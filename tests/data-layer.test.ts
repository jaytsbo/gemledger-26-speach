import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ApiService } from '../src/services/apiService';
import {
  DEFAULT_SETTINGS,
  MAX_AI_CHAT_MESSAGES,
  MOCK_STORAGE_KEYS,
} from '../src/services/database';
import { DEFAULT_FILTERS, useLedgerStore } from '../src/store/useLedgerStore';
import { AiChatMessage, ExchangeRates } from '../src/types/ledger';
import { DEFAULT_EXCHANGE_RATES } from '../src/utils/currency';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  return mockStorage;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 1500,
  intervalMs = 15,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Condition not satisfied within ${timeoutMs}ms`);
}

function resetStoreState() {
  useLedgerStore.setState({
    transactions: [],
    filteredTransactions: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    exchangeRates: {
      ...DEFAULT_EXCHANGE_RATES,
      rates: { ...DEFAULT_EXCHANGE_RATES.rates },
    },
    baseCurrency: 'TWD',
    filters: { ...DEFAULT_FILTERS },
    isLoading: false,
    isSyncingFX: false,
    initialized: false,
    aiChatMessages: [],
  });
}

describe('AI Chat History Persistence & Sanitization', () => {
  let storage: ReturnType<typeof installMockLocalStorage>;

  beforeEach(async () => {
    storage = installMockLocalStorage();
    storage.clear();
    ApiService.clearCache();
    resetStoreState();
    await useLedgerStore.getState().clearAiChat();
  });

  afterEach(async () => {
    await useLedgerStore.getState().clearAiChat();
    storage.clear();
    ApiService.clearCache();
    resetStoreState();
  });

  it('round-trips valid AI chat messages through ApiService and strips imageUri without mutating input', async () => {
    const inputMessages: AiChatMessage[] = [
      {
        id: 'u-1',
        role: 'user',
        text: '午餐牛肉麵 180 現金',
        imageUri: 'file:///var/mobile/receipt-001.jpg',
        audioDurationSec: 4.5,
        createdAt: '2026-11-20T12:00:00.000Z',
      },
      {
        id: 'a-1',
        role: 'assistant',
        text: '已幫您辨識 1 筆消費',
        imageUri: 'blob:https://gemledger-26.pages.dev/temp-id',
        drafts: [
          {
            name: '牛肉麵',
            amount: -180,
            currency: 'TWD',
            category: '食',
            account: '現金',
            date: '2026-11-20',
            time: '12:00',
            note: '午餐',
          },
        ],
        savedIndices: [0],
        isFallback: false,
        modelUsed: 'gemini-3.5-flash-lite',
        createdAt: '2026-11-20T12:00:02.000Z',
      },
    ];

    const saveRes = await ApiService.saveAiChatHistory(inputMessages);
    assert.equal(saveRes.success, true);
    assert.equal(saveRes.count, 2);

    // Must not mutate caller's in-memory objects
    assert.equal(inputMessages[0].imageUri, 'file:///var/mobile/receipt-001.jpg');
    assert.equal(inputMessages[1].imageUri, 'blob:https://gemledger-26.pages.dev/temp-id');

    // Stored JSON must live under GEMLEDGER_AI_CHAT_HISTORY and omit imageUri
    const rawStored = storage.getItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY);
    assert.ok(rawStored);
    assert.equal(rawStored.includes('imageUri'), false);
    assert.equal(rawStored.includes('receipt-001.jpg'), false);

    const loaded = await ApiService.getAiChatHistory();
    assert.equal(loaded.length, 2);
    assert.equal('imageUri' in loaded[0], false);
    assert.equal('imageUri' in loaded[1], false);
    assert.equal(loaded[0].id, 'u-1');
    assert.equal(loaded[0].audioDurationSec, 4.5);
    assert.equal(loaded[1].drafts?.length, 1);
    assert.equal(loaded[1].drafts?.[0].name, '牛肉麵');
    assert.equal(loaded[1].drafts?.[0].amount, -180);
    assert.deepEqual(loaded[1].savedIndices, [0]);
    assert.equal(loaded[1].modelUsed, 'gemini-3.5-flash-lite');

    const clearRes = await ApiService.clearAiChatHistory();
    assert.equal(clearRes.success, true);
    assert.equal(storage.getItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY), null);
    assert.deepEqual(await ApiService.getAiChatHistory(), []);
  });

  it('keeps only the latest 60 messages on save and on read', async () => {
    const messages: AiChatMessage[] = Array.from({ length: 75 }, (_, i) => ({
      id: `msg-${i + 1}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `message #${i + 1}`,
    }));

    const saveRes = await ApiService.saveAiChatHistory(messages);
    assert.equal(saveRes.success, true);
    assert.equal(saveRes.count, MAX_AI_CHAT_MESSAGES);

    const loaded = await ApiService.getAiChatHistory();
    assert.equal(loaded.length, 60);
    assert.equal(loaded[0].id, 'msg-16');
    assert.equal(loaded[59].id, 'msg-75');

    // Also enforce cap when raw storage contains > 60 records with imageUri
    const rawOversized = Array.from({ length: 80 }, (_, i) => ({
      id: `raw-${i + 1}`,
      role: 'user',
      text: `raw #${i + 1}`,
      imageUri: `file:///stale-${i + 1}.jpg`,
    }));
    storage.setItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY, JSON.stringify(rawOversized));

    const loadedRaw = await ApiService.getAiChatHistory();
    assert.equal(loadedRaw.length, 60);
    assert.equal(loadedRaw[0].id, 'raw-21');
    assert.equal(loadedRaw[59].id, 'raw-80');
    assert.equal('imageUri' in loadedRaw[0], false);
  });

  it('tolerates corrupted JSON, non-array payloads, and malformed message items without throwing', async () => {
    storage.setItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY, '{corrupted-json');
    assert.deepEqual(await ApiService.getAiChatHistory(), []);

    storage.setItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY, JSON.stringify({ not: 'an array' }));
    assert.deepEqual(await ApiService.getAiChatHistory(), []);

    storage.setItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY, 'null');
    assert.deepEqual(await ApiService.getAiChatHistory(), []);

    const mixedPayload = [
      null,
      'string-item',
      42,
      { id: '', role: 'user', text: 'empty id' },
      { id: 'bad-role', role: 'system', text: 'invalid role' },
      { id: 'bad-text', role: 'user', text: 999 },
      {
        id: 'good-1',
        role: 'assistant',
        text: 'valid message',
        imageUri: 'file:///should-strip.png',
        audioDurationSec: -5,
        savedIndices: [0, -1, 1.5, 0, 'bad'],
        drafts: [
          { bad: true },
          {
            name: '咖啡',
            amount: -120,
            currency: 'TWD',
            category: '食',
            account: '現金',
            date: '2026-11-20',
            time: '09:00',
            note: '',
          },
        ],
        isFallback: 'not-boolean',
        fallbackReason: 'KEY_MISSING',
      },
    ];
    storage.setItem(MOCK_STORAGE_KEYS.AI_CHAT_HISTORY, JSON.stringify(mixedPayload));

    const loaded = await ApiService.getAiChatHistory();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, 'good-1');
    assert.equal('imageUri' in loaded[0], false);
    assert.equal(loaded[0].audioDurationSec, undefined);
    assert.deepEqual(loaded[0].savedIndices, [0]);
    assert.equal(loaded[0].drafts?.length, 1);
    assert.equal(loaded[0].drafts?.[0].name, '咖啡');
    assert.equal(loaded[0].isFallback, undefined);
    assert.equal(loaded[0].fallbackReason, 'KEY_MISSING');
  });
});

describe('Store AI Chat Debounce & clearAiChat Race Safety', () => {
  let storage: ReturnType<typeof installMockLocalStorage>;
  const origSaveAiChatHistory = ApiService.saveAiChatHistory.bind(ApiService);
  const origClearAiChatHistory = ApiService.clearAiChatHistory.bind(ApiService);

  beforeEach(async () => {
    storage = installMockLocalStorage();
    storage.clear();
    ApiService.clearCache();
    resetStoreState();
    await useLedgerStore.getState().clearAiChat();
  });

  afterEach(async () => {
    (ApiService as any).saveAiChatHistory = origSaveAiChatHistory;
    (ApiService as any).clearAiChatHistory = origClearAiChatHistory;
    await useLedgerStore.getState().clearAiChat();
    storage.clear();
    ApiService.clearCache();
    resetStoreState();
  });

  it('updates state immediately, supports updater functions, and coalesces rapid writes via ~400ms debounce', async () => {
    let saveCalls = 0;
    (ApiService as any).saveAiChatHistory = async (msgs: AiChatMessage[]) => {
      saveCalls += 1;
      return origSaveAiChatHistory(msgs);
    };

    const msg1: AiChatMessage = {
      id: 'm1',
      role: 'user',
      text: '第一則',
      imageUri: 'file:///in-memory-preview.jpg',
    };
    const msg2: AiChatMessage = { id: 'm2', role: 'assistant', text: '第二則' };
    const msg3: AiChatMessage = { id: 'm3', role: 'user', text: '第三則' };

    useLedgerStore.getState().setAiChatMessages([msg1]);
    assert.equal(useLedgerStore.getState().aiChatMessages.length, 1);
    assert.equal(useLedgerStore.getState().aiChatMessages[0].imageUri, 'file:///in-memory-preview.jpg');

    await sleep(60);
    useLedgerStore.getState().setAiChatMessages((prev) => [...prev, msg2]);
    assert.equal(useLedgerStore.getState().aiChatMessages.length, 2);

    await sleep(60);
    useLedgerStore.getState().setAiChatMessages((prev) => [...prev, msg3]);
    assert.equal(useLedgerStore.getState().aiChatMessages.length, 3);

    // Still within debounce window: no write yet
    await sleep(120);
    assert.equal(saveCalls, 0);

    // Wait for debounce + mockDelay
    await waitForCondition(() => saveCalls === 1, 1000);
    await sleep(100);
    assert.equal(saveCalls, 1);

    const persisted = await ApiService.getAiChatHistory();
    assert.deepEqual(
      persisted.map((m) => m.id),
      ['m1', 'm2', 'm3'],
    );
    assert.equal('imageUri' in persisted[0], false);
  });

  it('clearAiChat cancels pending debounce and prevents resurrection even when a save is in-flight', async () => {
    // Part 1: cancel before debounce fires
    await ApiService.saveAiChatHistory([{ id: 'old', role: 'user', text: '舊訊息' }]);
    let saveCalls = 0;
    (ApiService as any).saveAiChatHistory = async (msgs: AiChatMessage[]) => {
      saveCalls += 1;
      return origSaveAiChatHistory(msgs);
    };

    useLedgerStore.getState().setAiChatMessages([{ id: 'pending', role: 'user', text: '待寫入' }]);
    assert.equal(useLedgerStore.getState().aiChatMessages.length, 1);

    await sleep(100);
    await useLedgerStore.getState().clearAiChat();
    assert.deepEqual(useLedgerStore.getState().aiChatMessages, []);
    assert.deepEqual(await ApiService.getAiChatHistory(), []);

    await sleep(500);
    assert.equal(saveCalls, 0);
    assert.deepEqual(await ApiService.getAiChatHistory(), []);

    // Part 2: clearAiChat invoked while a debounced save is already in-flight
    const slowSaveGate: { release: (() => void) | null } = { release: null };
    let slowSaveStarted = false;
    (ApiService as any).saveAiChatHistory = async (msgs: AiChatMessage[]) => {
      slowSaveStarted = true;
      await new Promise<void>((resolve) => {
        slowSaveGate.release = resolve;
      });
      return origSaveAiChatHistory(msgs);
    };

    useLedgerStore.getState().setAiChatMessages([{ id: 'inflight', role: 'user', text: '競態測試' }]);
    await waitForCondition(() => slowSaveStarted, 1000);

    const clearPromise = useLedgerStore.getState().clearAiChat();
    assert.deepEqual(useLedgerStore.getState().aiChatMessages, []);

    // Complete the slow save; queued clear must run after it so storage ends empty
    slowSaveGate.release?.();
    await clearPromise;

    assert.deepEqual(useLedgerStore.getState().aiChatMessages, []);
    assert.deepEqual(await ApiService.getAiChatHistory(), []);
  });
});

describe('Cold-Start Exchange Rate SWR, Chat Restore & refreshAll Resilience', () => {
  let storage: ReturnType<typeof installMockLocalStorage>;
  const originalFetch = globalThis.fetch;
  const origGetExchangeRates = ApiService.getExchangeRates.bind(ApiService);
  const origGetAiChatHistory = ApiService.getAiChatHistory.bind(ApiService);
  const origGetSheetData = ApiService.getSheetData.bind(ApiService);

  beforeEach(async () => {
    storage = installMockLocalStorage();
    storage.clear();
    ApiService.clearCache();
    resetStoreState();
    await useLedgerStore.getState().clearAiChat();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    (ApiService as any).getExchangeRates = origGetExchangeRates;
    (ApiService as any).getAiChatHistory = origGetAiChatHistory;
    (ApiService as any).getSheetData = origGetSheetData;
    await useLedgerStore.getState().clearAiChat();
    storage.clear();
    ApiService.clearCache();
    resetStoreState();
  });

  it('ApiService.getCachedExchangeRates returns null on missing/corrupt cache and returns valid cached FX', async () => {
    assert.equal(await ApiService.getCachedExchangeRates(), null);

    storage.setItem(MOCK_STORAGE_KEYS.FX_CACHE, '{bad-json');
    assert.equal(await ApiService.getCachedExchangeRates(), null);

    const cachedFx: ExchangeRates = {
      base: 'TWD',
      updated: '2026-11-19T00:00:00Z',
      rates: { TWD: 1, USD: 0.0312, JPY: 4.71 },
    };
    storage.setItem(MOCK_STORAGE_KEYS.FX_CACHE, JSON.stringify(cachedFx));

    const loaded = await ApiService.getCachedExchangeRates();
    assert.ok(loaded);
    assert.equal(loaded.updated, '2026-11-19T00:00:00Z');
    assert.equal(loaded.rates.USD, 0.0312);
    assert.equal(loaded.rates.JPY, 4.71);
  });

  it('initialize finishes fast even when live FX fetch hangs, restores chat & cached FX, then updates store when background FX resolves', async () => {
    const cachedFx: ExchangeRates = {
      base: 'TWD',
      updated: '2026-11-19T08:00:00Z',
      rates: { TWD: 1, USD: 0.031, JPY: 4.7 },
    };
    storage.setItem(MOCK_STORAGE_KEYS.FX_CACHE, JSON.stringify(cachedFx));
    await ApiService.saveAiChatHistory([
      { id: 'c1', role: 'user', text: '昨天晚餐 250' },
      { id: 'c2', role: 'assistant', text: '已解析昨天晚餐' },
    ]);

    const liveFetchGate: { resolve: ((res: Response) => void) | null } = { resolve: null };
    let fetchCalled = false;
    globalThis.fetch = ((_url: string | URL | Request) => {
      fetchCalled = true;
      return new Promise<Response>((resolve) => {
        liveFetchGate.resolve = resolve;
      });
    }) as typeof fetch;

    const startedAt = Date.now();
    await useLedgerStore.getState().initialize();
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 500, `Expected fast SWR initialize (<500ms), took ${elapsedMs}ms`);
    assert.equal(useLedgerStore.getState().initialized, true);
    assert.equal(useLedgerStore.getState().isLoading, false);
    assert.equal(useLedgerStore.getState().isSyncingFX, true);
    assert.equal(useLedgerStore.getState().exchangeRates.rates.USD, 0.031);
    assert.equal(useLedgerStore.getState().aiChatMessages.length, 2);
    assert.equal(useLedgerStore.getState().aiChatMessages[0].id, 'c1');

    await waitForCondition(() => fetchCalled, 500);

    // Resolve background FX request and verify store updates
    liveFetchGate.resolve?.({
      ok: true,
      status: 200,
      json: async () => ({
        time_last_update_utc: '2026-11-20T14:00:00Z',
        rates: { TWD: 1, USD: 0.036, JPY: 4.95 },
      }),
    } as unknown as Response);

    await waitForCondition(() => !useLedgerStore.getState().isSyncingFX, 1000);
    assert.equal(useLedgerStore.getState().exchangeRates.rates.USD, 0.036);
    assert.equal(useLedgerStore.getState().exchangeRates.rates.JPY, 4.95);
    assert.equal(useLedgerStore.getState().exchangeRates.updated, '2026-11-20T14:00:00Z');
  });

  it('initialize tolerates AI chat restore failure and background FX rejection while using DEFAULT_EXCHANGE_RATES when no cache exists', async () => {
    (ApiService as any).getAiChatHistory = async () => {
      throw new Error('corrupted sqlite settings table');
    };
    (ApiService as any).getExchangeRates = async () => {
      await sleep(30);
      throw new Error('network unreachable');
    };

    await useLedgerStore.getState().initialize();

    assert.equal(useLedgerStore.getState().initialized, true);
    assert.equal(useLedgerStore.getState().isLoading, false);
    assert.equal(useLedgerStore.getState().exchangeRates.updated, DEFAULT_EXCHANGE_RATES.updated);
    assert.equal(useLedgerStore.getState().exchangeRates.rates.USD, DEFAULT_EXCHANGE_RATES.rates.USD);
    assert.deepEqual(useLedgerStore.getState().aiChatMessages, []);

    await waitForCondition(() => !useLedgerStore.getState().isSyncingFX, 1000);
    assert.equal(useLedgerStore.getState().exchangeRates.rates.USD, DEFAULT_EXCHANGE_RATES.rates.USD);
  });

  it('preserves initPromise deduplication and keeps initialized=false when transaction load fails', async () => {
    let sheetCalls = 0;
    (ApiService as any).getExchangeRates = async () => ({
      ...DEFAULT_EXCHANGE_RATES,
      rates: { ...DEFAULT_EXCHANGE_RATES.rates },
    });
    (ApiService as any).getSheetData = async (force?: boolean) => {
      sheetCalls += 1;
      return origGetSheetData(force);
    };

    await Promise.all([
      useLedgerStore.getState().initialize(),
      useLedgerStore.getState().initialize(),
    ]);
    assert.equal(sheetCalls, 1);
    assert.equal(useLedgerStore.getState().initialized, true);
    await waitForCondition(() => !useLedgerStore.getState().isSyncingFX, 1000);

    // Failure case: transactions reject -> initialized remains false and no background FX starts
    resetStoreState();
    let fxCalledOnFail = false;
    (ApiService as any).getExchangeRates = async () => {
      fxCalledOnFail = true;
      return DEFAULT_EXCHANGE_RATES;
    };
    (ApiService as any).getSheetData = async () => {
      throw new Error('db unavailable');
    };

    await useLedgerStore.getState().initialize();
    assert.equal(useLedgerStore.getState().initialized, false);
    assert.equal(useLedgerStore.getState().isLoading, false);
    await sleep(50);
    assert.equal(fxCalledOnFail, false);
  });

  it('refreshAll still updates transactions and settings when getExchangeRates throws', async () => {
    const initialFx: ExchangeRates = {
      base: 'TWD',
      updated: '2026-11-19T12:00:00Z',
      rates: { TWD: 1, USD: 0.032, JPY: 4.68 },
    };
    storage.setItem(MOCK_STORAGE_KEYS.FX_CACHE, JSON.stringify(initialFx));
    (ApiService as any).getExchangeRates = async () => initialFx;

    await useLedgerStore.getState().initialize();
    await waitForCondition(() => !useLedgerStore.getState().isSyncingFX, 1000);

    await ApiService.addTransaction({
      account: '現金',
      name: '刷新驗證測試項目',
      category: '食',
      currency: 'TWD',
      amount: -99,
    });
    await ApiService.saveCustomSettings({ themeMode: 'dark' });

    (ApiService as any).getExchangeRates = async () => {
      throw new Error('FX service 503');
    };

    await useLedgerStore.getState().refreshAll(true);

    assert.equal(useLedgerStore.getState().isLoading, false);
    assert.equal(useLedgerStore.getState().settings.themeMode, 'dark');
    assert.ok(
      useLedgerStore.getState().transactions.some((tx) => tx.name === '刷新驗證測試項目'),
    );
    assert.equal(useLedgerStore.getState().exchangeRates.updated, initialFx.updated);
    assert.equal(useLedgerStore.getState().exchangeRates.rates.USD, 0.032);
  });
});
