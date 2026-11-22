import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAccountMeta, getCategoryMeta } from '../src/theme/colors';
import { Transaction } from '../src/types/ledger';
import {
  BreakdownStat,
  computeFlowBreakdown,
} from '../src/utils/analytics';
import { DEFAULT_EXCHANGE_RATES } from '../src/utils/currency';

function makeTx(overrides: Partial<Transaction> & { id: number | string }): Transaction {
  return {
    date: '2026-11-20',
    time: '12:00',
    account: '現金',
    name: '測試項目',
    category: '食',
    currency: 'TWD',
    amount: -100,
    note: '',
    ...overrides,
  };
}

describe('computeFlowBreakdown', () => {
  it('computes all 4 combinations (expense/income × category/account) and excludes neutral flow categories', () => {
    const txs: Transaction[] = [
      // Excluded categories (must be ignored in both category and account dimensions)
      makeTx({ id: 1, category: '初始資產', account: '永豐銀行', amount: 100000 }),
      makeTx({ id: 2, category: '內部轉帳', account: '永豐銀行', amount: -5000 }),
      makeTx({ id: 3, category: ' 內部轉帳 ', account: '現金', amount: 5000 }),
      makeTx({ id: 4, category: '代墊款', account: 'LINE Pay', amount: -1500 }),
      // Real expenses
      makeTx({ id: 5, category: '食', account: 'LINE Pay', amount: -300 }),
      makeTx({ id: 6, category: '食', account: '現金', amount: -200 }),
      makeTx({ id: 7, category: '行', account: 'LINE Pay', amount: -500 }),
      // Real incomes
      makeTx({ id: 8, category: '收入', account: '永豐銀行', amount: 60000 }),
      makeTx({ id: 9, category: '投資', account: '玉山銀行', amount: 15000 }),
      makeTx({ id: 10, category: '代墊回收', account: 'LINE Pay', amount: 5000 }),
      makeTx({ id: 11, category: '收入', account: '永豐銀行', amount: 20000 }),
    ];

    // 1. expense × category
    const expCat: BreakdownStat[] = computeFlowBreakdown(
      txs,
      'expense',
      'category',
      'TWD',
      DEFAULT_EXCHANGE_RATES,
    );
    assert.equal(expCat.length, 2);
    assert.equal(expCat[0].key, '食');
    assert.equal(expCat[0].amount, 500);
    assert.equal(expCat[0].percentage, 50);
    assert.equal(expCat[0].count, 2);
    assert.equal(expCat[0].color, getCategoryMeta('食').color);
    assert.equal(expCat[0].icon, getCategoryMeta('食').icon);

    assert.equal(expCat[1].key, '行');
    assert.equal(expCat[1].amount, 500);
    assert.equal(expCat[1].percentage, 50);
    assert.equal(expCat[1].count, 1);

    // 2. expense × account
    const expAcc = computeFlowBreakdown(
      txs,
      'expense',
      'account',
      'TWD',
      DEFAULT_EXCHANGE_RATES,
    );
    assert.equal(expAcc.length, 2);
    assert.equal(expAcc[0].key, 'LINE Pay');
    assert.equal(expAcc[0].amount, 800);
    assert.equal(expAcc[0].percentage, 80);
    assert.equal(expAcc[0].count, 2);
    assert.equal(expAcc[0].color, getAccountMeta('LINE Pay').color);
    assert.equal(expAcc[0].icon, getAccountMeta('LINE Pay').icon);

    assert.equal(expAcc[1].key, '現金');
    assert.equal(expAcc[1].amount, 200);
    assert.equal(expAcc[1].percentage, 20);
    assert.equal(expAcc[1].count, 1);

    // 3. income × category
    const incCat = computeFlowBreakdown(
      txs,
      'income',
      'category',
      'TWD',
      DEFAULT_EXCHANGE_RATES,
    );
    assert.deepEqual(
      incCat.map((item) => ({
        key: item.key,
        amount: item.amount,
        percentage: item.percentage,
        count: item.count,
      })),
      [
        { key: '收入', amount: 80000, percentage: 80, count: 2 },
        { key: '投資', amount: 15000, percentage: 15, count: 1 },
        { key: '代墊回收', amount: 5000, percentage: 5, count: 1 },
      ],
    );
    assert.equal(incCat[0].color, getCategoryMeta('收入').color);
    assert.equal(incCat[0].icon, getCategoryMeta('收入').icon);

    // 4. income × account
    const incAcc = computeFlowBreakdown(
      txs,
      'income',
      'account',
      'TWD',
      DEFAULT_EXCHANGE_RATES,
    );
    assert.deepEqual(
      incAcc.map((item) => ({
        key: item.key,
        amount: item.amount,
        percentage: item.percentage,
        count: item.count,
      })),
      [
        { key: '永豐銀行', amount: 80000, percentage: 80, count: 2 },
        { key: '玉山銀行', amount: 15000, percentage: 15, count: 1 },
        { key: 'LINE Pay', amount: 5000, percentage: 5, count: 1 },
      ],
    );
    assert.equal(incAcc[0].color, getAccountMeta('永豐銀行').color);
    assert.equal(incAcc[0].icon, getAccountMeta('永豐銀行').icon);
  });

  it('converts multi-currency amounts accurately into baseCurrency and rounds percentages to 1 decimal', () => {
    const txs: Transaction[] = [
      // 10 USD = 320 TWD at DEFAULT_EXCHANGE_RATES (USD: 0.03125 -> 10 / 0.03125 = 320)
      makeTx({ id: 1, category: '食', account: '國泰世華', currency: 'USD', amount: -10 }),
      // 4650 JPY = 1000 TWD at DEFAULT_EXCHANGE_RATES (JPY: 4.65 -> 4650 / 4.65 = 1000)
      makeTx({ id: 2, category: '行', account: '現金', currency: 'JPY', amount: -4650 }),
      makeTx({ id: 3, category: '育樂', account: 'LINE Pay', currency: 'TWD', amount: -680 }),
    ];

    const stats = computeFlowBreakdown(txs, 'expense', 'category', 'TWD', DEFAULT_EXCHANGE_RATES);
    assert.equal(stats.length, 3);
    assert.equal(stats[0].key, '行');
    assert.equal(Math.round(stats[0].amount), 1000);
    assert.equal(stats[0].percentage, 50);

    assert.equal(stats[1].key, '育樂');
    assert.equal(stats[1].amount, 680);
    assert.equal(stats[1].percentage, 34);

    assert.equal(stats[2].key, '食');
    assert.equal(Math.round(stats[2].amount), 320);
    assert.equal(stats[2].percentage, 16);

    // 1/3 vs 2/3 -> 33.3% and 66.7%
    const ratioTxs: Transaction[] = [
      makeTx({ id: 10, category: '食', amount: -100 }),
      makeTx({ id: 11, category: '行', amount: -200 }),
    ];
    const ratioStats = computeFlowBreakdown(ratioTxs, 'expense', 'category', 'TWD');
    assert.equal(ratioStats[0].key, '行');
    assert.equal(ratioStats[0].percentage, 66.7);
    assert.equal(ratioStats[1].key, '食');
    assert.equal(ratioStats[1].percentage, 33.3);
  });

  it('handles blank keys with fallbacks, empty datasets, non-finite amounts, zeros, and float residuals', () => {
    // Empty input
    assert.deepEqual(computeFlowBreakdown([], 'expense', 'category'), []);
    assert.deepEqual(computeFlowBreakdown([], 'income', 'account'), []);

    const edgeTxs: Transaction[] = [
      makeTx({ id: 1, category: '   ', account: '   ', amount: -150 }),
      makeTx({ id: 2, category: '食', account: '現金', amount: 0 }),
      makeTx({ id: 3, category: '食', account: '現金', amount: -0 }),
      makeTx({ id: 4, category: '食', account: '現金', amount: Number.NaN }),
      makeTx({ id: 5, category: '食', account: '現金', amount: Number.POSITIVE_INFINITY }),
      makeTx({ id: 6, category: '食', account: '現金', amount: Number.NEGATIVE_INFINITY }),
      makeTx({ id: 7, category: '殘值分類', account: '殘值帳戶', amount: -1e-12 }),
      makeTx({ id: 8, category: '殘值收入', account: '殘值帳戶', amount: 1e-12 }),
      makeTx({ id: 9, category: '   ', account: '   ', amount: 250 }),
    ];

    const expCat = computeFlowBreakdown(edgeTxs, 'expense', 'category');
    assert.equal(expCat.length, 1);
    assert.equal(expCat[0].key, '未分類');
    assert.equal(expCat[0].amount, 150);
    assert.equal(expCat[0].percentage, 100);
    assert.equal(expCat[0].count, 1);

    const expAcc = computeFlowBreakdown(edgeTxs, 'expense', 'account');
    assert.equal(expAcc.length, 1);
    assert.equal(expAcc[0].key, '現金');
    assert.equal(expAcc[0].amount, 150);
    assert.equal(expAcc[0].percentage, 100);

    const incCat = computeFlowBreakdown(edgeTxs, 'income', 'category');
    assert.equal(incCat.length, 1);
    assert.equal(incCat[0].key, '未分類');
    assert.equal(incCat[0].amount, 250);
    assert.equal(incCat[0].percentage, 100);

    const incAcc = computeFlowBreakdown(edgeTxs, 'income', 'account');
    assert.equal(incAcc.length, 1);
    assert.equal(incAcc[0].key, '現金');
    assert.equal(incAcc[0].amount, 250);
    assert.equal(incAcc[0].percentage, 100);
  });
});
