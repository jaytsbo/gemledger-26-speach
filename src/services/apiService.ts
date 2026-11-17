import {
  AIBookkeeperResponse,
  ApiActionResult,
  CustomSettings,
  ExchangeRates,
  Transaction,
  TransactionInput,
} from '../types/ledger';
import { DEFAULT_EXCHANGE_RATES } from '../utils/currency';
import { Database } from './database';
import { fallbackParseTransaction } from './fallbackParser';
import {
  callGeminiDirectWithKey,
  loadUserGeminiApiKey,
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

function getLocalDateStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getLocalTimeStr(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function escapeCsvField(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

class ApiServiceImpl {
  private _memoryCache: Transaction[] | null = null;

  private _log(method: string, action: string, summary: string): void {
    console.log(`[ApiService/${method}] ${action} - ${summary}`);
  }

  clearCache(): void {
    this._memoryCache = null;
    this._log('clearCache', 'Invalidate', 'MemoryCache reset to null');
  }

  async getSheetData(forceRefresh: boolean = false): Promise<Transaction[]> {
    if (forceRefresh) {
      this.clearCache();
    } else if (this._memoryCache) {
      this._log('getSheetData', 'CacheHit', `Rows:${this._memoryCache.length}`);
      return this._memoryCache;
    }

    this._log('getSheetData', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}, Force:${forceRefresh}`);
    if (isGasEnv) {
      const data = await callGas<Transaction[]>('getSheetData', forceRefresh);
      this._memoryCache = data || [];
      this._log('getSheetData', 'Response', `GAS Rows:${this._memoryCache.length}`);
      return this._memoryCache;
    }

    await mockDelay();
    const data = await Database.getTransactions();
    this._memoryCache = data;
    this._log('getSheetData', 'Response', `Local Rows:${data.length}`);
    return data;
  }

  async addTransaction(item: TransactionInput): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'addTransaction',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Name:${item?.name}, Amt:${item?.amount} ${item?.currency}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('addTransaction', item);
      this._log('addTransaction', 'Response', `GAS Success:${res?.success}, Row:${res?.rowNumber}`);
      return res;
    }

    await mockDelay();
    const res = await Database.addTransaction(item);
    this._log('addTransaction', 'Response', `Local Success:${res.success}, Row:${res.rowNumber}`);
    return res;
  }

  async batchAddTransactions(items: TransactionInput[]): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'batchAddTransactions',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Count:${items.length}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('batchAddTransactions', items);
      this._log('batchAddTransactions', 'Response', `GAS Count:${res?.count}`);
      return res;
    }

    await mockDelay();
    const res = await Database.batchAddTransactions(items);
    this._log('batchAddTransactions', 'Response', `Local Count:${res.count}`);
    return res;
  }

  async updateTransaction(
    rowNumberOrId: number | string,
    updatedItem: TransactionInput,
  ): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'updateTransaction',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Target:${rowNumberOrId}, Name:${updatedItem?.name}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('updateTransaction', rowNumberOrId, updatedItem);
      this._log('updateTransaction', 'Response', `GAS Success:${res?.success}`);
      return res;
    }

    await mockDelay();
    const res = await Database.updateTransaction(rowNumberOrId, updatedItem);
    this._log('updateTransaction', 'Response', `Local Success:${res.success}`);
    return res;
  }

  async deleteTransaction(rowNumberOrId: number | string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'deleteTransaction',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Target:${rowNumberOrId}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('deleteTransaction', rowNumberOrId);
      this._log('deleteTransaction', 'Response', `GAS Success:${res?.success}`);
      return res;
    }

    await mockDelay();
    const res = await Database.deleteTransaction(rowNumberOrId);
    this._log('deleteTransaction', 'Response', `Local Success:${res.success}`);
    return res;
  }

  async getCustomSettings(): Promise<CustomSettings> {
    this._log('getCustomSettings', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      const res = await callGas<CustomSettings>('getCustomSettings');
      this._log(
        'getCustomSettings',
        'Response',
        `GAS Accounts:${res?.accounts?.length ?? 0}, Categories:${res?.categories?.length ?? 0}`,
      );
      return res;
    }

    await mockDelay();
    const res = await Database.getSettings();
    this._log(
      'getCustomSettings',
      'Response',
      `Local Accounts:${res.accounts.length}, Categories:${res.categories.length}, Base:${res.baseCurrency}`,
    );
    return res;
  }

  async saveCustomSettings(settings: Partial<CustomSettings>): Promise<ApiActionResult> {
    this._log(
      'saveCustomSettings',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Base:${settings.baseCurrency ?? 'unchanged'}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('saveCustomSettings', settings);
      this._log('saveCustomSettings', 'Response', `GAS Success:${res?.success}`);
      return res;
    }

    await mockDelay();
    const res = await Database.saveSettings(settings);
    this._log('saveCustomSettings', 'Response', `Local Success:${res.success}`);
    return res;
  }

  async getExchangeRates(): Promise<ExchangeRates> {
    this._log('getExchangeRates', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      const res = await callGas<ExchangeRates>('getExchangeRates');
      this._log('getExchangeRates', 'Response', `GAS Base:${res?.base}, Updated:${res?.updated}`);
      return res;
    }

    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;

      const response = await fetch('https://open.er-api.com/v6/latest/TWD', {
        signal: controller?.signal,
      });
      if (timer) clearTimeout(timer);

      if (response.ok) {
        const json = (await response.json()) as {
          rates?: Record<string, number>;
          time_last_update_utc?: string;
        };
        if (json && json.rates) {
          const fresh: ExchangeRates = {
            base: 'TWD',
            updated: json.time_last_update_utc || new Date().toISOString(),
            rates: json.rates,
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
    }

    const cached = await Database.getCachedExchangeRates();
    if (cached) {
      this._log('getExchangeRates', 'CacheFallback', `Updated:${cached.updated}`);
      return cached;
    }

    const staticFallback: ExchangeRates = {
      ...DEFAULT_EXCHANGE_RATES,
      updated: new Date().toISOString(),
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
  }

  async deleteCategoryCascade(categoryName: string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'deleteCategoryCascade',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, Category:${categoryName}`,
    );

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
  }

  async renameAccount(oldName: string, newName: string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'renameAccount',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, ${oldName} -> ${newName}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('renameAccount', oldName, newName);
      this._log('renameAccount', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
      return res;
    }

    await mockDelay();
    const res = await Database.renameAccount(oldName, newName);
    this._log('renameAccount', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
    return res;
  }

  async renameCategory(oldName: string, newName: string): Promise<ApiActionResult> {
    this.clearCache();
    this._log(
      'renameCategory',
      'Request',
      `Env:${isGasEnv ? 'GAS' : 'Local'}, ${oldName} -> ${newName}`,
    );

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('renameCategory', oldName, newName);
      this._log('renameCategory', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
      return res;
    }

    await mockDelay();
    const res = await Database.renameCategory(oldName, newName);
    this._log('renameCategory', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
    return res;
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

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('mergeCategories', sourceCategory, targetCategory);
      this._log('mergeCategories', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
      return res;
    }

    await mockDelay();
    const res = await Database.mergeCategories(sourceCategory, targetCategory);
    this._log('mergeCategories', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
    return res;
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

    if (isGasEnv) {
      const res = await callGas<ApiActionResult>('importTransactions', items, mode);
      this._log('importTransactions', 'Response', `GAS Success:${res?.success}, Count:${res?.count ?? 0}`);
      return res;
    }

    await mockDelay();
    const res = await Database.importTransactions(items, mode);
    this._log('importTransactions', 'Response', `Local Success:${res.success}, Count:${res.count ?? 0}`);
    return res;
  }

  async hasGeminiApiKey(): Promise<boolean> {
    const key = await loadUserGeminiApiKey();
    const hasKey = Boolean(key);
    this._log('hasGeminiApiKey', 'Check', `HasKey:${hasKey}`);
    return hasKey;
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

    const settings = await Database.getSettings();
    const currentDateStr = getLocalDateStr();
    const currentTimeStr = getLocalTimeStr();

    if (settings.simulate503) {
      this._log('callGeminiBookkeeper', 'Fallback', `Reason:simulate503=true, IsAudio:${isAudio}`);
      await mockDelay(120);
      if (isAudio) {
        return {
          reply: '語音記帳需要設定 Gemini API Key，請先至「設定 → 進階 AI 設定」填入您的 API Key。',
          parsedTransactions: [],
          isFallback: true,
          fallbackReason: '語音記帳需要 Gemini API Key',
        };
      }
      return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr);
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
        reply: '語音記帳需要設定 Gemini API Key，請先至「設定 → 進階 AI 設定」填入您的 API Key。',
        parsedTransactions: [],
        isFallback: true,
        fallbackReason: '語音記帳需要 Gemini API Key',
      };
    }
    return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr);
  }

  async resetSeedData(): Promise<ApiActionResult> {
    this.clearCache();
    this._log('resetSeedData', 'Request', `Env:${isGasEnv ? 'GAS' : 'Local'}`);

    if (isGasEnv) {
      throw new Error('GAS 環境不支援直接覆寫試算表為本地範例資料');
    }

    await mockDelay();
    const res = await Database.resetSeedData();
    this._log('resetSeedData', 'Response', `Seeded:${res.count ?? 0} rows`);
    return res;
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
