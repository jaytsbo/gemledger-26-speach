import { getAccountMeta, getCategoryMeta } from '../theme/colors';
import {
  AccountStat,
  CategoryStat,
  CurrencyCode,
  ExchangeRates,
  FilterState,
  KPIStats,
  Transaction,
  TrendPoint,
} from '../types/ledger';
import { convertCurrency } from './currency';

export const EXCLUDED_FLOW_CATEGORIES = new Set(['初始資產', '內部轉帳', '代墊款']);

export interface DateGroupedSection {
  date: string;
  dayIncome: number;
  dayExpense: number;
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
  let foodAmount = 0;

  for (const tx of transactions) {
    const cat = (tx.category || '').trim();
    const converted = convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates);

    if (EXCLUDED_FLOW_CATEGORIES.has(cat)) {
      continue;
    }

    if (tx.amount > 0) {
      realIncome += converted;
    } else if (tx.amount < 0) {
      const absAmt = Math.abs(converted);
      realExpense += absAmt;
      if (cat === '食') {
        foodAmount += absAmt;
      }
    }
  }

  const foodRatio = realExpense > 0 ? Number(((foodAmount / realExpense) * 100).toFixed(1)) : 0;

  return {
    netWorth,
    realIncome,
    realExpense,
    netCashflow: realIncome - realExpense,
    foodAmount,
    foodRatio,
    transactionCount: transactions.length,
  };
}

export function computeCategoryStats(
  transactions: Transaction[],
  baseCurrency: CurrencyCode | string = 'TWD',
  exchangeRates?: ExchangeRates | Record<string, number>,
): CategoryStat[] {
  const catMap = new Map<string, { amount: number; count: number }>();
  let totalExpense = 0;

  for (const tx of transactions) {
    const cat = (tx.category || '未分類').trim();
    if (tx.amount >= 0 || EXCLUDED_FLOW_CATEGORIES.has(cat)) {
      continue;
    }
    const absConverted = Math.abs(convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates));
    totalExpense += absConverted;
    const prev = catMap.get(cat) || { amount: 0, count: 0 };
    catMap.set(cat, { amount: prev.amount + absConverted, count: prev.count + 1 });
  }

  const stats: CategoryStat[] = [];
  for (const [category, info] of catMap.entries()) {
    const meta = getCategoryMeta(category);
    stats.push({
      category,
      amount: info.amount,
      percentage: totalExpense > 0 ? Number(((info.amount / totalExpense) * 100).toFixed(1)) : 0,
      count: info.count,
      color: meta.color,
      icon: meta.icon,
    });
  }

  return stats.sort((a, b) => b.amount - a.amount);
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
    const acc = (tx.account || '現金').trim();
    const cur = (tx.currency || 'TWD').trim().toUpperCase();
    const entry = accountMap.get(acc) || {
      balance: 0,
      transactionCount: 0,
      currencyBreakdown: {},
    };

    entry.balance += convertCurrency(tx.amount, cur, baseCurrency, exchangeRates);
    entry.transactionCount += 1;
    entry.currencyBreakdown[cur] = (entry.currencyBreakdown[cur] || 0) + (Number(tx.amount) || 0);
    accountMap.set(acc, entry);
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

      if (filters.account && filters.account !== 'ALL' && tx.account !== filters.account) {
        return false;
      }
      if (filters.category && filters.category !== 'ALL' && tx.category !== filters.category) {
        return false;
      }
      if (
        filters.currency &&
        filters.currency !== 'ALL' &&
        (tx.currency || 'TWD').toUpperCase() !== filters.currency.toUpperCase()
      ) {
        return false;
      }

      if (query) {
        const haystack = `${tx.name || ''} ${tx.note || ''} ${tx.account || ''} ${tx.category || ''} ${tx.currency || ''} ${tx.amount ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      const timeCmp = (b.time || '').localeCompare(a.time || '');
      if (timeCmp !== 0) return timeCmp;
      return Number(b.id || 0) - Number(a.id || 0);
    });
}

export function groupTransactionsByDate(
  transactions: Transaction[],
  baseCurrency: CurrencyCode | string = 'TWD',
  exchangeRates?: ExchangeRates | Record<string, number>,
): DateGroupedSection[] {
  const grouped = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const dateKey = (tx.date || '未知日期').trim();
    const list = grouped.get(dateKey) || [];
    list.push(tx);
    grouped.set(dateKey, list);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => {
      let dayIncome = 0;
      let dayExpense = 0;

      for (const tx of list) {
        const cat = (tx.category || '').trim();
        if (EXCLUDED_FLOW_CATEGORIES.has(cat)) continue;
        const conv = convertCurrency(tx.amount, tx.currency, baseCurrency, exchangeRates);
        if (tx.amount > 0) dayIncome += conv;
        else if (tx.amount < 0) dayExpense += Math.abs(conv);
      }

      return {
        date,
        dayIncome,
        dayExpense,
        data: list.sort((a, b) => (b.time || '').localeCompare(a.time || '')),
      };
    });
}
