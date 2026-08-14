# JARVIS · Druckelite24

Voice-Grundsystem für Mattls persönlichen Business-Assistenten.

## Aktueller Stand

- OpenAI Realtime Speech-to-Speech über WebRTC
- permanenter OpenAI API-Key bleibt serverseitig
- JARVIS-Persönlichkeit
- vorbereitete Live-Tools für Shopify, Gmail und Google Kalender
- iPhone-taugliche Weboberfläche
- vorbereitet für spätere Meta-Ads-, WhatsApp- und Telefonie-Anbindung

## Render

Start command:

```bash
npm start
```

Pflichtvariable:

```text
OPENAI_API_KEY
```

Später für Shopify:

```text
SHOPIFY_STORE_DOMAIN
SHOPIFY_ADMIN_ACCESS_TOKEN
SHOPIFY_API_VERSION=2026-07
```

Später für Google:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
```

## Sicherheit

Keine Secrets ins GitHub-Repository schreiben. Zugangsdaten ausschließlich als Environment Variables im Hosting hinterlegen.
