import { create } from 'zustand';
import { ApiService } from '../services/apiService';
import { DEFAULT_SETTINGS } from '../services/database';
import {
  AIBookkeeperResponse,
  AiChatMessage,
  ApiActionResult,
  CurrencyCode,
  CustomSettings,
  ExchangeRates,
  FilterState,
  Transaction,
  TransactionInput,
} from '../types/ledger';
import { filterTransactions } from '../utils/analytics';
import { DEFAULT_EXCHANGE_RATES } from '../utils/currency';

export const DEFAULT_FILTERS: FilterState = {
  year: 'ALL',
  month: 'ALL',
  date: '',
  account: 'ALL',
  category: 'ALL',
  currency: 'ALL',
  searchQuery: '',
};

export interface LedgerState {
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  settings: CustomSettings;
  exchangeRates: ExchangeRates;
  baseCurrency: CurrencyCode;
  filters: FilterState;
  isLoading: boolean;
  isSyncingFX: boolean;
  initialized: boolean;
  aiChatMessages: AiChatMessage[];

  initialize: () => Promise<void>;
  refreshAll: (forceRefresh?: boolean) => Promise<void>;
  setAiChatMessages: (
    next: AiChatMessage[] | ((prev: AiChatMessage[]) => AiChatMessage[]),
  ) => void;
  clearAiChat: () => Promise<void>;
  setBaseCurrency: (currency: CurrencyCode) => Promise<void>;
  setFilter: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;
  addTransaction: (item: TransactionInput) => Promise<ApiActionResult>;
  batchAddTransactions: (items: TransactionInput[]) => Promise<ApiActionResult>;
  updateTransaction: (idOrRow: number | string, item: TransactionInput) => Promise<ApiActionResult>;
  deleteTransaction: (idOrRow: number | string) => Promise<ApiActionResult>;
  addAccount: (accountName: string) => Promise<ApiActionResult>;
  renameAccount: (oldName: string, newName: string) => Promise<ApiActionResult>;
  removeAccountCascade: (accountName: string) => Promise<ApiActionResult>;
  addCategory: (categoryName: string) => Promise<ApiActionResult>;
  renameCategory: (oldName: string, newName: string) => Promise<ApiActionResult>;
  mergeCategories: (sourceCategory: string, targetCategory: string) => Promise<ApiActionResult>;
  removeCategoryCascade: (categoryName: string) => Promise<ApiActionResult>;
  importTransactions: (
    items: Omit<Transaction, 'id' | 'rowNumber'>[],
    mode: 'append' | 'overwrite',
  ) => Promise<ApiActionResult>;
  updateSettings: (patch: Partial<CustomSettings>) => Promise<ApiActionResult>;
  syncExchangeRates: () => Promise<ExchangeRates>;
  callAI: (
    userMessage: string,
    mediaBase64?: string | null,
    mimeType?: string | null,
  ) => Promise<AIBookkeeperResponse>;
  resetToSeedData: () => Promise<ApiActionResult>;
}

const AI_CHAT_SAVE_DEBOUNCE_MS = 400;

let initPromise: Promise<void> | null = null;
let settingsMutationQueue: Promise<unknown> = Promise.resolve();
let aiChatSaveTimer: ReturnType<typeof setTimeout> | null = null;
let aiChatPersistEpoch = 0;
let aiChatStorageQueue: Promise<unknown> = Promise.resolve();
let fxApplyEpoch = 0;
let fxSyncInFlightCount = 0;

function enqueueSettingsMutation<T>(task: () => Promise<T>): Promise<T> {
  const next = settingsMutationQueue.then(task, task);
  settingsMutationQueue = next.catch(() => {});
  return next;
}

function enqueueAiChatStorage<T>(task: () => Promise<T>): Promise<T> {
  const next = aiChatStorageQueue.then(task, task);
  aiChatStorageQueue = next.catch(() => {});
  return next;
}

export const useLedgerStore = create<LedgerState>((set, get) => {
  const syncTransactions = async (): Promise<void> => {
    const transactions = await ApiService.getSheetData(true);
    set((state) => ({
      transactions,
      filteredTransactions: filterTransactions(transactions, state.filters),
    }));
  };

  const syncSettings = async (syncBaseCurrency = false): Promise<void> => {
    const updatedSettings = await ApiService.getCustomSettings();
    set((state) => ({
      settings: updatedSettings,
      ...(syncBaseCurrency
        ? { baseCurrency: (updatedSettings.baseCurrency || state.baseCurrency) as CurrencyCode }
        : {}),
    }));
  };

  const syncSettingsAndTransactions = async (
    mapFilters?: (filters: FilterState) => FilterState,
  ): Promise<void> => {
    const [updatedSettings, transactions] = await Promise.all([
      ApiService.getCustomSettings(),
      ApiService.getSheetData(true),
    ]);
    set((state) => {
      const nextFilters = mapFilters ? mapFilters(state.filters) : state.filters;
      return {
        settings: updatedSettings,
        transactions,
        ...(mapFilters ? { filters: nextFilters } : {}),
        filteredTransactions: filterTransactions(transactions, nextFilters),
      };
    });
  };

  return {
  transactions: [],
  filteredTransactions: [],
  settings: DEFAULT_SETTINGS,
  exchangeRates: DEFAULT_EXCHANGE_RATES,
  baseCurrency: 'TWD',
  filters: { ...DEFAULT_FILTERS },
  isLoading: false,
  isSyncingFX: false,
  initialized: false,
  aiChatMessages: [],

  initialize: async () => {
    if (get().initialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const chatEpochAtStart = aiChatPersistEpoch;
      set({ isLoading: true });
      console.log(
        '[LedgerStore/initialize] Start - Loading settings, transactions, cached FX, AI chat history',
      );
      try {
        const [settingsRes, txRes, cachedFxRes, chatRes] = await Promise.allSettled([
          ApiService.getCustomSettings(),
          ApiService.getSheetData(false),
          ApiService.getCachedExchangeRates(),
          ApiService.getAiChatHistory(),
        ]);

        const nextSettings =
          settingsRes.status === 'fulfilled' ? settingsRes.value : get().settings;
        const txLoaded = txRes.status === 'fulfilled' && Array.isArray(txRes.value);
        const nextTransactions = txLoaded ? txRes.value : get().transactions;
        const cachedFx =
          cachedFxRes.status === 'fulfilled' && cachedFxRes.value?.rates
            ? cachedFxRes.value
            : null;
        const nextFx: ExchangeRates = cachedFx ?? {
          ...DEFAULT_EXCHANGE_RATES,
          rates: { ...DEFAULT_EXCHANGE_RATES.rates },
        };
        if (cachedFxRes.status === 'rejected') {
          console.warn(
            '[LedgerStore/initialize] Warning - Cached FX load failed, using DEFAULT_EXCHANGE_RATES:',
            cachedFxRes.reason instanceof Error ? cachedFxRes.reason.message : 'unknown',
          );
        }

        const chatLoaded = chatRes.status === 'fulfilled' && Array.isArray(chatRes.value);
        if (chatRes.status === 'rejected') {
          console.warn(
            '[LedgerStore/initialize] Warning - AI chat history load failed, continuing:',
            chatRes.reason instanceof Error ? chatRes.reason.message : 'unknown',
          );
        }

        const nextBaseCurrency = (nextSettings.baseCurrency || 'TWD') as CurrencyCode;

        set((state) => ({
          settings: nextSettings,
          transactions: nextTransactions,
          filteredTransactions: filterTransactions(nextTransactions, state.filters),
          exchangeRates: nextFx,
          baseCurrency: nextBaseCurrency,
          aiChatMessages:
            chatLoaded && aiChatPersistEpoch === chatEpochAtStart
              ? chatRes.value
              : state.aiChatMessages,
          isLoading: false,
          initialized: txLoaded,
        }));

        if (!txLoaded) {
          console.warn(
            '[LedgerStore/initialize] Warning - Transactions load failed, keeping initialized=false',
          );
        } else {
          console.log(
            `[LedgerStore/initialize] Done - Tx:${nextTransactions.length}, Base:${nextBaseCurrency}, CachedFX:${Boolean(cachedFx)}, Chat:${chatLoaded ? chatRes.value.length : 0}`,
          );
          // Stale-While-Revalidate: refresh live FX in background without blocking cold start
          void (async () => {
            const myEpoch = ++fxApplyEpoch;
            fxSyncInFlightCount += 1;
            set({ isSyncingFX: true });
            console.log('[LedgerStore/initialize] BackgroundFXStart - Fetching live FX rates');
            try {
              const liveFx = await ApiService.getExchangeRates();
              if (fxApplyEpoch === myEpoch && liveFx?.rates) {
                set({ exchangeRates: liveFx });
                console.log(
                  `[LedgerStore/initialize] BackgroundFXDone - Updated:${liveFx.updated}`,
                );
              }
            } catch (err) {
              console.warn(
                '[LedgerStore/initialize] BackgroundFXFailed - Keeping cached/default FX:',
                err instanceof Error ? err.message : 'unknown',
              );
            } finally {
              fxSyncInFlightCount = Math.max(0, fxSyncInFlightCount - 1);
              if (fxSyncInFlightCount === 0) {
                set({ isSyncingFX: false });
              }
            }
          })();
        }
      } catch (err) {
        console.warn('[LedgerStore/initialize] Error -', err);
        set({ isLoading: false, initialized: false });
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  },

  refreshAll: async (forceRefresh = true) => {
    const myFxEpoch = ++fxApplyEpoch;
    set({ isLoading: true });
    console.log(`[LedgerStore/refreshAll] Request - Force:${forceRefresh}`);
    try {
      if (forceRefresh) {
        ApiService.clearCache();
      }
      const [settings, transactions, fxResult] = await Promise.all([
        ApiService.getCustomSettings(),
        ApiService.getSheetData(forceRefresh),
        ApiService.getExchangeRates().catch((err) => {
          console.warn(
            '[LedgerStore/refreshAll] FXFailed - Keeping existing exchangeRates:',
            err instanceof Error ? err.message : 'unknown',
          );
          return null;
        }),
      ]);
      set((state) => ({
        settings,
        transactions,
        filteredTransactions: filterTransactions(transactions, state.filters),
        exchangeRates:
          fxResult?.rates && fxApplyEpoch === myFxEpoch ? fxResult : state.exchangeRates,
        baseCurrency: (settings.baseCurrency || state.baseCurrency) as CurrencyCode,
        isLoading: false,
      }));
      console.log(
        `[LedgerStore/refreshAll] Done - Tx:${transactions.length}, FXUpdated:${Boolean(fxResult?.rates)}`,
      );
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  setAiChatMessages: (next) => {
    aiChatPersistEpoch += 1;
    const scheduledEpoch = aiChatPersistEpoch;
    let resolvedCount = 0;

    set((state) => {
      const resolved = typeof next === 'function' ? next(state.aiChatMessages) : next;
      const safeList = Array.isArray(resolved) ? resolved : [];
      resolvedCount = safeList.length;
      return { aiChatMessages: safeList };
    });

    if (aiChatSaveTimer) {
      clearTimeout(aiChatSaveTimer);
      aiChatSaveTimer = null;
    }

    console.log(
      `[LedgerStore/setAiChatMessages] QueuePersist - Count:${resolvedCount}, DebounceMs:${AI_CHAT_SAVE_DEBOUNCE_MS}`,
    );

    aiChatSaveTimer = setTimeout(() => {
      aiChatSaveTimer = null;
      if (scheduledEpoch !== aiChatPersistEpoch) return;
      const snapshot = get().aiChatMessages;
      void enqueueAiChatStorage(async () => {
        if (scheduledEpoch !== aiChatPersistEpoch) return;
        try {
          const res = await ApiService.saveAiChatHistory(snapshot);
          console.log(
            `[LedgerStore/setAiChatMessages] Persisted - Saved:${res?.count ?? snapshot.length}`,
          );
        } catch (err) {
          console.warn(
            '[LedgerStore/setAiChatMessages] PersistFailed -',
            err instanceof Error ? err.message : 'unknown',
          );
        }
      });
    }, AI_CHAT_SAVE_DEBOUNCE_MS);
  },

  clearAiChat: async () => {
    aiChatPersistEpoch += 1;
    if (aiChatSaveTimer) {
      clearTimeout(aiChatSaveTimer);
      aiChatSaveTimer = null;
    }
    set({ aiChatMessages: [] });
    console.log('[LedgerStore/clearAiChat] Request - Cleared state and cancelled pending persist');
    await enqueueAiChatStorage(async () => {
      await ApiService.clearAiChatHistory();
      console.log('[LedgerStore/clearAiChat] Done - Cleared persisted AI chat history');
    });
  },

  setBaseCurrency: async (currency: CurrencyCode) => {
    const nextCurrency = currency.trim().toUpperCase() as CurrencyCode;
    return enqueueSettingsMutation(async () => {
      const prevCurrency = get().baseCurrency;
      const prevSettings = get().settings;
      console.log(`[LedgerStore/setBaseCurrency] Update - Currency:${nextCurrency}`);
      set((state) => ({
        baseCurrency: nextCurrency,
        settings: { ...state.settings, baseCurrency: nextCurrency },
      }));
      try {
        await ApiService.saveCustomSettings({
          ...prevSettings,
          baseCurrency: nextCurrency,
        });
      } catch (err) {
        console.warn(
          '[LedgerStore/setBaseCurrency] Rollback - Save failed, restoring previous currency',
        );
        set({
          baseCurrency: prevCurrency,
          settings: prevSettings,
        });
        throw err;
      }
    });
  },

  setFilter: (patch: Partial<FilterState>) => {
    set((state) => {
      const nextFilters: FilterState = { ...state.filters, ...patch };
      if (patch.date) {
        const [y, m] = patch.date.split('-');
        if (y) nextFilters.year = y;
        if (m) nextFilters.month = m;
      } else if (
        patch.date === undefined &&
        ((patch.year !== undefined && patch.year !== state.filters.year) ||
          (patch.month !== undefined && patch.month !== state.filters.month))
      ) {
        nextFilters.date = '';
      }
      return {
        filters: nextFilters,
        filteredTransactions: filterTransactions(state.transactions, nextFilters),
      };
    });
  },

  resetFilters: () => {
    console.log('[LedgerStore/resetFilters] Reset - Clearing all filters');
    set((state) => ({
      filters: { ...DEFAULT_FILTERS },
      filteredTransactions: filterTransactions(state.transactions, DEFAULT_FILTERS),
    }));
  },

  addTransaction: async (item: TransactionInput) => {
    console.log(`[LedgerStore/addTransaction] Request - Name:${item.name}, Amt:${item.amount}`);
    const res = await ApiService.addTransaction(item);
    await syncTransactions();
    return res;
  },

  batchAddTransactions: async (items: TransactionInput[]) => {
    console.log(`[LedgerStore/batchAddTransactions] Request - Count:${items.length}`);
    const res = await ApiService.batchAddTransactions(items);
    await syncTransactions();
    return res;
  },

  updateTransaction: async (idOrRow: number | string, item: TransactionInput) => {
    console.log(`[LedgerStore/updateTransaction] Request - Target:${idOrRow}`);
    const res = await ApiService.updateTransaction(idOrRow, item);
    await syncTransactions();
    return res;
  },

  deleteTransaction: async (idOrRow: number | string) => {
    console.log(`[LedgerStore/deleteTransaction] Request - Target:${idOrRow}`);
    const res = await ApiService.deleteTransaction(idOrRow);
    await syncTransactions();
    return res;
  },

  addAccount: async (accountName: string) => {
    const clean = accountName.trim();
    if (!clean) throw new Error('請輸入帳戶名稱');
    return enqueueSettingsMutation(async () => {
      const current = get().settings;
      if (current.accounts.includes(clean)) {
        throw new Error(`帳戶「${clean}」已存在`);
      }
      const nextAccounts = [...current.accounts, clean];
      console.log(`[LedgerStore/addAccount] Request - Account:${clean}`);
      const res = await ApiService.saveCustomSettings({
        ...current,
        accounts: nextAccounts,
      });
      await syncSettings();
      return res;
    });
  },

  renameAccount: async (oldName: string, newName: string) => {
    const oldClean = oldName.trim();
    const newClean = newName.trim();
    return enqueueSettingsMutation(async () => {
      console.log(`[LedgerStore/renameAccount] Request - ${oldClean} -> ${newClean}`);
      const res = await ApiService.renameAccount(oldClean, newClean);
      await syncSettingsAndTransactions((filters) =>
        filters.account.trim() === oldClean ? { ...filters, account: newClean } : filters,
      );
      return res;
    });
  },

  removeAccountCascade: async (accountName: string) => {
    const cleanTarget = accountName.trim();
    return enqueueSettingsMutation(async () => {
      const current = get().settings;
      if (current.accounts.length <= 1) {
        throw new Error('至少需保留 1 個帳戶');
      }
      console.log(`[LedgerStore/removeAccountCascade] Request - Account:${cleanTarget}`);
      const res = await ApiService.deleteAccountCascade(cleanTarget);
      await syncSettingsAndTransactions((filters) =>
        filters.account.trim() === cleanTarget ? { ...filters, account: 'ALL' } : filters,
      );
      return res;
    });
  },

  addCategory: async (categoryName: string) => {
    const clean = categoryName.trim();
    if (!clean) throw new Error('請輸入分類名稱');
    return enqueueSettingsMutation(async () => {
      const current = get().settings;
      if (current.categories.includes(clean)) {
        throw new Error(`分類「${clean}」已存在`);
      }
      const nextCategories = [...current.categories, clean];
      console.log(`[LedgerStore/addCategory] Request - Category:${clean}`);
      const res = await ApiService.saveCustomSettings({
        ...current,
        categories: nextCategories,
      });
      await syncSettings();
      return res;
    });
  },

  renameCategory: async (oldName: string, newName: string) => {
    const oldClean = oldName.trim();
    const newClean = newName.trim();
    return enqueueSettingsMutation(async () => {
      console.log(`[LedgerStore/renameCategory] Request - ${oldClean} -> ${newClean}`);
      const res = await ApiService.renameCategory(oldClean, newClean);
      await syncSettingsAndTransactions((filters) =>
        filters.category.trim() === oldClean ? { ...filters, category: newClean } : filters,
      );
      return res;
    });
  },

  mergeCategories: async (sourceCategory: string, targetCategory: string) => {
    const sourceClean = sourceCategory.trim();
    const targetClean = targetCategory.trim();
    return enqueueSettingsMutation(async () => {
      console.log(`[LedgerStore/mergeCategories] Request - ${sourceClean} -> ${targetClean}`);
      const res = await ApiService.mergeCategories(sourceClean, targetClean);
      await syncSettingsAndTransactions((filters) =>
        filters.category.trim() === sourceClean ? { ...filters, category: targetClean } : filters,
      );
      return res;
    });
  },

  removeCategoryCascade: async (categoryName: string) => {
    const cleanTarget = categoryName.trim();
    return enqueueSettingsMutation(async () => {
      const current = get().settings;
      if (current.categories.length <= 1) {
        throw new Error('至少需保留 1 個分類');
      }
      console.log(`[LedgerStore/removeCategoryCascade] Request - Category:${cleanTarget}`);
      const res = await ApiService.deleteCategoryCascade(cleanTarget);
      await syncSettingsAndTransactions((filters) =>
        filters.category.trim() === cleanTarget ? { ...filters, category: 'ALL' } : filters,
      );
      return res;
    });
  },

  importTransactions: async (
    items: Omit<Transaction, 'id' | 'rowNumber'>[],
    mode: 'append' | 'overwrite',
  ) => {
    console.log(`[LedgerStore/importTransactions] Request - Mode:${mode}, Count:${items.length}`);
    const res = await ApiService.importTransactions(items, mode);
    await syncSettingsAndTransactions();
    return res;
  },

  updateSettings: async (patch: Partial<CustomSettings>) => {
    return enqueueSettingsMutation(async () => {
      const merged: CustomSettings = {
        ...get().settings,
        ...patch,
      };
      console.log('[LedgerStore/updateSettings] Request - Updating custom settings');
      const res = await ApiService.saveCustomSettings(merged);
      await syncSettings(true);
      return res;
    });
  },

  syncExchangeRates: async () => {
    const myEpoch = ++fxApplyEpoch;
    fxSyncInFlightCount += 1;
    set({ isSyncingFX: true });
    console.log('[LedgerStore/syncExchangeRates] Start - Fetching live FX rates');
    try {
      const exchangeRates = await ApiService.getExchangeRates();
      if (fxApplyEpoch === myEpoch) {
        set({ exchangeRates });
      }
      console.log(`[LedgerStore/syncExchangeRates] Done - Updated:${exchangeRates.updated}`);
      return exchangeRates;
    } finally {
      fxSyncInFlightCount = Math.max(0, fxSyncInFlightCount - 1);
      if (fxSyncInFlightCount === 0) {
        set({ isSyncingFX: false });
      }
    }
  },

  callAI: async (
    userMessage: string,
    mediaBase64?: string | null,
    mimeType?: string | null,
  ) => {
    console.log(
      `[LedgerStore/callAI] Request - MsgLen:${(userMessage || '').length}, HasMedia:${Boolean(mediaBase64)}, Mime:${mimeType ?? 'none'}`,
    );
    return ApiService.callGeminiBookkeeper(userMessage, mediaBase64, mimeType);
  },

  resetToSeedData: async () => {
    set({ isLoading: true });
    console.log('[LedgerStore/resetToSeedData] Request - Resetting to default seed data');
    try {
      const res = await ApiService.resetSeedData();
      const [settings, transactions] = await Promise.all([
        ApiService.getCustomSettings(),
        ApiService.getSheetData(true),
      ]);
      set({
        settings,
        transactions,
        filters: { ...DEFAULT_FILTERS },
        filteredTransactions: filterTransactions(transactions, DEFAULT_FILTERS),
        baseCurrency: (settings.baseCurrency || 'TWD') as CurrencyCode,
        isLoading: false,
      });
      return res;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },
};
});
