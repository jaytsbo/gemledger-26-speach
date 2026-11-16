import {
  ApiActionResult,
  CurrencyCode,
  CustomSettings,
  ExchangeRates,
  SUPPORTED_CURRENCIES,
  Transaction,
  TransactionInput,
} from '../types/ledger';
import { DEFAULT_EXCHANGE_RATES } from '../utils/currency';

export const MOCK_STORAGE_KEYS = {
  SHEET_DATA: 'MOCK_SHEET_DATA',
  CUSTOM_SETTINGS: 'MOCK_CUSTOM_SETTINGS',
  FX_CACHE: 'GEMLEDGER_EXCHANGE_RATES_CACHE',
} as const;

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
  aiProxyUrl: '',
  simulate503: false,
  themeMode: 'system',
};

function formatDateOffset(daysAgo: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function getDefaultSeedTransactions(): Transaction[] {
  const d0 = formatDateOffset(0);
  const d1 = formatDateOffset(1);
  const d2 = formatDateOffset(2);
  const d3 = formatDateOffset(3);
  const d4 = formatDateOffset(4);
  const d5 = formatDateOffset(5);

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
        if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.categories)) {
          return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            currencies: (parsed.currencies?.length
              ? parsed.currencies
              : DEFAULT_SETTINGS.currencies) as CurrencyCode[],
          };
        }
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
          return parsed;
        }
      } catch {
        // Re-seed if corrupted
      }
    }
    const seeded = getDefaultSeedTransactions();
    storage.setItem(MOCK_STORAGE_KEYS.SHEET_DATA, JSON.stringify(seeded));
    return seeded;
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
      if (parsed && parsed.rates) return parsed;
    } catch {
      return null;
    }
    return null;
  },

  saveCachedFX(rates: ExchangeRates): void {
    const storage = getWebStorage();
    storage.setItem(MOCK_STORAGE_KEYS.FX_CACHE, JSON.stringify(rates));
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
  return {
    id: row.id,
    rowNumber: row.row_number ?? row.id + 1,
    date: row.date,
    time: row.time,
    account: row.account,
    name: row.name,
    category: row.category,
    currency: row.currency,
    amount: Number(row.amount) || 0,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =========================================================================
// Unified Cross-Platform Database API
// =========================================================================

function normalizeInput(item: TransactionInput): Required<TransactionInput> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return {
    date: String(item.date || defaultDate).trim(),
    time: String(item.time || defaultTime).trim(),
    account: String(item.account || '現金').trim(),
    name: String(item.name || '未命名項目').trim(),
    category: String(item.category || '食').trim(),
    currency: String(item.currency || 'TWD').trim().toUpperCase(),
    amount: Number(item.amount) || 0,
    note: String(item.note || '').trim(),
  };
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
      const newId = Date.now() + Math.floor(Math.random() * 1000);
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
      let startRow =
        data.length > 0 ? Math.max(...data.map((d) => Number(d.rowNumber) || 0)) + 1 : 2;
      const baseId = Date.now();
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
        await db.runAsync('UPDATE transactions SET row_number = ? WHERE id = ?', [
          res.lastInsertRowId + 1,
          res.lastInsertRowId,
        ]);
      }
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
      const idx = data.findIndex(
        (d) => String(d.id) === String(idOrRow) || String(d.rowNumber) === String(idOrRow),
      );
      if (idx === -1) throw new Error('找不到該筆交易紀錄');
      data[idx] = {
        ...data[idx],
        ...clean,
        updatedAt: new Date().toISOString(),
      };
      LocalStorageBackend.saveTransactions(data);
      return { success: true, message: '成功更新紀錄！' };
    }

    const db = await getSqliteDb();
    const numericId = Number(idOrRow);
    const res = await db.runAsync(
      `UPDATE transactions
       SET date = ?, time = ?, account = ?, name = ?, category = ?, currency = ?, amount = ?, note = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? OR row_number = ?`,
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
        numericId,
      ],
    );
    if (res.changes === 0) throw new Error('找不到該筆交易紀錄');
    return { success: true, message: '成功更新紀錄！' };
  },

  async deleteTransaction(idOrRow: number | string): Promise<ApiActionResult> {
    if (!isNativeMobileRuntime()) {
      let data = LocalStorageBackend.getTransactions();
      const initialLen = data.length;
      data = data.filter(
        (d) => String(d.id) !== String(idOrRow) && String(d.rowNumber) !== String(idOrRow),
      );
      if (data.length === initialLen) throw new Error('找不到該筆交易紀錄');
      data.forEach((d, idx) => {
        d.rowNumber = idx + 2;
      });
      LocalStorageBackend.saveTransactions(data);
      return { success: true, message: '成功刪除紀錄！' };
    }

    const db = await getSqliteDb();
    const numericId = Number(idOrRow);
    const res = await db.runAsync('DELETE FROM transactions WHERE id = ? OR row_number = ?', [
      numericId,
      numericId,
    ]);
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
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          currencies: (parsed.currencies?.length
            ? parsed.currencies
            : DEFAULT_SETTINGS.currencies) as CurrencyCode[],
        };
      } catch {
        // Fallback to default
      }
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as CustomSettings;
  },

  async saveSettings(settings: Partial<CustomSettings>): Promise<ApiActionResult> {
    const current = await this.getSettings();
    const merged: CustomSettings = {
      ...current,
      ...settings,
      accounts: (settings.accounts ?? current.accounts)
        .map((a) => String(a).trim())
        .filter(Boolean),
      categories: (settings.categories ?? current.categories)
        .map((c) => String(c).trim())
        .filter(Boolean),
      currencies: (settings.currencies ?? current.currencies) as CurrencyCode[],
      baseCurrency: (settings.baseCurrency
        ? String(settings.baseCurrency).trim().toUpperCase()
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
      settings.accounts = (settings.accounts || []).filter((a) => a !== target);
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
      settings.accounts = settings.accounts.filter((a) => a !== target);
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
      settings.categories = (settings.categories || []).filter((c) => c !== target);
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
      settings.categories = settings.categories.filter((c) => c !== target);
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

  async getCachedExchangeRates(): Promise<ExchangeRates | null> {
    if (!isNativeMobileRuntime()) {
      return LocalStorageBackend.getCachedFX();
    }
    const db = await getSqliteDb();
    const row = await db.getFirstAsync<{ base: string; rates_json: string; updated_at: string }>(
      'SELECT base, rates_json, updated_at FROM fx_cache WHERE base = ?',
      ['TWD'],
    );
    if (!row) return null;
    try {
      return {
        base: row.base,
        updated: row.updated_at,
        rates: JSON.parse(row.rates_json),
      };
    } catch {
      return null;
    }
  },

  async saveCachedExchangeRates(fx: ExchangeRates): Promise<void> {
    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveCachedFX(fx);
      return;
    }
    const db = await getSqliteDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO fx_cache (base, rates_json, updated_at) VALUES (?, ?, ?)',
      [fx.base || 'TWD', JSON.stringify(fx.rates), fx.updated || new Date().toISOString()],
    );
  },

  async resetSeedData(): Promise<ApiActionResult> {
    const seedTx = getDefaultSeedTransactions();
    const seedSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as CustomSettings;

    if (!isNativeMobileRuntime()) {
      LocalStorageBackend.saveSettings(seedSettings);
      LocalStorageBackend.saveTransactions(seedTx);
      LocalStorageBackend.saveCachedFX({
        ...DEFAULT_EXCHANGE_RATES,
        updated: new Date().toISOString(),
      });
      return {
        success: true,
        count: seedTx.length,
        message: `已重置為預設範例資料（共 ${seedTx.length} 筆交易）！`,
      };
    }

    const db = await getSqliteDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM transactions');
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
