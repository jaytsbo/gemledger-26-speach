# GemLedger-26 Serverless Gemini AI Proxy (`ai-proxy`)

Serverless edge proxy for GemLedger-26 Mobile/Web. It keeps `GEMINI_API_KEY` strictly on the server, executes the frozen Gemini model cascade (`gemini-3.5-flash-lite` -> `gemini-3.6-flash` -> `gemini-3.5-flash`), enforces an 8-second per-model timeout with exponential backoff + jitter on transient errors (`429/500/502/503/504`), and returns HTTP `503` with `{ fallbackRequired: true, reason: "503_SERVICE_UNAVAILABLE" }` when exhausted so the mobile client seamlessly falls back to its local rule engine.

## Endpoints

- `GET /health` — Health check returning `{ ok, status, service, modelsCascade, geminiConfigured, timestamp }`.
- `POST /api/bookkeep` — Parses natural language text and/or receipt image (`imageBase64`, `mimeType`) into structured Traditional Chinese bookkeeping transactions.
- `OPTIONS *` — CORS preflight support.

### Request Body (`POST /api/bookkeep`)

```json
{
  "userMessage": "午餐拉麵 280 現金",
  "imageBase64": "",
  "mimeType": "image/jpeg",
  "settings": {
    "accounts": ["現金", "永豐銀行"],
    "categories": ["食", "行", "收入"]
  },
  "currentDateStr": "2026-11-13",
  "currentTimeStr": "12:30"
}
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes (for cloud AI) | Google Gemini API key. Never exposed to the client. If missing, `/api/bookkeep` returns HTTP `503` (`fallbackRequired: true`) so the client rule engine handles parsing. |
| `ALLOWED_ORIGIN` | No | CORS `Access-Control-Allow-Origin` header value (defaults to `*`). |
| `PORT` | No | Port for the local Node HTTP dev server (defaults to `8787`). |

## Local Development

### Option 1: Local Node HTTP Server (`tsx`)

```bash
cd ai-proxy
npm install
# Set GEMINI_API_KEY in .env or shell environment
GEMINI_API_KEY=your_key_here npm run dev
```

Server starts at `http://localhost:8787` (`GET http://localhost:8787/health`, `POST http://localhost:8787/api/bookkeep`).

### Option 2: Local Cloudflare Worker Runtime (`wrangler dev`)

Create `ai-proxy/.dev.vars`:

```dotenv
GEMINI_API_KEY=your_key_here
```

Then run:

```bash
cd ai-proxy
npm run dev:worker
```

## Typecheck & Cloudflare Workers Deployment

```bash
cd ai-proxy
npm run typecheck
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

After deploying, paste the Worker URL (e.g. `https://gemledger-ai-proxy.<subdomain>.workers.dev`) into the GemLedger-26 **Settings -> AI Proxy Endpoint** field.
