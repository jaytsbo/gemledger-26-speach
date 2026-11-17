import {
  AIBookkeeperResponse,
  AIParsedDraft,
  CustomSettings,
} from '../types/ledger';
import { fallbackParseTransaction } from './fallbackParser';

const USER_GEMINI_KEY_STORAGE = 'GEMLEDGER_USER_GEMINI_API_KEY';
const GEMINI_REQUEST_TIMEOUT_MS = 10000;

let memoryApiKeyFallback: string | null = null;

function isWebStorageAvailable(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage !== 'undefined';
}

function getSecureStore(): {
  getItemAsync: (k: string) => Promise<string | null>;
  setItemAsync: (k: string, v: string) => Promise<void>;
  deleteItemAsync: (k: string) => Promise<void>;
} | null {
  try {
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('expo-secure-store');
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Persist the user's personal Gemini API key in SecureStore (native) or localStorage (web).
 */
export async function saveUserGeminiApiKey(apiKey: string): Promise<void> {
  const clean = apiKey.trim();
  console.log(`[GeminiDirect/saveUserGeminiApiKey] Save - hasKey=${Boolean(clean)}`);
  memoryApiKeyFallback = clean || null;

  if (isWebStorageAvailable()) {
    if (clean) {
      (globalThis as any).localStorage.setItem(USER_GEMINI_KEY_STORAGE, clean);
    } else {
      (globalThis as any).localStorage.removeItem(USER_GEMINI_KEY_STORAGE);
    }
    return;
  }

  const secureStore = getSecureStore();
  if (secureStore) {
    if (clean) {
      await secureStore.setItemAsync(USER_GEMINI_KEY_STORAGE, clean);
    } else {
      await secureStore.deleteItemAsync(USER_GEMINI_KEY_STORAGE);
    }
  }
}

/**
 * Load the user's personal Gemini API key from local secure storage.
 */
export async function loadUserGeminiApiKey(): Promise<string> {
  try {
    let raw: string | null = null;
    if (isWebStorageAvailable()) {
      raw = (globalThis as any).localStorage.getItem(USER_GEMINI_KEY_STORAGE);
    } else {
      const secureStore = getSecureStore();
      if (secureStore) {
        raw = await secureStore.getItemAsync(USER_GEMINI_KEY_STORAGE);
      }
    }
    const key = (raw ?? memoryApiKeyFallback ?? '').trim();
    console.log(`[GeminiDirect/loadUserGeminiApiKey] Loaded - hasKey=${Boolean(key)}`);
    return key;
  } catch (err) {
    console.warn('[GeminiDirect/loadUserGeminiApiKey] Failed -', err);
    return (memoryApiKeyFallback ?? '').trim();
  }
}

/**
 * Clear the user's stored Gemini API key.
 */
export async function clearUserGeminiApiKey(): Promise<void> {
  console.log('[GeminiDirect/clearUserGeminiApiKey] Clearing stored key');
  memoryApiKeyFallback = null;
  if (isWebStorageAvailable()) {
    (globalThis as any).localStorage.removeItem(USER_GEMINI_KEY_STORAGE);
    return;
  }
  const secureStore = getSecureStore();
  if (secureStore) {
    await secureStore.deleteItemAsync(USER_GEMINI_KEY_STORAGE);
  }
}

function buildDirectSystemPrompt(
  currentDateStr: string,
  currentTimeStr: string,
  settings: CustomSettings,
): string {
  return `You are an expert multilingual financial bookkeeping assistant.
Current Date: ${currentDateStr}.
Current Time: ${currentTimeStr}.
Valid Categories: ${JSON.stringify(settings.categories)}.
Valid Accounts: ${JSON.stringify(settings.accounts)}.

TIME AND DATE RULES:
1. If user explicitly specifies date/time, parse accordingly.
2. Otherwise default "date" to "${currentDateStr}" and "time" to "${currentTimeStr}".

CRITICAL AMOUNT SIGN RULES:
1. Money coming IN (salary, refund, dividend, etc.) MUST be POSITIVE.
2. Money going OUT (food, bills, shopping, etc.) MUST be NEGATIVE.

AUDIO INPUT RULES:
1. If the user input is an audio recording, transcribe/summarize what was heard and ALWAYS start "reply" with "🗣️ 聽到：「<簡短逐字摘要>」\\n" followed by the bookkeeping summary in Traditional Chinese.

Output JSON schema:
{
  "reply": "Friendly response in Traditional Chinese (zh-TW)",
  "transactions": [
    {
      "name": "Item name",
      "amount": -100,
      "currency": "TWD",
      "category": "食",
      "account": "現金",
      "date": "${currentDateStr}",
      "time": "${currentTimeStr}",
      "note": ""
    }
  ]
}`;
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
): Promise<AIBookkeeperResponse> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr);
  }

  const isAudio = Boolean(mimeType?.startsWith('audio/'));
  const resolvedMimeType = mimeType || 'image/jpeg';
  const parts: Array<Record<string, unknown>> = [];
  if (mediaBase64) {
    parts.push({
      inlineData: {
        mimeType: resolvedMimeType,
        data: mediaBase64,
      },
    });
  }
  const fallbackPrompt = isAudio
    ? '請聆聽這段語音並辨識消費或收入明細來記帳'
    : '請辨識這張收據或消費明細並記帳';
  parts.push({ text: userMessage || fallbackPrompt });

  const payload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: buildDirectSystemPrompt(currentDateStr, currentTimeStr, settings) }],
    },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  for (const model of modelsCascade) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS) : null;

    try {
      console.log(
        `[GeminiDirect/callGeminiDirectWithKey] Request - Model:${model}, Media:${mediaBase64 ? resolvedMimeType : 'none'}`,
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
      if (timer) clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[GeminiDirect/callGeminiDirectWithKey] HTTP ${res.status} on ${model}`);
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          break;
        }
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!rawText) continue;

      const parsed = JSON.parse(rawText) as {
        reply?: string;
        transactions?: AIParsedDraft[];
      };

      const drafts = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      console.log(
        `[GeminiDirect/callGeminiDirectWithKey] Success - Model:${model}, Drafts:${drafts.length}`,
      );
      return {
        reply: parsed.reply || `已使用您的 Gemini Key (${model}) 解析 ${drafts.length} 筆交易。`,
        parsedTransactions: drafts,
        modelUsed: model,
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      console.warn(
        `[GeminiDirect/callGeminiDirectWithKey] Error on ${model} -`,
        err instanceof Error ? err.message : 'unknown',
      );
    }
  }

  console.warn('[GeminiDirect/callGeminiDirectWithKey] Exhausted - Falling back to local parser');
  return fallbackParseTransaction(userMessage, settings, currentDateStr, currentTimeStr);
}
