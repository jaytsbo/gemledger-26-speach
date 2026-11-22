import {
  AIBookkeeperResponse,
  AIParsedDraft,
  CustomSettings,
  GeminiConnectionTestResult,
  GeminiFailureCode,
} from '../types/ledger';
import { normalizeCurrencyCode } from '../utils/currency';
import { normalizeDateStr, normalizeTimeStr } from '../utils/dateTime';
import { fallbackParseTransaction } from './fallbackParser';

const USER_GEMINI_KEY_STORAGE = 'GEMLEDGER_USER_GEMINI_API_KEY';
const GEMINI_TEST_TIMEOUT_MS = 10000;
const GEMINI_TEXT_TIMEOUT_MS = 15000;
const GEMINI_MEDIA_TIMEOUT_MS = 30000;
const SECURE_STORE_RETRY_DELAY_MS = 150;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export const GEMINI_MAX_OUTPUT_TOKENS = 2048;
export const GEMINI_THINKING_LEVEL = 'minimal' as const;

export const BOOKKEEPER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    transactions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          currency: { type: 'STRING' },
          category: { type: 'STRING' },
          account: { type: 'STRING' },
          date: { type: 'STRING' },
          time: { type: 'STRING' },
          note: { type: 'STRING' },
        },
        required: ['name', 'amount', 'currency', 'category', 'account', 'date', 'time', 'note'],
      },
    },
  },
  required: ['reply', 'transactions'],
} as const;

export type AdaptiveGenerationField = 'thinkingConfig' | 'responseSchema';

const unsupportedModelFields = new Map<string, Set<AdaptiveGenerationField>>();

export function resetModelCapabilitiesCache(): void {
  unsupportedModelFields.clear();
}

export interface SecureStoreLike {
  getItemAsync: (k: string) => Promise<string | null>;
  setItemAsync: (k: string, v: string) => Promise<void>;
  deleteItemAsync: (k: string) => Promise<void>;
}

export interface GeminiStorageOptions {
  secureStore?: SecureStoreLike | null;
  retryDelayMs?: number;
}

export interface GeminiDirectCallOptions {
  retryDelayMs?: number;
  textTimeoutMs?: number;
  mediaTimeoutMs?: number;
}

let memoryApiKeyFallback: string | null = null;

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isAbortError(err: unknown, controller: AbortController | null): boolean {
  const errName =
    typeof err === 'object' && err !== null && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';
  return errName === 'AbortError' || controller?.signal?.aborted === true;
}

function isWebStorageAvailable(): boolean {
  try {
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as any).localStorage !== 'undefined' &&
      Boolean((globalThis as any).localStorage)
    );
  } catch {
    return false;
  }
}

function getSecureStore(): SecureStoreLike | null {
  try {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    if (!isWebStorageAvailable() && !isNode) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('expo-secure-store');
    }
  } catch (err) {
    console.warn(
      '[GeminiDirect/getSecureStore] Unavailable -',
      err instanceof Error ? err.message : 'require failed',
    );
    return null;
  }
  return null;
}

/**
 * Persist the user's personal Gemini API key in SecureStore (native) or localStorage (web).
 * Throws when no persistent storage backend is available so callers never show fake success.
 */
export async function saveUserGeminiApiKey(
  apiKey: string,
  options?: Pick<GeminiStorageOptions, 'secureStore'>,
): Promise<void> {
  const clean = apiKey.trim();
  const useLocalStorage = options?.secureStore === undefined && isWebStorageAvailable();

  if (useLocalStorage) {
    try {
      if (clean) {
        (globalThis as any).localStorage.setItem(USER_GEMINI_KEY_STORAGE, clean);
      } else {
        (globalThis as any).localStorage.removeItem(USER_GEMINI_KEY_STORAGE);
      }
      memoryApiKeyFallback = clean || null;
      console.log(`[GeminiDirect/saveUserGeminiApiKey] Saved - Storage:localStorage, hasKey=${Boolean(clean)}`);
      return;
    } catch (err) {
      console.warn(
        `[GeminiDirect/saveUserGeminiApiKey] Error - localStorage write failed (${err instanceof Error ? err.message : 'unknown'})`,
      );
      throw new Error('無法存取安全儲存空間，無法持久化 API Key');
    }
  }

  const secureStore = options?.secureStore !== undefined ? options.secureStore : getSecureStore();
  if (!secureStore) {
    console.error('[GeminiDirect/saveUserGeminiApiKey] Error - Persistent storage unavailable');
    throw new Error('無法存取安全儲存空間，無法持久化 API Key');
  }

  if (clean) {
    await secureStore.setItemAsync(USER_GEMINI_KEY_STORAGE, clean);
  } else {
    await secureStore.deleteItemAsync(USER_GEMINI_KEY_STORAGE);
  }
  memoryApiKeyFallback = clean || null;
  console.log(`[GeminiDirect/saveUserGeminiApiKey] Saved - Storage:SecureStore, hasKey=${Boolean(clean)}`);
}

/**
 * Load the user's personal Gemini API key from local secure storage.
 * Retries SecureStore reads once (~150ms) before falling back to memory cache.
 */
export async function loadUserGeminiApiKey(options?: GeminiStorageOptions): Promise<string> {
  const retryDelayMs = options?.retryDelayMs ?? SECURE_STORE_RETRY_DELAY_MS;
  const useLocalStorage = options?.secureStore === undefined && isWebStorageAvailable();

  if (useLocalStorage) {
    try {
      const raw = (globalThis as any).localStorage.getItem(USER_GEMINI_KEY_STORAGE);
      const key = (raw ?? '').trim();
      memoryApiKeyFallback = key || null;
      console.log(
        `[GeminiDirect/loadUserGeminiApiKey] Loaded - Storage:localStorage, hasKey=${Boolean(key)}`,
      );
      return key;
    } catch (err) {
      const fallbackKey = (memoryApiKeyFallback ?? '').trim();
      console.warn(
        `[GeminiDirect/loadUserGeminiApiKey] Fallback - localStorage read failed (${err instanceof Error ? err.message : 'unknown'}), hasMemoryKey=${Boolean(fallbackKey)}`,
      );
      return fallbackKey;
    }
  }

  const secureStore = options?.secureStore !== undefined ? options.secureStore : getSecureStore();
  if (!secureStore) {
    const fallbackKey = (memoryApiKeyFallback ?? '').trim();
    console.warn(
      `[GeminiDirect/loadUserGeminiApiKey] Fallback - SecureStore unavailable, hasMemoryKey=${Boolean(fallbackKey)}`,
    );
    return fallbackKey;
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await secureStore.getItemAsync(USER_GEMINI_KEY_STORAGE);
      const key = (raw ?? '').trim();
      memoryApiKeyFallback = key || null;
      console.log(
        `[GeminiDirect/loadUserGeminiApiKey] Loaded - Storage:SecureStore, Attempt:${attempt}, hasKey=${Boolean(key)}`,
      );
      return key;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (attempt === 1) {
        console.warn(
          `[GeminiDirect/loadUserGeminiApiKey] Retry - SecureStore getItemAsync failed on attempt 1 (${msg}), retrying in ${retryDelayMs}ms`,
        );
        await sleep(retryDelayMs);
      } else {
        const fallbackKey = (memoryApiKeyFallback ?? '').trim();
        console.warn(
          `[GeminiDirect/loadUserGeminiApiKey] Fallback - SecureStore getItemAsync failed twice (${msg}), returning memory cache (hasMemoryKey=${Boolean(fallbackKey)})`,
        );
        return fallbackKey;
      }
    }
  }

  return (memoryApiKeyFallback ?? '').trim();
}

/**
 * Clear the user's stored Gemini API key from both memory and persistent storage.
 */
export async function clearUserGeminiApiKey(
  options?: Pick<GeminiStorageOptions, 'secureStore'>,
): Promise<void> {
  console.log('[GeminiDirect/clearUserGeminiApiKey] Clearing stored key');
  memoryApiKeyFallback = null;
  const useLocalStorage = options?.secureStore === undefined && isWebStorageAvailable();
  if (useLocalStorage) {
    try {
      (globalThis as any).localStorage.removeItem(USER_GEMINI_KEY_STORAGE);
    } catch (err) {
      console.warn(
        `[GeminiDirect/clearUserGeminiApiKey] Warning - localStorage remove failed (${err instanceof Error ? err.message : 'unknown'})`,
      );
    }
    return;
  }
  const secureStore = options?.secureStore !== undefined ? options.secureStore : getSecureStore();
  if (secureStore) {
    await secureStore.deleteItemAsync(USER_GEMINI_KEY_STORAGE);
  }
}

async function readErrorBodyText(res: Response): Promise<string> {
  try {
    if (typeof (res as unknown as { text?: unknown }).text === 'function') {
      return await res.text();
    }
    if (typeof (res as unknown as { json?: unknown }).json === 'function') {
      return JSON.stringify(await res.json());
    }
  } catch {
    // Ignore unreadable error body
  }
  return '';
}

function isApiKeyInvalidBody(errBody: string): boolean {
  return /API_KEY_INVALID|API key not valid/i.test(errBody);
}

async function isApiKeyInvalidError(res: Response): Promise<boolean> {
  const errBody = await readErrorBodyText(res);
  return isApiKeyInvalidBody(errBody);
}

function detectUnsupportedGenerationFields(
  errBody: string,
  activeFields: { thinkingConfig: boolean; responseSchema: boolean },
): AdaptiveGenerationField[] {
  if (!errBody) return [];
  const unsupported: AdaptiveGenerationField[] = [];
  if (
    activeFields.thinkingConfig &&
    (/\b(thinkingConfig|thinking_config|thinkingLevel|thinking_level|thinkingBudget|thinking_budget)\b/i.test(
      errBody,
    ) ||
      /thinking(?:\s+(?:level|config|mode|budget))?(?:\s+(?:\\?['"`])?[\w-]+(?:\\?['"`])?)?\s*(?:is\s+)?not\s+supported/i.test(
        errBody,
      ))
  ) {
    unsupported.push('thinkingConfig');
  }
  if (
    activeFields.responseSchema &&
    (/\b(responseSchema|response_schema|responseJsonSchema|response_json_schema)\b/i.test(
      errBody,
    ) ||
      /structured\s+output(?:s)?\s+(?:is|are)\s+not\s+supported/i.test(errBody))
  ) {
    unsupported.push('responseSchema');
  }
  return unsupported;
}

/**
 * Test connectivity and authorization of a Gemini API key without consuming generation quota.
 */
export async function testUserGeminiApiKey(
  apiKey: string,
  options?: { timeoutMs?: number },
): Promise<GeminiConnectionTestResult> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    console.log('[GeminiDirect/testUserGeminiApiKey] Result - Code:KEY_MISSING');
    return {
      ok: false,
      code: 'KEY_MISSING',
      message: '尚未填入 Gemini API Key，請先貼上您的 API Key 後再測試。',
    };
  }

  const timeoutMs = options?.timeoutMs ?? GEMINI_TEST_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    console.log(`[GeminiDirect/testUserGeminiApiKey] Request - Endpoint:v1beta/models, TimeoutMs:${timeoutMs}`);
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: {
        'x-goog-api-key': cleanKey,
      },
      signal: controller?.signal,
    });

    if (res.ok) {
      console.log(`[GeminiDirect/testUserGeminiApiKey] Result - Status:${res.status}, Code:OK`);
      return {
        ok: true,
        status: res.status,
        code: 'OK',
        message: 'Gemini API Key 連線成功！可正常使用雲端 AI 與語音記帳。',
      };
    }

    if (res.status === 401 || res.status === 403) {
      console.warn(`[GeminiDirect/testUserGeminiApiKey] Result - Status:${res.status}, Code:AUTH_INVALID_KEY`);
      return {
        ok: false,
        status: res.status,
        code: 'AUTH_INVALID_KEY',
        message: 'API Key 無效或權限不足 (401/403)，請確認是否複製完整或已啟用 Gemini API。',
      };
    }

    if (res.status === 429) {
      console.warn('[GeminiDirect/testUserGeminiApiKey] Result - Status:429, Code:RATE_LIMIT_429');
      return {
        ok: false,
        status: 429,
        code: 'RATE_LIMIT_429',
        message: 'Gemini API 請求過於頻繁或額度已達上限 (429)，請稍後再試。',
      };
    }

    if (res.status === 400) {
      if (await isApiKeyInvalidError(res)) {
        console.warn('[GeminiDirect/testUserGeminiApiKey] Result - Status:400, Code:AUTH_INVALID_KEY');
        return {
          ok: false,
          status: 400,
          code: 'AUTH_INVALID_KEY',
          message: 'API Key 格式或內容無效 (400)，請檢查後重新貼上。',
        };
      }
      console.warn('[GeminiDirect/testUserGeminiApiKey] Result - Status:400, Code:BAD_REQUEST_400');
      return {
        ok: false,
        status: 400,
        code: 'BAD_REQUEST_400',
        message: 'Gemini API 拒絕此連線請求 (400 Bad Request)。',
      };
    }

    console.warn(`[GeminiDirect/testUserGeminiApiKey] Result - Status:${res.status}, Code:SERVER_503`);
    return {
      ok: false,
      status: res.status,
      code: 'SERVER_503',
      message: `Gemini 伺服器暫時無法回應 (HTTP ${res.status})，請稍後再試。`,
    };
  } catch (err) {
    if (isAbortError(err, controller)) {
      console.warn('[GeminiDirect/testUserGeminiApiKey] Result - Code:TIMEOUT');
      return {
        ok: false,
        code: 'TIMEOUT',
        message: '連線 Gemini 伺服器逾時（10 秒無回應），請檢查網路環境後重試。',
      };
    }
    const msg = err instanceof Error ? err.message : 'network error';
    console.warn(`[GeminiDirect/testUserGeminiApiKey] Result - Code:NETWORK_ERROR, Detail:${msg}`);
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: `無法連線至 Gemini 伺服器（網路異常：${msg}）。`,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildDirectSystemPrompt(
  currentDateStr: string,
  currentTimeStr: string,
  settings: CustomSettings,
): string {
  return [
    `記帳助手。現在:${currentDateStr} ${currentTimeStr}。預設幣別:${settings.baseCurrency || 'TWD'}。`,
    `分類白名單:${JSON.stringify(settings.categories)}`,
    `帳戶白名單:${JSON.stringify(settings.accounts)}`,
    `規則:`,
    `1.日期時間未指定時用 ${currentDateStr} / ${currentTimeStr}（YYYY-MM-DD / HH:mm）。`,
    `2.金額：收入為正數，支出為負數；category/account 必選白名單。`,
    `3.reply 限一句≤20字繁中短句；語音輸入必以「🗣️ 聽到：「<≤15字摘要>」\\n」開頭再接短句。`,
    `4.輸出JSON:{"reply":"","transactions":[{"name":"","amount":-100,"currency":"TWD","category":"","account":"","date":"${currentDateStr}","time":"${currentTimeStr}","note":""}]}`,
  ].join('\n');
}

function matchWhitelist(
  candidate: unknown,
  whitelist: readonly string[],
  fallback: string,
): string {
  const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
  if (!trimmed || whitelist.length === 0) return fallback;
  const exact = whitelist.find((item) => item === trimmed);
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  const ciMatch = whitelist.find((item) => item.trim().toLowerCase() === lower);
  return ciMatch ?? fallback;
}

function sanitizeGeminiDraft(
  draft: Partial<AIParsedDraft>,
  settings: CustomSettings,
  currentDateStr: string,
  currentTimeStr: string,
): AIParsedDraft {
  const accounts = Array.isArray(settings.accounts) ? settings.accounts : [];
  const categories = Array.isArray(settings.categories) ? settings.categories : [];
  const parsedAmount = Number(draft.amount);
  const amount = Number.isFinite(parsedAmount) && parsedAmount !== 0 ? parsedAmount : -100;

  const accountFallback = accounts[0] || '現金';
  const categoryFallback =
    amount > 0
      ? categories.includes('收入')
        ? '收入'
        : categories.includes('投資')
          ? '投資'
          : categories[0] || '收入'
      : categories.includes('其他')
        ? '其他'
        : categories.includes('醫療/雜項')
          ? '醫療/雜項'
          : categories[0] || '食';

  return {
    name: typeof draft.name === 'string' && draft.name.trim() ? draft.name.trim() : 'AI 記帳項目',
    amount,
    currency: normalizeCurrencyCode(draft.currency, settings.baseCurrency || 'TWD'),
    category: matchWhitelist(draft.category, categories, categoryFallback),
    account: matchWhitelist(draft.account, accounts, accountFallback),
    date: normalizeDateStr(draft.date, currentDateStr),
    time: normalizeTimeStr(draft.time, currentTimeStr),
    note: typeof draft.note === 'string' ? draft.note.trim() : '',
  };
}

type AttemptOutcome =
  | { kind: 'success'; response: AIBookkeeperResponse }
  | {
      kind: 'failure';
      code: GeminiFailureCode;
      detail: string;
      retrySameModel: boolean;
      stopCascade: boolean;
      unsupportedFields?: AdaptiveGenerationField[];
    };

async function executeSingleGeminiAttempt(params: {
  endpoint: string;
  payload: string;
  cleanKey: string;
  model: string;
  attempt: number;
  canRetryTransient: boolean;
  activeFields: { thinkingConfig: boolean; responseSchema: boolean };
  timeoutMs: number;
  mediaLabel: string;
  settings: CustomSettings;
  currentDateStr: string;
  currentTimeStr: string;
}): Promise<AttemptOutcome> {
  const {
    endpoint,
    payload,
    cleanKey,
    model,
    attempt,
    canRetryTransient,
    activeFields,
    timeoutMs,
    mediaLabel,
    settings,
    currentDateStr,
    currentTimeStr,
  } = params;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let stage: 'fetch' | 'parse' = 'fetch';

  try {
    console.log(
      `[GeminiDirect/callGeminiDirectWithKey] Request - Model:${model}, Attempt:${attempt + 1}, TimeoutMs:${timeoutMs}, Media:${mediaLabel}, Thinking:${activeFields.thinkingConfig}, Schema:${activeFields.responseSchema}`,
    );
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey,
      },
      body: payload,
      signal: controller?.signal,
    });

    if (!res.ok) {
      const detail = `HTTP ${res.status} on ${model}`;
      if (res.status === 401 || res.status === 403) {
        return {
          kind: 'failure',
          code: 'AUTH_INVALID_KEY',
          detail,
          retrySameModel: false,
          stopCascade: true,
        };
      }
      if (res.status === 400) {
        const errBody = await readErrorBodyText(res);
        if (isApiKeyInvalidBody(errBody)) {
          return {
            kind: 'failure',
            code: 'AUTH_INVALID_KEY',
            detail: `HTTP 400 (API_KEY_INVALID) on ${model}`,
            retrySameModel: false,
            stopCascade: true,
          };
        }
        const unsupportedFields = detectUnsupportedGenerationFields(errBody, activeFields);
        if (unsupportedFields.length > 0) {
          return {
            kind: 'failure',
            code: 'BAD_REQUEST_400',
            detail: `HTTP 400 (unsupported: ${unsupportedFields.join(',')}) on ${model}`,
            retrySameModel: false,
            stopCascade: false,
            unsupportedFields,
          };
        }
        return {
          kind: 'failure',
          code: 'BAD_REQUEST_400',
          detail,
          retrySameModel: false,
          stopCascade: false,
        };
      }
      if (RETRYABLE_STATUS_CODES.has(res.status)) {
        return {
          kind: 'failure',
          code: res.status === 429 ? 'RATE_LIMIT_429' : 'SERVER_503',
          detail,
          retrySameModel: canRetryTransient,
          stopCascade: false,
        };
      }
      return {
        kind: 'failure',
        code: 'SERVER_503',
        detail,
        retrySameModel: false,
        stopCascade: false,
      };
    }

    stage = 'parse';
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
    const answerPart =
      responseParts.find((part) => !part?.thought && typeof part?.text === 'string' && part.text.trim()) ??
      responseParts.find((part) => typeof part?.text === 'string' && part.text.trim());
    const rawText = answerPart?.text ?? '';
    const cleanedJson = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (!cleanedJson) {
      return {
        kind: 'failure',
        code: 'PARSE_ERROR',
        detail: `Empty response text on ${model}`,
        retrySameModel: false,
        stopCascade: false,
      };
    }

    const parsed = JSON.parse(cleanedJson) as {
      reply?: string;
      transactions?: Array<Partial<AIParsedDraft>>;
    };
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (typeof parsed.reply !== 'string' && !Array.isArray(parsed.transactions))
    ) {
      return {
        kind: 'failure',
        code: 'PARSE_ERROR',
        detail: `Unexpected JSON schema on ${model}`,
        retrySameModel: false,
        stopCascade: false,
      };
    }

    const rawDrafts = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    const drafts = rawDrafts
      .filter((d): d is Partial<AIParsedDraft> => Boolean(d && typeof d === 'object'))
      .map((d) => sanitizeGeminiDraft(d, settings, currentDateStr, currentTimeStr));
    console.log(
      `[GeminiDirect/callGeminiDirectWithKey] Success - Model:${model}, RawDrafts:${rawDrafts.length}, Drafts:${drafts.length}`,
    );
    return {
      kind: 'success',
      response: {
        reply: parsed.reply || `已使用您的 Gemini Key (${model}) 解析 ${drafts.length} 筆交易。`,
        parsedTransactions: drafts,
        modelUsed: model,
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown';
    if (isAbortError(err, controller)) {
      return {
        kind: 'failure',
        code: 'TIMEOUT',
        detail: `Timeout (${timeoutMs}ms) on ${model}`,
        retrySameModel: false,
        stopCascade: false,
      };
    }
    if (stage === 'parse' || err instanceof SyntaxError) {
      return {
        kind: 'failure',
        code: 'PARSE_ERROR',
        detail: `JSON parse error on ${model}: ${errMsg}`,
        retrySameModel: false,
        stopCascade: false,
      };
    }
    return {
      kind: 'failure',
      code: 'NETWORK_ERROR',
      detail: `Network error on ${model}: ${errMsg}`,
      retrySameModel: false,
      stopCascade: false,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Call Google Gemini REST API directly using the user's own API key (BYOK),
 * iterating over the frozen `modelsCascade` order with fallback to local rule parser.
 */
export async function callGeminiDirectWithKey(
  apiKey: string,
  userMessage: string,
  mediaBase64: string | null | undefined,
  mimeType: string | null | undefined,
  settings: CustomSettings,
  currentDateStr: string,
  currentTimeStr: string,
  modelsCascade: readonly string[],
  options?: GeminiDirectCallOptions,
): Promise<AIBookkeeperResponse> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr, {
      code: 'KEY_MISSING',
    });
  }

  const rawMedia = typeof mediaBase64 === 'string' ? mediaBase64.trim() : '';
  const dataUrlMatch = /^data:([^;]+);base64,/i.exec(rawMedia);
  const cleanMediaBase64 = dataUrlMatch ? rawMedia.slice(dataUrlMatch[0].length).trim() : rawMedia;
  const resolvedMimeType = mimeType || dataUrlMatch?.[1] || 'image/jpeg';
  const isAudio = Boolean(resolvedMimeType.startsWith('audio/'));
  const timeoutMs = cleanMediaBase64
    ? (options?.mediaTimeoutMs ?? GEMINI_MEDIA_TIMEOUT_MS)
    : (options?.textTimeoutMs ?? GEMINI_TEXT_TIMEOUT_MS);

  const parts: Array<Record<string, unknown>> = [];
  if (cleanMediaBase64) {
    parts.push({
      inlineData: {
        mimeType: resolvedMimeType,
        data: cleanMediaBase64,
      },
    });
  }
  const fallbackPrompt = isAudio
    ? '請聆聽這段語音並辨識消費或收入明細來記帳'
    : '請辨識這張收據或消費明細並記帳';
  parts.push({ text: userMessage || fallbackPrompt });

  const systemInstruction = {
    parts: [{ text: buildDirectSystemPrompt(currentDateStr, currentTimeStr, settings) }],
  };
  const contents = [{ role: 'user', parts }];
  const payloadCache = new Map<string, string>();

  const getSerializedPayload = (includeThinking: boolean, includeSchema: boolean): string => {
    const cacheKey = `${includeThinking ? 1 : 0}:${includeSchema ? 1 : 0}`;
    const cached = payloadCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const generationConfig: Record<string, unknown> = {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    };
    if (includeSchema) {
      generationConfig.responseSchema = BOOKKEEPER_RESPONSE_SCHEMA;
    }
    if (includeThinking) {
      generationConfig.thinkingConfig = {
        thinkingLevel: GEMINI_THINKING_LEVEL,
      };
    }

    const serialized = JSON.stringify({
      systemInstruction,
      contents,
      generationConfig,
    });
    payloadCache.set(cacheKey, serialized);
    return serialized;
  };

  let lastFailureCode: GeminiFailureCode = 'SERVER_503';
  let lastFailureDetail = '';
  let stopCascade = false;

  for (const model of modelsCascade) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`;

    let transientRetries = 0;
    let downgradeRetries = 0;
    let callIndex = 0;

    while (true) {
      const disabled = unsupportedModelFields.get(model);
      const includeThinking = !disabled?.has('thinkingConfig');
      const includeSchema = !disabled?.has('responseSchema');
      const payload = getSerializedPayload(includeThinking, includeSchema);

      const outcome = await executeSingleGeminiAttempt({
        endpoint,
        payload,
        cleanKey,
        model,
        attempt: callIndex,
        canRetryTransient: transientRetries === 0,
        activeFields: {
          thinkingConfig: includeThinking,
          responseSchema: includeSchema,
        },
        timeoutMs,
        mediaLabel: cleanMediaBase64 ? resolvedMimeType : 'none',
        settings,
        currentDateStr,
        currentTimeStr,
      });
      callIndex += 1;

      if (outcome.kind === 'success') {
        return outcome.response;
      }

      if (outcome.unsupportedFields && outcome.unsupportedFields.length > 0 && downgradeRetries < 2) {
        let modelSet = unsupportedModelFields.get(model);
        if (!modelSet) {
          modelSet = new Set<AdaptiveGenerationField>();
          unsupportedModelFields.set(model, modelSet);
        }
        const newlyDisabled: AdaptiveGenerationField[] = [];
        for (const field of outcome.unsupportedFields) {
          if (!modelSet.has(field)) {
            modelSet.add(field);
            newlyDisabled.push(field);
          }
        }
        if (newlyDisabled.length > 0) {
          downgradeRetries += 1;
          console.warn(
            `[GeminiDirect/callGeminiDirectWithKey] AdaptiveDowngrade - Model:${model}, Disabled:${newlyDisabled.join(',')}, Retrying immediately`,
          );
          continue;
        }
      }

      lastFailureCode = outcome.code;
      lastFailureDetail = outcome.detail;
      console.warn(
        `[GeminiDirect/callGeminiDirectWithKey] Failed - Model:${model}, Attempt:${callIndex}, Code:${outcome.code}, Detail:${outcome.detail}`,
      );

      if (outcome.stopCascade) {
        stopCascade = true;
        break;
      }

      if (outcome.retrySameModel && transientRetries === 0) {
        transientRetries += 1;
        const backoffMs =
          options?.retryDelayMs !== undefined
            ? options.retryDelayMs
            : Math.round(600 + Math.random() * 400);
        console.log(
          `[GeminiDirect/callGeminiDirectWithKey] RetryBackoff - Model:${model}, DelayMs:${backoffMs}`,
        );
        await sleep(backoffMs);
        continue;
      }

      break;
    }

    if (stopCascade) break;
  }

  console.warn(
    `[GeminiDirect/callGeminiDirectWithKey] Exhausted - Code:${lastFailureCode}, Detail:${lastFailureDetail}, Falling back to local parser`,
  );
  return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr, {
    code: lastFailureCode,
    detail: lastFailureDetail,
  });
}
