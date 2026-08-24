# Agent rules — JARVIS Druckelite24

Read `docs/IMPLEMENTATION_SPEC.md` before making changes.

## Hard rules
- Phase 1 is READ-ONLY. Never write to Shopify.
- Secrets live only in Render env vars, read only in `server/config.js`.
  Never send a key to the browser. Never commit `.env`.
- No new dependencies without asking.
- Do not implement anything in Section 10 of the spec (Gmail, WhatsApp,
  ElevenLabs, Meta Ads, telephony, write actions, local desktop app, etc.).
- Latency is the priority. Reject changes that add round trips to the voice path.

## Before writing third-party API code
The OpenAI Realtime and Shopify Admin APIs change often. Fetch current docs
first. Do not rely on remembered endpoint shapes. If docs conflict with the
spec, stop and report.

## Architecture reminders
- Audio travels browser <-> OpenAI directly over WebRTC. The backend NEVER relays audio.
- Ephemeral token endpoint: POST /api/realtime/session -> returns client_secret.value
- OpenAI session endpoint (verified 2026-08): POST https://api.openai.com/v1/realtime/sessions
- Shopify endpoint: https://{domain}/admin/api/{version}/graphql.json

## Conventions
- Node 20, ES modules, 2-space indent.
- One peer connection, one active response — enforced by state machine in session.ts.
- All user-facing text in German. All code, comments, commits in English.
- Conventional Commits (feat:, fix:, chore:, docs:).

## File ownership
- `server/config.js` — only place that reads process.env
- `server/routes/realtime.js` — only place that touches OPENAI_API_KEY
- `server/integrations/shopify/` — only place that touches SHOPIFY_ADMIN_TOKEN
- `web/src/styles/tokens.css` — only place that defines hex colour values

## Done means
The relevant acceptance criteria in Section 11 pass on the live deployment,
not just locally.
