import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ApiService, MODELS_CASCADE } from '../src/services/apiService';
import { DEFAULT_SETTINGS, MOCK_STORAGE_KEYS } from '../src/services/database';
import { fallbackParseTransaction } from '../src/services/fallbackParser';
import { Transaction } from '../src/types/ledger';
import { computeCategoryStats, computeKPIStats } from '../src/utils/analytics';
import { convertCurrency, DEFAULT_EXCHANGE_RATES, formatMoney } from '../src/utils/currency';
import { decodeCsvBytes, extractSpreadsheetId, parseCsvTransactions } from '../src/utils/csvImport';

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

  it('computes KPI stats excluding 初始資產, 內部轉帳, 代墊款 and calculates Engel ratio', () => {
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
    assert.equal(kpi.foodAmount, 200);
    assert.equal(kpi.foodRatio, 40);

    const catStats = computeCategoryStats(txs, 'TWD', DEFAULT_EXCHANGE_RATES);
    assert.equal(catStats.length, 2);
    assert.equal(catStats[0].category, '行');
    assert.equal(catStats[0].amount, 300);
    assert.equal(catStats[1].category, '食');
    assert.equal(catStats[1].amount, 200);
  });

  it('computes KPI Engel ratio properly when food category is 餐飲', () => {
    const txs: Transaction[] = [
      {
        id: 10,
        date: '2026-11-10',
        time: '09:00',
        account: '永豐銀行',
        name: '薪資',
        category: '收入',
        currency: 'TWD',
        amount: 10000,
        note: '',
      },
      {
        id: 11,
        date: '2026-11-11',
        time: '12:30',
        account: '現金',
        name: '商務午餐',
        category: '餐飲',
        currency: 'TWD',
        amount: -400,
        note: '',
      },
      {
        id: 12,
        date: '2026-11-11',
        time: '18:00',
        account: '悠遊卡',
        name: '高鐵票',
        category: '行',
        currency: 'TWD',
        amount: -600,
        note: '',
      },
    ];

    const kpi = computeKPIStats(txs, 'TWD', DEFAULT_EXCHANGE_RATES);
    assert.equal(kpi.realIncome, 10000);
    assert.equal(kpi.realExpense, 1000);
    assert.equal(kpi.foodAmount, 400);
    assert.equal(kpi.foodRatio, 40);
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

  it('falls back to rule engine when aiProxyUrl is unconfigured', async () => {
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
    assert.equal(await ApiService.hasGeminiApiKey(), false);

    await ApiService.saveGeminiApiKey('  AIzaSyTestKey123  ');
    assert.equal(await ApiService.getGeminiApiKey(), 'AIzaSyTestKey123');
    assert.equal(await ApiService.hasGeminiApiKey(), true);

    await ApiService.clearGeminiApiKey();
    assert.equal(await ApiService.getGeminiApiKey(), '');
    assert.equal(await ApiService.hasGeminiApiKey(), false);
  });
});

describe('CSV Import & Spreadsheet ID', () => {
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

  it('extractSpreadsheetId parses full Google Sheets URLs, raw IDs, and rejects invalid inputs', () => {
    assert.equal(
      extractSpreadsheetId(
        'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0',
      ),
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    );
    assert.equal(
      extractSpreadsheetId('  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms  '),
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    );
    assert.equal(extractSpreadsheetId(''), null);
    assert.equal(extractSpreadsheetId('https://example.com/not-a-sheet'), null);
    assert.equal(extractSpreadsheetId('short'), null);
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
