import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ApiService, MODELS_CASCADE } from '../src/services/apiService';
import { DEFAULT_SETTINGS, MOCK_STORAGE_KEYS } from '../src/services/database';
import { fallbackParseTransaction } from '../src/services/fallbackParser';
import { Transaction } from '../src/types/ledger';
import { computeCategoryStats, computeKPIStats } from '../src/utils/analytics';
import { convertCurrency, DEFAULT_EXCHANGE_RATES, formatMoney } from '../src/utils/currency';

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
});
