import { create } from 'zustand';
import { ApiService } from '../services/apiService';
import { DEFAULT_SETTINGS } from '../services/database';
import {
  AIBookkeeperResponse,
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

  initialize: () => Promise<void>;
  refreshAll: (forceRefresh?: boolean) => Promise<void>;
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

let initPromise: Promise<void> | null = null;

export const useLedgerStore = create<LedgerState>((set, get) => ({
  transactions: [],
  filteredTransactions: [],
  settings: DEFAULT_SETTINGS,
  exchangeRates: DEFAULT_EXCHANGE_RATES,
  baseCurrency: 'TWD',
  filters: { ...DEFAULT_FILTERS },
  isLoading: false,
  isSyncingFX: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      set({ isLoading: true });
      console.log('[LedgerStore/initialize] Start - Loading settings, transactions, FX rates');
      try {
        const [settingsRes, txRes, fxRes] = await Promise.allSettled([
          ApiService.getCustomSettings(),
          ApiService.getSheetData(false),
          ApiService.getExchangeRates(),
        ]);

        const nextSettings =
          settingsRes.status === 'fulfilled' ? settingsRes.value : get().settings;
        const nextTransactions =
          txRes.status === 'fulfilled' && Array.isArray(txRes.value) ? txRes.value : [];
        const nextFx =
          fxRes.status === 'fulfilled' && fxRes.value?.rates ? fxRes.value : get().exchangeRates;
        const nextBaseCurrency = (nextSettings.baseCurrency || 'TWD') as CurrencyCode;

        set((state) => ({
          settings: nextSettings,
          transactions: nextTransactions,
          filteredTransactions: filterTransactions(nextTransactions, state.filters),
          exchangeRates: nextFx,
          baseCurrency: nextBaseCurrency,
          isLoading: false,
          initialized: true,
        }));
        console.log(
          `[LedgerStore/initialize] Done - Tx:${nextTransactions.length}, Base:${nextBaseCurrency}`,
        );
      } catch (err) {
        console.warn('[LedgerStore/initialize] Error -', err);
        set({ isLoading: false, initialized: true });
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  },

  refreshAll: async (forceRefresh = true) => {
    set({ isLoading: true });
    console.log(`[LedgerStore/refreshAll] Request - Force:${forceRefresh}`);
    try {
      const [settings, transactions, exchangeRates] = await Promise.all([
        ApiService.getCustomSettings(),
        ApiService.getSheetData(forceRefresh),
        ApiService.getExchangeRates(),
      ]);
      set((state) => ({
        settings,
        transactions,
        filteredTransactions: filterTransactions(transactions, state.filters),
        exchangeRates,
        baseCurrency: (settings.baseCurrency || state.baseCurrency) as CurrencyCode,
        isLoading: false,
      }));
      console.log(`[LedgerStore/refreshAll] Done - Tx:${transactions.length}`);
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  setBaseCurrency: async (currency: CurrencyCode) => {
    const nextCurrency = currency.toUpperCase() as CurrencyCode;
    console.log(`[LedgerStore/setBaseCurrency] Update - Currency:${nextCurrency}`);
    set((state) => ({
      baseCurrency: nextCurrency,
      settings: { ...state.settings, baseCurrency: nextCurrency },
    }));
    await ApiService.saveCustomSettings({
      ...get().settings,
      baseCurrency: nextCurrency,
    });
  },

  setFilter: (patch: Partial<FilterState>) => {
    set((state) => {
      const nextFilters: FilterState = { ...state.filters, ...patch };
      if (patch.date) {
        const [y, m] = patch.date.split('-');
        if (y) nextFilters.year = y;
        if (m) nextFilters.month = m;
      } else if (patch.year !== undefined && patch.year !== state.filters.year && !patch.date) {
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
    const transactions = await ApiService.getSheetData(true);
    set((state) => ({
      transactions,
      filteredTransactions: filterTransactions(transactions, state.filters),
    }));
    return res;
  },

  batchAddTransactions: async (items: TransactionInput[]) => {
    console.log(`[LedgerStore/batchAddTransactions] Request - Count:${items.length}`);
    const res = await ApiService.batchAddTransactions(items);
    const transactions = await ApiService.getSheetData(true);
    set((state) => ({
      transactions,
      filteredTransactions: filterTransactions(transactions, state.filters),
    }));
    return res;
  },

  updateTransaction: async (idOrRow: number | string, item: TransactionInput) => {
    console.log(`[LedgerStore/updateTransaction] Request - Target:${idOrRow}`);
    const res = await ApiService.updateTransaction(idOrRow, item);
    const transactions = await ApiService.getSheetData(true);
    set((state) => ({
      transactions,
      filteredTransactions: filterTransactions(transactions, state.filters),
    }));
    return res;
  },

  deleteTransaction: async (idOrRow: number | string) => {
    console.log(`[LedgerStore/deleteTransaction] Request - Target:${idOrRow}`);
    const res = await ApiService.deleteTransaction(idOrRow);
    const transactions = await ApiService.getSheetData(true);
    set((state) => ({
      transactions,
      filteredTransactions: filterTransactions(transactions, state.filters),
    }));
    return res;
  },

  addAccount: async (accountName: string) => {
    const clean = accountName.trim();
    if (!clean) throw new Error('請輸入帳戶名稱');
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
    const updatedSettings = await ApiService.getCustomSettings();
    set({ settings: updatedSettings });
    return res;
  },

  renameAccount: async (oldName: string, newName: string) => {
    const oldClean = oldName.trim();
    const newClean = newName.trim();
    console.log(`[LedgerStore/renameAccount] Request - ${oldClean} -> ${newClean}`);
    const res = await ApiService.renameAccount(oldClean, newClean);
    const [updatedSettings, transactions] = await Promise.all([
      ApiService.getCustomSettings(),
      ApiService.getSheetData(true),
    ]);
    set((state) => {
      const nextFilters =
        state.filters.account === oldClean
          ? { ...state.filters, account: newClean }
          : state.filters;
      return {
        settings: updatedSettings,
        transactions,
        filters: nextFilters,
        filteredTransactions: filterTransactions(transactions, nextFilters),
      };
    });
    return res;
  },

  removeAccountCascade: async (accountName: string) => {
    const current = get().settings;
    if (current.accounts.length <= 1) {
      throw new Error('至少需保留 1 個帳戶');
    }
    console.log(`[LedgerStore/removeAccountCascade] Request - Account:${accountName}`);
    const res = await ApiService.deleteAccountCascade(accountName);
    const [updatedSettings, transactions] = await Promise.all([
      ApiService.getCustomSettings(),
      ApiService.getSheetData(true),
    ]);
    set((state) => {
      const nextFilters =
        state.filters.account === accountName
          ? { ...state.filters, account: 'ALL' }
          : state.filters;
      return {
        settings: updatedSettings,
        transactions,
        filters: nextFilters,
        filteredTransactions: filterTransactions(transactions, nextFilters),
      };
    });
    return res;
  },

  addCategory: async (categoryName: string) => {
    const clean = categoryName.trim();
    if (!clean) throw new Error('請輸入分類名稱');
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
    const updatedSettings = await ApiService.getCustomSettings();
    set({ settings: updatedSettings });
    return res;
  },

  renameCategory: async (oldName: string, newName: string) => {
    const oldClean = oldName.trim();
    const newClean = newName.trim();
    console.log(`[LedgerStore/renameCategory] Request - ${oldClean} -> ${newClean}`);
    const res = await ApiService.renameCategory(oldClean, newClean);
    const [updatedSettings, transactions] = await Promise.all([
      ApiService.getCustomSettings(),
      ApiService.getSheetData(true),
    ]);
    set((state) => {
      const nextFilters =
        state.filters.category === oldClean
          ? { ...state.filters, category: newClean }
          : state.filters;
      return {
        settings: updatedSettings,
        transactions,
        filters: nextFilters,
        filteredTransactions: filterTransactions(transactions, nextFilters),
      };
    });
    return res;
  },

  mergeCategories: async (sourceCategory: string, targetCategory: string) => {
    const sourceClean = sourceCategory.trim();
    const targetClean = targetCategory.trim();
    console.log(`[LedgerStore/mergeCategories] Request - ${sourceClean} -> ${targetClean}`);
    const res = await ApiService.mergeCategories(sourceClean, targetClean);
    const [updatedSettings, transactions] = await Promise.all([
      ApiService.getCustomSettings(),
      ApiService.getSheetData(true),
    ]);
    set((state) => {
      const nextFilters =
        state.filters.category === sourceClean
          ? { ...state.filters, category: targetClean }
          : state.filters;
      return {
        settings: updatedSettings,
        transactions,
        filters: nextFilters,
        filteredTransactions: filterTransactions(transactions, nextFilters),
      };
    });
    return res;
  },

  removeCategoryCascade: async (categoryName: string) => {
    const current = get().settings;
    if (current.categories.length <= 1) {
      throw new Error('至少需保留 1 個分類');
    }
    console.log(`[LedgerStore/removeCategoryCascade] Request - Category:${categoryName}`);
    const res = await ApiService.deleteCategoryCascade(categoryName);
    const [updatedSettings, transactions] = await Promise.all([
      ApiService.getCustomSettings(),
      ApiService.getSheetData(true),
    ]);
    set((state) => {
      const nextFilters =
        state.filters.category === categoryName
          ? { ...state.filters, category: 'ALL' }
          : state.filters;
      return {
        settings: updatedSettings,
        transactions,
        filters: nextFilters,
        filteredTransactions: filterTransactions(transactions, nextFilters),
      };
    });
    return res;
  },

  importTransactions: async (
    items: Omit<Transaction, 'id' | 'rowNumber'>[],
    mode: 'append' | 'overwrite',
  ) => {
    console.log(`[LedgerStore/importTransactions] Request - Mode:${mode}, Count:${items.length}`);
    const res = await ApiService.importTransactions(items, mode);
    const [updatedSettings, transactions] = await Promise.all([
      ApiService.getCustomSettings(),
      ApiService.getSheetData(true),
    ]);
    set((state) => ({
      settings: updatedSettings,
      transactions,
      filteredTransactions: filterTransactions(transactions, state.filters),
    }));
    return res;
  },

  updateSettings: async (patch: Partial<CustomSettings>) => {
    const merged: CustomSettings = {
      ...get().settings,
      ...patch,
    };
    console.log('[LedgerStore/updateSettings] Request - Updating custom settings');
    const res = await ApiService.saveCustomSettings(merged);
    const updatedSettings = await ApiService.getCustomSettings();
    set({
      settings: updatedSettings,
      baseCurrency: (updatedSettings.baseCurrency || get().baseCurrency) as CurrencyCode,
    });
    return res;
  },

  syncExchangeRates: async () => {
    set({ isSyncingFX: true });
    console.log('[LedgerStore/syncExchangeRates] Start - Fetching live FX rates');
    try {
      const exchangeRates = await ApiService.getExchangeRates();
      set({ exchangeRates, isSyncingFX: false });
      console.log(`[LedgerStore/syncExchangeRates] Done - Updated:${exchangeRates.updated}`);
      return exchangeRates;
    } catch (err) {
      set({ isSyncingFX: false });
      throw err;
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
}));
