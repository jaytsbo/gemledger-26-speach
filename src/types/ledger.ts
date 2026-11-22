export type CurrencyCode =
  | 'TWD'
  | 'JPY'
  | 'USD'
  | 'KRW'
  | 'EUR'
  | 'CNY'
  | 'GBP'
  | 'HKD'
  | 'SGD'
  | 'THB'
  | 'AUD';

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = [
  'TWD',
  'JPY',
  'USD',
  'KRW',
  'EUR',
  'CNY',
  'GBP',
  'HKD',
  'SGD',
  'THB',
  'AUD',
] as const;

export interface Transaction {
  id: number | string;
  rowNumber?: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  account: string;
  name: string;
  category: string;
  currency: CurrencyCode | string;
  amount: number; // Positive for inflows, negative for outflows
  note: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransactionInput {
  date?: string;
  time?: string;
  account: string;
  name: string;
  category: string;
  currency: CurrencyCode | string;
  amount: number;
  note?: string;
}

export interface CustomSettings {
  accounts: string[];
  categories: string[];
  currencies: CurrencyCode[];
  baseCurrency: CurrencyCode;
  accountIcons?: Record<string, string>;
  simulate503?: boolean;
  themeMode?: 'light' | 'dark' | 'system';
}

export interface ExchangeRates {
  base: CurrencyCode | string;
  updated: string;
  rates: Record<string, number>;
}

export interface AIParsedDraft {
  name: string;
  amount: number;
  currency: CurrencyCode | string;
  category: string;
  account: string;
  date: string;
  time: string;
  note: string;
}

export type GeminiFailureCode =
  | 'KEY_MISSING'
  | 'SIMULATE_503'
  | 'AUTH_INVALID_KEY'
  | 'RATE_LIMIT_429'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'BAD_REQUEST_400'
  | 'PARSE_ERROR'
  | 'SERVER_503';

export interface GeminiConnectionTestResult {
  ok: boolean;
  status?: number;
  code: 'OK' | GeminiFailureCode;
  message: string;
}

export interface AIBookkeeperResponse {
  reply: string;
  parsedTransactions: AIParsedDraft[];
  isFallback?: boolean;
  fallbackReason?: string;
  errorType?: string;
  modelUsed?: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  audioDurationSec?: number;
  drafts?: AIParsedDraft[];
  savedIndices?: number[];
  isFallback?: boolean;
  fallbackReason?: string;
  modelUsed?: string;
  createdAt?: string;
}

export interface KPIStats {
  netWorth: number;
  realIncome: number;
  realExpense: number;
  netCashflow: number;
  transactionCount: number;
}

export interface AccountStat {
  account: string;
  balance: number;
  sharePercentage: number;
  transactionCount: number;
  currencyBreakdown: Record<string, number>;
  color: string;
  icon: string;
}

export interface TrendPoint {
  key: string; // YYYY-MM-DD or YYYY-MM
  label: string; // MM-DD or YYYY-MM
  income: number;
  expense: number;
  net: number;
}

export interface FilterState {
  year: string; // 'ALL' or '2026'
  month: string; // 'ALL' or '01'..'12'
  date: string; // '' or 'YYYY-MM-DD'
  account: string; // 'ALL' or account name
  category: string; // 'ALL' or category name
  currency: string; // 'ALL' or CurrencyCode
  searchQuery: string;
}

export interface ApiActionResult {
  success: boolean;
  message?: string;
  rowNumber?: number;
  id?: number | string;
  count?: number;
  deletedCount?: number;
}
