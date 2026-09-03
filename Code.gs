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

function putLargeCache(key, dataArray, ttlSeconds) {
  const cache = CacheService.getScriptCache();
  try {
    const jsonStr = JSON.stringify(dataArray);
    const chunkSize = 90 * 1024; // 90KB (safe under 100KB)
    
    if (jsonStr.length < chunkSize) {
      cache.put(key, jsonStr, ttlSeconds);
      cache.put(key + "_chunks", "1", ttlSeconds);
      return;
    }
    
    const numChunks = Math.ceil(jsonStr.length / chunkSize);
    for (let i = 0; i < numChunks; i++) {
      const chunk = jsonStr.substring(i * chunkSize, (i + 1) * chunkSize);
      cache.put(key + "_part_" + i, chunk, ttlSeconds);
    }
    cache.put(key + "_chunks", String(numChunks), ttlSeconds);
  } catch (e) {
    console.warn("寫入分片快取失敗:", e);
  }
}

function getLargeCache(key) {
  const cache = CacheService.getScriptCache();
  try {
    const chunksVal = cache.get(key + "_chunks");
    if (!chunksVal) return null;
    
    const numChunks = parseInt(chunksVal, 10);
    if (numChunks === 1) {
      return cache.get(key);
    }
    
    let jsonStr = "";
    for (let i = 0; i < numChunks; i++) {
      const chunk = cache.get(key + "_part_" + i);
      if (!chunk) return null; // 碎片丟失，視為快取失效
      jsonStr += chunk;
    }
    return jsonStr;
  } catch (e) {
    console.warn("讀取分片快取失敗:", e);
    return null;
  }
}

function clearLargeCache(key) {
  const cache = CacheService.getScriptCache();
  try {
    const chunksVal = cache.get(key + "_chunks");
    if (chunksVal) {
      const numChunks = parseInt(chunksVal, 10);
      if (numChunks === 1) {
        cache.remove(key);
      } else {
        for (let i = 0; i < numChunks; i++) {
          cache.remove(key + "_part_" + i);
        }
      }
      cache.remove(key + "_chunks");
    } else {
      cache.remove(key);
    }
  } catch (e) {
    console.warn("清除分片快取失敗:", e);
  }
}

function clearSheetDataCache() {
  clearLargeCache(CACHE_KEY_SHEET_DATA);
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
  if (!forceRefresh) {
    const cachedData = getLargeCache(CACHE_KEY_SHEET_DATA);
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

  const rawRows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const data = [];
  const pad = (n) => String(n).padStart(2, '0');

  for (let i = 0; i < rawRows.length; i++) {
    const rRow = rawRows[i];
    if (!rRow[0] && !rRow[3]) continue;

    let dateStr = "";
    if (rRow[0] instanceof Date) {
      dateStr = `${rRow[0].getFullYear()}-${pad(rRow[0].getMonth() + 1)}-${pad(rRow[0].getDate())}`;
    } else if (rRow[0]) {
      dateStr = String(rRow[0]).trim();
    }

    let timeStr = "";
    if (rRow[1] instanceof Date) {
      timeStr = `${pad(rRow[1].getHours())}:${pad(rRow[1].getMinutes())}`;
    } else if (rRow[1]) {
      timeStr = String(rRow[1]).trim();
    }
    if (timeStr.length > 5) timeStr = timeStr.slice(0, 5);

    data.push({
      id: i + 2,
      rowNumber: i + 2,
      date: String(dateStr || "").trim(),
      time: String(timeStr || "").trim(),
      account: String(rRow[2] || "現金").trim(),
      name: String(rRow[3] || "未命名項目").trim(),
      category: String(rRow[4] || "食").trim(),
      currency: String(rRow[5] || "TWD").trim().toUpperCase(),
      amount: Number(rRow[6]) || 0,
      note: String(rRow[7] || "").trim()
    });
  }

  putLargeCache(CACHE_KEY_SHEET_DATA, data, CACHE_TTL_SECONDS);

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
    const fetchResult = fetchWithRetry("https://open.er-api.com/v6/latest/TWD", { muteHttpExceptions: true }, 2);
    if (fetchResult.success && fetchResult.response) {
      const json = JSON.parse(fetchResult.response.getContentText());
      if (json && json.rates) {
        const data = { base: "TWD", updated: json.time_last_update_utc || new Date().toISOString(), rates: json.rates };
        cache.put('EXCHANGE_RATES_TWD', JSON.stringify(data), 21600); // 6 小時快取
        return data;
      }
    }
  } catch (err) {
    console.warn("取得即時匯率異常，切換至靜態備援匯率:", err);
  }
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

/**
 * 🔄 具備指數退避與 Jitter 的 HTTP 請求工具（支援 8 秒上限與 503/429 過載快速 Failover）
 */
function fetchWithRetry(url, options, maxRetries = 3, timeoutMs = 8000) {
  let lastError = null;
  let lastResponse = null;
  const startTime = new Date().getTime();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 8 秒快速逾時防護：若已達逾時上限，提早返回以利切換至下一備援模型
    if (new Date().getTime() - startTime >= timeoutMs) {
      console.warn(`[API Timeout] 單一模型請求累計達 ${timeoutMs}ms，提早返回切換備用模型。`);
      break;
    }

    try {
      const res = UrlFetchApp.fetch(url, options);
      const code = res.getResponseCode();

      // 2xx 成功直接返回
      if (code >= 200 && code < 300) {
        return { success: true, response: res, code: code };
      }

      lastResponse = res;

      // 4xx 中非暫時性錯誤（例如 400 格式錯誤、401/403 憑證無效），不進行無效重試
      if (code === 400 || code === 401 || code === 403 || code === 404) {
        console.warn(`[API Client Error] 收到狀態碼 ${code}，略過重試。`);
        return { success: false, response: res, code: code };
      }

      // 針對 429 (Rate Limit)、500、502、503 (Overloaded)、504 進行指數退避
      if (attempt < maxRetries && (new Date().getTime() - startTime < timeoutMs)) {
        const baseDelayMs = 1000 * Math.pow(2, attempt);
        const jitterMs = Math.floor(Math.random() * 500);
        const delayMs = Math.min(timeoutMs, baseDelayMs + jitterMs);
        console.warn(`[API Retry] 收到狀態碼 ${code}，等待 ${delayMs}ms 進行第 ${attempt + 1}/${maxRetries} 次重試...`);
        Utilities.sleep(delayMs);
      }
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const baseDelayMs = 1000 * Math.pow(2, attempt);
        const jitterMs = Math.floor(Math.random() * 500);
        const delayMs = Math.min(8000, baseDelayMs + jitterMs);
        console.warn(`[API Network Retry] 連線異常 (${err.message})，等待 ${delayMs}ms 進行第 ${attempt + 1}/${maxRetries} 次重試...`);
        Utilities.sleep(delayMs);
      }
    }
  }

  return { 
    success: false, 
    response: lastResponse, 
    error: lastError, 
    code: lastResponse ? lastResponse.getResponseCode() : 0 
  };
}

/**
 * 🛡️ 規則型備援解析器 (Rule-based Fallback Parser)
 * 當 Gemini API 遭遇 503 伺服器過載、429 配額耗盡或連線異常且重試失敗時，
 * 本地解析純文字輸入，確保使用者的記帳流程完全不中斷！
 */
function fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr) {
  const msg = (userMessage || "").trim();
  if (!msg) {
    return {
      reply: "⚠️ Gemini 伺服器目前負載過高 (503 Service Unavailable)，多模態圖像/語音辨識暫時無法連線。建議稍候 1~2 分鐘重試，或直接以文字輸入（例如：「午餐 120 現金」）快速記帳！",
      parsedTransactions: [],
      isFallback: true,
      errorType: "503_OVERLOAD_NO_TEXT"
    };
  }

  // 1. 解析金額數值
  let amount = -100;
  const numMatch = msg.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    if (!isNaN(val)) amount = -Math.abs(val);
  }

  // 2. 判斷正負號（收入性質 vs 支出性質）
  const incomeKeywords = ["收入", "薪水", "薪資", "獎金", "配息", "股息", "退款", "代墊款歸還", "代墊回收", "利息", "領錢", "投資收益", "紅包"];
  const isIncome = incomeKeywords.some(kw => msg.includes(kw));
  if (isIncome) {
    amount = Math.abs(amount);
  }

  // 3. 比對有效帳戶
  const validAccounts = (settings.accounts && settings.accounts.length > 0) ? settings.accounts : ["現金"];
  let matchedAccount = validAccounts[0];
  for (let i = 0; i < validAccounts.length; i++) {
    if (msg.includes(validAccounts[i])) {
      matchedAccount = validAccounts[i];
      break;
    }
  }

  // 4. 比對有效分類
  const validCategories = (settings.categories && settings.categories.length > 0) ? settings.categories : ["食", "收入"];
  let matchedCategory = isIncome ? (validCategories.includes("收入") ? "收入" : validCategories[0]) : "食";
  
  // 先扣除已識別的帳戶名稱與常見干擾詞（如「銀行」），避免「永豐銀行」中的「行」被誤判為交通分類「行」
  const cleanMsgForCat = msg.replace(new RegExp(matchedAccount, "g"), "").replace(/銀行|行動支付|分行/g, "");

  for (let i = 0; i < validCategories.length; i++) {
    const cat = validCategories[i];
    if (cleanMsgForCat.includes(cat)) {
      // 若已判斷為收入性質，僅接受收入/投資等相容分類覆蓋
      if (isIncome && !["收入", "投資", "代墊回收", "初始資產"].includes(cat)) {
        continue;
      }
      matchedCategory = cat;
      break;
    }
  }

  // 若未直接匹配分類，根據常見消費詞性做智慧推論（僅在非收入情境下推論支出分類）
  if (!isIncome && matchedCategory === "食") {
    if (/(捷運|公車|計程車|高鐵|火車|uber|加油|悠遊卡|車資|機票|停車)/i.test(cleanMsgForCat) && validCategories.includes("行")) {
      matchedCategory = "行";
    } else if (/(衣服|褲|鞋|襯衫|外套|買包|圍巾)/i.test(cleanMsgForCat) && validCategories.includes("衣")) {
      matchedCategory = "衣";
    } else if (/(房租|水電|瓦斯|管理費|家具|修繕)/i.test(cleanMsgForCat) && validCategories.includes("住")) {
      matchedCategory = "住";
    } else if (/(電影|遊戲|看展|演唱會|門票|唱歌|旅行|玩)/i.test(cleanMsgForCat) && validCategories.includes("育樂")) {
      matchedCategory = "育樂";
    } else if (/(書|課程|學費|補習|訂閱|chatgpt|伺服器)/i.test(cleanMsgForCat) && validCategories.includes("學習費用")) {
      matchedCategory = "學習費用";
    } else if (/(看診|看病|掛號|感冒|藥|保健品|體檢)/i.test(cleanMsgForCat) && validCategories.includes("醫療/雜項")) {
      matchedCategory = "醫療/雜項";
    }
  }

  // 5. 幣別判斷
  let currency = "TWD";
  if (/(jpy|日圓|日幣|円)/i.test(msg)) currency = "JPY";
  else if (/(usd|美金|美元)/i.test(msg)) currency = "USD";
  else if (/(krw|韓元|韓幣)/i.test(msg)) currency = "KRW";
  else if (/(eur|歐元)/i.test(msg)) currency = "EUR";
  else if (/(cny|rmb|人民幣)/i.test(msg)) currency = "CNY";
  else if (/(gbp|英鎊)/i.test(msg)) currency = "GBP";

  // 6. 項目名稱提煉
  let cleanName = msg
    .replace(/(\d+(?:\.\d+)?)/g, "")
    .replace(/(jpy|usd|krw|eur|cny|gbp|twd|元|塊|日圓|日幣|美金|美元|台幣)/gi, "")
    .replace(new RegExp(matchedAccount, "g"), "")
    .replace(new RegExp(matchedCategory, "g"), "")
    .replace(/[，,。！!？?\s]+/g, " ")
    .trim();
  if (!cleanName || cleanName.length < 1) cleanName = msg.slice(0, 15);

  const fallbackTransaction = {
    name: cleanName,
    amount: amount,
    currency: currency,
    category: matchedCategory,
    account: matchedAccount,
    date: currentDateStr,
    time: currentTimeStr,
    note: "由 503 備援離線規則引擎解析"
  };

  return {
    reply: "⚠️ Gemini API 雲端伺服器目前過載 (503 Service Unavailable)。系統已自動啟動【規則備援引擎】解析記帳草稿，請核對明細無誤後即可寫入：",
    parsedTransactions: [fallbackTransaction],
    isFallback: true,
    fallbackReason: "503_SERVICE_UNAVAILABLE"
  };
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
  
  // 🛡️ 模型級聯備援序列 (Cascade Fallback List)
  // 優先順序：3.5 flash-lite (主模型) -> 3.6 flash (第一備援) -> 3.5 flash (第二備援)
  const MODELS_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.5-flash"
  ];

  const fetchOptions = { 
    method: "post", 
    contentType: "application/json", 
    payload: JSON.stringify(payload), 
    muteHttpExceptions: true 
  };

  let lastStatusCode = 0;
  let lastErrorMsg = "";

  for (let mIdx = 0; mIdx < MODELS_CASCADE.length; mIdx++) {
    const currentModel = MODELS_CASCADE[mIdx];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    
    const requestStartTime = new Date().getTime();
    console.log(`[Gemini Cascade] 嘗試使用模型【${currentModel}】(順位 ${mIdx + 1}/${MODELS_CASCADE.length})...`);

    // 針對單一模型最多重試 1 次，若 429 配額滿載或伺服器過載則迅速 Failover 到下一模型
    const fetchResult = fetchWithRetry(url, fetchOptions, 1);
    const elapsedMs = new Date().getTime() - requestStartTime;
    lastStatusCode = fetchResult.code;

    if (fetchResult.success && fetchResult.response) {
      try {
        const json = JSON.parse(fetchResult.response.getContentText());
        if (json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
          const parsed = JSON.parse(json.candidates[0].content.parts[0].text);
          const txs = parsed.transactions || [];
          
          let replyPrefix = "";
          if (mIdx > 0) {
            replyPrefix = `⚡ [注意：由於前置模型過載或限制，系統已自動為您切換至 ${currentModel} 完成解析！]\n\n`;
          }

          return { 
            reply: replyPrefix + (parsed.reply || "解析成功！請核對以下記帳明細："), 
            parsedTransactions: txs,
            modelUsed: currentModel
          };
        }
      } catch (parseErr) {
        console.error(`[${currentModel}] 輸出 JSON 解析錯誤:`, parseErr);
      }
    }

    lastErrorMsg = fetchResult.response ? fetchResult.response.getContentText() : (fetchResult.error ? fetchResult.error.toString() : "連線逾時");
    console.warn(`[Gemini Cascade] 模型 ${currentModel} 回應失敗 [HTTP ${lastStatusCode}，耗時 ${elapsedMs}ms]。準備切換至下一備援模型...`);

    // 若非暫時性錯誤（如 400 格式錯誤、401/403 金鑰無效），換模型也無法解決，直接跳出
    if (lastStatusCode === 400 || lastStatusCode === 401 || lastStatusCode === 403) {
      break;
    }
  }

  // 若所有模型皆因 429（每分鐘限制）、503（伺服器過載）或連線逾時而失敗，啟動最後防線：本地規則備援引擎
  if (lastStatusCode === 429 || lastStatusCode === 503 || lastStatusCode === 500 || lastStatusCode === 502 || lastStatusCode === 504 || !lastStatusCode) {
    console.warn(`[Gemini Cascade] 所有雲端模型皆受限或過載，啟動離線規則備援引擎。`);
    return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr);
  }

  // 其他致命客戶端錯誤
  return { 
    reply: `⚠️ 調用 Gemini API 發生錯誤 [HTTP ${lastStatusCode}]：${lastErrorMsg}`, 
    parsedTransactions: [] 
  };
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

/**
 * 🧪 [測試專用] 在 Apps Script 編輯器直接測試 503 伺服器過載與 Fallback 規則引擎
 * 操作方式：在 Apps Script 編輯器上方函式選單選取「testGemini503Fallback」，點擊「執行」即可在執行紀錄中查看結果
 */
function testGemini503Fallback() {
  console.log("=== 🧪 開始驗證 503 Fallback 規則型備援降級機制 ===");
  const settings = getCustomSettings();
  const timeZone = Session.getScriptTimeZone();
  const currentDateStr = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd");
  const currentTimeStr = Utilities.formatDate(new Date(), timeZone, "HH:mm");

  // 1. 測試文字支出與分類推論
  const test1 = fallbackParseTransaction("中午跟同事吃拉麵 280 LINE Pay", settings, currentDateStr, currentTimeStr);
  console.log("【測試 1：一般支出】", JSON.stringify(test1, null, 2));

  // 2. 測試收入與帳戶防干擾
  const test2 = fallbackParseTransaction("公司發放本月薪水 65000 永豐銀行", settings, currentDateStr, currentTimeStr);
  console.log("【測試 2：薪資收入】", JSON.stringify(test2, null, 2));

  // 3. 測試純多模態無文字時的降級提示
  const test3 = fallbackParseTransaction("", settings, currentDateStr, currentTimeStr);
  console.log("【測試 3：無文字/純多模態】", JSON.stringify(test3, null, 2));

  console.log("=== ✅ 503 Fallback 機制驗證完成 ===");
  return { test1, test2, test3 };
}

