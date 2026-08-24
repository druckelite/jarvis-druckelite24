# JARVIS · Druckelite24

Voice-controlled business assistant for Druckelite24 print shop.
German-only, speech-to-speech via OpenAI Realtime API, live Shopify data.

## Prerequisites

- Node.js 20 LTS
- An OpenAI API key with Realtime API access
- A Shopify Custom App with scopes: `read_orders`, `read_products`, `read_customers`
- (Production) Render account — Frankfurt region, paid instance (not free tier)

## Local setup

```bash
# 1. Clone
git clone https://github.com/druckelite/jarvis-druckelite24
cd jarvis-druckelite24

# 2. Install dependencies
npm install

# 3. Create your env file
cp .env.example .env
# Edit .env — fill in OPENAI_API_KEY, SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_TOKEN

# 4. Build the frontend
npm run build

# 5. Start the server
npm start
# -> http://localhost:10000
```

## Development (hot-reload)

```bash
# Terminal 1 — backend
node server/index.js

# Terminal 2 — frontend dev server (proxies /api to port 10000)
npx vite web
# -> http://localhost:5173
```

## Environment variables

See `.env.example` for the full list with descriptions.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | ? | — | Server-side only, never sent to browser |
| `OPENAI_REALTIME_MODEL` | ? | `gpt-realtime-2.1` | Speech-to-speech model |
| `OPENAI_VOICE` | ? | `alloy` | Native OpenAI voice |
| `SHOPIFY_STORE_DOMAIN` | ? | — | e.g. `druckelite24.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | ? | — | Custom app Admin API token |
| `SHOPIFY_API_VERSION` | ? | `2025-07` | Shopify GraphQL API version |
| `JARVIS_LANGUAGE` | — | `de-DE` | Locks language |
| `JARVIS_WAKE_WORD` | — | `hey jarvis` | Wake word (lowercased) |
| `JARVIS_VAD_SILENCE_MS` | — | `600` | Turn detection silence threshold |
| `JARVIS_CACHE_TTL_MS` | — | `60000` | Shopify cache TTL in ms |
| `PORT` | — | `10000` | Render injects this automatically |
| `NODE_ENV` | — | `development` | `production` on Render |
| `LOG_LEVEL` | — | `info` | pino log level |

## Render deployment

1. Connect the GitHub repo in Render dashboard
2. **Region: Frankfurt (EU Central)** — critical for latency
3. **Plan: Paid (Starter or above)** — free tier cold-starts add 10–30 s delay
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Add all env vars from `.env.example` in the Render environment settings

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Liveness check: `{ status, uptime }` |
| `/api/status` | GET | Integration health: OpenAI + Shopify |
| `/api/realtime/session` | POST | Mint ephemeral OpenAI token for WebRTC |
| `/api/shopify/orders/recent` | GET | Last N orders |
| `/api/shopify/revenue/daily` | GET | Daily revenue last N days |
| `/api/shopify/revenue/by-product` | GET | Top products by revenue |

## Voice — how it works

1. Click the orb (or tap-to-talk on iOS) to start JARVIS
2. Server mints a short-lived ephemeral token from OpenAI
3. Browser connects directly to OpenAI via WebRTC — **audio never transits the server**
4. Say "Hey Jarvis" to wake it (desktop), or use the tap button (iOS/iPad)
5. Ask in German: e.g. "Wie ist der Umsatz heute?" / "Was sind die letzten Bestellungen?"

## Architecture

```
Browser --(WebRTC audio)--? OpenAI Realtime API
   ¦                              ¦
   ¦ POST /api/realtime/session   ¦ (ephemeral token)
   ?                              ¦
Node Backend ?--------------------+
   ¦
   +- GET /api/shopify/* --? Shopify Admin GraphQL
   +- pino structured logs
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Slow responses (>2 s) | Render free tier cold start | Upgrade to paid plan |
| Slow responses (>2 s) | Wrong Render region | Change to Frankfurt (EU Central) |
| "OPENAI_API_KEY is required" | Missing env var | Check .env / Render env settings |
| Shopify panel shows error | Invalid token or wrong domain | Verify SHOPIFY_ADMIN_TOKEN and SHOPIFY_STORE_DOMAIN |
| No audio on iOS | Mic not yet granted | Tap the tap-to-talk button first |
| Duplicate audio | Multiple sessions open | Refresh the page; only one tab should run JARVIS |

## Notes for client

- Brand colours (`--brand-magenta`) are placeholders (`#E6007E`) — confirm exact hex with designer
- Single-currency assumption: EUR. If multi-currency is needed, report before Stage 2
- `read_orders` scope gives access to approximately the last 60 days.
  For longer order history, request `read_all_orders` scope from Shopify
