import { getAccountMeta, getCategoryMeta } from '../theme/colors';
import {
  AccountStat,
  CurrencyCode,
  ExchangeRates,
  FilterState,
  KPIStats,
  Transaction,
  TrendPoint,
} from '../types/ledger';
import { convertCurrency } from './currency';
import { compareIdsDesc } from './dateTime';

export const EXCLUDED_FLOW_CATEGORIES = new Set(['初始資產', '內部轉帳', '代墊款']);

export type FlowType = 'expense' | 'income';
export type BreakdownDimension = 'category' | 'account';

export interface BreakdownStat {
  key: string;
  amount: number;
  percentage: number;
  count: number;
  color: string;
  icon: string;
}

export interface AvailableTimeBuckets {
  years: string[];
  months: string[];
  days: string[];
}

export function extractAvailableTimeBuckets(
  transactions: Transaction[],
  seeds?: { year?: string; month?: string; day?: string },
): AvailableTimeBuckets {
  const yearSet = new Set<string>();
  const monthSet = new Set<string>();
  const daySet = new Set<string>();

  const seedYear = seeds?.year?.trim();
  const seedMonth = seeds?.month?.trim();
  const seedDay = seeds?.day?.trim();
  if (seedYear) yearSet.add(seedYear);
  if (seedMonth) monthSet.add(seedMonth);
  if (seedDay) daySet.add(seedDay);

  for (const tx of transactions) {
    const dateStr = (tx.date || '').trim();
    if (!dateStr) continue;

    const year = dateStr.slice(0, 4);
    if (/^\d{4}$/.test(year)) {
      yearSet.add(year);
    }

    const month = dateStr.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) {
      monthSet.add(month);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      daySet.add(dateStr);
    }
  }

  return {
    years: Array.from(yearSet).sort((a, b) => b.localeCompare(a)),
    months: Array.from(monthSet).sort((a, b) => b.localeCompare(a)),
    days: Array.from(daySet).sort((a, b) => b.localeCompare(a)),
  };
}

function cleanFloatResidual(val: number, threshold = 1e-6): number {
  if (!Number.isFinite(val)) return 0;
  return Math.abs(val) < threshold || Object.is(val, -0) ? 0 : val;
}

export interface DateGroupedSection {
  date: string;
  data: Transaction[];
}

export function computeKPIStats(
  transactions: Transaction[],
  baseCurrency: CurrencyCode | string = 'TWD',
  exchangeRates?: ExchangeRates | Record<string, number>,
  allTransactionsForNetWorth?: Transaction[],
): KPIStats {
  const netWorthSource = allTransactionsForNetWorth ?? transactions;
  let netWorth = 0;
  for (const tx of netWorthSource) {
    netWorth += convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates);
  }

  let realIncome = 0;
  let realExpense = 0;

  for (const tx of transactions) {
    const cat = (tx.category || '').trim();
    const converted = convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates);

    if (EXCLUDED_FLOW_CATEGORIES.has(cat)) {
      continue;
    }

    if (tx.amount > 0) {
      realIncome += converted;
    } else if (tx.amount < 0) {
      realExpense += Math.abs(converted);
    }
  }

  const cleanNetWorth = cleanFloatResidual(netWorth, 1e-9);
  const cleanIncome = cleanFloatResidual(realIncome, 1e-9);
  const cleanExpense = cleanFloatResidual(realExpense, 1e-9);

  console.log(
    `[analytics/computeKPIStats] Computed - tx=${transactions.length}, base=${baseCurrency}, realIncome=${cleanIncome}, realExpense=${cleanExpense}, netWorth=${cleanNetWorth}`,
  );

  return {
    netWorth: cleanNetWorth,
    realIncome: cleanIncome,
    realExpense: cleanExpense,
    netCashflow: cleanFloatResidual(cleanIncome - cleanExpense, 1e-9),
    transactionCount: transactions.length,
  };
}

export function computeFlowBreakdown(
  transactions: Transaction[],
  flow: FlowType,
  dimension: BreakdownDimension,
  baseCurrency: CurrencyCode | string = 'TWD',
  exchangeRates?: ExchangeRates | Record<string, number>,
): BreakdownStat[] {
  const bucketMap = new Map<string, { amount: number; count: number }>();
  let total = 0;

  for (const tx of transactions) {
    const rawCat = (tx.category || '').trim();
    if (EXCLUDED_FLOW_CATEGORIES.has(rawCat)) {
      continue;
    }

    const amt = Number(tx.amount);
    if (!Number.isFinite(amt)) {
      continue;
    }
    if (flow === 'expense' && amt >= 0) {
      continue;
    }
    if (flow === 'income' && amt <= 0) {
      continue;
    }

    const converted = convertCurrency(amt, tx.currency, baseCurrency, exchangeRates);
    const magnitude = cleanFloatResidual(
      flow === 'expense' ? Math.abs(converted) : converted,
      1e-9,
    );
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      continue;
    }

    const key =
      dimension === 'category'
        ? rawCat || '未分類'
        : (tx.account || '').trim() || '現金';

    total += magnitude;
    const prev = bucketMap.get(key) || { amount: 0, count: 0 };
    bucketMap.set(key, {
      amount: prev.amount + magnitude,
      count: prev.count + 1,
    });
  }

  const cleanTotal = cleanFloatResidual(total, 1e-9);
  const stats: BreakdownStat[] = [];

  for (const [key, info] of bucketMap.entries()) {
    const cleanAmount = cleanFloatResidual(info.amount, 1e-9);
    if (cleanAmount <= 0) continue;
    const meta = dimension === 'category' ? getCategoryMeta(key) : getAccountMeta(key);
    stats.push({
      key,
      amount: cleanAmount,
      percentage:
        cleanTotal > 0 ? Number(((cleanAmount / cleanTotal) * 100).toFixed(1)) : 0,
      count: info.count,
      color: meta.color,
      icon: meta.icon,
    });
  }

  stats.sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
  console.log(
    `[analytics/computeFlowBreakdown] Computed - flow=${flow}, dim=${dimension}, tx=${transactions.length}, buckets=${stats.length}, total=${cleanTotal}`,
  );
  return stats;
}

export function computeAccountStats(
  transactions: Transaction[],
  accounts: string[] = [],
  baseCurrency: CurrencyCode | string = 'TWD',
  exchangeRates?: ExchangeRates | Record<string, number>,
): AccountStat[] {
  const accountMap = new Map<
    string,
    { balance: number; transactionCount: number; currencyBreakdown: Record<string, number> }
  >();

  for (const acc of accounts) {
    const clean = acc.trim();
    if (clean && !accountMap.has(clean)) {
      accountMap.set(clean, { balance: 0, transactionCount: 0, currencyBreakdown: {} });
    }
  }

  for (const tx of transactions) {
    const acc = (tx.account || '').trim() || '現金';
    const cur = (tx.currency || '').trim().toUpperCase() || 'TWD';
    const rawAmt = Number(tx.amount);
    const safeAmt = Number.isFinite(rawAmt) ? rawAmt : 0;
    const entry = accountMap.get(acc) || {
      balance: 0,
      transactionCount: 0,
      currencyBreakdown: {},
    };

    entry.balance += convertCurrency(safeAmt, cur, baseCurrency, exchangeRates);
    entry.transactionCount += 1;
    entry.currencyBreakdown[cur] = (entry.currencyBreakdown[cur] || 0) + safeAmt;
    accountMap.set(acc, entry);
  }

  for (const entry of accountMap.values()) {
    entry.balance = cleanFloatResidual(entry.balance, 1e-6);
    for (const [curKey, curVal] of Object.entries(entry.currencyBreakdown)) {
      entry.currencyBreakdown[curKey] = cleanFloatResidual(curVal, 1e-6);
    }
  }

  let totalPositiveAssets = 0;
  for (const entry of accountMap.values()) {
    if (entry.balance > 0) {
      totalPositiveAssets += entry.balance;
    }
  }

  const result: AccountStat[] = [];
  for (const [account, entry] of accountMap.entries()) {
    const meta = getAccountMeta(account);
    const sharePercentage =
      entry.balance > 0 && totalPositiveAssets > 0
        ? Number(((entry.balance / totalPositiveAssets) * 100).toFixed(1))
        : 0;

    result.push({
      account,
      balance: entry.balance,
      sharePercentage,
      transactionCount: entry.transactionCount,
      currencyBreakdown: entry.currencyBreakdown,
      color: meta.color,
      icon: meta.icon,
    });
  }

  return result.sort((a, b) => b.balance - a.balance);
}

export function computeTrendStats(
  transactions: Transaction[],
  baseCurrency: CurrencyCode | string = 'TWD',
  exchangeRates?: ExchangeRates | Record<string, number>,
  granularity: 'day' | 'month' = 'day',
): TrendPoint[] {
  const map = new Map<string, { income: number; expense: number }>();

  for (const tx of transactions) {
    const cat = (tx.category || '').trim();
    if (EXCLUDED_FLOW_CATEGORIES.has(cat)) continue;

    const rawDate = (tx.date || '').trim();
    if (!rawDate) continue;
    const key = granularity === 'month' ? rawDate.slice(0, 7) : rawDate;
    const entry = map.get(key) || { income: 0, expense: 0 };
    const converted = convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates);

    if (tx.amount > 0) {
      entry.income += converted;
    } else if (tx.amount < 0) {
      entry.expense += Math.abs(converted);
    }
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({
      key,
      label: granularity === 'month' ? key : key.slice(5),
      income: val.income,
      expense: val.expense,
      net: val.income - val.expense,
    }));
}

export function filterTransactions(
  transactions: Transaction[],
  filters: FilterState,
): Transaction[] {
  const query = (filters.searchQuery || '').trim().toLowerCase();

  return transactions
    .filter((tx) => {
      const dateStr = (tx.date || '').trim();
      const parts = dateStr.split('-');

      if (filters.date) {
        if (dateStr !== filters.date) return false;
      } else {
        if (filters.year && filters.year !== 'ALL' && parts[0] !== filters.year) return false;
        if (filters.month && filters.month !== 'ALL' && parts[1] !== filters.month) return false;
      }

      if (
        filters.account &&
        filters.account !== 'ALL' &&
        (tx.account || '').trim() !== filters.account.trim()
      ) {
        return false;
      }
      if (
        filters.category &&
        filters.category !== 'ALL' &&
        (tx.category || '').trim() !== filters.category.trim()
      ) {
        return false;
      }
      if (
        filters.currency &&
        filters.currency !== 'ALL' &&
        (tx.currency || 'TWD').trim().toUpperCase() !== filters.currency.trim().toUpperCase()
      ) {
        return false;
      }

      if (query) {
        const haystack = `${tx.date || ''} ${tx.time || ''} ${tx.name || ''} ${tx.note || ''} ${tx.account || ''} ${tx.category || ''} ${tx.currency || ''} ${tx.amount ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      const timeCmp = (b.time || '').localeCompare(a.time || '');
      if (timeCmp !== 0) return timeCmp;
      return compareIdsDesc(a.id, b.id);
    });
}

export function groupTransactionsByDate(transactions: Transaction[]): DateGroupedSection[] {
  const grouped = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const dateKey = (tx.date || '').trim() || '未知日期';
    const list = grouped.get(dateKey) || [];
    list.push(tx);
    grouped.set(dateKey, list);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({
      date,
      data: [...list].sort(
        (a, b) => (b.time || '').localeCompare(a.time || '') || compareIdsDesc(a.id, b.id),
      ),
    }));
}
