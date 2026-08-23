JARVIS V12 CLEAN REBUILD
Diese Version wurde als Single-Screen-System neu aufgebaut.
Beibehaltene Connectoren
OpenAI Realtime
OpenAI Responses / Web Search
Shopify Admin GraphQL
Gmail
Superchat / WhatsApp
Open-Meteo
Shopify-Metafields für Notizen/Erinnerungen
Druckelite Mail Sync Router
Voice
Direktes OpenAI Realtime Audio über WebRTC.
Kein ElevenLabs in der Live-Sprachkette.
Mikrofon bleibt während der gesamten aktiven Session offen.
Realtime semantic_vad = medium (über OPENAI_VAD_EAGERNESS änderbar).
interrupt_response = true für Barge-in.
Standardstimme = cedar.
Smalltalk/Hörtest darf keine Business-Tools aufrufen.
Soundtrack
`Intro.mp3` wird weiterhin verwendet.
Die Datei selbst wird NICHT ersetzt.
Neue Logik:
Startlautstärke 5,5 %
sobald JARVIS spricht: Ducking auf ca. 0,6 %
danach weiches Fade-out
Dateien ersetzen
index.html
app.js
styles.css
server.js
jarvis-mail-sync.js
launcher.html
package.json
`Intro.mp3` behalten.
Render Environment Variablen
Bestehende Variablen NICHT löschen.
Wichtig:
OPENAI_API_KEY
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=cedar
OPENAI_VAD_EAGERNESS=medium
OPENAI_NOISE_REDUCTION=far_field
SHOPIFY_STORE_DOMAIN
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_API_VERSION
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
SUPERCHAT_API_KEY
SUPERCHAT_CHANNEL_ID (optional)
MAIL_API_KEY
Optional für WhatsApp Voice:
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=cedar
Testreihenfolge
Render-Deploy erfolgreich.
`/health` öffnen.
JARVIS per Klick starten.
Sagen: "Jarvis, hörst du mich?"
Erwartet: direkte kurze Antwort OHNE Tool.
Kurze Pause beim Sprechen testen:
"Jarvis, ähm ... sag mir bitte ... wie spät ..."
JARVIS soll nicht zu früh abschneiden.
Während JARVIS spricht dazwischenreden.
Shopify testen.
Gmail öffnen → Mail lesen → JARVIS antworten → Entwurf → senden.
WhatsApp-Liste testen.
Briefing testen.
