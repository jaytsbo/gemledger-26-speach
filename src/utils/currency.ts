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

const CURRENCY_ALIASES: Record<string, CurrencyCode> = {
  TWD: 'TWD',
  NTD: 'TWD',
  NT: 'TWD',
  'NT$': 'TWD',
  台幣: 'TWD',
  新台幣: 'TWD',
  臺幣: 'TWD',
  新臺幣: 'TWD',
  JPY: 'JPY',
  'JP¥': 'JPY',
  日圓: 'JPY',
  日幣: 'JPY',
  円: 'JPY',
  USD: 'USD',
  'US$': 'USD',
  美元: 'USD',
  美金: 'USD',
  KRW: 'KRW',
  韓元: 'KRW',
  韓幣: 'KRW',
  EUR: 'EUR',
  歐元: 'EUR',
  '€': 'EUR',
  CNY: 'CNY',
  RMB: 'CNY',
  人民幣: 'CNY',
  GBP: 'GBP',
  英鎊: 'GBP',
  '£': 'GBP',
  HKD: 'HKD',
  'HK$': 'HKD',
  港幣: 'HKD',
  港元: 'HKD',
  SGD: 'SGD',
  'S$': 'SGD',
  新幣: 'SGD',
  新加坡幣: 'SGD',
  THB: 'THB',
  泰銖: 'THB',
  '฿': 'THB',
  AUD: 'AUD',
  'A$': 'AUD',
  澳幣: 'AUD',
  澳元: 'AUD',
};

export function normalizeCurrencyCode(raw: unknown, fallback: string = 'TWD'): string {
  const clean = typeof raw === 'string' ? raw.trim() : '';
  if (!clean) return fallback;
  const upper = clean.toUpperCase();
  if (CURRENCY_ALIASES[upper]) return CURRENCY_ALIASES[upper];
  if (CURRENCY_ALIASES[clean]) return CURRENCY_ALIASES[clean];
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return fallback;
}

export function sanitizeRatesMap(rawRates: unknown): Record<string, number> | null {
  if (!rawRates || typeof rawRates !== 'object' || Array.isArray(rawRates)) {
    return null;
  }
  const clean: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(rawRates)) {
    if (typeof rawVal === 'boolean' || rawVal === null || rawVal === '') continue;
    const key = rawKey.trim().toUpperCase();
    const num = Number(rawVal);
    if (key && Number.isFinite(num) && num > 0) {
      clean[key] = num;
    }
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

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

function resolveValidRate(raw: unknown, fallbackRate: number): number {
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) return num;
  return Number.isFinite(fallbackRate) && fallbackRate > 0 ? fallbackRate : 1;
}

export function convertCurrency(
  amount: number,
  fromCur: string,
  toCur: string,
  ratesInput?: RatesInput,
): number {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  const from = (fromCur || 'TWD').trim().toUpperCase() || 'TWD';
  const to = (toCur || 'TWD').trim().toUpperCase() || 'TWD';
  if (from === to) return Object.is(num, -0) ? 0 : num;

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
  const defaultFrom = !hasNonTwdBase ? Number(DEFAULT_EXCHANGE_RATES.rates[from]) : 0;
  const defaultTo = !hasNonTwdBase ? Number(DEFAULT_EXCHANGE_RATES.rates[to]) : 0;
  const fromRate = resolveValidRate(rawFromRate, defaultFrom);
  const toRate = resolveValidRate(rawToRate, defaultTo);

  if (
    !Number.isFinite(rawFromRate) ||
    rawFromRate <= 0 ||
    !Number.isFinite(rawToRate) ||
    rawToRate <= 0
  ) {
    console.log(
      `[currency/convertCurrency] Fallback - from=${from}, to=${to}, hasNonTwdBase=${hasNonTwdBase}, fromRate=${fromRate}, toRate=${toRate}`,
    );
  }

  const converted = (num / fromRate) * toRate;
  return Number.isFinite(converted) ? (Object.is(converted, -0) ? 0 : converted) : 0;
}

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'TWD']);

export function formatMoney(
  amount: number,
  currencyCode: string = 'TWD',
  includeSymbol: boolean = true,
): string {
  const code = (currencyCode || 'TWD').trim().toUpperCase() || 'TWD';
  const raw = Number(amount);
  const safeRaw = Number.isFinite(raw) ? raw : 0;
  const sym = includeSymbol ? getCurrencySymbol(code) : '';
  const decimals = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  const factor = Math.pow(10, decimals);
  const roundedAbs = Math.round(Math.abs(safeRaw) * factor) / factor;
  const num = roundedAbs === 0 ? 0 : safeRaw < 0 ? -roundedAbs : roundedAbs;
  const formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${num < 0 ? '-' : ''}${sym}${formatted}`;
}
