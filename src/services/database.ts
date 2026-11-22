import {
  AiChatMessage,
  AIParsedDraft,
  ApiActionResult,
  CurrencyCode,
  CustomSettings,
  ExchangeRates,
  SUPPORTED_CURRENCIES,
  Transaction,
  TransactionInput,
} from '../types/ledger';
import {
  DEFAULT_EXCHANGE_RATES,
  normalizeCurrencyCode,
  sanitizeRatesMap,
} from '../utils/currency';
import {
  compareIdsDesc,
  getLocalDateOffset,
  getLocalDateStr,
  getLocalTimeStr,
} from '../utils/dateTime';

export const MOCK_STORAGE_KEYS = {
  SHEET_DATA: 'MOCK_SHEET_DATA',
  CUSTOM_SETTINGS: 'MOCK_CUSTOM_SETTINGS',
  FX_CACHE: 'GEMLEDGER_EXCHANGE_RATES_CACHE',
  AI_CHAT_HISTORY: 'GEMLEDGER_AI_CHAT_HISTORY',
} as const;

export const MAX_AI_CHAT_MESSAGES = 60;
const SQLITE_AI_CHAT_KEY = 'ai_chat_history';

export const DEFAULT_ACCOUNTS = [
  '現金',
  'LINE Pay',
  'LINE Bank',
  '郵局',
  '永豐銀行',
  '國泰世華',
  '玉山銀行',
  '悠遊卡',
  '街口支付',
  '台新Richart',
];

export const DEFAULT_CATEGORIES = [
  '食',
  '衣',
  '住',
  '行',
  '育樂',
  '學習費用',
  '醫療/雜項',
  '收入',
  '投資',
  '初始資產',
  '代墊款',
  '代墊回收',
  '內部轉帳',
];

export const DEFAULT_SETTINGS: CustomSettings = {
  accounts: [...DEFAULT_ACCOUNTS],
  categories: [...DEFAULT_CATEGORIES],
  currencies: [...SUPPORTED_CURRENCIES] as CurrencyCode[],
  baseCurrency: 'TWD',
  simulate503: false,
  themeMode: 'dark',
};

export function getDefaultSeedTransactions(): Transaction[] {
  const d0 = getLocalDateOffset(0);
  const d1 = getLocalDateOffset(-1);
  const d2 = getLocalDateOffset(-2);
  const d3 = getLocalDateOffset(-3);
  const d4 = getLocalDateOffset(-4);
  const d5 = getLocalDateOffset(-5);

  return [
    {
      id: 1,
      rowNumber: 2,
      date: d0,
      time: '12:30',
      account: 'LINE Pay',
      name: '日式豚骨拉麵',
      category: '食',
      currency: 'TWD',
      amount: -280,
      note: '午餐',
    },
    {
      id: 2,
      rowNumber: 3,
      date: d0,
      time: '09:15',
      account: '悠遊卡',
      name: '捷運通勤車資',
      category: '行',
      currency: 'TWD',
      amount: -35,
      note: '上班通勤',
    },
    {
      id: 3,
      rowNumber: 4,
      date: d1,
      time: '19:40',
      account: '現金',
      name: '東京銀座伴手禮',
      category: '育樂',
      currency: 'JPY',
      amount: -4500,
      note: '日圓現金消費',
    },
    {
      id: 4,
      rowNumber: 5,
      date: d1,
      time: '14:20',
      account: '國泰世華',
      name: '雲端伺服器託管訂閱',
      category: '學習費用',
      currency: 'USD',
      amount: -20,
      note: 'Cloud Hosting',
    },
    {
      id: 5,
      rowNumber: 6,
      date: d2,
      time: '18:10',
      account: '街口支付',
      name: '手搖飲與咖啡',
      category: '食',
      currency: 'TWD',
      amount: -145,
      note: '下午茶',
    },
    {
      id: 6,
      rowNumber: 7,
      date: d2,
      time: '10:00',
      account: '永豐銀行',
      name: '專案接案收入',
      category: '收入',
      currency: 'TWD',
      amount: 28000,
      note: '第一期款',
    },
    {
      id: 7,
      rowNumber: 8,
      date: d3,
      time: '20:05',
      account: '玉山銀行',
      name: '運動機能外套',
      category: '衣',
      currency: 'TWD',
      amount: -1980,
      note: '換季添購',
    },
    {
      id: 8,
      rowNumber: 9,
      date: d3,
      time: '11:30',
      account: 'LINE Bank',
      name: '水電與網路帳單',
      category: '住',
      currency: 'TWD',
      amount: -1350,
      note: '每月固定支出',
    },
    {
      id: 9,
      rowNumber: 10,
      date: d4,
      time: '16:45',
      account: '郵局',
      name: '牙科定期檢查',
      category: '醫療/雜項',
      currency: 'TWD',
      amount: -350,
      note: '掛號費',
    },
    {
      id: 10,
      rowNumber: 11,
      date: d5,
      time: '09:00',
      account: '台新Richart',
      name: '期初活存餘額',
      category: '初始資產',
      currency: 'TWD',
      amount: 120000,
      note: '帳戶初始餘額',
    },
    {
      id: 11,
      rowNumber: 12,
      date: d5,
      time: '09:05',
      account: '永豐銀行',
      name: '期初銀行存款',
      category: '初始資產',
      currency: 'TWD',
      amount: 85000,
      note: '薪轉帳戶初始餘額',
    },
    {
      id: 12,
      rowNumber: 13,
      date: d5,
      time: '09:10',
      account: '現金',
      name: '期初錢包現金',
      category: '初始資產',
      currency: 'TWD',
      amount: 6500,
      note: '隨身現金',
    },
  ];
}

// =========================================================================
// Environment & Storage Detection
// =========================================================================

const memoryFallbackMap = new Map<string, string>();

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function getWebStorage(): StorageLike {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Fallback to in-memory storage when localStorage access is blocked
  }
  return {
    getItem: (key: string) => memoryFallbackMap.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryFallbackMap.set(key, value);
    },
    removeItem: (key: string) => {
      memoryFallbackMap.delete(key);
    },
  };
}

function isNativeMobileRuntime(): boolean {
  if (typeof process !== 'undefined' && Boolean(process.versions?.node)) {
    return false;
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return false;
  }
  return true;
}

function cleanUniqueStrings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(
      list
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeLoadedSettings(parsed: Partial<CustomSettings> | null | undefined): CustomSettings | null {
  if (!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.categories)) {
    return null;
  }
  const accounts = cleanUniqueStrings(parsed.accounts);
  const categories = cleanUniqueStrings(parsed.categories);
  if (accounts.length === 0 || categories.length === 0) {
    return null;
  }
  const currencies = cleanUniqueStrings(parsed.currencies).map((c) => c.toUpperCase());
  const baseCurrency = normalizeCurrencyCode(parsed.baseCurrency, DEFAULT_SETTINGS.baseCurrency) as CurrencyCode;

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    accounts,
    categories,
    currencies: (currencies.length > 0 ? currencies : DEFAULT_SETTINGS.currencies) as CurrencyCode[],
    baseCurrency,
  };
}

function sanitizeLoadedTransaction(raw: Transaction): Transaction {
  const rawAmt = Number(raw?.amount);
  const safeAmt = Number.isFinite(rawAmt) ? (Object.is(rawAmt, -0) ? 0 : rawAmt) : 0;
  return {
    ...raw,
    date: typeof raw?.date === 'string' ? raw.date.trim() : getLocalDateStr(),
    time: typeof raw?.time === 'string' ? raw.time.trim() : '00:00',
    account: typeof raw?.account === 'string' && raw.account.trim() ? raw.account.trim() : '現金',
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : '未命名項目',
    category: typeof raw?.category === 'string' && raw.category.trim() ? raw.category.trim() : '食',
    currency: normalizeCurrencyCode(raw?.currency, 'TWD'),
    amount: safeAmt,
    note: typeof raw?.note === 'string' ? raw.note : '',
  };
}

function sortTransactionsDesc(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    const timeCmp = (b.time || '').localeCompare(a.time || '');
    if (timeCmp !== 0) return timeCmp;
    return compareIdsDesc(a.id, b.id);
  });
}

function getNextLocalIdStart(existing: Transaction[]): number {
  let maxId = 0;
  for (const tx of existing) {
    const n = Number(tx.id);
    if (Number.isFinite(n) && n > maxId) {
      maxId = n;
    }
  }
  return Math.max(Date.now(), maxId + 1);
}

function sanitizeAiDraft(raw: unknown): AIParsedDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.name !== 'string' ||
    typeof obj.amount !== 'number' ||
    !Number.isFinite(obj.amount) ||
    typeof obj.currency !== 'string' ||
    typeof obj.category !== 'string' ||
    typeof obj.account !== 'string' ||
    typeof obj.date !== 'string' ||
    typeof obj.time !== 'string'
  ) {
    return null;
  }
  return {
    name: obj.name,
    amount: Object.is(obj.amount, -0) ? 0 : obj.amount,
    currency: obj.currency.trim() || 'TWD',
    category: obj.category,
    account: obj.account,
    date: obj.date,
    time: obj.time,
    note: typeof obj.note === 'string' ? obj.note : '',
  };
}

function sanitizeAiChatMessage(raw: unknown): AiChatMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    !obj.id.trim() ||
    (obj.role !== 'user' && obj.role !== 'assistant') ||
    typeof obj.text !== 'string'
  ) {
    return null;
  }

  // Strip imageUri intentionally: local file/blob URIs expire across restarts
  const clean: AiChatMessage = {
    id: obj.id.trim(),
    role: obj.role,
    text: obj.text,
  };

  if (
    typeof obj.audioDurationSec === 'number' &&
    Number.isFinite(obj.audioDurationSec) &&
    obj.audioDurationSec >= 0
  ) {
    clean.audioDurationSec = obj.audioDurationSec;
  }
  if (Array.isArray(obj.drafts)) {
    const cleanDrafts = obj.drafts
      .map(sanitizeAiDraft)
      .filter((d): d is AIParsedDraft => d !== null);
    if (cleanDrafts.length > 0 || obj.drafts.length === 0) {
      clean.drafts = cleanDrafts;
    }
  }
  if (Array.isArray(obj.savedIndices)) {
    clean.savedIndices = Array.from(
      new Set(
        obj.savedIndices.filter(
          (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0,
        ),
      ),
    );
  }
  if (typeof obj.isFallback === 'boolean') {
    clean.isFallback = obj.isFallback;
  }
  if (typeof obj.fallbackReason === 'string') {
    clean.fallbackReason = obj.fallbackReason;
  }
  if (typeof obj.modelUsed === 'string') {
    clean.modelUsed = obj.modelUsed;
  }
  if (typeof obj.createdAt === 'string') {
    clean.createdAt = obj.createdAt;
  }

  return clean;
}

export function sanitizeAiChatMessages(raw: unknown): AiChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw
    .map(sanitizeAiChatMessage)
    .filter((msg): msg is AiChatMessage => msg !== null);
  return valid.length > MAX_AI_CHAT_MESSAGES ? valid.slice(-MAX_AI_CHAT_MESSAGES) : valid;
}

// =========================================================================
// Web / Node LocalStorage Backend
// =========================================================================

const LocalStorageBackend = {
  getSettings(): CustomSettings {
    const storage = getWebStorage();
    const raw = storage.getItem(MOCK_STORAGE_KEYS.CUSTOM_SETTINGS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<CustomSettings>;
        const normalized = normalizeLoadedSettings(parsed);
        if (normalized) return normalized;
      } catch {
        // Re-seed if corrupted
      }
    }
    const seeded = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as CustomSettings;
    storage.setItem(MOCK_STORAGE_KEYS.CUSTOM_SETTINGS, JSON.stringify(seeded));
    return seeded;
  },

  saveSettings(settings: CustomSettings): void {
    const storage = getWebStorage();
    storage.setItem(MOCK_STORAGE_KEYS.CUSTOM_SETTINGS, JSON.stringify(settings));
  },

  getTransactions(): Transaction[] {
    const storage = getWebStorage();
    const raw = storage.getItem(MOCK_STORAGE_KEYS.SHEET_DATA);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return sortTransactionsDesc(parsed.map((item) => sanitizeLoadedTransaction(item)));
        }
      } catch {
        // Re-seed if corrupted
      }
    }
    const seeded = getDefaultSeedTransactions();
    storage.setItem(MOCK_STORAGE_KEYS.SHEET_DATA, JSON.stringify(seeded));
    return sortTransactionsDesc(seeded);
  },

  saveTransactions(data: Transaction[]): void {
    const storage = getWebStorage();
    storage.setItem(MOCK_STORAGE_KEYS.SHEET_DATA, JSON.stringify(data));
  },

  getCachedFX(): ExchangeRates | null {
    const storage = getWebStorage();
    const raw = storage.getItem(MOCK_STORAGE_KEYS.FX_CACHE);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ExchangeRates;
      const cleanRates = sanitizeRatesMap(parsed?.rates);
      if (parsed && cleanRates) {
        return {
          base: typeof parsed.base === 'string' && parsed.base.trim() ? parsed.base.trim() : 'TWD',
          updated: typeof parsed.updated === 'string' ? parsed.updated : DEFAULT_EXCHANGE_RATES.updated,
          rates: cleanRates,
        };
      }
    } catch {
      return null;
    }
    return null;
  },

  saveCachedFX(rates: ExchangeRates): void {
    const storage = getWebStorage();
    storage.setItem(MOCK_STORAGE_KEYS.FX_CACHE, JSON.stringify(rates));
  },

  getAiChatHistory(): AiChatMessage[] {
    const storage = getWebStorage();
    const raw = storage.getItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return sanitizeAiChatMessages(parsed);
    } catch (err) {
      console.warn(
        '[Database/LocalStorageBackend.getAiChatHistory] ParseFailed - Returning empty list:',
        err instanceof Error ? err.message : 'unknown',
      );
      return [];
    }
  },

  saveAiChatHistory(messages: AiChatMessage[]): void {
    const storage = getWebStorage();
    storage.setItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY, JSON.stringify(messages));
  },

  clearAiChatHistory(): void {
    const storage = getWebStorage();
    if (typeof storage.removeItem === 'function') {
      storage.removeItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY);
    } else {
      storage.setItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY, '[]');
    }
  },
};

// =========================================================================
// Native expo-sqlite Backend (iOS / Android)
// =========================================================================

type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;

let sqliteDbPromise: Promise<SQLiteDatabase> | null = null;

async function getSqliteDb(): Promise<SQLiteDatabase> {
  if (!sqliteDbPromise) {
    sqliteDbPromise = (async () => {
      try {
        const SQLite = await import('expo-sqlite');
        const db = await SQLite.openDatabaseAsync('gemledger.db');
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            row_number INTEGER,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            account TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            currency TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
          CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account);
          CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS fx_cache (
            base TEXT PRIMARY KEY,
            rates_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);
        await ensureSqliteSeeded(db);
        console.log('[Database/getSqliteDb] Initialized - SQLite tables ready');
        return db;
      } catch (err) {
        sqliteDbPromise = null;
        console.warn(
          '[Database/getSqliteDb] InitFailed - Resetting sqliteDbPromise:',
          err instanceof Error ? err.message : 'unknown',
        );
        throw err;
      }
    })();
  }
  return sqliteDbPromise;
}

async function ensureSqliteSeeded(db: SQLiteDatabase): Promise<void> {
  const settingsRow = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['custom_settings'],
  );
  if (!settingsRow) {
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      'custom_settings',
      JSON.stringify(DEFAULT_SETTINGS),
    ]);
    console.log('[Database/ensureSqliteSeeded] Seeded - Default settings inserted');
  }

  const countRow = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM transactions',
  );
  if (!countRow || countRow.cnt === 0) {
    const seeds = getDefaultSeedTransactions();
    await db.withTransactionAsync(async () => {
      for (const tx of seeds) {
        await db.runAsync(
          `INSERT INTO transactions (row_number, date, time, account, name, category, currency, amount, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tx.rowNumber ?? null,
            tx.date,
            tx.time,
            tx.account,
            tx.name,
            tx.category,
            tx.currency,
            tx.amount,
            tx.note,
          ],
        );
      }
    });
    console.log(`[Database/ensureSqliteSeeded] Seeded - Inserted ${seeds.length} default transactions`);
  }
}

interface SqliteTxRow {
  id: number;
  row_number: number | null;
  date: string;
  time: string;
  account: string;
  name: string;
  category: string;
  currency: string;
  amount: number;
  note: string | null;
  created_at?: string;
  updated_at?: string;
}

function mapSqliteRowToTx(row: SqliteTxRow): Transaction {
  const rawAmt = Number(row.amount);
  const safeAmt = Number.isFinite(rawAmt) ? (Object.is(rawAmt, -0) ? 0 : rawAmt) : 0;
  return {
    id: row.id,
    rowNumber: row.row_number ?? row.id + 1,
    date: row.date,
    time: row.time,
    account: row.account,
    name: row.name,
    category: row.category,
    currency: normalizeCurrencyCode(row.currency, 'TWD'),
    amount: safeAmt,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =========================================================================
// Unified Cross-Platform Database API
// =========================================================================

function normalizeInput(item: TransactionInput): Required<TransactionInput> {
  const defaultDate = getLocalDateStr();
  const defaultTime = getLocalTimeStr();

  const cleanDate = typeof item.date === 'string' ? item.date.trim() : '';
  const cleanTime = typeof item.time === 'string' ? item.time.trim() : '';
  const cleanAccount = typeof item.account === 'string' ? item.account.trim() : '';
  const cleanName = typeof item.name === 'string' ? item.name.trim() : '';
  const cleanCategory = typeof item.category === 'string' ? item.category.trim() : '';
  const cleanNote = typeof item.note === 'string' ? item.note.trim() : '';

  const rawAmount = Number(item.amount);
  const safeAmount = Number.isFinite(rawAmount) ? (Object.is(rawAmount, -0) ? 0 : rawAmount) : 0;

  return {
    date: cleanDate || defaultDate,
    time: cleanTime || defaultTime,
    account: cleanAccount || '現金',
    name: cleanName || '未命名項目',
    category: cleanCategory || '食',
    currency: normalizeCurrencyCode(item.currency, 'TWD'),
    amount: safeAmount,
    note: cleanNote,
  };
}

/**
 * 優先精確比對 id；僅在舊資料無 id 時才允許退回比對 rowNumber，
 * 避免刪除 id=2 後因重複送出而誤刪改 rowNumber=2 的鄰筆資料 (id=1)。
 */
function findTxIndexByIdOrRow(data: Transaction[], idOrRow: number | string): number {
  const target = String(idOrRow).trim();
  if (!target) return -1;
  const byId = data.findIndex(
    (d) => d.id !== undefined && d.id !== null && String(d.id).trim() !== '' && String(d.id) === target,
  );
  if (byId !== -1) return byId;
  return data.findIndex(
    (d) =>
      (d.id === undefined || d.id === null || String(d.id).trim() === '') &&
      d.rowNumber !== undefined &&
      d.rowNumber !== null &&
      String(d.rowNumber) === target,
  );
}

export const Database = {
  async getTransactions(): Promise<Transaction[]> {
    if (!isNativeMobileRuntime()) {
      return LocalStorageBackend.getTransactions();
    }
    const db = await getSqliteDb();
    const rows = await db.getAllAsync<SqliteTxRow>(
      'SELECT * FROM transactions ORDER BY date DESC, time DESC, id DESC',
    );
    return rows.map(mapSqliteRowToTx);
  },

  async addTransaction(item: TransactionInput): Promise<ApiActionResult> {
    const clean = normalizeInput(item);
    if (!isNativeMobileRuntime()) {
      const data = LocalStorageBackend.getTransactions();
      const newRowNumber =
        data.length > 0 ? Math.max(...data.map((d) => Number(d.rowNumber) || 0)) + 1 : 2;
      const newId = getNextLocalIdStart(data);
      const newTx: Transaction = {
        id: newId,
        rowNumber: newRowNumber,
        ...clean,
      };
      data.push(newTx);
      LocalStorageBackend.saveTransactions(data);
      return {
        success: true,
        message: '成功寫入記帳紀錄！',
        rowNumber: newRowNumber,
        id: newId,
      };
    }

    const db = await getSqliteDb();
    const res = await db.runAsync(
      `INSERT INTO transactions (date, time, account, name, category, currency, amount, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clean.date,
        clean.time,
        clean.account,
        clean.name,
        clean.category,
        clean.currency,
        clean.amount,
        clean.note,
      ],
    );
    const id = res.lastInsertRowId;
    await db.runAsync('UPDATE transactions SET row_number = ? WHERE id = ?', [id + 1, id]);
    return {
      success: true,
      message: '成功寫入記帳紀錄！',
      rowNumber: id + 1,
      id,
    };
  },

  async batchAddTransactions(items: TransactionInput[]): Promise<ApiActionResult> {
    if (!isNativeMobileRuntime()) {
      const data = LocalStorageBackend.getTransactions();
      const startRow =
        data.length > 0 ? Math.max(...data.map((d) => Number(d.rowNumber) || 0)) + 1 : 2;
      const baseId = getNextLocalIdStart(data);
      items.forEach((raw, idx) => {
        const clean = normalizeInput(raw);
        data.push({
          id: baseId + idx,
          rowNumber: startRow + idx,
          ...clean,
        });
      });
      LocalStorageBackend.saveTransactions(data);
      return { success: true, count: items.length, message: `成功批次寫入 ${items.length} 筆紀錄！` };
    }

    const db = await getSqliteDb();
    await db.withTransactionAsync(async () => {
      for (const raw of items) {
        const clean = normalizeInput(raw);
        await db.runAsync(
          `INSERT INTO transactions (date, time, account, name, category, currency, amount, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clean.date,
            clean.time,
            clean.account,
            clean.name,
            clean.category,
            clean.currency,
            clean.amount,
            clean.note,
          ],
        );
      }
      await db.runAsync('UPDATE transactions SET row_number = id + 1 WHERE row_number IS NULL');
    });
    return { success: true, count: items.length, message: `成功批次寫入 ${items.length} 筆紀錄！` };
  },

  async updateTransaction(
    idOrRow: number | string,
    updatedItem: TransactionInput,
  ): Promise<ApiActionResult> {
    const clean = normalizeInput(updatedItem);
    if (!isNativeMobileRuntime()) {
      const data = LocalStorageBackend.getTransactions();
      const idx = findTxIndexByIdOrRow(data, idOrRow);
      if (idx === -1) throw new Error('找不到該筆交易紀錄');
      data[idx] = {
        ...data[idx],
        ...clean,
        updatedAt: new Date().toISOString(),
      };
      LocalStorageBackend.saveTransactions(data);
      console.log(
        `[Database/updateTransaction] Local - Target:${idOrRow}, MatchedId:${data[idx].id}`,
      );
      return { success: true, message: '成功更新紀錄！' };
    }

    const numericId = Number(idOrRow);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error('找不到該筆交易紀錄');
    }

    const db = await getSqliteDb();
    const res = await db.runAsync(
      `UPDATE transactions
       SET date = ?, time = ?, account = ?, name = ?, category = ?, currency = ?, amount = ?, note = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        clean.date,
        clean.time,
        clean.account,
        clean.name,
        clean.category,
        clean.currency,
        clean.amount,
        clean.note,
        numericId,
      ],
    );
    console.log(`[Database/updateTransaction] SQLite - Target:${idOrRow}, Changes:${res.changes}`);
    if (res.changes === 0) throw new Error('找不到該筆交易紀錄');
    return { success: true, message: '成功更新紀錄！' };
  },

  async deleteTransaction(idOrRow: number | string): Promise<ApiActionResult> {
    if (!isNativeMobileRuntime()) {
      const data = LocalStorageBackend.getTransactions();
      const idx = findTxIndexByIdOrRow(data, idOrRow);
      if (idx === -1) throw new Error('找不到該筆交易紀錄');
      const [removed] = data.splice(idx, 1);
      data.forEach((d, i) => {
        d.rowNumber = i + 2;
      });
      LocalStorageBackend.saveTransactions(data);
      console.log(
        `[Database/deleteTransaction] Local - Target:${idOrRow}, DeletedId:${removed.id}`,
      );
      return { success: true, message: '成功刪除紀錄！' };
    }

    const numericId = Number(idOrRow);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error('找不到該筆交易紀錄');
    }

    const db = await getSqliteDb();
    const res = await db.runAsync('DELETE FROM transactions WHERE id = ?', [numericId]);
    console.log(`[Database/deleteTransaction] SQLite - Target:${idOrRow}, Changes:${res.changes}`);
    if (res.changes === 0) throw new Error('找不到該筆交易紀錄');
    return { success: true, message: '成功刪除紀錄！' };
  },

  async getSettings(): Promise<CustomSettings> {
    if (!isNativeMobileRuntime()) {
      return LocalStorageBackend.getSettings();
    }
    const db = await getSqliteDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['custom_settings'],
    );
    if (row) {
      try {
        const parsed = JSON.parse(row.value) as Partial<CustomSettings>;
        const normalized = normalizeLoadedSettings(parsed);
        if (normalized) return normalized;
      } catch {
        // Fallback to default
      }
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as CustomSettings;
  },

  async saveSettings(settings: Partial<CustomSettings>): Promise<ApiActionResult> {
    const current = await this.getSettings();
    const nextAccounts =
      settings.accounts !== undefined ? cleanUniqueStrings(settings.accounts) : current.accounts;
    const nextCategories =
      settings.categories !== undefined
        ? cleanUniqueStrings(settings.categories)
        : current.categories;
    if (nextAccounts.length === 0) {
      throw new Error('至少需保留 1 個帳戶');
    }
    if (nextCategories.length === 0) {
      throw new Error('至少需保留 1 個分類');
    }

    const nextCurrencies =
      settings.currencies !== undefined
        ? (cleanUniqueStrings(settings.currencies).map((c) => c.toUpperCase()) as CurrencyCode[])
        : current.currencies;

    const merged: CustomSettings = {
      ...current,
      ...settings,
      accounts: nextAccounts,
      categories: nextCategories,
      currencies: nextCurrencies.length > 0 ? nextCurrencies : current.currencies,
      baseCurrency: (settings.baseCurrency
        ? normalizeCurrencyCode(settings.baseCurrency, current.baseCurrency)
        : current.baseCurrency) as CurrencyCode,
    };

    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveSettings(merged);
      return { success: true, message: '已成功儲存自訂設定！' };
    }

    const db = await getSqliteDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['custom_settings', JSON.stringify(merged)],
    );
    return { success: true, message: '已成功儲存自訂設定！' };
  },

  async deleteAccountCascade(accountName: string): Promise<ApiActionResult> {
    const target = String(accountName || '').trim();
    if (!target) throw new Error('未提供欲刪除的帳戶名稱');

    if (!isNativeMobileRuntime()) {
      const settings = LocalStorageBackend.getSettings();
      const nextAccounts = (settings.accounts || []).filter((a) => a !== target);
      if (nextAccounts.length === 0) {
        throw new Error('至少需保留 1 個帳戶');
      }
      settings.accounts = nextAccounts;
      if (settings.accountIcons && target in settings.accountIcons) {
        const nextIcons = { ...settings.accountIcons };
        delete nextIcons[target];
        settings.accountIcons = nextIcons;
      }
      LocalStorageBackend.saveSettings(settings);

      let data = LocalStorageBackend.getTransactions();
      const before = data.length;
      data = data.filter((tx) => (tx.account || '').trim() !== target);
      const deletedCount = before - data.length;
      data.forEach((d, idx) => {
        d.rowNumber = idx + 2;
      });
      LocalStorageBackend.saveTransactions(data);

      return {
        success: true,
        deletedCount,
        message: `已成功刪除帳戶「${target}」，並清除 ${deletedCount} 筆關聯記帳記錄！`,
      };
    }

    const db = await getSqliteDb();
    let deletedCount = 0;
    await db.withTransactionAsync(async () => {
      const settings = await this.getSettings();
      const nextAccounts = settings.accounts.filter((a) => a !== target);
      if (nextAccounts.length === 0) {
        throw new Error('至少需保留 1 個帳戶');
      }
      settings.accounts = nextAccounts;
      if (settings.accountIcons && target in settings.accountIcons) {
        const nextIcons = { ...settings.accountIcons };
        delete nextIcons[target];
        settings.accountIcons = nextIcons;
      }
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        ['custom_settings', JSON.stringify(settings)],
      );
      const delRes = await db.runAsync('DELETE FROM transactions WHERE TRIM(account) = ?', [target]);
      deletedCount = delRes.changes;
    });

    return {
      success: true,
      deletedCount,
      message: `已成功刪除帳戶「${target}」，並清除 ${deletedCount} 筆關聯記帳記錄！`,
    };
  },

  async deleteCategoryCascade(categoryName: string): Promise<ApiActionResult> {
    const target = String(categoryName || '').trim();
    if (!target) throw new Error('未提供欲刪除的分類名稱');

    if (!isNativeMobileRuntime()) {
      const settings = LocalStorageBackend.getSettings();
      const nextCategories = (settings.categories || []).filter((c) => c !== target);
      if (nextCategories.length === 0) {
        throw new Error('至少需保留 1 個分類');
      }
      settings.categories = nextCategories;
      LocalStorageBackend.saveSettings(settings);

      let data = LocalStorageBackend.getTransactions();
      const before = data.length;
      data = data.filter((tx) => (tx.category || '').trim() !== target);
      const deletedCount = before - data.length;
      data.forEach((d, idx) => {
        d.rowNumber = idx + 2;
      });
      LocalStorageBackend.saveTransactions(data);

      return {
        success: true,
        deletedCount,
        message: `已成功刪除分類「${target}」，並清除 ${deletedCount} 筆關聯記帳記錄！`,
      };
    }

    const db = await getSqliteDb();
    let deletedCount = 0;
    await db.withTransactionAsync(async () => {
      const settings = await this.getSettings();
      const nextCategories = settings.categories.filter((c) => c !== target);
      if (nextCategories.length === 0) {
        throw new Error('至少需保留 1 個分類');
      }
      settings.categories = nextCategories;
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        ['custom_settings', JSON.stringify(settings)],
      );
      const delRes = await db.runAsync('DELETE FROM transactions WHERE TRIM(category) = ?', [
        target,
      ]);
      deletedCount = delRes.changes;
    });

    return {
      success: true,
      deletedCount,
      message: `已成功刪除分類「${target}」，並清除 ${deletedCount} 筆關聯記帳記錄！`,
    };
  },

  async renameAccount(oldName: string, newName: string): Promise<ApiActionResult> {
    const oldClean = String(oldName || '').trim();
    const newClean = String(newName || '').trim();
    if (!oldClean || !newClean) throw new Error('帳戶名稱不可為空');
    if (oldClean === newClean) {
      return { success: true, count: 0, message: '帳戶名稱未變更' };
    }

    const currentSettings = await this.getSettings();
    if (!currentSettings.accounts.includes(oldClean)) {
      throw new Error(`找不到帳戶「${oldClean}」`);
    }
    if (currentSettings.accounts.includes(newClean)) {
      throw new Error(`帳戶「${newClean}」已存在`);
    }

    const nextAccounts = currentSettings.accounts.map((a) => (a === oldClean ? newClean : a));
    const nextIcons = currentSettings.accountIcons
      ? { ...currentSettings.accountIcons }
      : undefined;
    if (nextIcons && oldClean in nextIcons) {
      if (!(newClean in nextIcons)) {
        nextIcons[newClean] = nextIcons[oldClean];
      }
      delete nextIcons[oldClean];
    }

    console.log(`[Database/renameAccount] Start - ${oldClean} -> ${newClean}`);

    if (!isNativeMobileRuntime()) {
      const nextSettings: CustomSettings = {
        ...currentSettings,
        accounts: nextAccounts,
        ...(nextIcons ? { accountIcons: nextIcons } : {}),
      };
      LocalStorageBackend.saveSettings(nextSettings);

      const data = LocalStorageBackend.getTransactions();
      let updatedCount = 0;
      const nowIso = new Date().toISOString();
      const nextData = data.map((tx) => {
        const matchAccount = (tx.account || '').trim() === oldClean;
        const txWithTo = tx as Transaction & { toAccount?: string };
        const matchToAccount =
          typeof txWithTo.toAccount === 'string' && txWithTo.toAccount.trim() === oldClean;
        if (!matchAccount && !matchToAccount) return tx;
        updatedCount += 1;
        return {
          ...tx,
          ...(matchAccount ? { account: newClean } : {}),
          ...(matchToAccount ? { toAccount: newClean } : {}),
          updatedAt: nowIso,
        };
      });
      LocalStorageBackend.saveTransactions(nextData);
      console.log(`[Database/renameAccount] Done - Local UpdatedTx:${updatedCount}`);
      return {
        success: true,
        count: updatedCount,
        message: `已將帳戶「${oldClean}」更名為「${newClean}」（同步更新 ${updatedCount} 筆紀錄）`,
      };
    }

    const db = await getSqliteDb();
    let updatedCount = 0;
    await db.withTransactionAsync(async () => {
      const nextSettings: CustomSettings = {
        ...currentSettings,
        accounts: nextAccounts,
        ...(nextIcons ? { accountIcons: nextIcons } : {}),
      };
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        ['custom_settings', JSON.stringify(nextSettings)],
      );
      const res = await db.runAsync(
        'UPDATE transactions SET account = ?, updated_at = CURRENT_TIMESTAMP WHERE TRIM(account) = ?',
        [newClean, oldClean],
      );
      updatedCount = res.changes;
    });
    console.log(`[Database/renameAccount] Done - SQLite UpdatedTx:${updatedCount}`);
    return {
      success: true,
      count: updatedCount,
      message: `已將帳戶「${oldClean}」更名為「${newClean}」（同步更新 ${updatedCount} 筆紀錄）`,
    };
  },

  async renameCategory(oldName: string, newName: string): Promise<ApiActionResult> {
    const oldClean = String(oldName || '').trim();
    const newClean = String(newName || '').trim();
    if (!oldClean || !newClean) throw new Error('分類名稱不可為空');
    if (oldClean === newClean) {
      return { success: true, count: 0, message: '分類名稱未變更' };
    }

    const currentSettings = await this.getSettings();
    if (!currentSettings.categories.includes(oldClean)) {
      throw new Error(`找不到分類「${oldClean}」`);
    }
    if (currentSettings.categories.includes(newClean)) {
      throw new Error(`分類「${newClean}」已存在`);
    }

    const nextCategories = currentSettings.categories.map((c) => (c === oldClean ? newClean : c));
    console.log(`[Database/renameCategory] Start - ${oldClean} -> ${newClean}`);

    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveSettings({
        ...currentSettings,
        categories: nextCategories,
      });
      const data = LocalStorageBackend.getTransactions();
      let updatedCount = 0;
      const nowIso = new Date().toISOString();
      const nextData = data.map((tx) => {
        if ((tx.category || '').trim() !== oldClean) return tx;
        updatedCount += 1;
        return { ...tx, category: newClean, updatedAt: nowIso };
      });
      LocalStorageBackend.saveTransactions(nextData);
      console.log(`[Database/renameCategory] Done - Local UpdatedTx:${updatedCount}`);
      return {
        success: true,
        count: updatedCount,
        message: `已將分類「${oldClean}」更名為「${newClean}」（同步更新 ${updatedCount} 筆紀錄）`,
      };
    }

    const db = await getSqliteDb();
    let updatedCount = 0;
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        ['custom_settings', JSON.stringify({ ...currentSettings, categories: nextCategories })],
      );
      const res = await db.runAsync(
        'UPDATE transactions SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE TRIM(category) = ?',
        [newClean, oldClean],
      );
      updatedCount = res.changes;
    });
    console.log(`[Database/renameCategory] Done - SQLite UpdatedTx:${updatedCount}`);
    return {
      success: true,
      count: updatedCount,
      message: `已將分類「${oldClean}」更名為「${newClean}」（同步更新 ${updatedCount} 筆紀錄）`,
    };
  },

  async mergeCategories(sourceCategory: string, targetCategory: string): Promise<ApiActionResult> {
    const sourceClean = String(sourceCategory || '').trim();
    const targetClean = String(targetCategory || '').trim();
    if (!sourceClean || !targetClean) throw new Error('來源與目標分類不可為空');
    if (sourceClean === targetClean) throw new Error('來源與目標分類不可相同');

    const currentSettings = await this.getSettings();
    if (!currentSettings.categories.includes(sourceClean)) {
      throw new Error(`找不到來源分類「${sourceClean}」`);
    }
    if (!currentSettings.categories.includes(targetClean)) {
      throw new Error(`找不到目標分類「${targetClean}」`);
    }

    const nextCategories = currentSettings.categories.filter((c) => c !== sourceClean);
    console.log(`[Database/mergeCategories] Start - ${sourceClean} -> ${targetClean}`);

    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveSettings({
        ...currentSettings,
        categories: nextCategories,
      });
      const data = LocalStorageBackend.getTransactions();
      let movedCount = 0;
      const nowIso = new Date().toISOString();
      const nextData = data.map((tx) => {
        if ((tx.category || '').trim() !== sourceClean) return tx;
        movedCount += 1;
        return { ...tx, category: targetClean, updatedAt: nowIso };
      });
      LocalStorageBackend.saveTransactions(nextData);
      console.log(`[Database/mergeCategories] Done - Local MovedTx:${movedCount}`);
      return {
        success: true,
        count: movedCount,
        message: `已將「${sourceClean}」合併至「${targetClean}」（轉移 ${movedCount} 筆紀錄）`,
      };
    }

    const db = await getSqliteDb();
    let movedCount = 0;
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        ['custom_settings', JSON.stringify({ ...currentSettings, categories: nextCategories })],
      );
      const res = await db.runAsync(
        'UPDATE transactions SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE TRIM(category) = ?',
        [targetClean, sourceClean],
      );
      movedCount = res.changes;
    });
    console.log(`[Database/mergeCategories] Done - SQLite MovedTx:${movedCount}`);
    return {
      success: true,
      count: movedCount,
      message: `已將「${sourceClean}」合併至「${targetClean}」（轉移 ${movedCount} 筆紀錄）`,
    };
  },

  async importTransactions(
    items: Omit<Transaction, 'id' | 'rowNumber'>[],
    mode: 'append' | 'overwrite',
  ): Promise<ApiActionResult> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('匯入資料為空');
    }

    const normalized = items.map((raw) => normalizeInput(raw));
    const currentSettings = await this.getSettings();

    let nextAccounts: string[];
    let nextCategories: string[];
    let nextAccountIcons = { ...(currentSettings.accountIcons ?? {}) };
    let settingsChanged = false;

    if (mode === 'overwrite') {
      const csvAccounts = Array.from(
        new Set(normalized.map((tx) => tx.account).filter(Boolean)),
      );
      const csvCategories = Array.from(
        new Set(normalized.map((tx) => tx.category).filter(Boolean)),
      );
      nextAccounts = csvAccounts.length > 0 ? csvAccounts : ['現金'];
      nextCategories = csvCategories.length > 0 ? csvCategories : ['其他'];

      const allowedAccSet = new Set(nextAccounts);
      const prunedIcons: Record<string, string> = {};
      for (const [k, v] of Object.entries(nextAccountIcons)) {
        if (allowedAccSet.has(k)) prunedIcons[k] = v;
      }
      nextAccountIcons = prunedIcons;
      settingsChanged = true;
    } else {
      const accountSet = new Set(currentSettings.accounts);
      const categorySet = new Set(currentSettings.categories);
      const newAccounts: string[] = [];
      const newCategories: string[] = [];

      for (const tx of normalized) {
        if (tx.account && !accountSet.has(tx.account)) {
          accountSet.add(tx.account);
          newAccounts.push(tx.account);
        }
        if (tx.category && !categorySet.has(tx.category)) {
          categorySet.add(tx.category);
          newCategories.push(tx.category);
        }
      }

      nextAccounts = [...currentSettings.accounts, ...newAccounts];
      nextCategories = [...currentSettings.categories, ...newCategories];
      settingsChanged = newAccounts.length > 0 || newCategories.length > 0;
    }

    const nextSettings: CustomSettings = {
      ...currentSettings,
      accounts: nextAccounts,
      categories: nextCategories,
      accountIcons: nextAccountIcons,
    };

    console.log(
      `[Database/importTransactions] Start - Mode:${mode}, Count:${normalized.length}, Accounts:${nextAccounts.length}, Categories:${nextCategories.length}`,
    );

    if (!isNativeMobileRuntime()) {
      if (settingsChanged) {
        LocalStorageBackend.saveSettings(nextSettings);
      }
      const existing = mode === 'overwrite' ? [] : LocalStorageBackend.getTransactions();
      const startRow =
        existing.length > 0 ? Math.max(...existing.map((d) => Number(d.rowNumber) || 0)) + 1 : 2;
      const baseId = getNextLocalIdStart(existing);
      const appended: Transaction[] = normalized.map((clean, idx) => ({
        id: baseId + idx,
        rowNumber: startRow + idx,
        ...clean,
      }));
      LocalStorageBackend.saveTransactions([...existing, ...appended]);
      console.log(`[Database/importTransactions] Done - Local Imported:${appended.length}`);
      return {
        success: true,
        count: appended.length,
        message: `成功${mode === 'overwrite' ? '覆寫' : '附加'}匯入 ${appended.length} 筆紀錄！`,
      };
    }

    const db = await getSqliteDb();
    await db.withTransactionAsync(async () => {
      if (settingsChanged) {
        await db.runAsync(
          'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          ['custom_settings', JSON.stringify(nextSettings)],
        );
      }
      if (mode === 'overwrite') {
        await db.runAsync('DELETE FROM transactions');
      }
      for (const clean of normalized) {
        await db.runAsync(
          `INSERT INTO transactions (date, time, account, name, category, currency, amount, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clean.date,
            clean.time,
            clean.account,
            clean.name,
            clean.category,
            clean.currency,
            clean.amount,
            clean.note,
          ],
        );
      }
      await db.runAsync('UPDATE transactions SET row_number = id + 1 WHERE row_number IS NULL');
    });
    console.log(`[Database/importTransactions] Done - SQLite Imported:${normalized.length}`);
    return {
      success: true,
      count: normalized.length,
      message: `成功${mode === 'overwrite' ? '覆寫' : '附加'}匯入 ${normalized.length} 筆紀錄！`,
    };
  },

  async getCachedExchangeRates(): Promise<ExchangeRates | null> {
    if (!isNativeMobileRuntime()) {
      return LocalStorageBackend.getCachedFX();
    }
    const db = await getSqliteDb();
    const row = await db.getFirstAsync<{ base: string; rates_json: string; updated_at: string }>(
      'SELECT base, rates_json, updated_at FROM fx_cache ORDER BY updated_at DESC LIMIT 1',
    );
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.rates_json);
      const cleanRates = sanitizeRatesMap(parsed);
      if (!cleanRates) return null;
      return {
        base: row.base || 'TWD',
        updated: row.updated_at || DEFAULT_EXCHANGE_RATES.updated,
        rates: cleanRates,
      };
    } catch {
      return null;
    }
  },

  async saveCachedExchangeRates(fx: ExchangeRates): Promise<void> {
    const cleanRates = sanitizeRatesMap(fx?.rates);
    if (!cleanRates) return;
    const payload: ExchangeRates = {
      base: (fx.base || 'TWD').trim().toUpperCase(),
      updated: fx.updated || new Date().toISOString(),
      rates: cleanRates,
    };

    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveCachedFX(payload);
      return;
    }
    const db = await getSqliteDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM fx_cache');
      await db.runAsync(
        'INSERT OR REPLACE INTO fx_cache (base, rates_json, updated_at) VALUES (?, ?, ?)',
        [payload.base, JSON.stringify(payload.rates), payload.updated],
      );
    });
  },

  async getAiChatHistory(): Promise<AiChatMessage[]> {
    if (!isNativeMobileRuntime()) {
      try {
        const list = LocalStorageBackend.getAiChatHistory();
        console.log(`[Database/getAiChatHistory] Done - Backend:Local, Count:${list.length}`);
        return list;
      } catch (err) {
        console.warn(
          '[Database/getAiChatHistory] Failed - Backend:Local, returning empty list:',
          err instanceof Error ? err.message : 'unknown',
        );
        return [];
      }
    }

    try {
      const db = await getSqliteDb();
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [SQLITE_AI_CHAT_KEY],
      );
      if (!row?.value) {
        console.log('[Database/getAiChatHistory] Done - Backend:SQLite, Count:0');
        return [];
      }
      const parsed: unknown = JSON.parse(row.value);
      const list = sanitizeAiChatMessages(parsed);
      console.log(`[Database/getAiChatHistory] Done - Backend:SQLite, Count:${list.length}`);
      return list;
    } catch (err) {
      console.warn(
        '[Database/getAiChatHistory] Failed - Backend:SQLite, returning empty list:',
        err instanceof Error ? err.message : 'unknown',
      );
      return [];
    }
  },

  async saveAiChatHistory(messages: AiChatMessage[]): Promise<ApiActionResult> {
    const sanitized = sanitizeAiChatMessages(messages);
    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveAiChatHistory(sanitized);
      console.log(
        `[Database/saveAiChatHistory] Done - Backend:Local, Input:${Array.isArray(messages) ? messages.length : 0}, Saved:${sanitized.length}`,
      );
      return {
        success: true,
        count: sanitized.length,
        message: '已儲存 AI 對話紀錄！',
      };
    }

    const db = await getSqliteDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [SQLITE_AI_CHAT_KEY, JSON.stringify(sanitized)],
    );
    console.log(
      `[Database/saveAiChatHistory] Done - Backend:SQLite, Input:${Array.isArray(messages) ? messages.length : 0}, Saved:${sanitized.length}`,
    );
    return {
      success: true,
      count: sanitized.length,
      message: '已儲存 AI 對話紀錄！',
    };
  },

  async clearAiChatHistory(): Promise<ApiActionResult> {
    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.clearAiChatHistory();
      console.log('[Database/clearAiChatHistory] Done - Backend:Local');
      return {
        success: true,
        message: '已清除 AI 對話紀錄！',
      };
    }

    const db = await getSqliteDb();
    await db.runAsync('DELETE FROM settings WHERE key = ?', [SQLITE_AI_CHAT_KEY]);
    console.log('[Database/clearAiChatHistory] Done - Backend:SQLite');
    return {
      success: true,
      message: '已清除 AI 對話紀錄！',
    };
  },

  async resetSeedData(): Promise<ApiActionResult> {
    const seedTx = getDefaultSeedTransactions();
    const seedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as CustomSettings;
    const seedFx: ExchangeRates = {
      ...DEFAULT_EXCHANGE_RATES,
      rates: { ...DEFAULT_EXCHANGE_RATES.rates },
    };

    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveSettings(seedSettings);
      LocalStorageBackend.saveTransactions(seedTx);
      LocalStorageBackend.saveCachedFX(seedFx);
      return {
        success: true,
        count: seedTx.length,
        message: `已重置為預設範例資料（共 ${seedTx.length} 筆交易）！`,
      };
    }

    const db = await getSqliteDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM transactions');
      await db.runAsync('DELETE FROM fx_cache');
      await db.runAsync('INSERT OR REPLACE INTO fx_cache (base, rates_json, updated_at) VALUES (?, ?, ?)', [
        seedFx.base,
        JSON.stringify(seedFx.rates),
        seedFx.updated,
      ]);
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'custom_settings',
        JSON.stringify(seedSettings),
      ]);
      for (const tx of seedTx) {
        await db.runAsync(
          `INSERT INTO transactions (row_number, date, time, account, name, category, currency, amount, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tx.rowNumber ?? null,
            tx.date,
            tx.time,
            tx.account,
            tx.name,
            tx.category,
            tx.currency,
            tx.amount,
            tx.note,
          ],
        );
      }
    });

    return {
      success: true,
      count: seedTx.length,
      message: `已重置為預設範例資料（共 ${seedTx.length} 筆交易）！`,
    };
  },
};
