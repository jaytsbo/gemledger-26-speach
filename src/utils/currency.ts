import { CurrencyCode, ExchangeRates, SUPPORTED_CURRENCIES } from '../types/ledger';

export const CURRENCY_SYMBOLS: Record<CurrencyCode | string, string> = {
  TWD: 'NT$',
  JPY: '¥',
  USD: '$',
  KRW: '₩',
  EUR: '€',
  CNY: '¥',
  GBP: '£',
  HKD: 'HK$',
  SGD: 'S$',
  THB: '฿',
  AUD: 'A$',
};

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  TWD: '新台幣',
  JPY: '日圓',
  USD: '美元',
  KRW: '韓元',
  EUR: '歐元',
  CNY: '人民幣',
  GBP: '英鎊',
  HKD: '港幣',
  SGD: '新加坡幣',
  THB: '泰銖',
  AUD: '澳幣',
};

export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  base: 'TWD',
  updated: '2026-01-01T00:00:00.000Z',
  rates: {
    TWD: 1,
    USD: 0.03125,
    JPY: 4.65,
    KRW: 41.5,
    EUR: 0.0285,
    CNY: 0.225,
    GBP: 0.0245,
    HKD: 0.244,
    SGD: 0.0418,
    THB: 1.08,
    AUD: 0.0475,
  },
};

export function getCurrencySymbol(code?: string): string {
  const normalized = (code || 'TWD').trim().toUpperCase();
  return CURRENCY_SYMBOLS[normalized] || `${normalized} `;
}

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code.toUpperCase());
}

type RatesInput = ExchangeRates | Record<string, number> | undefined;

function extractRatesMap(ratesInput?: RatesInput): Record<string, number> {
  if (!ratesInput) return DEFAULT_EXCHANGE_RATES.rates;
  if ('rates' in ratesInput && typeof ratesInput.rates === 'object' && ratesInput.rates !== null) {
    return ratesInput.rates as Record<string, number>;
  }
  return ratesInput as Record<string, number>;
}

export function convertCurrency(
  amount: number,
  fromCur: string,
  toCur: string,
  ratesInput?: RatesInput,
): number {
  const num = Number(amount) || 0;
  const from = (fromCur || 'TWD').trim().toUpperCase();
  const to = (toCur || 'TWD').trim().toUpperCase();
  if (from === to) return num;

  const rates = extractRatesMap(ratesInput);
  const hasNonTwdBase = Boolean(
    ratesInput &&
      'base' in ratesInput &&
      typeof ratesInput.base === 'string' &&
      ratesInput.base.trim().length > 0 &&
      ratesInput.base.trim().toUpperCase() !== 'TWD',
  );
  const rawFromRate = Number(rates[from]);
  const rawToRate = Number(rates[to]);
  const fromRate =
    rawFromRate || (!hasNonTwdBase ? Number(DEFAULT_EXCHANGE_RATES.rates[from]) : 0) || 1;
  const toRate =
    rawToRate || (!hasNonTwdBase ? Number(DEFAULT_EXCHANGE_RATES.rates[to]) : 0) || 1;

  if (!rawFromRate || !rawToRate) {
    console.log(
      `[currency/convertCurrency] Fallback - from=${from}, to=${to}, hasNonTwdBase=${hasNonTwdBase}, fromRate=${fromRate}, toRate=${toRate}`,
    );
  }

  return (num / fromRate) * toRate;
}

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'TWD']);

export function formatMoney(
  amount: number,
  currencyCode: string = 'TWD',
  includeSymbol: boolean = true,
): string {
  const code = (currencyCode || 'TWD').trim().toUpperCase();
  const num = Math.abs(Number(amount) || 0) < 0.000001 ? 0 : Number(amount) || 0;
  const sym = includeSymbol ? getCurrencySymbol(code) : '';
  const decimals = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  const formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${num < 0 ? '-' : ''}${sym}${formatted}`;
}
