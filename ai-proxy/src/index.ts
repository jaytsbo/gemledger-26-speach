import type * as NodeHttp from 'node:http';

/**
 * Frozen Gemini model cascade order (coding-rules.md).
 * NEVER modify, upgrade, downgrade, or reorder without explicit instruction.
 */
export const MODELS_CASCADE = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
] as const;

export type GeminiModel = (typeof MODELS_CASCADE)[number];

export interface Env {
  GEMINI_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
  PORT?: string;
}

export interface BookkeepSettings {
  accounts?: string[];
  categories?: string[];
}

export interface BookkeepRequestBody {
  userMessage?: string;
  imageBase64?: string;
  mimeType?: string;
  settings?: BookkeepSettings;
  currentDateStr?: string;
  currentTimeStr?: string;
}

export interface ParsedTransaction {
  name: string;
  amount: number;
  currency: string;
  category: string;
  account: string;
  date: string;
  time: string;
  note: string;
}

interface RetryResult {
  success: boolean;
  statusCode: number;
  bodyText: string;
  errorMessage: string;
}

const DEFAULT_ACCOUNTS = [
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

const DEFAULT_CATEGORIES = [
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

const MODEL_ATTEMPT_TIMEOUT_MS = 8000;
const MAX_RETRIES_PER_MODEL = 1;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const FATAL_CLIENT_STATUS_CODES = new Set([400, 401, 403]);

/** Build standard CORS headers for Edge and Node responses. */
function buildCorsHeaders(allowedOrigin = '*'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

/** Serialize a JSON response with CORS headers. */
function jsonResponse(
  payload: unknown,
  status = 200,
  allowedOrigin = '*'
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...buildCorsHeaders(allowedOrigin),
    },
  });
}

/** Return current date (YYYY-MM-DD) and time (HH:mm) in Asia/Taipei as defaults. */
function getDefaultTaipeiDateTime(): { dateStr: string; timeStr: string } {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const pick = (parts: Intl.DateTimeFormatPart[], type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    dateStr: `${pick(dateParts, 'year')}-${pick(dateParts, 'month')}-${pick(dateParts, 'day')}`,
    timeStr: `${pick(timeParts, 'hour')}:${pick(timeParts, 'minute')}`,
  };
}

/** Build the Traditional Chinese bookkeeping system prompt matching legacy GAS logic. */
function buildSystemPrompt(
  currentDateStr: string,
  currentTimeStr: string,
  categories: string[],
  accounts: string[]
): string {
  return `You are an expert multilingual financial bookkeeping assistant.
Current Date: ${currentDateStr}.
Current Time: ${currentTimeStr}.
Valid Categories: ${JSON.stringify(categories)}.
Valid Accounts: ${JSON.stringify(accounts)}.

TIME AND DATE RULES:
1. If user explicitly specifies date/time (e.g. "昨天", "早上9點"), parse accordingly.
2. If date or time is NOT explicitly specified by the user, default "date" strictly to "${currentDateStr}" and "time" strictly to "${currentTimeStr}". Do NOT fallback to 00:00 or 12:00.

CRITICAL AMOUNT SIGN RULES:
1. ANY transaction representing money coming IN (e.g. Salary, dividend/配息, investment profit, cash gifts, refunds, repayment collected/代墊款歸還, selling assets, etc.) MUST have a POSITIVE amount (e.g. 5000).
2. ANY transaction representing money going OUT (e.g. Buying food/clothes/goods, paying bills, travel expense, haircut, fees, subscription, etc.) MUST have a NEGATIVE amount (e.g. -150).
3. For internal transfers, distinguish transfer-out as NEGATIVE and transfer-in as POSITIVE based on context.
4. Do NOT rely solely on category names. Judge strictly by the financial nature of the action described by the user.

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
      "note": "Any additional note"
    }
  ]
}`;
}

/** Sleep helper for exponential backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch Gemini REST endpoint with 8s per-model budget and exponential backoff + jitter. */
async function fetchWithRetry(
  url: string,
  bodyJson: string,
  model: GeminiModel,
  maxRetries = MAX_RETRIES_PER_MODEL,
  timeoutMs = MODEL_ATTEMPT_TIMEOUT_MS
): Promise<RetryResult> {
  const startTime = Date.now();
  let lastStatusCode = 0;
  let lastBodyText = '';
  let lastErrorMessage = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const elapsed = Date.now() - startTime;
    const remainingMs = timeoutMs - elapsed;
    if (remainingMs <= 0) {
      console.warn(
        `[AIProxy/fetchWithRetry] Timeout - Model ${model} exceeded ${timeoutMs}ms budget`
      );
      break;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
        signal: controller.signal,
      });
      clearTimeout(timer);

      lastStatusCode = response.status;
      lastBodyText = await response.text();

      if (response.ok) {
        console.log(
          `[AIProxy/fetchWithRetry] Success - Model ${model} HTTP ${lastStatusCode} in ${Date.now() - startTime}ms`
        );
        return {
          success: true,
          statusCode: lastStatusCode,
          bodyText: lastBodyText,
          errorMessage: '',
        };
      }

      lastErrorMessage = lastBodyText || `HTTP ${lastStatusCode}`;

      // Non-transient 4xx errors should not be retried on the same model
      if (FATAL_CLIENT_STATUS_CODES.has(lastStatusCode) || lastStatusCode === 404) {
        console.warn(
          `[AIProxy/fetchWithRetry] ClientError - Model ${model} HTTP ${lastStatusCode}, skipping retry`
        );
        return {
          success: false,
          statusCode: lastStatusCode,
          bodyText: lastBodyText,
          errorMessage: lastErrorMessage,
        };
      }

      if (
        RETRYABLE_STATUS_CODES.has(lastStatusCode) &&
        attempt < maxRetries &&
        Date.now() - startTime < timeoutMs
      ) {
        const baseDelayMs = 1000 * Math.pow(2, attempt);
        const jitterMs = Math.floor(Math.random() * 500);
        const budgetLeft = Math.max(0, timeoutMs - (Date.now() - startTime));
        const delayMs = Math.min(budgetLeft, baseDelayMs + jitterMs);
        if (delayMs > 0) {
          console.warn(
            `[AIProxy/fetchWithRetry] Retry - Model ${model} HTTP ${lastStatusCode}, waiting ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await sleep(delayMs);
        }
      }
    } catch (err) {
      clearTimeout(timer);
      const errMsg = err instanceof Error ? err.message : String(err);
      lastErrorMessage = errMsg;
      lastStatusCode = 0;

      if (attempt < maxRetries && Date.now() - startTime < timeoutMs) {
        const baseDelayMs = 1000 * Math.pow(2, attempt);
        const jitterMs = Math.floor(Math.random() * 500);
        const budgetLeft = Math.max(0, timeoutMs - (Date.now() - startTime));
        const delayMs = Math.min(budgetLeft, baseDelayMs + jitterMs);
        if (delayMs > 0) {
          console.warn(
            `[AIProxy/fetchWithRetry] NetworkRetry - Model ${model} error "${errMsg}", waiting ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await sleep(delayMs);
        }
      }
    }
  }

  return {
    success: false,
    statusCode: lastStatusCode,
    bodyText: lastBodyText,
    errorMessage: lastErrorMessage || 'Request timeout or network failure',
  };
}

/** Normalize raw Gemini transaction objects to match client schema defaults. */
function normalizeTransactions(
  rawList: unknown,
  defaultCategory: string,
  defaultAccount: string,
  defaultDate: string,
  defaultTime: string
): ParsedTransaction[] {
  if (!Array.isArray(rawList)) return [];

  return rawList
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const parsedAmount = Number(item.amount);
      return {
        name: String(item.name || '未命名項目').trim() || '未命名項目',
        amount: Number.isFinite(parsedAmount) ? parsedAmount : -100,
        currency: String(item.currency || 'TWD').trim().toUpperCase() || 'TWD',
        category: String(item.category || defaultCategory).trim() || defaultCategory,
        account: String(item.account || defaultAccount).trim() || defaultAccount,
        date: String(item.date || defaultDate).trim() || defaultDate,
        time: String(item.time || defaultTime).trim() || defaultTime,
        note: String(item.note || '').trim(),
      };
    });
}

/** Execute the frozen MODELS_CASCADE against Gemini v1beta generateContent. */
async function callModelCascade(
  apiKey: string,
  payloadJson: string,
  defaults: {
    category: string;
    account: string;
    dateStr: string;
    timeStr: string;
  }
): Promise<
  | {
      ok: true;
      reply: string;
      parsedTransactions: ParsedTransaction[];
      modelUsed: GeminiModel;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      fatalClientError: boolean;
    }
> {
  let lastStatusCode = 0;
  let lastErrorMsg = '';

  for (let mIdx = 0; mIdx < MODELS_CASCADE.length; mIdx++) {
    const currentModel = MODELS_CASCADE[mIdx];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    console.log(
      `[AIProxy/callModelCascade] Attempt - Model ${currentModel} (${mIdx + 1}/${MODELS_CASCADE.length})`
    );

    const result = await fetchWithRetry(url, payloadJson, currentModel);
    lastStatusCode = result.statusCode;

    if (result.success) {
      try {
        const json = JSON.parse(result.bodyText) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText) as {
            reply?: string;
            transactions?: unknown;
          };
          const parsedTransactions = normalizeTransactions(
            parsed.transactions,
            defaults.category,
            defaults.account,
            defaults.dateStr,
            defaults.timeStr
          );
          const replyPrefix =
            mIdx > 0
              ? `⚡ [注意：由於前置模型過載或限制，系統已自動為您切換至 ${currentModel} 完成解析！]\n\n`
              : '';

          console.log(
            `[AIProxy/callModelCascade] Parsed - Model ${currentModel} extracted ${parsedTransactions.length} transaction(s)`
          );
          return {
            ok: true,
            reply:
              replyPrefix +
              (parsed.reply || '解析成功！請核對以下記帳明細：'),
            parsedTransactions,
            modelUsed: currentModel,
          };
        }
        lastErrorMsg = `Empty candidate text from ${currentModel}`;
        console.warn(
          `[AIProxy/callModelCascade] ParseEmpty - Model ${currentModel} returned no candidate text`
        );
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        lastErrorMsg = `JSON parse error from ${currentModel}: ${msg}`;
        console.error(
          `[AIProxy/callModelCascade] ParseError - Model ${currentModel}: ${msg}`
        );
      }
    } else {
      lastErrorMsg = result.errorMessage;
      console.warn(
        `[AIProxy/callModelCascade] Failed - Model ${currentModel} HTTP ${lastStatusCode}: ${lastErrorMsg.slice(0, 200)}`
      );
      if (FATAL_CLIENT_STATUS_CODES.has(lastStatusCode)) {
        return {
          ok: false,
          statusCode: lastStatusCode,
          error: lastErrorMsg,
          fatalClientError: true,
        };
      }
    }
  }

  return {
    ok: false,
    statusCode: lastStatusCode || 503,
    error: lastErrorMsg || 'All Gemini models in cascade failed or timed out',
    fatalClientError: false,
  };
}

/** Handle POST /api/bookkeep requests. */
async function handleBookkeep(
  request: Request,
  env: Env,
  allowedOrigin: string
): Promise<Response> {
  let body: BookkeepRequestBody;
  try {
    body = (await request.json()) as BookkeepRequestBody;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AIProxy/handleBookkeep] BadJSON - ${msg}`);
    return jsonResponse({ error: 'Invalid JSON request body' }, 400, allowedOrigin);
  }

  const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const mimeType =
    typeof body.mimeType === 'string' && body.mimeType.trim()
      ? body.mimeType.trim()
      : 'image/jpeg';

  if (!userMessage && !imageBase64) {
    console.warn('[AIProxy/handleBookkeep] ValidationFailed - Empty userMessage and imageBase64');
    return jsonResponse(
      { error: 'Either userMessage or imageBase64 must be provided' },
      400,
      allowedOrigin
    );
  }

  const apiKey = env.GEMINI_API_KEY?.trim() ?? '';
  if (!apiKey) {
    console.warn(
      '[AIProxy/handleBookkeep] MissingKey - GEMINI_API_KEY not configured, returning 503 fallbackRequired'
    );
    return jsonResponse(
      {
        fallbackRequired: true,
        reason: '503_SERVICE_UNAVAILABLE',
        error: 'GEMINI_API_KEY is not configured on proxy server',
      },
      503,
      allowedOrigin
    );
  }

  const defaults = getDefaultTaipeiDateTime();
  const currentDateStr =
    typeof body.currentDateStr === 'string' && body.currentDateStr.trim()
      ? body.currentDateStr.trim()
      : defaults.dateStr;
  const currentTimeStr =
    typeof body.currentTimeStr === 'string' && body.currentTimeStr.trim()
      ? body.currentTimeStr.trim()
      : defaults.timeStr;

  const accounts =
    Array.isArray(body.settings?.accounts) && body.settings.accounts.length > 0
      ? body.settings.accounts
      : DEFAULT_ACCOUNTS;
  const categories =
    Array.isArray(body.settings?.categories) && body.settings.categories.length > 0
      ? body.settings.categories
      : DEFAULT_CATEGORIES;

  console.log(
    `[AIProxy/handleBookkeep] Request - textLen=${userMessage.length}, hasImage=${Boolean(imageBase64)}, accounts=${accounts.length}, categories=${categories.length}, date=${currentDateStr} ${currentTimeStr}`
  );

  const systemPrompt = buildSystemPrompt(
    currentDateStr,
    currentTimeStr,
    categories,
    accounts
  );

  const parts: Array<
    | { inlineData: { data: string; mimeType: string } }
    | { text: string }
  > = [];

  if (imageBase64) {
    parts.push({
      inlineData: {
        data: imageBase64.replace(/^data:[^;]+;base64,/, ''),
        mimeType,
      },
    });
  }

  parts.push({
    text: `${systemPrompt}\n\nUser Input: ${userMessage || '請辨識語音、收據與消費內容'}`,
  });

  const geminiPayload = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const cascadeResult = await callModelCascade(apiKey, geminiPayload, {
    category: categories.includes('食') ? '食' : categories[0],
    account: accounts[0],
    dateStr: currentDateStr,
    timeStr: currentTimeStr,
  });

  if (cascadeResult.ok) {
    console.log(
      `[AIProxy/handleBookkeep] Success - model=${cascadeResult.modelUsed}, txCount=${cascadeResult.parsedTransactions.length}`
    );
    return jsonResponse(
      {
        reply: cascadeResult.reply,
        parsedTransactions: cascadeResult.parsedTransactions,
        modelUsed: cascadeResult.modelUsed,
        isFallback: false,
      },
      200,
      allowedOrigin
    );
  }

  if (cascadeResult.fatalClientError) {
    console.error(
      `[AIProxy/handleBookkeep] ClientError - HTTP ${cascadeResult.statusCode}`
    );
    return jsonResponse(
      {
        fallbackRequired: false,
        reason: 'GEMINI_CLIENT_ERROR',
        error: cascadeResult.error,
      },
      cascadeResult.statusCode,
      allowedOrigin
    );
  }

  console.warn(
    `[AIProxy/handleBookkeep] Exhausted - All cascade models unavailable (lastStatus=${cascadeResult.statusCode}), returning 503 fallbackRequired`
  );
  return jsonResponse(
    {
      fallbackRequired: true,
      reason: '503_SERVICE_UNAVAILABLE',
      error: cascadeResult.error,
    },
    503,
    allowedOrigin
  );
}

/** Primary Edge / Cloudflare Workers / Node unified Fetch handler. */
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim() || '*';
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  console.log(`[AIProxy/handleRequest] Incoming - ${method} ${pathname}`);

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(allowedOrigin),
    });
  }

  if (method === 'GET' && pathname === '/health') {
    const geminiConfigured = Boolean(env.GEMINI_API_KEY?.trim());
    console.log(`[AIProxy/handleRequest] Health - geminiConfigured=${geminiConfigured}`);
    return jsonResponse(
      {
        ok: true,
        status: 'healthy',
        service: 'gemledger-ai-proxy',
        modelsCascade: MODELS_CASCADE,
        geminiConfigured,
        timestamp: new Date().toISOString(),
      },
      200,
      allowedOrigin
    );
  }

  if (method === 'POST' && pathname === '/api/bookkeep') {
    return handleBookkeep(request, env, allowedOrigin);
  }

  console.warn(`[AIProxy/handleRequest] NotFound - ${method} ${pathname}`);
  return jsonResponse({ error: `Route not found: ${method} ${pathname}` }, 404, allowedOrigin);
}

const workerHandler: ExportedHandler<Env> = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

export default workerHandler;

/** Convert a Node IncomingMessage into a Web Request. */
async function toWebRequest(req: NodeHttp.IncomingMessage): Promise<Request> {
  const host = req.headers.host || 'localhost:8787';
  const fullUrl = `http://${host}${req.url || '/'}`;
  const method = (req.method || 'GET').toUpperCase();

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return new Request(fullUrl, { method, headers });
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const bodyBuffer = Buffer.concat(chunks);
  return new Request(fullUrl, {
    method,
    headers,
    body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
  });
}

/** Detect whether this file is being executed directly by Node.js (not bundled in Edge). */
function isDirectNodeExecution(): boolean {
  if (typeof process === 'undefined' || !process.versions?.node) return false;
  const entryPath = process.argv?.[1];
  if (!entryPath) return false;
  const normalizedArg = entryPath.replace(/\\/g, '/').toLowerCase();
  const normalizedUrl = decodeURIComponent(import.meta.url).toLowerCase();
  return normalizedUrl.endsWith(normalizedArg) || normalizedArg.endsWith('src/index.ts');
}

/** Start optional local Node HTTP server when invoked directly via `tsx src/index.ts`. */
async function startLocalNodeServer(): Promise<void> {
  // Load .env or .dev.vars silently if Node supports loadEnvFile
  const loadEnv = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
  if (typeof loadEnv === 'function') {
    for (const candidate of ['.env', '.dev.vars']) {
      try {
        loadEnv(candidate);
      } catch {
        // Optional local env file may not exist
      }
    }
  }

  const httpSpecifier = 'node:http';
  const http = (await import(/* @vite-ignore */ httpSpecifier)) as typeof NodeHttp;
  const port = Number(process.env.PORT) || 8787;

  const server = http.createServer(async (req, res) => {
    try {
      const webReq = await toWebRequest(req);
      const env: Env = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
        PORT: process.env.PORT,
      };
      const webRes = await handleRequest(webReq, env);
      res.statusCode = webRes.status;
      webRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const arrayBuf = await webRes.arrayBuffer();
      res.end(Buffer.from(arrayBuf));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AIProxy/startNodeServer] UnhandledError - ${msg}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Internal Proxy Error' }));
    }
  });

  server.listen(port, () => {
    console.log(
      `[AIProxy/startNodeServer] Listening - http://localhost:${port} (geminiConfigured=${Boolean(process.env.GEMINI_API_KEY?.trim())})`
    );
  });
}

if (isDirectNodeExecution()) {
  void startLocalNodeServer();
}
