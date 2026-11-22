import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ApiService, MODELS_CASCADE } from '../src/services/apiService';
import { DEFAULT_SETTINGS, MOCK_STORAGE_KEYS } from '../src/services/database';
import { fallbackParseTransaction } from '../src/services/fallbackParser';
import {
  callGeminiDirectWithKey,
  clearUserGeminiApiKey,
  loadUserGeminiApiKey,
  saveUserGeminiApiKey,
  SecureStoreLike,
} from '../src/services/geminiDirectService';
import { useLedgerStore } from '../src/store/useLedgerStore';
import { Transaction } from '../src/types/ledger';
import {
  computeAccountStats,
  computeKPIStats,
  extractAvailableTimeBuckets,
  filterTransactions,
  groupTransactionsByDate,
} from '../src/utils/analytics';
import { convertCurrency, DEFAULT_EXCHANGE_RATES, formatMoney } from '../src/utils/currency';
import { decodeCsvBytes, parseCsvTransactions } from '../src/utils/csvImport';
import {
  getLocalDateOffset,
  getLocalDateStr,
  isValidClockTime,
} from '../src/utils/dateTime';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  return mockStorage;
}

describe('fallbackParseTransaction', () => {
  it('parses expense with negative amount, account, and category', () => {
    const res = fallbackParseTransaction(
      '午餐 日式豚骨拉麵 280 LINE Pay',
      DEFAULT_SETTINGS,
      '2026-11-13',
      '12:30',
    );
    assert.equal(res.isFallback, true);
    assert.equal(res.parsedTransactions.length, 1);
    const tx = res.parsedTransactions[0];
    assert.equal(tx.amount, -280);
    assert.equal(tx.currency, 'TWD');
    assert.equal(tx.account, 'LINE Pay');
    assert.equal(tx.category, '食');
    assert.equal(tx.date, '2026-11-13');
    assert.equal(tx.time, '12:30');
  });

  it('parses income with 永豐銀行 without misclassifying 銀行 as 行', () => {
    const res = fallbackParseTransaction(
      '專案接案收入 28000 永豐銀行',
      DEFAULT_SETTINGS,
      '2026-11-13',
      '09:00',
    );
    assert.equal(res.isFallback, true);
    assert.equal(res.parsedTransactions.length, 1);
    const tx = res.parsedTransactions[0];
    assert.equal(tx.amount, 28000);
    assert.equal(tx.account, '永豐銀行');
    assert.equal(tx.category, '收入');
    assert.notEqual(tx.category, '行');
  });

  it('parses multi-currency JPY expense', () => {
    const res = fallbackParseTransaction(
      '東京拉麵 1080 JPY 現金',
      DEFAULT_SETTINGS,
      '2026-11-13',
      '19:45',
    );
    assert.equal(res.parsedTransactions.length, 1);
    const tx = res.parsedTransactions[0];
    assert.equal(tx.amount, -1080);
    assert.equal(tx.currency, 'JPY');
    assert.equal(tx.account, '現金');
    assert.equal(tx.category, '食');
  });

  it('returns 503_OVERLOAD_NO_TEXT on empty message', () => {
    const res = fallbackParseTransaction('   ', DEFAULT_SETTINGS, '2026-11-13', '12:00');
    assert.equal(res.isFallback, true);
    assert.equal(res.errorType, '503_OVERLOAD_NO_TEXT');
    assert.equal(res.parsedTransactions.length, 0);
  });
});

describe('Currency & Analytics', () => {
  it('converts currencies and formats decimals properly', () => {
    const twd = convertCurrency(4650, 'JPY', 'TWD', DEFAULT_EXCHANGE_RATES);
    assert.equal(Math.round(twd), 1000);

    const usdToTwd = convertCurrency(10, 'USD', 'TWD', DEFAULT_EXCHANGE_RATES);
    assert.equal(Math.round(usdToTwd), 320);

    assert.equal(formatMoney(1234.56, 'TWD'), 'NT$1,235');
    assert.equal(formatMoney(-1080, 'JPY'), '-¥1,080');
    assert.equal(formatMoney(19.5, 'USD'), '$19.50');
  });

  it('computes KPI stats excluding 初始資產, 內部轉帳, 代墊款', () => {
    const txs: Transaction[] = [
      {
        id: 1,
        date: '2026-11-01',
        time: '09:00',
        account: '永豐銀行',
        name: '期初餘額',
        category: '初始資產',
        currency: 'TWD',
        amount: 100000,
        note: '',
      },
      {
        id: 2,
        date: '2026-11-05',
        time: '09:00',
        account: '永豐銀行',
        name: '月薪',
        category: '收入',
        currency: 'TWD',
        amount: 50000,
        note: '',
      },
      {
        id: 3,
        date: '2026-11-06',
        time: '12:00',
        account: '現金',
        name: '午餐便當',
        category: '食',
        currency: 'TWD',
        amount: -200,
        note: '',
      },
      {
        id: 4,
        date: '2026-11-06',
        time: '15:00',
        account: '悠遊卡',
        name: '捷運',
        category: '行',
        currency: 'TWD',
        amount: -300,
        note: '',
      },
      {
        id: 5,
        date: '2026-11-07',
        time: '18:00',
        account: '永豐銀行',
        name: '轉帳至現金',
        category: '內部轉帳',
        currency: 'TWD',
        amount: -5000,
        note: '',
      },
      {
        id: 6,
        date: '2026-11-07',
        time: '18:00',
        account: '現金',
        name: '從永豐提領',
        category: '內部轉帳',
        currency: 'TWD',
        amount: 5000,
        note: '',
      },
      {
        id: 7,
        date: '2026-11-08',
        time: '20:00',
        account: 'LINE Pay',
        name: '幫朋友代墊聚餐',
        category: '代墊款',
        currency: 'TWD',
        amount: -1500,
        note: '',
      },
    ];

    const kpi = computeKPIStats(txs, 'TWD', DEFAULT_EXCHANGE_RATES);
    assert.equal(kpi.netWorth, 148000);
    assert.equal(kpi.realIncome, 50000);
    assert.equal(kpi.realExpense, 500);
    assert.equal(kpi.netCashflow, 49500);
    assert.equal(kpi.transactionCount, 7);
  });

  it('extractAvailableTimeBuckets collects sorted unique years, months, days with and without seeds', () => {
    const txs: Transaction[] = [
      {
        id: 1,
        date: '2025-12-31',
        time: '10:00',
        account: '現金',
        name: '跨年晚餐',
        category: '食',
        currency: 'TWD',
        amount: -500,
        note: '',
      },
      {
        id: 2,
        date: '2026-11-05',
        time: '12:00',
        account: '現金',
        name: '午餐',
        category: '食',
        currency: 'TWD',
        amount: -120,
        note: '',
      },
      {
        id: 3,
        date: '2026-11-05',
        time: '18:00',
        account: '現金',
        name: '晚餐',
        category: '食',
        currency: 'TWD',
        amount: -180,
        note: '',
      },
      {
        id: 4,
        date: '2026-02-14',
        time: '19:00',
        account: '現金',
        name: '聚餐',
        category: '食',
        currency: 'TWD',
        amount: -800,
        note: '',
      },
      {
        id: 5,
        date: 'invalid-date',
        time: '00:00',
        account: '現金',
        name: '無效日期',
        category: '其他',
        currency: 'TWD',
        amount: -10,
        note: '',
      },
      {
        id: 6,
        date: '',
        time: '00:00',
        account: '現金',
        name: '空日期',
        category: '其他',
        currency: 'TWD',
        amount: -10,
        note: '',
      },
    ];

    const unseeded = extractAvailableTimeBuckets(txs);
    assert.deepEqual(unseeded.years, ['2026', '2025']);
    assert.deepEqual(unseeded.months, ['2026-11', '2026-02', '2025-12']);
    assert.deepEqual(unseeded.days, ['2026-11-05', '2026-02-14', '2025-12-31']);

    const seeded = extractAvailableTimeBuckets(txs, {
      year: '2027',
      month: '2026-11',
      day: '2027-01-01',
    });
    assert.deepEqual(seeded.years, ['2027', '2026', '2025']);
    assert.deepEqual(seeded.months, ['2026-11', '2026-02', '2025-12']);
    assert.deepEqual(seeded.days, ['2027-01-01', '2026-11-05', '2026-02-14', '2025-12-31']);

    const emptySeeded = extractAvailableTimeBuckets([], {
      year: '2026',
      month: '',
      day: undefined,
    });
    assert.deepEqual(emptySeeded.years, ['2026']);
    assert.deepEqual(emptySeeded.months, []);
    assert.deepEqual(emptySeeded.days, []);
  });

  it('validates clock times and computes local date offsets accurately', () => {
    assert.equal(isValidClockTime('00:00'), true);
    assert.equal(isValidClockTime('09:05'), true);
    assert.equal(isValidClockTime('23:59'), true);
    assert.equal(isValidClockTime('24:00'), false);
    assert.equal(isValidClockTime('12:60'), false);
    assert.equal(isValidClockTime('9:05'), false);
    assert.equal(isValidClockTime('12:5'), false);
    assert.equal(isValidClockTime('12:00:00'), false);
    assert.equal(isValidClockTime(''), false);
    assert.equal(isValidClockTime('ab:cd'), false);

    assert.equal(getLocalDateOffset(0), getLocalDateStr());

    const expectedYesterday = new Date();
    expectedYesterday.setDate(expectedYesterday.getDate() - 1);
    assert.equal(getLocalDateOffset(-1), getLocalDateStr(expectedYesterday));

    const expectedNextWeek = new Date();
    expectedNextWeek.setDate(expectedNextWeek.getDate() + 7);
    assert.equal(getLocalDateOffset(7), getLocalDateStr(expectedNextWeek));
  });
});

describe('ApiService & Cascade Deletion', () => {
  let storage: ReturnType<typeof installMockLocalStorage>;

  beforeEach(() => {
    storage = installMockLocalStorage();
    storage.clear();
    ApiService.clearCache();
  });

  it('freezes Gemini MODELS_CASCADE per coding-rules.md', () => {
    assert.deepEqual(MODELS_CASCADE, [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
    ]);
  });

  it('auto-seeds MOCK_SHEET_DATA and MOCK_CUSTOM_SETTINGS and performs cascade deletions', async () => {
    const initialTx = await ApiService.getSheetData(true);
    const initialSettings = await ApiService.getCustomSettings();

    assert.ok(initialTx.length >= 5);
    assert.ok(initialSettings.accounts.includes('永豐銀行'));
    assert.ok(initialSettings.categories.includes('食'));
    assert.ok(storage.getItem(MOCK_STORAGE_KEYS.SHEET_DATA));
    assert.ok(storage.getItem(MOCK_STORAGE_KEYS.CUSTOM_SETTINGS));

    const expectedAccCount = initialTx.filter((t) => t.account === '永豐銀行').length;
    assert.ok(expectedAccCount > 0);

    const accRes = await ApiService.deleteAccountCascade('永豐銀行');
    assert.equal(accRes.success, true);
    assert.equal(accRes.deletedCount, expectedAccCount);

    const afterAccSettings = await ApiService.getCustomSettings();
    const afterAccTx = await ApiService.getSheetData(true);
    assert.equal(afterAccSettings.accounts.includes('永豐銀行'), false);
    assert.equal(afterAccTx.some((t) => t.account === '永豐銀行'), false);

    const expectedCatCount = afterAccTx.filter((t) => t.category === '食').length;
    assert.ok(expectedCatCount > 0);

    const catRes = await ApiService.deleteCategoryCascade('食');
    assert.equal(catRes.success, true);
    assert.equal(catRes.deletedCount, expectedCatCount);

    const afterCatSettings = await ApiService.getCustomSettings();
    const afterCatTx = await ApiService.getSheetData(true);
    assert.equal(afterCatSettings.categories.includes('食'), false);
    assert.equal(afterCatTx.some((t) => t.category === '食'), false);
  });

  it('falls back to rule engine when user Gemini API key is unconfigured', async () => {
    const res = await ApiService.callGeminiBookkeeper('晚餐 牛肉麵 180 現金');
    assert.equal(res.isFallback, true);
    assert.equal(res.parsedTransactions.length, 1);
    assert.equal(res.parsedTransactions[0].amount, -180);
    assert.equal(res.parsedTransactions[0].category, '食');
    assert.equal(res.parsedTransactions[0].account, '現金');
  });

  it('does not collide id with rowNumber when updating or deleting transaction id=2', async () => {
    const initialTx = await ApiService.getSheetData(true);
    const tx1Before = initialTx.find((t) => t.id === 1);
    const tx2Before = initialTx.find((t) => t.id === 2);
    assert.ok(tx1Before && tx1Before.rowNumber === 2);
    assert.ok(tx2Before && tx2Before.rowNumber === 3);

    await ApiService.updateTransaction(2, {
      date: tx2Before.date,
      time: tx2Before.time,
      account: tx2Before.account,
      name: '捷運通勤更新',
      category: tx2Before.category,
      currency: tx2Before.currency,
      amount: -40,
      note: 'updated id 2',
    });

    const afterUpdateTx = await ApiService.getSheetData(true);
    assert.equal(afterUpdateTx.find((t) => t.id === 1)?.name, tx1Before.name);
    assert.equal(afterUpdateTx.find((t) => t.id === 2)?.name, '捷運通勤更新');
    assert.equal(afterUpdateTx.find((t) => t.id === 2)?.amount, -40);

    await ApiService.deleteTransaction(2);
    const afterDeleteTx = await ApiService.getSheetData(true);
    assert.equal(afterDeleteTx.length, initialTx.length - 1);
    assert.ok(afterDeleteTx.some((t) => t.id === 1));
    assert.equal(afterDeleteTx.some((t) => t.id === 2), false);
  });

  it('neutralizes CSV formula injection in ApiService.exportTransactionsCSV while keeping plain numbers unescaped', async () => {
    const txs: Transaction[] = [
      {
        id: 1,
        date: '2026-11-16',
        time: '12:00',
        account: '現金',
        name: "=CMD|' /C calc'!A0",
        category: '食',
        currency: 'TWD',
        amount: -280,
        note: '+SUM(1,2)',
      },
      {
        id: 2,
        date: '2026-11-16',
        time: '13:00',
        account: '現金',
        name: '@HYPERLINK("http://evil")',
        category: '食',
        currency: 'TWD',
        amount: 100,
        note: '-1+1',
      },
    ];

    const csv = await ApiService.exportTransactionsCSV(txs);
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    assert.equal(lines.length, 3);
    assert.equal(
      lines[1],
      "2026-11-16,12:00,現金,'=CMD|' /C calc'!A0,食,TWD,-280,\"'+SUM(1,2)\"",
    );
    assert.equal(
      lines[2],
      '2026-11-16,13:00,現金,"\'@HYPERLINK(""http://evil"")",食,TWD,100,\'-1+1',
    );
  });

  it('saves, loads, and clears user Gemini API key through ApiService adapter', async () => {
    await ApiService.clearGeminiApiKey();
    assert.equal(await ApiService.getGeminiApiKey(), '');

    await ApiService.saveGeminiApiKey('  AIzaSyTestKey123  ');
    assert.equal(await ApiService.getGeminiApiKey(), 'AIzaSyTestKey123');

    await ApiService.clearGeminiApiKey();
    assert.equal(await ApiService.getGeminiApiKey(), '');
  });
});

describe('CSV Import', () => {
  it('parseCsvTransactions handles UTF-8 BOM, quoted commas, escaped quotes, and Chinese headers', () => {
    const csv =
      '\uFEFF日期,時間,帳戶,項目名稱,分類,幣別,金額,備註\r\n' +
      '2026/11/16,12:30,永豐銀行,"午餐, ""豚骨拉麵""",食,TWD,-280,"好吃, 下次再來"\r\n' +
      '2026-11-16,09:05,現金,咖啡,食,USD,-4.50,\r\n';

    const drafts = parseCsvTransactions(csv);
    assert.equal(drafts.length, 2);

    assert.equal(drafts[0].date, '2026-11-16');
    assert.equal(drafts[0].time, '12:30');
    assert.equal(drafts[0].account, '永豐銀行');
    assert.equal(drafts[0].name, '午餐, "豚骨拉麵"');
    assert.equal(drafts[0].category, '食');
    assert.equal(drafts[0].currency, 'TWD');
    assert.equal(drafts[0].amount, -280);
    assert.equal(drafts[0].note, '好吃, 下次再來');

    assert.equal(drafts[1].currency, 'USD');
    assert.equal(drafts[1].amount, -4.5);
  });

  it('parseCsvTransactions finds headers below leading title rows and resolves Chinese aliases', () => {
    const csv =
      '我的 2026 記帳本\n' +
      '交易日期,付款方式,消費項目,消費分類,花費\n' +
      '2026-11-16,悠遊卡,捷運通勤,行,-35\n';

    const drafts = parseCsvTransactions(csv);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].account, '悠遊卡');
    assert.equal(drafts[0].name, '捷運通勤');
    assert.equal(drafts[0].category, '行');
    assert.equal(drafts[0].amount, -35);
  });

  it('decodeCsvBytes decodes Big5-encoded bytes without garbled replacement characters', () => {
    // Big5 bytes for "日期,項目名稱,金額\n" -> 日(A4E9) 期(B4C1) , 項目名稱 , 金額
    const big5Bytes = new Uint8Array([
      0xa4, 0xe9, 0xb4, 0xc1, 0x2c, // 日期,
      0xb6, 0xb5, 0xa5, 0xd8, 0xa6, 0x57, 0xba, 0xd9, 0x2c, // 項目名稱,
      0xaa, 0xf7, 0xc3, 0x42, // 金額
    ]);
    const decoded = decodeCsvBytes(big5Bytes);
    assert.equal(decoded, '日期,項目名稱,金額');
  });

  it('parseCsvTransactions parses accounting parentheses and trailing-minus negative amounts', () => {
    const csv =
      '日期,帳戶,項目名稱,分類,幣別,金額,備註\n' +
      '2026-11-16,永豐銀行,餐費,食,TWD,"(1,250)",括號負數\n' +
      '2026-11-16,現金,美金消費,食,USD,"($1,200.50)",幣別括號負數\n' +
      '2026-11-16,悠遊卡,高鐵票,行,TWD,"1,200-",尾綴負號\n' +
      '2026-11-16,現金,零元測試,其他,TWD,(0),零值\n';

    const drafts = parseCsvTransactions(csv);
    assert.equal(drafts.length, 4);
    assert.equal(drafts[0].amount, -1250);
    assert.equal(drafts[1].amount, -1200.5);
    assert.equal(drafts[2].amount, -1200);
    assert.ok(Object.is(drafts[3].amount, 0));
  });
});

describe('Account/Category Rename, Merge & Import', () => {
  let storage: ReturnType<typeof installMockLocalStorage>;

  beforeEach(() => {
    storage = installMockLocalStorage();
    storage.clear();
    ApiService.clearCache();
  });

  it('renameAccount cascades account, toAccount, accountIcons and rejects duplicates', async () => {
    await ApiService.getSheetData(true);
    await ApiService.saveCustomSettings({
      accountIcons: { 永豐銀行: 'bank-outline', 現金: 'cash' },
    });

    const rawTxs = JSON.parse(storage.getItem(MOCK_STORAGE_KEYS.SHEET_DATA) || '[]');
    rawTxs.push({
      id: 999,
      rowNumber: 99,
      date: '2026-11-16',
      time: '10:00',
      account: '現金',
      toAccount: '永豐銀行',
      name: '轉帳測試',
      category: '內部轉帳',
      currency: 'TWD',
      amount: -1000,
      note: '',
    });
    storage.setItem(MOCK_STORAGE_KEYS.SHEET_DATA, JSON.stringify(rawTxs));

    const expectedCount = rawTxs.filter(
      (t: any) => t.account === '永豐銀行' || t.toAccount === '永豐銀行',
    ).length;

    const res = await ApiService.renameAccount('永豐銀行', '永豐大戶');
    assert.equal(res.success, true);
    assert.equal(res.count, expectedCount);

    const settings = await ApiService.getCustomSettings();
    assert.equal(settings.accounts.includes('永豐銀行'), false);
    assert.equal(settings.accounts.includes('永豐大戶'), true);
    assert.equal(settings.accountIcons?.['永豐大戶'], 'bank-outline');
    assert.equal(settings.accountIcons?.['永豐銀行'], undefined);

    const txs = (await ApiService.getSheetData(true)) as Array<Transaction & { toAccount?: string }>;
    assert.equal(txs.some((t) => t.account === '永豐銀行' || t.toAccount === '永豐銀行'), false);
    const transferTx = txs.find((t) => t.id === 999);
    assert.equal(transferTx?.toAccount, '永豐大戶');

    await assert.rejects(() => ApiService.renameAccount('永豐大戶', '現金'), /已存在/);
  });

  it('renameCategory cascades transactions and rejects duplicates', async () => {
    const initialTx = await ApiService.getSheetData(true);
    const expectedCount = initialTx.filter((t) => t.category === '食').length;
    assert.ok(expectedCount > 0);

    const res = await ApiService.renameCategory('食', '餐飲');
    assert.equal(res.success, true);
    assert.equal(res.count, expectedCount);

    const settings = await ApiService.getCustomSettings();
    assert.equal(settings.categories.includes('食'), false);
    assert.equal(settings.categories.includes('餐飲'), true);

    const txs = await ApiService.getSheetData(true);
    assert.equal(txs.some((t) => t.category === '食'), false);
    assert.equal(txs.filter((t) => t.category === '餐飲').length, expectedCount);

    await assert.rejects(() => ApiService.renameCategory('餐飲', '行'), /已存在/);
  });

  it('mergeCategories moves transactions to target and removes source category', async () => {
    const initialTx = await ApiService.getSheetData(true);
    const sourceCount = initialTx.filter((t) => t.category === '食').length;
    const targetCount = initialTx.filter((t) => t.category === '行').length;
    assert.ok(sourceCount > 0);

    const res = await ApiService.mergeCategories('食', '行');
    assert.equal(res.success, true);
    assert.equal(res.count, sourceCount);

    const settings = await ApiService.getCustomSettings();
    assert.equal(settings.categories.includes('食'), false);
    assert.equal(settings.categories.includes('行'), true);

    const txs = await ApiService.getSheetData(true);
    assert.equal(txs.some((t) => t.category === '食'), false);
    assert.equal(txs.filter((t) => t.category === '行').length, sourceCount + targetCount);
  });

  it('importTransactions supports append vs overwrite and auto-adds new accounts and categories', async () => {
    const initialTx = await ApiService.getSheetData(true);
    const initialCount = initialTx.length;

    const appendRes = await ApiService.importTransactions(
      [
        {
          date: '2026-11-16',
          time: '14:00',
          account: '新數位帳戶',
          name: '雲端訂閱',
          category: '數位服務',
          currency: 'TWD',
          amount: -390,
          note: 'append test',
        },
      ],
      'append',
    );
    assert.equal(appendRes.success, true);
    assert.equal(appendRes.count, 1);

    const afterAppendTx = await ApiService.getSheetData(true);
    assert.equal(afterAppendTx.length, initialCount + 1);
    const afterAppendSettings = await ApiService.getCustomSettings();
    assert.ok(afterAppendSettings.accounts.includes('新數位帳戶'));
    assert.ok(afterAppendSettings.categories.includes('數位服務'));

    const overwriteRes = await ApiService.importTransactions(
      [
        {
          date: '2026-11-16',
          time: '18:00',
          account: '覆寫專用卡',
          name: '全新帳本第一筆',
          category: '全新分類',
          currency: 'JPY',
          amount: -1200,
          note: 'overwrite test',
        },
      ],
      'overwrite',
    );
    assert.equal(overwriteRes.success, true);
    assert.equal(overwriteRes.count, 1);

    const afterOverwriteTx = await ApiService.getSheetData(true);
    assert.equal(afterOverwriteTx.length, 1);
    assert.equal(afterOverwriteTx[0].name, '全新帳本第一筆');
    assert.equal(afterOverwriteTx[0].account, '覆寫專用卡');
    assert.equal(afterOverwriteTx[0].category, '全新分類');

    const afterOverwriteSettings = await ApiService.getCustomSettings();
    assert.deepEqual(afterOverwriteSettings.accounts, ['覆寫專用卡']);
    assert.deepEqual(afterOverwriteSettings.categories, ['全新分類']);
    assert.equal(afterOverwriteSettings.baseCurrency, 'TWD');
  });
});

describe('Gemini Direct, Key Storage & Connection Test', () => {
  let storage: ReturnType<typeof installMockLocalStorage>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    storage = installMockLocalStorage();
    storage.clear();
    await clearUserGeminiApiKey();
    ApiService.clearCache();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    storage = installMockLocalStorage();
    storage.clear();
    await clearUserGeminiApiKey();
  });

  it('stops cascade immediately on 401/403 and reports AUTH_INVALID_KEY without hitting remaining models', async () => {
    for (const status of [401, 403]) {
      const requestedUrls: string[] = [];
      globalThis.fetch = (async (input: string | URL | Request) => {
        requestedUrls.push(String(input));
        return { ok: false, status } as Response;
      }) as typeof fetch;

      const textRes = await callGeminiDirectWithKey(
        'AIzaInvalidKey',
        '午餐 120 現金',
        null,
        null,
        DEFAULT_SETTINGS,
        '2026-11-20',
        '12:00',
        MODELS_CASCADE,
        { retryDelayMs: 0 },
      );

      assert.equal(requestedUrls.length, 1);
      assert.ok(requestedUrls[0].includes(MODELS_CASCADE[0]));
      assert.equal(textRes.isFallback, true);
      assert.equal(textRes.fallbackReason, 'AUTH_INVALID_KEY');
      assert.equal(textRes.errorType, 'AUTH_INVALID_KEY');

      requestedUrls.length = 0;
      const audioRes = await callGeminiDirectWithKey(
        'AIzaInvalidKey',
        '',
        'ZmFrZUF1ZGlv',
        'audio/m4a',
        DEFAULT_SETTINGS,
        '2026-11-20',
        '12:00',
        MODELS_CASCADE,
        { retryDelayMs: 0 },
      );

      assert.equal(requestedUrls.length, 1);
      assert.equal(audioRes.isFallback, true);
      assert.equal(audioRes.fallbackReason, 'AUTH_INVALID_KEY');
      assert.equal(audioRes.errorType, 'AUTH_INVALID_KEY');
      assert.equal(audioRes.parsedTransactions.length, 0);
      assert.match(audioRes.reply, /401\/403|無效/);
    }
  });

  it('continues cascade on HTTP 400 and succeeds on subsequent model', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      if (requestedUrls.length === 1) {
        return { ok: false, status: 400 } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: '已記帳咖啡',
                      transactions: [
                        {
                          name: '拿鐵咖啡',
                          amount: -145,
                          currency: 'TWD',
                          category: '食',
                          account: 'LINE Pay',
                          date: '2026-11-20',
                          time: '09:30',
                          note: '',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const res = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '咖啡 145 LINE Pay',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '09:30',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls[0].includes(MODELS_CASCADE[0]));
    assert.ok(requestedUrls[1].includes(MODELS_CASCADE[1]));
    assert.equal(res.isFallback, undefined);
    assert.equal(res.modelUsed, MODELS_CASCADE[1]);
    assert.equal(res.parsedTransactions.length, 1);
    assert.equal(res.parsedTransactions[0].name, '拿鐵咖啡');
  });

  it('retries once on 429 and succeeds, and classifies RATE_LIMIT_429 when all retries exhaust', async () => {
    const retryUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      retryUrls.push(String(input));
      if (retryUrls.length === 1) {
        return { ok: false, status: 429 } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: '重試後成功',
                      transactions: [{ name: '早餐', amount: -85, category: '食', account: '現金' }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const recovered = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '早餐 85 現金',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '08:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(retryUrls.length, 2);
    assert.ok(retryUrls[0].includes(MODELS_CASCADE[0]));
    assert.ok(retryUrls[1].includes(MODELS_CASCADE[0]));
    assert.equal(recovered.modelUsed, MODELS_CASCADE[0]);

    const exhaustedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      exhaustedUrls.push(String(input));
      return { ok: false, status: 429 } as Response;
    }) as typeof fetch;

    const exhausted = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '',
      'ZmFrZUF1ZGlv',
      'audio/m4a',
      DEFAULT_SETTINGS,
      '2026-11-20',
      '08:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(exhaustedUrls.length, MODELS_CASCADE.length * 2);
    assert.equal(exhausted.isFallback, true);
    assert.equal(exhausted.fallbackReason, 'RATE_LIMIT_429');
    assert.equal(exhausted.errorType, 'RATE_LIMIT_429');
    assert.equal(exhausted.parsedTransactions.length, 0);
  });

  it('uses 15s text / 30s multimodal timeout and classifies AbortError as TIMEOUT', async () => {
    const capturedTimeoutDelays: number[] = [];
    const origSetTimeout = globalThis.setTimeout;
    const origClearTimeout = globalThis.clearTimeout;
    const clearedTimers = new Set<unknown>();

    globalThis.setTimeout = ((fn: (...args: any[]) => void, delay?: number, ...args: any[]) => {
      if (delay === 15000 || delay === 30000) {
        capturedTimeoutDelays.push(delay);
      }
      return origSetTimeout(fn, delay, ...args);
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id: any) => {
      clearedTimers.add(id);
      return origClearTimeout(id);
    }) as typeof clearTimeout;

    globalThis.fetch = (async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }) as typeof fetch;

    try {
      const textTimeoutRes = await callGeminiDirectWithKey(
        'AIzaValidKey',
        '午餐 120 現金',
        null,
        null,
        DEFAULT_SETTINGS,
        '2026-11-20',
        '12:00',
        MODELS_CASCADE,
        { retryDelayMs: 0 },
      );
      assert.equal(textTimeoutRes.fallbackReason, 'TIMEOUT');
      assert.equal(textTimeoutRes.errorType, 'TIMEOUT');

      const mediaTimeoutRes = await callGeminiDirectWithKey(
        'AIzaValidKey',
        '',
        'ZmFrZUltYWdl',
        'image/jpeg',
        DEFAULT_SETTINGS,
        '2026-11-20',
        '12:00',
        MODELS_CASCADE,
        { retryDelayMs: 0 },
      );
      assert.equal(mediaTimeoutRes.fallbackReason, 'TIMEOUT');
      assert.equal(mediaTimeoutRes.errorType, 'TIMEOUT');

      assert.ok(capturedTimeoutDelays.includes(15000));
      assert.ok(capturedTimeoutDelays.includes(30000));
      assert.ok(clearedTimers.size >= 6);
    } finally {
      globalThis.setTimeout = origSetTimeout;
      globalThis.clearTimeout = origClearTimeout;
    }
  });

  it('classifies invalid JSON responses as PARSE_ERROR', async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{not-valid-json' }] } }],
        }),
      }) as unknown as Response) as typeof fetch;

    const res = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '晚餐 200 現金',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '19:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(res.isFallback, true);
    assert.equal(res.fallbackReason, 'PARSE_ERROR');
    assert.equal(res.errorType, 'PARSE_ERROR');
  });

  it('stops cascade immediately on HTTP 400 API_KEY_INVALID, continues generic 400 across all models, and classifies exhausted 503 and NETWORK_ERROR', async () => {
    const keyInvalidUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      keyInvalidUrls.push(String(input));
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              code: 400,
              message: 'API key not valid. Please pass a valid API key.',
              details: [{ reason: 'API_KEY_INVALID' }],
            },
          }),
      } as unknown as Response;
    }) as typeof fetch;

    const invalidKey400Res = await callGeminiDirectWithKey(
      'AIzaFake400',
      '午餐 120 現金',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '12:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );
    assert.equal(keyInvalidUrls.length, 1);
    assert.equal(invalidKey400Res.isFallback, true);
    assert.equal(invalidKey400Res.fallbackReason, 'AUTH_INVALID_KEY');
    assert.equal(invalidKey400Res.errorType, 'AUTH_INVALID_KEY');

    const generic400Urls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      generic400Urls.push(String(input));
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { code: 400, message: 'Bad payload' } }),
      } as unknown as Response;
    }) as typeof fetch;

    const exhausted400Res = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '午餐 120 現金',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '12:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );
    assert.equal(generic400Urls.length, MODELS_CASCADE.length);
    assert.equal(exhausted400Res.isFallback, true);
    assert.equal(exhausted400Res.fallbackReason, 'BAD_REQUEST_400');
    assert.equal(exhausted400Res.errorType, 'BAD_REQUEST_400');

    const server503Urls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      server503Urls.push(String(input));
      return { ok: false, status: 503 } as Response;
    }) as typeof fetch;

    const exhausted503Res = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '',
      'ZmFrZUF1ZGlv',
      'audio/m4a',
      DEFAULT_SETTINGS,
      '2026-11-20',
      '12:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );
    assert.equal(server503Urls.length, MODELS_CASCADE.length * 2);
    assert.equal(exhausted503Res.isFallback, true);
    assert.equal(exhausted503Res.fallbackReason, 'SERVER_503');
    assert.equal(exhausted503Res.errorType, 'SERVER_503');
    assert.equal(exhausted503Res.parsedTransactions.length, 0);

    const netErrUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      netErrUrls.push(String(input));
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const netErrRes = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '晚餐 200 現金',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '19:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );
    assert.equal(netErrUrls.length, MODELS_CASCADE.length);
    assert.equal(netErrRes.isFallback, true);
    assert.equal(netErrRes.fallbackReason, 'NETWORK_ERROR');
    assert.equal(netErrRes.errorType, 'NETWORK_ERROR');
  });

  it('reports SIMULATE_503 accurately for both voice and text without false missing-key warning', async () => {
    await ApiService.saveCustomSettings({ simulate503: true });

    const audioRes = await ApiService.callGeminiBookkeeper('', 'ZmFrZUF1ZGlv', 'audio/m4a');
    assert.equal(audioRes.isFallback, true);
    assert.equal(audioRes.fallbackReason, 'SIMULATE_503');
    assert.equal(audioRes.errorType, 'SIMULATE_503');
    assert.equal(audioRes.parsedTransactions.length, 0);
    assert.match(audioRes.reply, /503 離線模擬/);
    assert.doesNotMatch(audioRes.reply, /需要設定 Gemini API Key/);

    const textRes = await ApiService.callGeminiBookkeeper('午餐 150 現金');
    assert.equal(textRes.isFallback, true);
    assert.equal(textRes.fallbackReason, 'SIMULATE_503');
    assert.equal(textRes.errorType, 'SIMULATE_503');
    assert.equal(textRes.parsedTransactions[0].amount, -150);
  });

  it('reports KEY_MISSING for text and audio when API key is not configured', async () => {
    await ApiService.saveCustomSettings({ simulate503: false });

    const textRes = await ApiService.callGeminiBookkeeper('晚餐 180 現金');
    assert.equal(textRes.isFallback, true);
    assert.equal(textRes.fallbackReason, 'KEY_MISSING');
    assert.equal(textRes.errorType, 'KEY_MISSING');

    const audioRes = await ApiService.callGeminiBookkeeper('', 'ZmFrZUF1ZGlv', 'audio/m4a');
    assert.equal(audioRes.isFallback, true);
    assert.equal(audioRes.fallbackReason, 'KEY_MISSING');
    assert.equal(audioRes.errorType, 'KEY_MISSING');
    assert.match(audioRes.reply, /設定 → AI 與開發者設定/);
  });

  it('tests Gemini API key connectivity via v1beta/models and classifies every result code', async () => {
    let fetchCalls = 0;
    let lastUrl = '';
    let lastKeyHeader: string | null = null;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      fetchCalls += 1;
      lastUrl = String(input);
      lastKeyHeader =
        (init?.headers as Record<string, string> | undefined)?.['x-goog-api-key'] ?? null;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;

    const missingRes = await ApiService.testGeminiApiKey('   ');
    assert.equal(missingRes.ok, false);
    assert.equal(missingRes.code, 'KEY_MISSING');
    assert.equal(fetchCalls, 0);

    await ApiService.saveGeminiApiKey('  AIzaStoredKey  ');
    const storedOk = await ApiService.testGeminiApiKey();
    assert.equal(storedOk.ok, true);
    assert.equal(storedOk.status, 200);
    assert.equal(storedOk.code, 'OK');
    assert.equal(lastUrl, 'https://generativelanguage.googleapis.com/v1beta/models');
    assert.equal(lastKeyHeader, 'AIzaStoredKey');

    globalThis.fetch = (async () => ({ ok: false, status: 403 }) as Response) as typeof fetch;
    const authFail = await ApiService.testGeminiApiKey('AIzaBad');
    assert.equal(authFail.ok, false);
    assert.equal(authFail.status, 403);
    assert.equal(authFail.code, 'AUTH_INVALID_KEY');

    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              message: 'API key not valid',
              details: [{ reason: 'API_KEY_INVALID' }],
            },
          }),
      }) as unknown as Response) as typeof fetch;
    const authFail400 = await ApiService.testGeminiApiKey('AIzaBad400');
    assert.equal(authFail400.ok, false);
    assert.equal(authFail400.status, 400);
    assert.equal(authFail400.code, 'AUTH_INVALID_KEY');

    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'Invalid argument' } }),
      }) as unknown as Response) as typeof fetch;
    const badReq400 = await ApiService.testGeminiApiKey('AIzaBadReq400');
    assert.equal(badReq400.ok, false);
    assert.equal(badReq400.status, 400);
    assert.equal(badReq400.code, 'BAD_REQUEST_400');

    globalThis.fetch = (async () => ({ ok: false, status: 429 }) as Response) as typeof fetch;
    const rateFail = await ApiService.testGeminiApiKey('AIzaRate');
    assert.equal(rateFail.ok, false);
    assert.equal(rateFail.status, 429);
    assert.equal(rateFail.code, 'RATE_LIMIT_429');

    globalThis.fetch = (async () => ({ ok: false, status: 503 }) as Response) as typeof fetch;
    const serverFail = await ApiService.testGeminiApiKey('AIzaServer');
    assert.equal(serverFail.ok, false);
    assert.equal(serverFail.status, 503);
    assert.equal(serverFail.code, 'SERVER_503');

    globalThis.fetch = (async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as typeof fetch;
    const timeoutFail = await ApiService.testGeminiApiKey('AIzaTimeout');
    assert.equal(timeoutFail.ok, false);
    assert.equal(timeoutFail.code, 'TIMEOUT');

    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const netFail = await ApiService.testGeminiApiKey('AIzaNet');
    assert.equal(netFail.ok, false);
    assert.equal(netFail.code, 'NETWORK_ERROR');
  });

  it('backfills memoryApiKeyFallback, retries SecureStore once, and throws when storage is unavailable', async () => {
    // 1. SecureStore succeeds on retry after 1 transient error and backfills memoryApiKeyFallback
    let getCalls = 0;
    const mockSecureStore: SecureStoreLike = {
      getItemAsync: async () => {
        getCalls += 1;
        if (getCalls === 1) throw new Error('Transient keychain lock');
        return '  AIzaFromSecureStore  ';
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    };

    const loadedRetry = await loadUserGeminiApiKey({
      secureStore: mockSecureStore,
      retryDelayMs: 5,
    });
    assert.equal(getCalls, 2);
    assert.equal(loadedRetry, 'AIzaFromSecureStore');

    // 2. When SecureStore fails twice, falls back to backfilled memoryApiKeyFallback
    const failingSecureStore: SecureStoreLike = {
      getItemAsync: async () => {
        throw new Error('Keychain unavailable');
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    };
    const loadedFallback = await loadUserGeminiApiKey({
      secureStore: failingSecureStore,
      retryDelayMs: 5,
    });
    assert.equal(loadedFallback, 'AIzaFromSecureStore');

    // 3. When neither localStorage nor SecureStore is available, saveUserGeminiApiKey throws and clear removes memory
    await clearUserGeminiApiKey({ secureStore: null });
    delete (globalThis as any).localStorage;
    await assert.rejects(
      () => saveUserGeminiApiKey('AIzaShouldFail', { secureStore: null }),
      /無法存取安全儲存空間，無法持久化 API Key/,
    );
    assert.equal(await loadUserGeminiApiKey({ secureStore: null }), '');
  });
});

describe('Track A Security, Data Integrity & Store Regression Suite', () => {
  let storage: ReturnType<typeof installMockLocalStorage>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    storage = installMockLocalStorage();
    storage.clear();
    await clearUserGeminiApiKey();
    ApiService.clearCache();
    useLedgerStore.setState({
      transactions: [],
      filteredTransactions: [],
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      exchangeRates: DEFAULT_EXCHANGE_RATES,
      baseCurrency: 'TWD',
      filters: {
        year: 'ALL',
        month: 'ALL',
        date: '',
        account: 'ALL',
        category: 'ALL',
        currency: 'ALL',
        searchQuery: '',
      },
      isLoading: false,
      isSyncingFX: false,
      initialized: false,
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    storage = installMockLocalStorage();
    storage.clear();
    await clearUserGeminiApiKey();
  });

  it('prevents stale/duplicate delete or update of id=2 from colliding with rowNumber=2 (id=1)', async () => {
    const initial = await ApiService.getSheetData(true);
    const id1Name = initial.find((t) => t.id === 1)?.name;
    assert.ok(id1Name);

    await ApiService.deleteTransaction(2);
    await assert.rejects(() => ApiService.deleteTransaction(2), /找不到該筆交易紀錄/);
    await assert.rejects(
      () =>
        ApiService.updateTransaction(2, {
          account: '現金',
          name: '誤改鄰筆測試',
          category: '食',
          currency: 'TWD',
          amount: -999,
        }),
      /找不到該筆交易紀錄/,
    );

    const after = await ApiService.getSheetData(true);
    assert.equal(after.length, initial.length - 1);
    assert.equal(after.find((t) => t.id === 1)?.name, id1Name);
  });

  it('guarantees monotonic unique LocalStorage IDs and sanitizes whitespace/Infinity inputs', async () => {
    await ApiService.getSheetData(true);
    await ApiService.batchAddTransactions(
      Array.from({ length: 15 }, (_, idx) => ({
        account: '現金',
        name: `批次-${idx}`,
        category: '食',
        currency: 'TWD',
        amount: -10,
      })),
    );
    const added = await ApiService.addTransaction({
      date: '   ',
      time: '   ',
      account: '   ',
      name: '   ',
      category: '   ',
      currency: '   ',
      amount: Infinity,
      note: '   ',
    });

    const txs = await ApiService.getSheetData(true);
    const idSet = new Set(txs.map((t) => String(t.id)));
    assert.equal(idSet.size, txs.length);

    const sanitized = txs.find((t) => t.id === added.id);
    assert.ok(sanitized);
    assert.equal(sanitized.name, '未命名項目');
    assert.equal(sanitized.account, '現金');
    assert.equal(sanitized.category, '食');
    assert.equal(sanitized.currency, 'TWD');
    assert.equal(sanitized.amount, 0);
  });

  it('maintains settings validation, atomic accountIcons cleanup, FX reset, and sorted LocalStorage rows', async () => {
    await ApiService.getSheetData(true);
    await ApiService.saveCustomSettings({
      accounts: ['現金', '永豐銀行', '現金'],
      accountIcons: { 現金: 'cash', 永豐銀行: 'bank' },
    });
    const savedSettings = await ApiService.getCustomSettings();
    assert.deepEqual(savedSettings.accounts, ['現金', '永豐銀行']);

    await assert.rejects(() => ApiService.saveCustomSettings({ accounts: [] }), /至少需保留 1 個帳戶/);
    await assert.rejects(
      () => ApiService.saveCustomSettings({ categories: [] }),
      /至少需保留 1 個分類/,
    );

    await ApiService.deleteAccountCascade('永豐銀行');
    const afterCascade = await ApiService.getCustomSettings();
    assert.equal(afterCascade.accountIcons?.['永豐銀行'], undefined);
    assert.equal(afterCascade.accountIcons?.['現金'], 'cash');

    await ApiService.resetSeedData();
    const cachedFx = JSON.parse(storage.getItem(MOCK_STORAGE_KEYS.FX_CACHE) || '{}');
    assert.equal(cachedFx.updated, DEFAULT_EXCHANGE_RATES.updated);

    const txs = await ApiService.getSheetData(true);
    for (let i = 1; i < txs.length; i += 1) {
      const prevKey = `${txs[i - 1].date} ${txs[i - 1].time}`;
      const currKey = `${txs[i].date} ${txs[i].time}`;
      assert.ok(prevKey >= currKey);
    }
  });

  it('prevents getSheetData cache race with concurrent writes and keeps static FX updated timestamp', async () => {
    await ApiService.getSheetData(true);
    ApiService.clearCache();

    const readPromise = ApiService.getSheetData(false);
    const writePromise = ApiService.addTransaction({
      account: '現金',
      name: '併發寫入測試',
      category: '食',
      currency: 'TWD',
      amount: -55,
    });
    await Promise.all([readPromise, writePromise]);

    const nextRead = await ApiService.getSheetData(false);
    assert.ok(nextRead.some((t) => t.name === '併發寫入測試'));

    globalThis.fetch = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;
    storage.removeItem(MOCK_STORAGE_KEYS.FX_CACHE);

    const fx = await ApiService.getExchangeRates();
    assert.equal(fx.updated, DEFAULT_EXCHANGE_RATES.updated);

    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          rates: { TWD: 1, USD: -0.5, JPY: Infinity },
          time_last_update_utc: '2026-11-20',
        }),
      }) as unknown as Response) as typeof fetch;

    const fxInvalidLive = await ApiService.getExchangeRates();
    assert.equal(fxInvalidLive.rates.USD, undefined);
    assert.equal(fxInvalidLive.rates.JPY, undefined);
  });

  it('sanitizes Gemini drafts (date, time, currency aliases, positive income category, data URL media)', async () => {
    let sentBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      reply: 'ok',
                      transactions: [
                        {
                          name: '年終獎金',
                          amount: 50000,
                          currency: 'NT$',
                          category: '獎金紅包',
                          account: '永豐銀行',
                          date: '2026-02-30',
                          time: '99:99',
                          note: '  bonus  ',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const res = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '年終獎金 50000',
      'data:image/png;base64,QUJD',
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '14:30',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(res.parsedTransactions.length, 1);
    const tx = res.parsedTransactions[0];
    assert.equal(tx.currency, 'TWD');
    assert.equal(tx.category, '收入');
    assert.equal(tx.date, '2026-11-20');
    assert.equal(tx.time, '14:30');
    assert.equal(tx.note, 'bonus');
    assert.ok(sentBody.includes('"data":"QUJD"'));
    assert.ok(!sentBody.includes('data:image/png;base64,'));
  });

  it('handles brand digits, dates, commas, -0, account length order, renamed food category & baseCurrency in fallbackParser', () => {
    const sevenEleven = fallbackParseTransaction('7-11 咖啡 85', DEFAULT_SETTINGS, '2026-11-20', '09:00');
    assert.equal(sevenEleven.parsedTransactions[0].amount, -85);
    assert.ok(sevenEleven.parsedTransactions[0].name.includes('7-11'));

    const cafe85 = fallbackParseTransaction('85度C 65', DEFAULT_SETTINGS, '2026-11-20', '09:00');
    assert.equal(cafe85.parsedTransactions[0].amount, -65);

    const dated = fallbackParseTransaction('2026-11-20 午餐 120', DEFAULT_SETTINGS, '2026-11-20', '12:00');
    assert.equal(dated.parsedTransactions[0].amount, -120);

    const comma = fallbackParseTransaction('聚餐 1,200 現金', DEFAULT_SETTINGS, '2026-11-20', '19:00');
    assert.equal(comma.parsedTransactions[0].amount, -1200);

    const zero = fallbackParseTransaction('免費試吃 0 元 現金', DEFAULT_SETTINGS, '2026-11-20', '12:00');
    assert.ok(Object.is(zero.parsedTransactions[0].amount, 0));

    const accRes = fallbackParseTransaction(
      '拿鐵 155 line pay',
      { ...DEFAULT_SETTINGS, accounts: ['LINE', 'LINE Pay'] },
      '2026-11-20',
      '10:00',
    );
    assert.equal(accRes.parsedTransactions[0].account, 'LINE Pay');

    const renamedFoodSettings = {
      ...DEFAULT_SETTINGS,
      categories: ['餐飲', '行', '衣', '住', '收入'],
      baseCurrency: 'JPY' as const,
    };
    const transportRes = fallbackParseTransaction(
      '捷運通勤 35 悠遊卡',
      renamedFoodSettings,
      '2026-11-20',
      '08:30',
    );
    assert.equal(transportRes.parsedTransactions[0].category, '行');
    assert.equal(transportRes.parsedTransactions[0].currency, 'JPY');
  });

  it('guards currency negative/Infinity rates, -NT$0 formatting, and analytics float residuals/sorting', () => {
    assert.equal(convertCurrency(Infinity, 'USD', 'TWD'), 0);
    assert.equal(
      Math.round(convertCurrency(10, 'USD', 'TWD', { USD: -1, TWD: 1 })),
      Math.round(convertCurrency(10, 'USD', 'TWD', DEFAULT_EXCHANGE_RATES)),
    );
    assert.equal(formatMoney(-0.4, 'TWD'), 'NT$0');
    assert.equal(formatMoney(-0.004, 'USD'), '$0.00');
    assert.equal(formatMoney(Infinity, 'TWD'), 'NT$0');

    const residualTxs: Transaction[] = [
      {
        id: 'tx-a',
        date: '2026-11-20',
        time: '12:00',
        account: '   ',
        name: 'A',
        category: '   ',
        currency: 'USD',
        amount: 0.1,
        note: '',
      },
      {
        id: 'tx-b',
        date: '2026-11-20',
        time: '12:00',
        account: '現金',
        name: 'B',
        category: '食',
        currency: 'USD',
        amount: 0.2,
        note: '',
      },
      {
        id: 'tx-c',
        date: '2026-11-20',
        time: '12:00',
        account: '現金',
        name: 'C',
        category: '食',
        currency: 'USD',
        amount: -0.3,
        note: '',
      },
    ];

    const accStats = computeAccountStats(residualTxs, ['現金'], 'TWD', DEFAULT_EXCHANGE_RATES);
    assert.equal(accStats[0].balance, 0);
    assert.equal(accStats[0].currencyBreakdown.USD, 0);

    const filtered = filterTransactions(residualTxs, {
      year: 'ALL',
      month: 'ALL',
      date: '',
      account: ' 現金 ',
      category: 'ALL',
      currency: 'ALL',
      searchQuery: '2026-11-20',
    });
    assert.equal(filtered.length, 2);
    assert.deepEqual(
      filtered.map((d) => d.id),
      ['tx-c', 'tx-b'],
    );

    const grouped = groupTransactionsByDate(residualTxs);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].date, '2026-11-20');
    assert.deepEqual(
      grouped[0].data.map((d) => d.id),
      ['tx-c', 'tx-b', 'tx-a'],
    );
  });

  it('safely decodes UTF-16 without TextDecoder support, uses local date, rejects 99:99 and empty-amount summary rows in CSV', () => {
    const OrigTextDecoder = globalThis.TextDecoder;
    globalThis.TextDecoder = class MockHermesDecoder {
      private encoding: string;
      constructor(encoding = 'utf-8') {
        if (encoding.toLowerCase().startsWith('utf-16')) {
          throw new RangeError('Unsupported encoding');
        }
        this.encoding = encoding;
      }
      decode(input: Uint8Array): string {
        return new OrigTextDecoder(this.encoding).decode(input);
      }
    } as unknown as typeof TextDecoder;

    try {
      // UTF-16LE BOM + "日期,金額"
      const leBytes = new Uint8Array([
        0xff, 0xfe,
        0xe5, 0x65, 0x1f, 0x67, // 日期
        0x2c, 0x00, // ,
        0xd1, 0x91, 0x4d, 0x98, // 金額
      ]);
      assert.equal(decodeCsvBytes(leBytes), '日期,金額');
    } finally {
      globalThis.TextDecoder = OrigTextDecoder;
    }

    const csv =
      '日期,時間,帳戶,項目名稱,分類,幣別,金額,備註\n' +
      '2026-02-30,99:99,現金,異常日期時間,食,TWD,-100,\n' +
      ',,,,合計,,,\n' +
      '2026-11-20,10:00,現金,零元項目,食,TWD,(0),\n';

    const drafts = parseCsvTransactions(csv);
    assert.equal(drafts.length, 2);
    assert.equal(drafts[0].date, getLocalDateStr());
    assert.equal(drafts[0].time, '00:00');
    assert.equal(drafts[1].name, '零元項目');
    assert.ok(Object.is(drafts[1].amount, 0));
  });

  it('keeps store initialized=false on load failure, rolls back setBaseCurrency, clears date on month change & serializes updateSettings', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('offline test');
    }) as typeof fetch;
    const origGetSheetData = ApiService.getSheetData.bind(ApiService);
    const origSaveSettings = ApiService.saveCustomSettings.bind(ApiService);

    (ApiService as any).getSheetData = async () => {
      throw new Error('storage read failed');
    };
    try {
      await useLedgerStore.getState().initialize();
      assert.equal(useLedgerStore.getState().initialized, false);
    } finally {
      (ApiService as any).getSheetData = origGetSheetData;
    }

    await useLedgerStore.getState().initialize();
    assert.equal(useLedgerStore.getState().initialized, true);

    (ApiService as any).saveCustomSettings = async () => {
      throw new Error('disk full');
    };
    try {
      await assert.rejects(() => useLedgerStore.getState().setBaseCurrency('JPY'), /disk full/);
      assert.equal(useLedgerStore.getState().baseCurrency, 'TWD');
      assert.equal(useLedgerStore.getState().settings.baseCurrency, 'TWD');
    } finally {
      (ApiService as any).saveCustomSettings = origSaveSettings;
    }

    useLedgerStore.getState().setFilter({ date: '2026-11-20' });
    assert.equal(useLedgerStore.getState().filters.date, '2026-11-20');
    useLedgerStore.getState().setFilter({ month: '10' });
    assert.equal(useLedgerStore.getState().filters.date, '');
    assert.equal(useLedgerStore.getState().filters.month, '10');

    await Promise.all([
      useLedgerStore.getState().updateSettings({ simulate503: true }),
      useLedgerStore.getState().updateSettings({ themeMode: 'dark' }),
    ]);
    assert.equal(useLedgerStore.getState().settings.simulate503, true);
    assert.equal(useLedgerStore.getState().settings.themeMode, 'dark');

    useLedgerStore.getState().setFilter({ account: '現金' });
    await useLedgerStore.getState().removeAccountCascade(' 現金 ');
    assert.equal(useLedgerStore.getState().filters.account, 'ALL');
  });
});
