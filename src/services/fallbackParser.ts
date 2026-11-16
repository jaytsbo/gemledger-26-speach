import { AIBookkeeperResponse, AIParsedDraft, CustomSettings } from '../types/ledger';

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

function getLocalDateStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getLocalTimeStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

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
): AIBookkeeperResponse {
  const msg = (userMessage || '').trim();
  if (!msg) {
    console.log('[FallbackParser/fallbackParseTransaction] EmptyInput - Returning 503_OVERLOAD_NO_TEXT');
    return {
      reply:
        '⚠️ Gemini 伺服器目前負載過高 (503 Service Unavailable)，多模態圖像/語音辨識暫時無法連線。建議稍候 1~2 分鐘重試，或直接以文字輸入（例如：「午餐 120 現金」）快速記帳！',
      parsedTransactions: [],
      isFallback: true,
      errorType: '503_OVERLOAD_NO_TEXT',
    };
  }

  // 1. 解析金額數值
  let amount = -100;
  const numMatch = msg.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    if (!Number.isNaN(val)) {
      amount = -Math.abs(val);
    }
  }

  // 2. 判斷正負號（收入性質 vs 支出性質）
  const isIncome = INCOME_KEYWORDS.some((kw) => msg.includes(kw));
  if (isIncome) {
    amount = Math.abs(amount);
  }

  // 3. 比對有效帳戶
  const validAccounts =
    settings.accounts && settings.accounts.length > 0 ? settings.accounts : ['現金'];
  let matchedAccount = validAccounts[0];
  for (const acc of validAccounts) {
    if (acc && msg.includes(acc)) {
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
      : validCategories[0];

  // 先扣除已識別的帳戶名稱與常見干擾詞（如「銀行」），避免「永豐銀行」中的「行」被誤判為交通分類「行」
  const cleanMsgForCat = msg
    .replace(new RegExp(escapeRegExp(matchedAccount), 'g'), '')
    .replace(/銀行|行動支付|分行/g, '');

  for (const cat of validCategories) {
    if (cat && cleanMsgForCat.includes(cat)) {
      // 若已判斷為收入性質，僅接受收入/投資等相容分類覆蓋
      if (isIncome && !['收入', '投資', '代墊回收', '初始資產'].includes(cat)) {
        continue;
      }
      matchedCategory = cat;
      break;
    }
  }

  // 若未直接匹配分類，根據常見消費詞性做智慧推論（僅在非收入情境下推論支出分類）
  if (!isIncome && matchedCategory === '食') {
    if (
      /(捷運|公車|計程車|高鐵|火車|uber|加油|悠遊卡|車資|機票|停車)/i.test(cleanMsgForCat) &&
      validCategories.includes('行')
    ) {
      matchedCategory = '行';
    } else if (
      /(衣服|褲|鞋|襯衫|外套|買包|圍巾)/i.test(cleanMsgForCat) &&
      validCategories.includes('衣')
    ) {
      matchedCategory = '衣';
    } else if (
      /(房租|水電|瓦斯|管理費|家具|修繕)/i.test(cleanMsgForCat) &&
      validCategories.includes('住')
    ) {
      matchedCategory = '住';
    } else if (
      /(電影|遊戲|看展|演唱會|門票|唱歌|旅行|玩)/i.test(cleanMsgForCat) &&
      validCategories.includes('育樂')
    ) {
      matchedCategory = '育樂';
    } else if (
      /(書|課程|學費|補習|訂閱|chatgpt|伺服器)/i.test(cleanMsgForCat) &&
      validCategories.includes('學習費用')
    ) {
      matchedCategory = '學習費用';
    } else if (
      /(看診|看病|掛號|感冒|藥|保健品|體檢)/i.test(cleanMsgForCat) &&
      validCategories.includes('醫療/雜項')
    ) {
      matchedCategory = '醫療/雜項';
    }
  }

  // 5. 幣別判斷
  let currency = 'TWD';
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

  // 6. 項目名稱提煉
  let cleanName = msg
    .replace(/(\d+(?:\.\d+)?)/g, '')
    .replace(
      /(jpy|usd|krw|eur|cny|gbp|hkd|sgd|thb|aud|twd|元|塊|日圓|日幣|美金|美元|韓元|韓幣|歐元|人民幣|英鎊|港幣|港元|新幣|新加坡幣|泰銖|澳幣|澳元|台幣)/gi,
      '',
    )
    .replace(new RegExp(escapeRegExp(matchedAccount), 'g'), '')
    .replace(new RegExp(escapeRegExp(matchedCategory), 'g'), '')
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
    note: '由 503 備援離線規則引擎解析',
  };

  console.log(
    `[FallbackParser/fallbackParseTransaction] Parsed - Name:${fallbackTransaction.name}, Amt:${fallbackTransaction.amount} ${fallbackTransaction.currency}, Cat:${fallbackTransaction.category}, Acc:${fallbackTransaction.account}`,
  );

  return {
    reply:
      '⚠️ Gemini API 雲端伺服器目前過載 (503 Service Unavailable)。系統已自動啟動【規則備援引擎】解析記帳草稿，請核對明細無誤後即可寫入：',
    parsedTransactions: [fallbackTransaction],
    isFallback: true,
    fallbackReason: '503_SERVICE_UNAVAILABLE',
  };
}
