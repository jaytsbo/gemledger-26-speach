import {
  AIBookkeeperResponse,
  AIParsedDraft,
  CustomSettings,
  GeminiFailureCode,
} from '../types/ledger';
import { getLocalDateStr, getLocalTimeStr } from '../utils/dateTime';

export interface FallbackFailureInfo {
  code?: GeminiFailureCode;
  detail?: string;
}

const EMPTY_INPUT_REPLY_MAP: Record<GeminiFailureCode, string> = {
  KEY_MISSING:
    '⚠️ 尚未設定個人 Gemini API Key，多模態圖像/語音辨識無法啟動。請至「設定 → AI 與開發者設定」填入您的 API Key，或直接以文字輸入（例如：「午餐 120 現金」）快速記帳！',
  SIMULATE_503:
    '⚠️ 目前已開啟 503 離線模擬，多模態圖像/語音辨識暫時停用。請先至「設定 → AI 與開發者設定」關閉後重試，或直接以文字輸入快速記帳！',
  AUTH_INVALID_KEY:
    '🔑 Gemini API Key 無效或權限不足 (401/403)，多模態圖像/語音辨識無法執行。請至「設定 → AI 與開發者設定」檢查並更新您的 API Key，或直接以文字輸入快速記帳！',
  RATE_LIMIT_429:
    '⏳ Gemini API 請求頻率或額度已達上限 (429 Too Many Requests)，多模態圖像/語音辨識暫時受限。請稍候重試，或直接以文字輸入（例如：「午餐 120 現金」）快速記帳！',
  TIMEOUT:
    '⏱️ Gemini 連線逾時，多模態圖像/語音辨識未能在時限內完成。請確認網路環境後重試，或直接以文字輸入快速記帳！',
  NETWORK_ERROR:
    '🌐 無法連線至 Gemini 伺服器（網路異常），多模態圖像/語音辨識失敗。請檢查網路連線後重試，或直接以文字輸入快速記帳！',
  BAD_REQUEST_400:
    '⚠️ Gemini 請求格式或媒體內容不被接受 (400 Bad Request)，請重新拍攝/錄製後再試，或改以文字輸入快速記帳！',
  PARSE_ERROR:
    '⚠️ Gemini 回傳格式異常無法解析，請稍後重試，或改以文字輸入（例如：「午餐 120 現金」）快速記帳！',
  SERVER_503:
    '⚠️ Gemini 伺服器目前負載過高或暫時異常 (5xx)，多模態圖像/語音辨識暫時無法連線。建議稍候重試，或直接以文字輸入（例如：「午餐 120 現金」）快速記帳！',
};

const TEXT_FALLBACK_REPLY_MAP: Record<GeminiFailureCode, string> = {
  KEY_MISSING:
    'ℹ️ 尚未設定個人 Gemini API Key，系統已使用【離線規則引擎】為您解析記帳草稿（可至「設定 → AI 與開發者設定」填入免費 Key 啟用 AI）。請核對明細無誤後即可寫入：',
  SIMULATE_503:
    '🛠️ 目前已開啟 503 離線模擬，系統已自動啟動【離線規則引擎】解析記帳草稿，請核對明細無誤後即可寫入：',
  AUTH_INVALID_KEY:
    '🔑 Gemini API Key 無效或權限不足 (401/403)，請至「設定 → AI 與開發者設定」確認您的 Key。系統已改用【離線規則引擎】為您解析記帳草稿：',
  RATE_LIMIT_429:
    '⏳ Gemini API 請求過於頻繁或額度已達上限 (429)，系統已自動改用【離線規則引擎】為您解析記帳草稿，請核對明細無誤後即可寫入：',
  TIMEOUT:
    '⏱️ Gemini 雲端連線逾時，系統已自動改用【離線規則引擎】為您解析記帳草稿，請核對明細無誤後即可寫入：',
  NETWORK_ERROR:
    '🌐 Gemini 網路連線異常，系統已自動改用【離線規則引擎】為您解析記帳草稿，請核對明細無誤後即可寫入：',
  BAD_REQUEST_400:
    '⚠️ Gemini 請求格式異常 (400)，系統已自動改用【離線規則引擎】為您解析記帳草稿，請核對明細無誤後即可寫入：',
  PARSE_ERROR:
    '⚠️ Gemini 回傳格式無法解析，系統已自動改用【離線規則引擎】為您解析記帳草稿，請核對明細無誤後即可寫入：',
  SERVER_503:
    '⚠️ Gemini API 雲端伺服器目前過載或發生 5xx 錯誤。系統已自動啟動【離線規則引擎】解析記帳草稿，請核對明細無誤後即可寫入：',
};

const DEFAULT_EMPTY_INPUT_REPLY =
  '⚠️ Gemini 伺服器目前負載過高 (503 Service Unavailable)，多模態圖像/語音辨識暫時無法連線。建議稍候 1~2 分鐘重試，或直接以文字輸入（例如：「午餐 120 現金」）快速記帳！';

const DEFAULT_TEXT_FALLBACK_REPLY =
  '⚠️ Gemini API 雲端伺服器目前過載 (503 Service Unavailable)。系統已自動啟動【規則備援引擎】解析記帳草稿，請核對明細無誤後即可寫入：';

const INCOME_KEYWORDS = [
  '收入',
  '薪水',
  '薪資',
  '獎金',
  '配息',
  '股息',
  '退款',
  '代墊款歸還',
  '代墊回收',
  '利息',
  '領錢',
  '投資收益',
  '紅包',
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripNonAmountTokens(msg: string): string {
  return msg
    .replace(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/7-11|7-eleven|85度c|85°c|50嵐|\b3c\b/gi, ' ');
}

function extractAmountFromMessage(msg: string): { value: number; rawToken: string } | null {
  const sanitized = stripNonAmountTokens(msg);
  const numPattern = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
  const withUnitRegex = new RegExp(
    `(?:NT\\$|US\\$|HK\\$|S\\$|A\\$|\\$|¥|€|£|₩|฿)\\s*(${numPattern})|(${numPattern})\\s*(?:元|塊|twd|jpy|usd|krw|eur|cny|rmb|gbp|hkd|sgd|thb|aud|日圓|日幣|円|美金|美元|台幣|新台幣|臺幣|新臺幣|港幣|港元|韓元|韓幣|人民幣)`,
    'i',
  );
  const unitMatch = withUnitRegex.exec(sanitized);
  if (unitMatch) {
    const token = unitMatch[1] ?? unitMatch[2] ?? '';
    const num = parseFloat(token.replace(/,/g, ''));
    if (Number.isFinite(num)) {
      return { value: num === 0 ? 0 : num, rawToken: token };
    }
  }

  const numberMatches = Array.from(
    sanitized.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g),
  );
  for (let i = numberMatches.length - 1; i >= 0; i -= 1) {
    const token = numberMatches[i][1];
    const num = parseFloat(token.replace(/,/g, ''));
    if (Number.isFinite(num)) {
      return { value: num === 0 ? 0 : num, rawToken: token };
    }
  }
  return null;
}

const EXPENSE_INFERENCE_RULES: Array<[RegExp, string]> = [
  [/(捷運|公車|計程車|高鐵|火車|uber|加油|悠遊卡|車資|機票|停車)/i, '行'],
  [/(衣服|褲|鞋|襯衫|外套|買包|圍巾)/i, '衣'],
  [/(房租|水電|瓦斯|管理費|家具|修繕)/i, '住'],
  [/(電影|遊戲|看展|演唱會|門票|唱歌|旅行|玩)/i, '育樂'],
  [/(書|課程|學費|補習|訂閱|chatgpt|伺服器)/i, '學習費用'],
  [/(看診|看病|掛號|感冒|藥|保健品|體檢)/i, '醫療/雜項'],
];

/**
 * 規則型備援解析器 (Rule-based Fallback Parser)
 * 當 Gemini API 遭遇 503 伺服器過載、429 配額耗盡或連線異常且重試失敗時，
 * 本地解析純文字輸入，確保使用者的記帳流程完全不中斷。
 */
export function fallbackParseTransaction(
  userMessage: string,
  settings: Partial<CustomSettings>,
  currentDateStr: string = getLocalDateStr(),
  currentTimeStr: string = getLocalTimeStr(),
  failureInfo?: FallbackFailureInfo,
): AIBookkeeperResponse {
  const failureCode = failureInfo?.code;
  const msg = (userMessage || '').trim();
  if (!msg) {
    const resolvedErrorType = failureCode ?? '503_OVERLOAD_NO_TEXT';
    const reply = failureCode
      ? EMPTY_INPUT_REPLY_MAP[failureCode]
      : DEFAULT_EMPTY_INPUT_REPLY;
    console.log(
      `[FallbackParser/fallbackParseTransaction] EmptyInput - Code:${resolvedErrorType}`,
    );
    return {
      reply,
      parsedTransactions: [],
      isFallback: true,
      ...(failureCode ? { fallbackReason: failureCode } : {}),
      errorType: resolvedErrorType,
    };
  }

  // 1 & 2. 解析金額數值並判斷正負號（防範 -0）
  const isIncome = INCOME_KEYWORDS.some((kw) => msg.includes(kw));
  const parsedAmountInfo = extractAmountFromMessage(msg);
  const absAmount = parsedAmountInfo !== null ? Math.abs(parsedAmountInfo.value) : 100;
  const amount = absAmount === 0 ? 0 : isIncome ? absAmount : -absAmount;

  // 3. 比對有效帳戶（依長度降冪且不分大小寫，避免 "LINE" 搶先 "LINE Pay"）
  const validAccounts =
    settings.accounts && settings.accounts.length > 0 ? settings.accounts : ['現金'];
  const sortedAccounts = [...validAccounts]
    .map((a) => a.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const msgLower = msg.toLowerCase();
  let matchedAccount = validAccounts[0];
  for (const acc of sortedAccounts) {
    if (msgLower.includes(acc.toLowerCase())) {
      matchedAccount = acc;
      break;
    }
  }

  // 4. 比對有效分類
  const validCategories =
    settings.categories && settings.categories.length > 0 ? settings.categories : ['食', '收入'];
  let matchedCategory = isIncome
    ? validCategories.includes('收入')
      ? '收入'
      : validCategories[0]
    : validCategories.includes('食')
      ? '食'
      : validCategories.includes('餐飲')
        ? '餐飲'
        : validCategories[0];

  // 先扣除已識別的帳戶名稱與常見干擾詞（如「銀行」），避免「永豐銀行」中的「行」被誤判為交通分類「行」
  const cleanMsgForCat = msg
    .replace(new RegExp(escapeRegExp(matchedAccount), 'gi'), '')
    .replace(/銀行|行動支付|分行/g, '');

  const sortedCategories = [...validCategories]
    .map((c) => c.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let explicitCategoryMatched = false;
  for (const cat of sortedCategories) {
    if (cleanMsgForCat.toLowerCase().includes(cat.toLowerCase())) {
      // 若已判斷為收入性質，僅接受收入/投資等相容分類覆蓋
      if (isIncome && !['收入', '投資', '代墊回收', '初始資產'].includes(cat)) {
        continue;
      }
      matchedCategory = cat;
      explicitCategoryMatched = true;
      break;
    }
  }

  // 若未直接匹配分類，根據常見消費詞性做智慧推論（不依賴「食」名稱存在）
  if (!isIncome && !explicitCategoryMatched) {
    for (const [pattern, inferredCat] of EXPENSE_INFERENCE_RULES) {
      if (pattern.test(cleanMsgForCat) && validCategories.includes(inferredCat)) {
        matchedCategory = inferredCat;
        break;
      }
    }
  }

  // 5. 幣別判斷（預設使用 settings.baseCurrency）
  let currency = (settings.baseCurrency || 'TWD').trim().toUpperCase() || 'TWD';
  if (/(jpy|日圓|日幣|円)/i.test(msg)) currency = 'JPY';
  else if (/(usd|美金|美元)/i.test(msg)) currency = 'USD';
  else if (/(krw|韓元|韓幣)/i.test(msg)) currency = 'KRW';
  else if (/(eur|歐元)/i.test(msg)) currency = 'EUR';
  else if (/(cny|rmb|人民幣)/i.test(msg)) currency = 'CNY';
  else if (/(gbp|英鎊)/i.test(msg)) currency = 'GBP';
  else if (/(hkd|港幣|港元)/i.test(msg)) currency = 'HKD';
  else if (/(sgd|新幣|新加坡幣)/i.test(msg)) currency = 'SGD';
  else if (/(thb|泰銖)/i.test(msg)) currency = 'THB';
  else if (/(aud|澳幣|澳元)/i.test(msg)) currency = 'AUD';
  else if (/(twd|nt\$|新台幣|台幣|臺幣|新臺幣)/i.test(msg)) currency = 'TWD';

  // 6. 項目名稱提煉
  let cleanName = msg
    .replace(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
  if (parsedAmountInfo?.rawToken) {
    cleanName = cleanName.replace(new RegExp(escapeRegExp(parsedAmountInfo.rawToken), 'g'), '');
  }
  cleanName = cleanName
    .replace(
      /(jpy|usd|krw|eur|cny|gbp|hkd|sgd|thb|aud|twd|nt\$|us\$|hk\$|元|塊|日圓|日幣|美金|美元|韓元|韓幣|歐元|人民幣|英鎊|港幣|港元|新幣|新加坡幣|泰銖|澳幣|澳元|新台幣|台幣)/gi,
      '',
    )
    .replace(new RegExp(escapeRegExp(matchedAccount), 'gi'), '')
    .replace(new RegExp(escapeRegExp(matchedCategory), 'gi'), '')
    .replace(/[，,。！!？?\s]+/g, ' ')
    .trim();

  if (!cleanName || cleanName.length < 1) {
    cleanName = msg.slice(0, 15);
  }

  const fallbackTransaction: AIParsedDraft = {
    name: cleanName,
    amount,
    currency,
    category: matchedCategory,
    account: matchedAccount,
    date: currentDateStr,
    time: currentTimeStr,
    note: failureCode ? `由離線規則引擎解析 (${failureCode})` : '由 503 備援離線規則引擎解析',
  };

  const resolvedReason = failureCode ?? '503_SERVICE_UNAVAILABLE';
  const reply = failureCode
    ? TEXT_FALLBACK_REPLY_MAP[failureCode]
    : DEFAULT_TEXT_FALLBACK_REPLY;

  console.log(
    `[FallbackParser/fallbackParseTransaction] Parsed - Reason:${resolvedReason}, Name:${fallbackTransaction.name}, Amt:${fallbackTransaction.amount} ${fallbackTransaction.currency}, Cat:${fallbackTransaction.category}, Acc:${fallbackTransaction.account}`,
  );

  return {
    reply,
    parsedTransactions: [fallbackTransaction],
    isFallback: true,
    fallbackReason: resolvedReason,
    ...(failureCode ? { errorType: failureCode } : {}),
  };
}
