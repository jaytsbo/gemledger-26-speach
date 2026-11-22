import {
  AIBookkeeperResponse,
  AiChatMessage,
  ApiActionResult,
  CustomSettings,
  ExchangeRates,
  GeminiConnectionTestResult,
  Transaction,
  TransactionInput,
} from '../types/ledger';
import { DEFAULT_EXCHANGE_RATES, sanitizeRatesMap } from '../utils/currency';
import { getLocalDateStr, getLocalTimeStr } from '../utils/dateTime';
import { Database, sanitizeAiChatMessages } from './database';
import { fallbackParseTransaction } from './fallbackParser';
import {
  callGeminiDirectWithKey,
  clearUserGeminiApiKey,
  loadUserGeminiApiKey,
  saveUserGeminiApiKey,
  testUserGeminiApiKey,
} from './geminiDirectService';

declare const google:
  | {
      script?: {
        run?: {
          withSuccessHandler: (cb: (res: any) => void) => any;
        };
      };
    }
  | undefined;

// Single environment detection check per coding-rules.md
const isGasEnv = typeof google !== 'undefined' && Boolean((google as any)?.script?.run);

// Frozen Gemini model cascade per coding-rules.md
export const MODELS_CASCADE = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
] as const;

const mockDelay = (ms = 25): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function callGas<T>(methodName: string, ...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = (google as any).script.run
      .withSuccessHandler((res: T) => resolve(res))
      .withFailureHandler((err: any) => reject(err));
    runner[methodName](...args);
  });
}

function escapeCsvField(value: unknown): string {
  const str = String(value ?? '');
  const isFormulaPrefix = /^[=+\-@]/.test(str);
  const isPlainNumber = /^[+-]?\d+(?:\.\d+)?$/.test(str);
  let safeStr = str;
  if (isFormulaPrefix && !isPlainNumber) {
    safeStr = `'${str}`;
    console.warn('[ApiService/escapeCsvField] Neutralized - Formula prefix escaped');
  }
  if (/[",\n\r]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

class ApiServiceImpl {
  private _memoryCache: Transaction[] | null = null;
  private _cacheEpoch = 0;
  private _settingsCache: CustomSettings | null = null;
  private _settingsCacheEpoch = 0;

  private _log(method: string, action: string, summary: string): void {
    console.log(`[ApiService/${method}] ${action} - ${summary}`);
  }

  private _invalidateTxCache(): void {
    this._memoryCache = null;
    this._cacheEpoch += 1;
    this._log('_invalidateTxCache', 'Invalidate', `MemoryCache reset (epoch=${this._cacheEpoch})`);
  }

  private _invalidateSettingsCache(): void {
    this._settingsCache = null;
    this._settingsCacheEpoch += 1;
    this._log(
      '_invalidateSettingsCache',
      'Invalidate',
      `SettingsCache reset (epoch=${this._settingsCacheEpoch})`,
    );
  }

  clearCache(): void {
    this._invalidateTxCache();
    this._invalidateSettingsCache();
  }

  async getSheetData(forceRefresh: boolean = false): Promise<Transaction[]> {
    if (forceRefresh) {
      this._invalidateTxCache();
    } else if (this._memoryCache) {
      this._log('getSheetData', 'CacheHit', `Rows:${this._memoryCache.length}`);
      return this._memoryCache;
    }

    const requestEpoch = this._cacheEpoch;
    this._log('getSheetData', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}, Force:${forceRefresh}`);
    if (isGasEnv) {
      const data = (await callGas<Transaction[]>('getSheetData', forceRefresh)) || [];
      if (this._cacheEpoch === requestEpoch) {
        this._memoryCache = data;
      }
      this._log('getSheetData', 'Response', `GAS Rows:${data.length}`);
      return data;
    }

    await mockDelay();
    const data = await Database.getTransactions();
    if (this._cacheEpoch === requestEpoch) {
      this._memoryCache = data;
    } else {
      this._log('getSheetData', 'SkipCache', `Stale epoch (${requestEpoch} !== ${this._cacheEpoch})`);
    }
    this._log('getSheetData', 'Response', `Local Rows:${data.length}`);
    return data;
  }

  async addTransaction(item: TransactionInput): Promise<ApiActionResult> {
    this._invalidateTxCache();
    this._log(
      'addTransaction',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Name:${item?.name}, Amt:${item?.amount} ${item?.currency}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('addTransaction', item);
        this._log('addTransaction', 'Response', `GAS Success:${res?.success}, Row:${res?.rowNumber}`);
        return res;
      }

      await mockDelay();
      const res = await Database.addTransaction(item);
      this._log('addTransaction', 'Response', `Local Success:${res.success}, Row:${res.rowNumber}`);
      return res;
    } finally {
      this._invalidateTxCache();
    }
  }

  async batchAddTransactions(items: TransactionInput[]): Promise<ApiActionResult> {
    this._invalidateTxCache();
    this._log(
      'batchAddTransactions',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Count:${items.length}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('batchAddTransactions', items);
        this._log('batchAddTransactions', 'Response', `GAS Count:${res?.count}`);
        return res;
      }

      await mockDelay();
      const res = await Database.batchAddTransactions(items);
      this._log('batchAddTransactions', 'Response', `Local Count:${res.count}`);
      return res;
    } finally {
      this._invalidateTxCache();
    }
  }

  async updateTransaction(
    rowNumberOrId: number | string,
    updatedItem: TransactionInput,
  ): Promise<ApiActionResult> {
    this._invalidateTxCache();
    this._log(
      'updateTransaction',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Target:${rowNumberOrId}, Name:${updatedItem?.name}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('updateTransaction', rowNumberOrId, updatedItem);
        this._log('updateTransaction', 'Response', `GAS Success:${res?.success}`);
        return res;
      }

      await mockDelay();
      const res = await Database.updateTransaction(rowNumberOrId, updatedItem);
      this._log('updateTransaction', 'Response', `Local Success:${res.success}`);
      return res;
    } finally {
      this._invalidateTxCache();
    }
  }

  async deleteTransaction(rowNumberOrId: number | string): Promise<ApiActionResult> {
    this._invalidateTxCache();
    this._log(
      'deleteTransaction',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Target:${rowNumberOrId}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('deleteTransaction', rowNumberOrId);
        this._log('deleteTransaction', 'Response', `GAS Success:${res?.success}`);
        return res;
      }

      await mockDelay();
      const res = await Database.deleteTransaction(rowNumberOrId);
      this._log('deleteTransaction', 'Response', `Local Success:${res.success}`);
      return res;
    } finally {
      this._invalidateTxCache();
    }
  }

  async getCustomSettings(): Promise<CustomSettings> {
    if (this._settingsCache) {
      this._log(
        'getCustomSettings',
        'CacheHit',
        `Accounts:${this._settingsCache.accounts.length}, Categories:${this._settingsCache.categories.length}, Base:${this._settingsCache.baseCurrency}`,
      );
      return this._settingsCache;
    }

    const requestEpoch = this._settingsCacheEpoch;
    this._log('getCustomSettings', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      const res = await callGas<CustomSettings>('getCustomSettings');
      if (this._settingsCacheEpoch === requestEpoch) {
        this._settingsCache = res;
      } else {
        this._log(
          'getCustomSettings',
          'SkipCache',
          `Stale epoch (${requestEpoch} !== ${this._settingsCacheEpoch})`,
        );
      }
      this._log(
        'getCustomSettings',
        'Response',
        `GAS Accounts:${res?.accounts?.length ?? 0}, Categories:${res?.categories?.length ?? 0}`,
      );
      return res;
    }

    await mockDelay();
    const res = await Database.getSettings();
    if (this._settingsCacheEpoch === requestEpoch) {
      this._settingsCache = res;
    } else {
      this._log(
        'getCustomSettings',
        'SkipCache',
        `Stale epoch (${requestEpoch} !== ${this._settingsCacheEpoch})`,
      );
    }
    this._log(
      'getCustomSettings',
      'Response',
      `Local Accounts:${res.accounts.length}, Categories:${res.categories.length}, Base:${res.baseCurrency}`,
    );
    return res;
  }

  async saveCustomSettings(settings: Partial<CustomSettings>): Promise<ApiActionResult> {
    this._invalidateSettingsCache();
    this._log(
      'saveCustomSettings',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Base:${settings.baseCurrency ?? 'unchanged'}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('saveCustomSettings', settings);
        this._log('saveCustomSettings', 'Response', `GAS Success:${res?.success}`);
        return res;
      }

      await mockDelay();
      const res = await Database.saveSettings(settings);
      this._log('saveCustomSettings', 'Response', `Local Success:${res.success}`);
      return res;
    } finally {
      this._invalidateSettingsCache();
    }
  }

  async getCachedExchangeRates(): Promise<ExchangeRates | null> {
    this._log('getCachedExchangeRates', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      const res = await callGas<ExchangeRates | null>('getCachedExchangeRates');
      const cleanRates = res?.rates ? sanitizeRatesMap(res.rates) : null;
      const valid = res && cleanRates ? { ...res, rates: cleanRates } : null;
      this._log(
        'getCachedExchangeRates',
        'Response',
        `GAS Hit:${Boolean(valid)}, Updated:${valid?.updated ?? 'none'}`,
      );
      return valid;
    }

    await mockDelay();
    const res = await Database.getCachedExchangeRates();
    this._log(
      'getCachedExchangeRates',
      'Response',
      `Local Hit:${Boolean(res)}, Updated:${res?.updated ?? 'none'}`,
    );
    return res;
  }

  async getExchangeRates(): Promise<ExchangeRates> {
    this._log('getExchangeRates', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      const res = await callGas<ExchangeRates>('getExchangeRates');
      this._log('getExchangeRates', 'Response', `GAS Base:${res?.base}, Updated:${res?.updated}`);
      return res;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/TWD', {
        signal: controller?.signal,
      });

      if (response.ok) {
        const json = (await response.json()) as {
          rates?: Record<string, number>;
          time_last_update_utc?: string;
        };
        const cleanRates = sanitizeRatesMap(json?.rates);
        if (cleanRates) {
          const fresh: ExchangeRates = {
            base: 'TWD',
            updated: json.time_last_update_utc || new Date().toISOString(),
            rates: cleanRates,
          };
          await Database.saveCachedExchangeRates(fresh);
          this._log('getExchangeRates', 'Response', `LiveFX Updated:${fresh.updated}`);
          return fresh;
        }
      }
    } catch (err) {
      this._log(
        'getExchangeRates',
        'Fallback',
        `LiveFX failed (${err instanceof Error ? err.message : 'network error'}), checking cache`,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }

    const cached = await Database.getCachedExchangeRates();
    if (cached) {
      this._log('getExchangeRates', 'CacheFallback', `Updated:${cached.updated}`);
      return cached;
    }

    const staticFallback: ExchangeRates = {
      ...DEFAULT_EXCHANGE_RATES,
      rates: { ...DEFAULT_EXCHANGE_RATES.rates },
    };
    this._log('getExchangeRates', 'StaticFallback', 'Using DEFAULT_EXCHANGE_RATES');
    return staticFallback;
  }

  async deleteAccountCascade(accountName: string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'deleteAccountCascade',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Account:${accountName}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('deleteAccountCascade', accountName);
        this._log(
          'deleteAccountCascade',
          'Response',
          `GAS Deleted:${res?.deletedCount ?? 0}`,
        );
        return res;
      }

      await mockDelay();
      const res = await Database.deleteAccountCascade(accountName);
      this._log('deleteAccountCascade', 'Response', `Local Deleted:${res.deletedCount ?? 0}`);
      return res;
    } finally {
      this.clearCache();
    }
  }

  async deleteCategoryCascade(categoryName: string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'deleteCategoryCascade',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Category:${categoryName}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('deleteCategoryCascade', categoryName);
        this._log(
          'deleteCategoryCascade',
          'Response',
          `GAS Deleted:${res?.deletedCount ?? 0}`,
        );
        return res;
      }

      await mockDelay();
      const res = await Database.deleteCategoryCascade(categoryName);
      this._log('deleteCategoryCascade', 'Response', `Local Deleted:${res.deletedCount ?? 0}`);
      return res;
    } finally {
      this.clearCache();
    }
  }

  async renameAccount(oldName: string, newName: string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'renameAccount',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, ${oldName} -> ${newName}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('renameAccount', oldName, newName);
        this._log('renameAccount', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
        return res;
      }

      await mockDelay();
      const res = await Database.renameAccount(oldName, newName);
      this._log('renameAccount', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
      return res;
    } finally {
      this.clearCache();
    }
  }

  async renameCategory(oldName: string, newName: string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'renameCategory',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, ${oldName} -> ${newName}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('renameCategory', oldName, newName);
        this._log('renameCategory', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
        return res;
      }

      await mockDelay();
      const res = await Database.renameCategory(oldName, newName);
      this._log('renameCategory', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
      return res;
    } finally {
      this.clearCache();
    }
  }

  async mergeCategories(
    sourceCategory: string,
    targetCategory: string,
  ): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'mergeCategories',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, ${sourceCategory} -> ${targetCategory}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('mergeCategories', sourceCategory, targetCategory);
        this._log('mergeCategories', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
        return res;
      }

      await mockDelay();
      const res = await Database.mergeCategories(sourceCategory, targetCategory);
      this._log('mergeCategories', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
      return res;
    } finally {
      this.clearCache();
    }
  }

  async importTransactions(
    items: Omit<Transaction, 'id' | 'rowNumber'>[],
    mode: 'append' | 'overwrite',
  ): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'importTransactions',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Mode:${mode}, Count:${items.length}`,
    );

    try {
      if (isGasEnv) {
        const res = await callGas<ApiActionResult>('importTransactions', items, mode);
        this._log('importTransactions', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
        return res;
      }

      await mockDelay();
      const res = await Database.importTransactions(items, mode);
      this._log('importTransactions', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
      return res;
    } finally {
      this.clearCache();
    }
  }

  async getGeminiApiKey(): Promise<string> {
    const key = await loadUserGeminiApiKey();
    this._log('getGeminiApiKey', 'Load', `HasKey:${Boolean(key)}`);
    return key;
  }

  async saveGeminiApiKey(apiKey: string): Promise<void> {
    const hasKey = Boolean(apiKey.trim());
    this._log('saveGeminiApiKey', 'Save', `HasKey:${hasKey}`);
    await saveUserGeminiApiKey(apiKey);
  }

  async clearGeminiApiKey(): Promise<void> {
    this._log('clearGeminiApiKey', 'Clear', 'Removing stored user Gemini API key');
    await clearUserGeminiApiKey();
  }

  async testGeminiApiKey(apiKeyOverride?: string): Promise<GeminiConnectionTestResult> {
    this._log(
      'testGeminiApiKey',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, HasOverride:${apiKeyOverride !== undefined}`,
    );

    if (isGasEnv) {
      const res = await callGas<GeminiConnectionTestResult>('testGeminiApiKey', apiKeyOverride);
      this._log(
        'testGeminiApiKey',
        'Response',
        `GAS OK:${Boolean(res?.ok)}, Code:${res?.code ?? 'unknown'}`,
      );
      return res;
    }

    const resolvedKey = (
      apiKeyOverride !== undefined ? apiKeyOverride : await loadUserGeminiApiKey()
    ).trim();
    const res = await testUserGeminiApiKey(resolvedKey);
    this._log(
      'testGeminiApiKey',
      'Response',
      `Local OK:${res.ok}, Status:${res.status ?? 'none'}, Code:${res.code}`,
    );
    return res;
  }

  async callGeminiBookkeeper(
    userMessage: string,
    mediaBase64?: string | null,
    mimeType?: string | null,
  ): Promise<AIBookkeeperResponse> {
    const isAudio = Boolean(mimeType?.startsWith('audio/'));
    this._log(
      'callGeminiBookkeeper',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, MsgLen:${(userMessage || '').length}, HasMedia:${Boolean(mediaBase64)}, Mime:${mimeType ?? 'none'}`,
    );

    if (isGasEnv) {
      const res = await callGas<AIBookkeeperResponse>(
        'callGeminiBookkeeper',
        userMessage,
        mediaBase64,
        mimeType,
      );
      this._log(
        'callGeminiBookkeeper',
        'Response',
        `GAS Model:${res?.modelUsed ?? 'fallback'}, Drafts:${res?.parsedTransactions?.length ?? 0}`,
      );
      return res;
    }

    const settings = await this.getCustomSettings();
    const currentDateStr = getLocalDateStr();
    const currentTimeStr = getLocalTimeStr();

    if (settings.simulate503) {
      this._log('callGeminiBookkeeper', 'Fallback', `Reason:simulate503=true, IsAudio:${isAudio}`);
      await mockDelay(120);
      if (isAudio) {
        return {
          reply:
            '目前已開啟 503 離線模擬，請先至「設定 → AI 與開發者設定」關閉後再使用語音記帳。',
          parsedTransactions: [],
          isFallback: true,
          fallbackReason: 'SIMULATE_503',
          errorType: 'SIMULATE_503',
        };
      }
      return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr, {
        code: 'SIMULATE_503',
      });
    }

    const userApiKey = await loadUserGeminiApiKey();
    if (userApiKey) {
      this._log('callGeminiBookkeeper', 'DirectBYOK', 'Using user-provided Gemini API key');
      return callGeminiDirectWithKey(
        userApiKey,
        userMessage,
        mediaBase64,
        mimeType,
        settings,
        currentDateStr,
        currentTimeStr,
        MODELS_CASCADE,
      );
    }

    this._log('callGeminiBookkeeper', 'Fallback', `Reason:User Gemini Key unconfigured, IsAudio:${isAudio}`);
    await mockDelay(120);
    if (isAudio) {
      return {
        reply:
          '語音記帳需要設定 Gemini API Key，請先至「設定 → AI 與開發者設定」填入您的 API Key。',
        parsedTransactions: [],
        isFallback: true,
        fallbackReason: 'KEY_MISSING',
        errorType: 'KEY_MISSING',
      };
    }
    return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr, {
      code: 'KEY_MISSING',
    });
  }

  async getAiChatHistory(): Promise<AiChatMessage[]> {
    this._log('getAiChatHistory', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      const res = await callGas<AiChatMessage[]>('getAiChatHistory');
      const sanitized = sanitizeAiChatMessages(res);
      this._log('getAiChatHistory', 'Response', `GAS Count:${sanitized.length}`);
      return sanitized;
    }

    await mockDelay();
    const res = await Database.getAiChatHistory();
    this._log('getAiChatHistory', 'Response', `Local Count:${res.length}`);
    return res;
  }

  async saveAiChatHistory(messages: AiChatMessage[]): Promise<ApiActionResult> {
    const sanitized = sanitizeAiChatMessages(messages);
    this._log(
      'saveAiChatHistory',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Input:${Array.isArray(messages) ? messages.length : 0}, Sanitized:${sanitized.length}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('saveAiChatHistory', sanitized);
      this._log('saveAiChatHistory', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? sanitized.length}`);
      return res;
    }

    await mockDelay();
    const res = await Database.saveAiChatHistory(sanitized);
    this._log('saveAiChatHistory', 'Response', `Local Success:${res.success}, Count:${res.count ?? sanitized.length}`);
    return res;
  }

  async clearAiChatHistory(): Promise<ApiActionResult> {
    this._log('clearAiChatHistory', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('clearAiChatHistory');
      this._log('clearAiChatHistory', 'Response', `GAS Success:${res?.success}`);
      return res;
    }

    await mockDelay();
    const res = await Database.clearAiChatHistory();
    this._log('clearAiChatHistory', 'Response', `Local Success:${res.success}`);
    return res;
  }

  async resetSeedData(): Promise<ApiActionResult> {
    this.clearCache();
    this._log('resetSeedData', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      throw new Error('GAS 環境不支援直接覆寫試算表為本地範例資料');
    }

    try {
      await mockDelay();
      const res = await Database.resetSeedData();
      this._log('resetSeedData', 'Response', `Seeded:${res.count ?? 0} rows`);
      return res;
    } finally {
      this.clearCache();
    }
  }

  async exportTransactionsCSV(transactions?: Transaction[]): Promise<string> {
    const rows = transactions ?? (await this.getSheetData());
    this._log('exportTransactionsCSV', 'Export', `Rows:${rows.length}`);

    const header = ['日期', '時間', '帳戶', '項目名稱', '分類', '幣別', '金額', '備註'].join(',');
    const lines = rows.map((tx) =>
      [
        escapeCsvField(tx.date),
        escapeCsvField(tx.time),
        escapeCsvField(tx.account),
        escapeCsvField(tx.name),
        escapeCsvField(tx.category),
        escapeCsvField((tx.currency || 'TWD').toUpperCase()),
        escapeCsvField(tx.amount),
        escapeCsvField(tx.note),
      ].join(','),
    );
    return `\uFEFF${[header, ...lines].join('\n')}`;
  }

  async exportTransactionsJSON(transactions?: Transaction[]): Promise<string> {
    const rows = transactions ?? (await this.getSheetData());
    this._log('exportTransactionsJSON', 'Export', `Rows:${rows.length}`);
    return JSON.stringify(rows, null, 2);
  }
}

export const ApiService = new ApiServiceImpl();
