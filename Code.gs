/**
 * 📊 Google Sheets 智慧多幣別財務儀表板與 Gemini 3.5 AI 記帳系統 (Google Apps Script)
 * 檔案：Code.gs
 */

// 安全取得 UI 物件（避免在無 UI 環境、Web App 或編輯器測試時拋出例外）
function getSafeUi() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

function safeAlert(message) {
  const ui = getSafeUi();
  if (ui) {
    ui.alert(message);
  } else {
    console.log("[Alert]: " + message);
  }
}

function safeToast(message, title = "系統通知", timeoutSeconds = 3) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) ss.toast(message, title, timeoutSeconds);
  } catch (e) {
    console.log(`[Toast - ${title}]: ${message}`);
  }
}
 
function onOpen() {
  const ui = getSafeUi();
  if (!ui) {
    console.warn("目前處於無 UI 執行環境，略過選單掛載。");
    return;
  }

  ui.createMenu('📊 財務儀表板與多幣別記帳')
    .addItem('🚀 開啟財務分析儀表板', 'openDashboardModal')
    .addItem('📱 開啟側邊欄智能記帳', 'openSidebar')
    .addSeparator()
    .addItem('🔄 清除快取並強制同步試算表', 'syncSheetDataToast')
    .addItem('💱 立即同步最新各國即時匯率', 'syncExchangeRatesToast')
    .addSeparator()
    .addItem('⚙️ 初始化 8 欄位「記帳資料」工作表', 'initAccountingSheet')
    .addItem('⚙️ 初始化/重設「系統設定」工作表', 'initSettingsSheet')
    .addItem('🔑 設定/更新 Gemini API Key', 'promptSetApiKey')
    .addToUi();
}

/**
 * 試算表手動編輯或貼上時自動觸發：自動清除快取以維持資料即時性
 */
function onEdit(e) {
  clearSheetDataCache();
}

function syncSheetDataToast() {
  clearSheetDataCache();
  safeToast('✅ 已強制清除快取，試算表資料已同步！', '快取同步', 3);
}

function openDashboardModal() {
  const ui = getSafeUi();
  if (!ui) return;
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setWidth(1380)
    .setHeight(900)
    .setTitle('個人財務分析儀表板');
  ui.showModalDialog(html, '個人財務分析儀表板');
}

function openSidebar() {
  const ui = getSafeUi();
  if (!ui) return;
  const html = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Gemini 智能記帳側邊欄');
  ui.showSidebar(html);
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('個人財務深層分析與多幣別記帳儀表板');
}

function initAccountingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("找不到作用中的試算表");

  let sheet = ss.getSheetByName("記帳資料") || ss.insertSheet("記帳資料");
  const headers = ["日期", "時間", "帳戶", "項目名稱", "分類", "幣別", "金額", "備註"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
  sheet.setFrozenRows(1);
  safeAlert('✅ 成功初始化「記帳資料」工作表！');
}

function initSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  let sheet = ss.getSheetByName("系統設定") || ss.insertSheet("系統設定");
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([["帳戶清單", "分類清單"]]).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
  
  const accounts = ['現金', 'LINE Pay', 'LINE Bank', '郵局', '永豐銀行', '國泰世華', '玉山銀行', '悠遊卡', '街口支付', '台新Richart'];
  const categories = ['食', '衣', '住', '行', '育樂', '學習費用', '醫療/雜項', '收入', '投資', '初始資產', '代墊款', '代墊回收', '內部轉帳'];
  const rows = [];
  for (let i = 0; i < Math.max(accounts.length, categories.length); i++) {
    rows.push([accounts[i] || "", categories[i] || ""]);
  }
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.setFrozenRows(1);
  safeAlert('✅ 成功初始化「系統設定」工作表！');
}

const CACHE_KEY_SHEET_DATA = 'CACHE_SHEET_DATA_V1';
const CACHE_TTL_SECONDS = 300; // 5 分鐘快取

function clearSheetDataCache() {
  try {
    CacheService.getScriptCache().remove(CACHE_KEY_SHEET_DATA);
  } catch (e) {
    console.warn("快取清除失敗:", e);
  }
}

function getCustomSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fallbackCurrencies = ['TWD', 'JPY', 'USD', 'KRW', 'EUR', 'CNY', 'GBP', 'HKD', 'SGD', 'THB', 'AUD'];

  if (!ss) return { accounts: ['現金'], categories: ['食', '收入'], currencies: fallbackCurrencies };
  const sheet = ss.getSheetByName("系統設定");
  if (!sheet) return { accounts: ['現金'], categories: ['食', '收入'], currencies: fallbackCurrencies };

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { accounts: ['現金'], categories: ['食', '收入'], currencies: fallbackCurrencies };

  const accounts = [], categories = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) accounts.push(String(values[i][0]).trim());
    if (values[i][1]) categories.push(String(values[i][1]).trim());
  }
  return { 
    accounts: accounts.length > 0 ? accounts : ['現金'], 
    categories: categories.length > 0 ? categories : ['食', '收入'], 
    currencies: fallbackCurrencies 
  };
}

function saveCustomSettings(settings) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("系統繁忙中，請稍後再試（無法取得鎖定）");

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表");

    let sheet = ss.getSheetByName("系統設定") || ss.insertSheet("系統設定");
    sheet.clear();
    sheet.getRange(1, 1, 1, 2).setValues([["帳戶清單", "分類清單"]]).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    
    const accounts = (settings.accounts || []).map(a => String(a).trim()).filter(Boolean);
    const categories = (settings.categories || []).map(c => String(c).trim()).filter(Boolean);
    const rows = [];
    for (let i = 0; i < Math.max(accounts.length, categories.length); i++) {
      rows.push([accounts[i] || "", categories[i] || ""]);
    }
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    sheet.setFrozenRows(1);
    return { success: true, message: "已成功儲存自訂設定！" };
  } finally {
    lock.releaseLock();
  }
}

function getSheetData(forceRefresh = false) {
  const cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    const cachedData = cache.get(CACHE_KEY_SHEET_DATA);
    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (e) {
        console.warn("快取解析失敗，重新讀取試算表");
      }
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  const sheet = ss.getSheetByName("記帳資料") || ss.getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const displayRows = sheet.getRange(2, 1, lastRow - 1, 8).getDisplayValues();
  const rawRows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const data = [];
  const timeZone = Session.getScriptTimeZone();

  for (let i = 0; i < rawRows.length; i++) {
    const rRow = rawRows[i];
    const dRow = displayRows[i];
    if (!rRow[0] && !rRow[3] && !dRow[0] && !dRow[3]) continue;

    let dateStr = String(dRow[0] || '').trim();
    if (!dateStr && rRow[0] instanceof Date) {
      dateStr = Utilities.formatDate(rRow[0], timeZone, "yyyy-MM-dd");
    }

    let timeStr = String(dRow[1] || '').trim();
    if (!timeStr && rRow[1] instanceof Date) {
      timeStr = Utilities.formatDate(rRow[1], timeZone, "HH:mm");
    }
    if (timeStr.length > 5) timeStr = timeStr.slice(0, 5);

    data.push({
      id: i + 2,
      rowNumber: i + 2,
      date: String(dateStr || "").trim(),
      time: String(timeStr || "").trim(),
      account: String(dRow[2] || rRow[2] || "現金").trim(),
      name: String(dRow[3] || rRow[3] || "未命名項目").trim(),
      category: String(dRow[4] || rRow[4] || "食").trim(),
      currency: String(dRow[5] || rRow[5] || "TWD").trim().toUpperCase(),
      amount: Number(rRow[6]) || 0,
      note: String(dRow[7] || rRow[7] || "").trim()
    });
  }

  try {
    cache.put(CACHE_KEY_SHEET_DATA, JSON.stringify(data), CACHE_TTL_SECONDS);
  } catch (e) {
    console.warn("資料超出 CacheService 100KB 單筆限制，略過寫入快取。");
  }

  return data;
}

// 寫入交易：直接採用傳入數值，移除後端硬編碼正負號邏輯
function addTransaction(item) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("系統繁忙中，請稍後再試（無法取得試算表寫入鎖定）");

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表");
    let sheet = ss.getSheetByName("記帳資料") || ss.getActiveSheet();
    const timeZone = Session.getScriptTimeZone();

    const category = String(item.category || "食").trim();
    const finalAmount = Number(item.amount) || 0;

    const rowData = [
      String(item.date || Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd")).trim(),
      String(item.time || Utilities.formatDate(new Date(), timeZone, "HH:mm")).trim(),
      String(item.account || "現金").trim(),
      String(item.name || "未命名項目").trim(),
      category,
      String(item.currency || 'TWD').trim().toUpperCase(),
      finalAmount,
      String(item.note || "").trim()
    ];

    sheet.appendRow(rowData);
    const newRowNumber = sheet.getLastRow();

    clearSheetDataCache();

    return { 
      success: true, 
      message: "成功寫入記帳紀錄！", 
      rowNumber: newRowNumber 
    };
  } catch (error) {
    throw new Error("寫入試算表失敗: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

// 批次寫入交易：直接採用傳入數值，移除後端硬編碼正負號邏輯
function batchAddTransactions(items) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("系統繁忙中，請稍後再試（無法取得試算表寫入鎖定）");

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表");
    let sheet = ss.getSheetByName("記帳資料") || ss.getActiveSheet();
    const timeZone = Session.getScriptTimeZone();

    const rows = items.map(item => [
      String(item.date || Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd")).trim(),
      String(item.time || Utilities.formatDate(new Date(), timeZone, "HH:mm")).trim(),
      String(item.account || "現金").trim(),
      String(item.name || "未命名項目").trim(),
      String(item.category || "食").trim(),
      String(item.currency || 'TWD').trim().toUpperCase(),
      Number(item.amount) || 0,
      String(item.note || "").trim()
    ]);

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
    }
    clearSheetDataCache();
    return { success: true, count: rows.length };
  } catch (error) {
    throw new Error("批次寫入試算表失敗: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

function updateTransaction(rowNumber, updatedItem) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("系統繁忙中，請稍後再試（無法取得鎖定）");

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表");
    const sheet = ss.getSheetByName("記帳資料") || ss.getActiveSheet();
    const rowIndex = Number(rowNumber);
    if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error("無效的資料列編號");

    sheet.getRange(rowIndex, 1, 1, 8).setValues([[
      String(updatedItem.date || "").trim(),
      String(updatedItem.time || "").trim(),
      String(updatedItem.account || "現金").trim(),
      String(updatedItem.name || "未命名項目").trim(),
      String(updatedItem.category || "食").trim(),
      String(updatedItem.currency || 'TWD').trim().toUpperCase(),
      Number(updatedItem.amount) || 0,
      String(updatedItem.note || "").trim()
    ]]);
    clearSheetDataCache();
    return { success: true, message: "成功更新紀錄！" };
  } finally {
    lock.releaseLock();
  }
}

function deleteTransaction(rowNumber) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("系統繁忙中，請稍後再試（無法取得鎖定）");

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表");
    const sheet = ss.getSheetByName("記帳資料") || ss.getActiveSheet();
    const rowIndex = Number(rowNumber);
    if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error("無效的資料列編號");
    sheet.deleteRow(rowIndex);
    clearSheetDataCache();
    return { success: true, message: "成功刪除紀錄！" };
  } finally {
    lock.releaseLock();
  }
}

function getExchangeRates() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('EXCHANGE_RATES_TWD');
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }

  const fallback = { base: "TWD", rates: { TWD: 1, USD: 0.03125, JPY: 4.65, KRW: 41.5, EUR: 0.0285, CNY: 0.225, GBP: 0.0245, HKD: 0.244, SGD: 0.0418, THB: 1.08, AUD: 0.0475 } };
  try {
    const res = UrlFetchApp.fetch("https://open.er-api.com/v6/latest/TWD", { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const json = JSON.parse(res.getContentText());
      if (json && json.rates) {
        const data = { base: "TWD", updated: json.time_last_update_utc || new Date().toISOString(), rates: json.rates };
        cache.put('EXCHANGE_RATES_TWD', JSON.stringify(data), 21600);
        return data;
      }
    }
  } catch (err) {}
  return fallback;
}

function syncExchangeRatesToast() {
  getExchangeRates();
  safeToast('💱 匯率同步完成！', '即時匯率更新', 3);
}

function promptSetApiKey() {
  const ui = getSafeUi();
  if (!ui) {
    console.warn("無法開啟提示視窗，請在 Google 試算表畫面執行。");
    return;
  }
  const result = ui.prompt('🔑 設定 Gemini API Key', '請輸入您的 Google AI Studio API Key：', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() === ui.Button.OK) {
    const key = result.getResponseText().trim();
    if (key) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
      ui.alert('✅ API Key 已成功儲存！');
    }
  }
}

function callGeminiBookkeeper(userMessage, imageBase64, mimeType, autoSave = false) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { reply: "⚠️ 尚未設定 GEMINI_API_KEY！請至試算表上方選單點選「設定/更新 Gemini API Key」。", parsedTransactions: [] };

  const settings = getCustomSettings();
  const now = new Date();
  const timeZone = Session.getScriptTimeZone();
  const currentDateStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
  const currentTimeStr = Utilities.formatDate(now, timeZone, "HH:mm");
  
  const systemPrompt = `You are an expert multilingual financial bookkeeping assistant.
Current Date: ${currentDateStr}.
Current Time: ${currentTimeStr}.
Valid Categories: ${JSON.stringify(settings.categories)}.
Valid Accounts: ${JSON.stringify(settings.accounts)}.

TIME AND DATE RULES:
1. If user explicitly specifies date/time (e.g. "昨天", "早上9點"), parse accordingly.
2. If date or time is NOT explicitly specified by the user, default "date" strictly to "${currentDateStr}" and "time" strictly to "${currentTimeStr}". Do NOT fallback to 00:00 or 12:00.

CRITICAL AMOUNT SIGN RULES:
1. ANY transaction representing money coming IN (e.g. Salary, dividend/配息, investment profit, cash gifts, refunds, repayment collected/代墊款歸還, selling assets, etc.) MUST have a POSITIVE amount (e.g. 5000).
2. ANY transaction representing money going OUT (e.g. Buying food/clothes/goods, paying bills, travel expense, haircut, fees, subscription, etc.) MUST have a NEGATIVE amount (e.g. -150).
3. For internal transfers, distinguish transfer-out as NEGATIVE and transfer-in as POSITIVE based on context.
4. Do NOT rely solely on category names. Judge strictly by the financial nature of the action described by the user.

Output JSON schema:
{
  "reply": "Friendly response in Traditional Chinese (zh-TW)",
  "transactions": [
    {
      "name": "Item name",
      "amount": -100, // POSITIVE for income/dividends/receipts/inflows, NEGATIVE for expenses/spending/outflows
      "currency": "TWD", // 3-letter uppercase ISO code
      "category": "食", // Must match one of valid categories
      "account": "現金", // Must match one of valid accounts
      "date": "${currentDateStr}",
      "time": "${currentTimeStr}",
      "note": "Any additional note"
    }
  ]
}`;

  const parts = [];
  if (imageBase64) {
    parts.push({ inlineData: { data: imageBase64.replace(/^data:[^;]+;base64,/, ""), mimeType: mimeType || "image/jpeg" } });
  }
  parts.push({ text: systemPrompt + "\n\nUser Input: " + (userMessage || "請辨識語音、收據與消費內容") });

  const payload = { 
    contents: [{ parts: parts }], 
    generationConfig: { 
      responseMimeType: "application/json", 
      temperature: 0.1 
    } 
  };
  
  const isAudio = mimeType && mimeType.startsWith("audio/");
  const model = isAudio ? "gemini-3.5-transcribe" : "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  
  try {
    const res = UrlFetchApp.fetch(url, { 
      method: "post", 
      contentType: "application/json", 
      payload: JSON.stringify(payload), 
      muteHttpExceptions: true 
    });
    
    if (res.getResponseCode() === 200) {
      const json = JSON.parse(res.getContentText());
      const parsed = JSON.parse(json.candidates[0].content.parts[0].text);
      const txs = parsed.transactions || [];

      return { 
        reply: parsed.reply || "解析成功！請核對以下記帳明細：", 
        parsedTransactions: txs 
      };
    }
    return { reply: `⚠️ 調用 Gemini API (${model}) 發生錯誤：` + res.getContentText(), parsedTransactions: [] };
  } catch (err) { 
    return { reply: `⚠️ 調用 Gemini API (${model}) 發生錯誤：` + err.toString(), parsedTransactions: [] };
  }
}

/**
 * 🗑️ 級聯刪除帳戶：同步刪除「系統設定」中的帳戶，並批次清除「記帳資料」中所有包含該帳戶的列
 */
function deleteAccountCascade(accountName) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("系統繁忙中，請稍後再試（無法取得鎖定）");

  try {
    const targetAccount = String(accountName || "").trim();
    if (!targetAccount) throw new Error("未提供欲刪除的帳戶名稱");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表");

    // 1. 從「系統設定」工作表移除帳戶
    const settingsSheet = ss.getSheetByName("系統設定");
    if (settingsSheet) {
      const settingsData = settingsSheet.getDataRange().getValues();
      let newAccounts = [];
      let existingCategories = [];
      for (let i = 1; i < settingsData.length; i++) {
        const acc = String(settingsData[i][0] || "").trim();
        const cat = String(settingsData[i][1] || "").trim();
        if (acc && acc !== targetAccount) newAccounts.push(acc);
        if (cat) existingCategories.push(cat);
      }
      
      settingsSheet.clear();
      settingsSheet.getRange(1, 1, 1, 2).setValues([["帳戶清單", "分類清單"]]).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      const rows = [];
      for (let i = 0; i < Math.max(newAccounts.length, existingCategories.length); i++) {
        rows.push([newAccounts[i] || "", existingCategories[i] || ""]);
      }
      if (rows.length > 0) settingsSheet.getRange(2, 1, rows.length, 2).setValues(rows);
      settingsSheet.setFrozenRows(1);
    }

    // 2. 批次更新「記帳資料」工作表（記憶體過濾後一次寫入，防止逐列刪除超時）
    const accountingSheet = ss.getSheetByName("記帳資料") || ss.getActiveSheet();
    let deletedRowsCount = 0;
    if (accountingSheet && accountingSheet.getLastRow() > 1) {
      const allRows = accountingSheet.getRange(2, 1, accountingSheet.getLastRow() - 1, 8).getValues();
      const remainingRows = allRows.filter(row => {
        const rowAccount = String(row[2] || "").trim();
        if (rowAccount === targetAccount) {
          deletedRowsCount++;
          return false;
        }
        return true;
      });

      // 清空原有資料列區域並批次寫回剩餘資料
      accountingSheet.getRange(2, 1, accountingSheet.getLastRow() - 1, 8).clearContent();
      if (remainingRows.length > 0) {
        accountingSheet.getRange(2, 1, remainingRows.length, 8).setValues(remainingRows);
      }
    }

    SpreadsheetApp.flush();
    clearSheetDataCache();

    return {
      success: true,
      deletedCount: deletedRowsCount,
      message: `已成功刪除帳戶「${targetAccount}」，並清除後端 ${deletedRowsCount} 筆關聯記帳記錄！`
    };
  } catch (error) {
    throw new Error("級聯刪除帳戶失敗: " + error.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 🗑️ 級聯刪除分類：同步刪除「系統設定」中的分類，並批次清除「記帳資料」中所有包含該分類的列
 */
function deleteCategoryCascade(categoryName) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("系統繁忙中，請稍後再試（無法取得鎖定）");

  try {
    const targetCategory = String(categoryName || "").trim();
    if (!targetCategory) throw new Error("未提供欲刪除的分類名稱");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("找不到試算表");

    // 1. 從「系統設定」工作表移除分類
    const settingsSheet = ss.getSheetByName("系統設定");
    if (settingsSheet) {
      const settingsData = settingsSheet.getDataRange().getValues();
      let existingAccounts = [];
      let newCategories = [];
      for (let i = 1; i < settingsData.length; i++) {
        const acc = String(settingsData[i][0] || "").trim();
        const cat = String(settingsData[i][1] || "").trim();
        if (acc) existingAccounts.push(acc);
        if (cat && cat !== targetCategory) newCategories.push(cat);
      }
      
      settingsSheet.clear();
      settingsSheet.getRange(1, 1, 1, 2).setValues([["帳戶清單", "分類清單"]]).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      const rows = [];
      for (let i = 0; i < Math.max(existingAccounts.length, newCategories.length); i++) {
        rows.push([existingAccounts[i] || "", newCategories[i] || ""]);
      }
      if (rows.length > 0) settingsSheet.getRange(2, 1, rows.length, 2).setValues(rows);
      settingsSheet.setFrozenRows(1);
    }

    // 2. 批次更新「記帳資料」工作表（記憶體過濾後一次寫入，防止逐列刪除超時）
    const accountingSheet = ss.getSheetByName("記帳資料") || ss.getActiveSheet();
    let deletedRowsCount = 0;
    if (accountingSheet && accountingSheet.getLastRow() > 1) {
      const allRows = accountingSheet.getRange(2, 1, accountingSheet.getLastRow() - 1, 8).getValues();
      const remainingRows = allRows.filter(row => {
        const rowCategory = String(row[4] || "").trim();
        if (rowCategory === targetCategory) {
          deletedRowsCount++;
          return false;
        }
        return true;
      });

      // 清空原有資料列區域並批次寫回剩餘資料
      accountingSheet.getRange(2, 1, accountingSheet.getLastRow() - 1, 8).clearContent();
      if (remainingRows.length > 0) {
        accountingSheet.getRange(2, 1, remainingRows.length, 8).setValues(remainingRows);
      }
    }

    SpreadsheetApp.flush();
    clearSheetDataCache();

    return {
      success: true,
      deletedCount: deletedRowsCount,
      message: `已成功刪除分類「${targetCategory}」，並清除後端 ${deletedRowsCount} 筆關聯記帳記錄！`
    };
  } catch (error) {
    throw new Error("級聯刪除分類失敗: " + error.message);
  } finally {
    lock.releaseLock();
  }
}
