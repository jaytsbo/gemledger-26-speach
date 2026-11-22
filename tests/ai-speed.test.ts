import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { MODELS_CASCADE } from '../src/services/apiService';
import { DEFAULT_SETTINGS } from '../src/services/database';
import {
  BOOKKEEPER_RESPONSE_SCHEMA,
  callGeminiDirectWithKey,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_THINKING_LEVEL,
  resetModelCapabilitiesCache,
} from '../src/services/geminiDirectService';
import {
  buildReceiptResizeActions,
  compressReceiptImage,
  ImageManipulatorLike,
  MAX_RECEIPT_EDGE_PX,
  RECEIPT_JPEG_COMPRESS,
} from '../src/services/mediaCompressor';
import { VOICE_RECORDING_OPTIONS } from '../src/services/voiceRecorder';

function makeGeminiOkResponse(
  reply: string,
  transactions: Array<Record<string, unknown>>,
  partsOverride?: Array<{ text?: string; thought?: boolean }>,
): Response {
  const parts = partsOverride ?? [
    {
      text: JSON.stringify({ reply, transactions }),
    },
  ];
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts } }],
    }),
  } as unknown as Response;
}

describe('Gemini Direct Speed Optimization & Adaptive Downgrade', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetModelCapabilitiesCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetModelCapabilitiesCache();
  });

  it('sends thinkingConfig, responseSchema, maxOutputTokens, slim prompt, and parses non-thought parts', async () => {
    let capturedBody = '';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return makeGeminiOkResponse('已記下午餐 150 元', [], [
        { thought: true, text: 'analyzing user input...' },
        {
          text: JSON.stringify({
            reply: '已記下午餐 150 元',
            transactions: [
              {
                name: '牛肉麵',
                amount: -150,
                currency: 'TWD',
                category: '食',
                account: '現金',
                date: '2026-11-20',
                time: '12:15',
                note: '',
              },
            ],
          }),
        },
      ]);
    }) as typeof fetch;

    const res = await callGeminiDirectWithKey(
      'AIzaSpeedTestKey',
      '午餐牛肉麵 150 現金',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '12:15',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(res.isFallback, undefined);
    assert.equal(res.modelUsed, MODELS_CASCADE[0]);
    assert.equal(res.parsedTransactions.length, 1);
    assert.equal(res.parsedTransactions[0].name, '牛肉麵');
    assert.equal(res.parsedTransactions[0].amount, -150);

    const parsedBody = JSON.parse(capturedBody);
    const genCfg = parsedBody.generationConfig;
    assert.equal(genCfg.responseMimeType, 'application/json');
    assert.equal(genCfg.temperature, 0.1);
    assert.equal(genCfg.maxOutputTokens, GEMINI_MAX_OUTPUT_TOKENS);
    assert.equal(genCfg.maxOutputTokens, 2048);
    assert.deepEqual(genCfg.thinkingConfig, { thinkingLevel: GEMINI_THINKING_LEVEL });
    assert.deepEqual(genCfg.responseSchema, BOOKKEEPER_RESPONSE_SCHEMA);

    const txProps = genCfg.responseSchema.properties.transactions.items.properties;
    for (const key of ['name', 'amount', 'currency', 'category', 'account', 'date', 'time', 'note']) {
      assert.ok(key in txProps, `responseSchema missing transaction property: ${key}`);
    }

    const sysPrompt: string = parsedBody.systemInstruction.parts[0].text;
    assert.match(sysPrompt, /≤20字/);
    assert.match(sysPrompt, /🗣️ 聽到：「/);
    assert.match(sysPrompt, /≤15字/);
    assert.match(sysPrompt, /正數/);
    assert.match(sysPrompt, /負數/);
    assert.match(sysPrompt, /白名單/);
  });

  it('reuses serialized payload across cascade attempts when capabilities match', async () => {
    const sentBodies: string[] = [];
    const origStringify = JSON.stringify;
    let payloadStringifyCount = 0;

    JSON.stringify = ((value: unknown, ...rest: unknown[]) => {
      if (
        value &&
        typeof value === 'object' &&
        'generationConfig' in (value as Record<string, unknown>) &&
        'contents' in (value as Record<string, unknown>)
      ) {
        payloadStringifyCount += 1;
      }
      return (origStringify as (...args: unknown[]) => string)(value, ...rest);
    }) as typeof JSON.stringify;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      sentBodies.push(String(init?.body ?? ''));
      return { ok: false, status: 503 } as Response;
    }) as typeof fetch;

    try {
      await callGeminiDirectWithKey(
        'AIzaHotPathKey',
        '咖啡 95 現金',
        null,
        null,
        DEFAULT_SETTINGS,
        '2026-11-20',
        '09:00',
        MODELS_CASCADE,
        { retryDelayMs: 0 },
      );
    } finally {
      JSON.stringify = origStringify;
    }

    assert.equal(sentBodies.length, MODELS_CASCADE.length * 2);
    assert.equal(payloadStringifyCount, 1);
  });

  it('adaptively strips unsupported thinkingConfig on HTTP 400, retries same model once, and remembers for session', async () => {
    const requests: Array<{ url: string; body: any }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      requests.push({ url: String(input), body });

      if (body.generationConfig?.thinkingConfig) {
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({
              error: {
                code: 400,
                message: 'Invalid JSON payload received. Unknown name "thinkingConfig" at \'generation_config\'',
              },
            }),
        } as unknown as Response;
      }

      return makeGeminiOkResponse('已記下早餐', [
        {
          name: '蛋餅',
          amount: -45,
          currency: 'TWD',
          category: '食',
          account: '現金',
          date: '2026-11-20',
          time: '08:00',
          note: '',
        },
      ]);
    }) as typeof fetch;

    const first = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '早餐蛋餅 45',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '08:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(first.modelUsed, MODELS_CASCADE[0]);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].url.includes(MODELS_CASCADE[0]));
    assert.ok(requests[1].url.includes(MODELS_CASCADE[0]));
    assert.ok(requests[0].body.generationConfig.thinkingConfig);
    assert.equal(requests[1].body.generationConfig.thinkingConfig, undefined);
    // responseSchema must still be preserved when only thinkingConfig was rejected
    assert.deepEqual(requests[1].body.generationConfig.responseSchema, BOOKKEEPER_RESPONSE_SCHEMA);

    // Second call in the same session must omit thinkingConfig immediately (only 1 fetch call)
    requests.length = 0;
    const second = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '午餐 120',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '12:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(second.modelUsed, MODELS_CASCADE[0]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.generationConfig.thinkingConfig, undefined);
    assert.deepEqual(requests[0].body.generationConfig.responseSchema, BOOKKEEPER_RESPONSE_SCHEMA);
  });

  it('triggers adaptive downgrade for Gemini "Thinking level minimal / \\"MINIMAL\\" is not supported" messages', async () => {
    const errorMessages = [
      'Thinking level minimal is not supported for this model.',
      'Thinking level "MINIMAL" is not supported for this model.',
    ];

    for (const msg of errorMessages) {
      resetModelCapabilitiesCache();
      const requests: Array<{ url: string; body: any }> = [];

      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'));
        requests.push({ url: String(input), body });

        if (body.generationConfig?.thinkingConfig) {
          return {
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ error: { code: 400, message: msg } }),
          } as unknown as Response;
        }

        return makeGeminiOkResponse('已記下咖啡', [
          {
            name: '美式咖啡',
            amount: -80,
            currency: 'TWD',
            category: '食',
            account: '現金',
            date: '2026-11-20',
            time: '10:00',
            note: '',
          },
        ]);
      }) as typeof fetch;

      const res = await callGeminiDirectWithKey(
        'AIzaValidKey',
        '美式咖啡 80',
        null,
        null,
        DEFAULT_SETTINGS,
        '2026-11-20',
        '10:00',
        MODELS_CASCADE,
        { retryDelayMs: 0 },
      );

      assert.equal(res.modelUsed, MODELS_CASCADE[0]);
      assert.equal(requests.length, 2);
      assert.ok(requests[0].url.includes(MODELS_CASCADE[0]));
      assert.ok(requests[1].url.includes(MODELS_CASCADE[0]));
      assert.ok(requests[0].body.generationConfig.thinkingConfig);
      assert.equal(requests[1].body.generationConfig.thinkingConfig, undefined);
      assert.deepEqual(requests[1].body.generationConfig.responseSchema, BOOKKEEPER_RESPONSE_SCHEMA);

      // Session cache omits thinkingConfig on subsequent request
      requests.length = 0;
      const followUp = await callGeminiDirectWithKey(
        'AIzaValidKey',
        '紅茶 40',
        null,
        null,
        DEFAULT_SETTINGS,
        '2026-11-20',
        '10:30',
        MODELS_CASCADE,
        { retryDelayMs: 0 },
      );
      assert.equal(followUp.modelUsed, MODELS_CASCADE[0]);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body.generationConfig.thinkingConfig, undefined);
    }
  });

  it('adaptively strips unsupported responseSchema on HTTP 400 while preserving thinkingConfig', async () => {
    const requests: Array<{ url: string; body: any }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      requests.push({ url: String(input), body });

      if (body.generationConfig?.responseSchema) {
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({
              error: {
                code: 400,
                message: 'responseSchema is not supported for this model',
              },
            }),
        } as unknown as Response;
      }

      return makeGeminiOkResponse('已記下捷運 35 元', [
        {
          name: '捷運',
          amount: -35,
          currency: 'TWD',
          category: '行',
          account: '悠遊卡',
          date: '2026-11-20',
          time: '08:30',
          note: '',
        },
      ]);
    }) as typeof fetch;

    const first = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '捷運 35 悠遊卡',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '08:30',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(first.modelUsed, MODELS_CASCADE[0]);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].body.generationConfig.responseSchema);
    assert.equal(requests[1].body.generationConfig.responseSchema, undefined);
    assert.deepEqual(requests[1].body.generationConfig.thinkingConfig, {
      thinkingLevel: GEMINI_THINKING_LEVEL,
    });

    // Subsequent call remembers responseSchema is unsupported for model[0]
    requests.length = 0;
    const second = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '公車 15 悠遊卡',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '09:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );
    assert.equal(second.modelUsed, MODELS_CASCADE[0]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.generationConfig.responseSchema, undefined);
    assert.deepEqual(requests[0].body.generationConfig.thinkingConfig, {
      thinkingLevel: GEMINI_THINKING_LEVEL,
    });
  });

  it('still stops cascade immediately on HTTP 400 API_KEY_INVALID without adaptive retry', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              code: 400,
              message: 'API key not valid. Please pass a valid API key.',
              details: [{ reason: 'API_KEY_INVALID' }],
            },
          }),
      } as unknown as Response;
    }) as typeof fetch;

    const res = await callGeminiDirectWithKey(
      'AIzaBadKey400',
      '午餐 120',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '12:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(requestedUrls.length, 1);
    assert.equal(res.isFallback, true);
    assert.equal(res.fallbackReason, 'AUTH_INVALID_KEY');
    assert.equal(res.errorType, 'AUTH_INVALID_KEY');
  });

  it('does not loop when a model keeps rejecting with unrelated HTTP 400 errors', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { code: 400, message: 'Bad payload' } }),
      } as unknown as Response;
    }) as typeof fetch;

    const res = await callGeminiDirectWithKey(
      'AIzaValidKey',
      '晚餐 200',
      null,
      null,
      DEFAULT_SETTINGS,
      '2026-11-20',
      '19:00',
      MODELS_CASCADE,
      { retryDelayMs: 0 },
    );

    assert.equal(requestedUrls.length, MODELS_CASCADE.length);
    assert.equal(res.isFallback, true);
    assert.equal(res.fallbackReason, 'BAD_REQUEST_400');
  });
});

describe('VoiceRecorder Lightweight Speech Preset', () => {
  it('configures 16kHz mono 32kbps AAC (.m4a) on Android/iOS and 32kbps audio/webm on Web', () => {
    assert.equal(VOICE_RECORDING_OPTIONS.android.extension, '.m4a');
    assert.equal(VOICE_RECORDING_OPTIONS.android.outputFormat, 2); // MPEG_4
    assert.equal(VOICE_RECORDING_OPTIONS.android.audioEncoder, 3); // AAC
    assert.equal(VOICE_RECORDING_OPTIONS.android.sampleRate, 16000);
    assert.equal(VOICE_RECORDING_OPTIONS.android.numberOfChannels, 1);
    assert.equal(VOICE_RECORDING_OPTIONS.android.bitRate, 32000);

    assert.equal(VOICE_RECORDING_OPTIONS.ios.extension, '.m4a');
    assert.equal(VOICE_RECORDING_OPTIONS.ios.outputFormat, 'aac '); // MPEG4AAC
    assert.equal(VOICE_RECORDING_OPTIONS.ios.sampleRate, 16000);
    assert.equal(VOICE_RECORDING_OPTIONS.ios.numberOfChannels, 1);
    assert.equal(VOICE_RECORDING_OPTIONS.ios.bitRate, 32000);
    assert.ok(
      typeof VOICE_RECORDING_OPTIONS.ios.audioQuality === 'number' &&
        VOICE_RECORDING_OPTIONS.ios.audioQuality > 0,
    );

    assert.equal(VOICE_RECORDING_OPTIONS.web.mimeType, 'audio/webm');
    assert.equal(VOICE_RECORDING_OPTIONS.web.bitsPerSecond, 32000);
  });
});

describe('mediaCompressor', () => {
  it('computes resize actions for portrait, landscape, small images, and unknown dimensions', () => {
    // Landscape > 1024 -> resize width
    assert.deepEqual(buildReceiptResizeActions(4032, 3024), [
      { resize: { width: MAX_RECEIPT_EDGE_PX } },
    ]);
    // Portrait > 1024 -> resize height
    assert.deepEqual(buildReceiptResizeActions(3024, 4032), [
      { resize: { height: MAX_RECEIPT_EDGE_PX } },
    ]);
    // Square > 1024 -> resize width
    assert.deepEqual(buildReceiptResizeActions(2048, 2048), [
      { resize: { width: MAX_RECEIPT_EDGE_PX } },
    ]);
    // Small or exact <= 1024 -> no upscale
    assert.deepEqual(buildReceiptResizeActions(1024, 1024), []);
    assert.deepEqual(buildReceiptResizeActions(800, 600), []);
    assert.deepEqual(buildReceiptResizeActions(600, 900), []);
    // Unknown / invalid dimensions -> fallback width 1024
    assert.deepEqual(buildReceiptResizeActions(undefined, undefined), [
      { resize: { width: MAX_RECEIPT_EDGE_PX } },
    ]);
    assert.deepEqual(buildReceiptResizeActions(1200, undefined), [
      { resize: { width: MAX_RECEIPT_EDGE_PX } },
    ]);
    assert.deepEqual(buildReceiptResizeActions(0, 2000), [
      { resize: { width: MAX_RECEIPT_EDGE_PX } },
    ]);
  });

  it('compresses portrait, landscape, small, and unknown-size images via injected manipulator', async () => {
    const calls: Array<{ uri: string; actions: unknown[]; saveOptions: unknown }> = [];
    const fakeManipulator: ImageManipulatorLike = {
      SaveFormat: { JPEG: 'jpeg' },
      manipulateAsync: async (uri, actions, saveOptions) => {
        calls.push({ uri, actions, saveOptions });
        return {
          uri: `${uri}.compressed.jpg`,
          width: 768,
          height: 1024,
          base64: 'data:image/jpeg;base64,/9j/4AAQ',
        };
      },
    };

    const portrait = await compressReceiptImage(
      { uri: 'file:///portrait.jpg', width: 1536, height: 2048 },
      { manipulator: fakeManipulator },
    );
    assert.deepEqual(calls[0].actions, [{ resize: { height: 1024 } }]);
    assert.deepEqual(calls[0].saveOptions, {
      compress: RECEIPT_JPEG_COMPRESS,
      format: 'jpeg',
      base64: true,
    });
    assert.equal(portrait.base64, '/9j/4AAQ');
    assert.equal(portrait.mimeType, 'image/jpeg');
    assert.equal(portrait.width, 768);
    assert.equal(portrait.height, 1024);

    await compressReceiptImage(
      { uri: 'file:///landscape.jpg', width: 4000, height: 3000 },
      { manipulator: fakeManipulator },
    );
    assert.deepEqual(calls[1].actions, [{ resize: { width: 1024 } }]);

    await compressReceiptImage(
      { uri: 'file:///small.jpg', width: 640, height: 480 },
      { manipulator: fakeManipulator },
    );
    assert.deepEqual(calls[2].actions, []);

    await compressReceiptImage({ uri: 'file:///unknown.jpg' }, { manipulator: fakeManipulator });
    assert.deepEqual(calls[3].actions, [{ resize: { width: 1024 } }]);
  });

  it('throws Traditional Chinese error on empty URI, empty base64, or manipulator failure', async () => {
    const emptyBase64Manipulator: ImageManipulatorLike = {
      manipulateAsync: async () => ({ uri: 'file:///x.jpg', width: 100, height: 100, base64: '' }),
    };
    const throwingManipulator: ImageManipulatorLike = {
      manipulateAsync: async () => {
        throw new Error('decode error');
      },
    };

    await assert.rejects(
      () => compressReceiptImage({ uri: '   ' }, { manipulator: emptyBase64Manipulator }),
      /圖片路徑無效/,
    );
    await assert.rejects(
      () => compressReceiptImage({ uri: 'file:///x.jpg' }, { manipulator: emptyBase64Manipulator }),
      /圖片壓縮失敗/,
    );
    await assert.rejects(
      () => compressReceiptImage({ uri: 'file:///x.jpg' }, { manipulator: throwingManipulator }),
      /圖片壓縮失敗/,
    );
  });
});
