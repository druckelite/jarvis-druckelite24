/**
 * JARVIS – Gmail-Sync-Modul für Druckelite24 Mail-Client
 * ---------------------------------------------------------
 * Passt zu server__1_.js: nutzt eure bestehende getGmailAccessToken()
 * (kein googleapis-Paket, kein oauth2Client nötig – reines fetch()
 * gegen die Gmail-REST-API, genau wie der Rest eures Servers).
 *
 * Einbindung in server__1_.js:
 *
 *   1) Ganz oben bei den anderen imports ergänzen:
 *      import { createMailRouter } from "./jarvis-mail-sync.js";
 *
 *   2) Irgendwo NACH der Definition von getGmailAccessToken()
 *      (z.B. direkt vor app.listen(...) ganz am Ende) ergänzen:
 *
 *      app.use(
 *        "/api/mail",
 *        createMailRouter({
 *          getAccessToken: getGmailAccessToken,
 *          apiKey: process.env.MAIL_API_KEY,
 *          pollIntervalMs: 8000
 *        })
 *      );
 *
 * ENV-Variable in Render ergänzen (Environment-Tab, NICHT in GitHub):
 *   MAIL_API_KEY = ein-langes-selbst-ausgedachtes-secret
 *
 * GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * existieren bei euch schon – die braucht dieses Modul nur indirekt
 * über getAccessToken(), nichts weiter zu tun.
 *
 * Kein npm install nötig – nur Node-eigenes fetch (bereits genutzt).
 */

import express from "express";

const FOLDERS = ["INBOX", "SENT", "DRAFT", "TRASH"];
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export function createMailRouter({ getAccessToken, apiKey, pollIntervalMs = 8000, itemsPerFolder = 15 }) {
  const router = express.Router();

  const cache = { INBOX: [], SENT: [], DRAFT: [], TRASH: [] };
  let labelsCache = [];
  let snoozeStore = {}; // messageId -> { until: ms, meta: { subject, from } }
  const sseClients = new Set();
  let lastError = null;

  // ---- CORS (kein cors-Paket nötig, JARVIS hat aktuell keins global) ----
  router.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ---- Auth: einfacher gemeinsamer Schlüssel ----
  router.use((req, res, next) => {
    if (!apiKey) return next(); // kein Key konfiguriert -> offen (nur für lokale Tests!)
    const provided = req.headers["x-jarvis-key"] || req.query.key;
    if (provided !== apiKey) return res.status(401).json({ error: "Ungültiger oder fehlender API-Key" });
    next();
  });

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) { try { res.write(payload); } catch (e) { /* Client weg */ } }
  }

  async function gmailFetch(path, opts = {}) {
    const token = await getAccessToken();
    const res = await fetch(GMAIL_BASE + path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers || {})
      },
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Gmail-API-Fehler ${res.status}`);
    return data;
  }

  function parseEmail(fromHeader = "") {
    const m = fromHeader.match(/<(.+)>/);
    return m ? m[1] : fromHeader;
  }

  function extractPlainText(payload) {
    if (!payload) return "";
    if (payload.mimeType === "text/plain" && payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        const t = extractPlainText(part);
        if (t) return t;
      }
    }
    return "";
  }

  function buildRawMessage({ to, subject, body, inReplyTo }) {
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
      inReplyTo ? `References: ${inReplyTo}` : null,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body
    ].filter(Boolean).join("\r\n");
    return Buffer.from(lines).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function toListItem(id, threadId, msg) {
    const headers = Object.fromEntries((msg.payload?.headers || []).map(h => [h.name, h.value]));
    return {
      id,
      threadId,
      from: (headers.From || "").replace(/<.*>/, "").trim() || headers.From || "",
      fromEmail: parseEmail(headers.From || ""),
      subject: headers.Subject || "(kein Betreff)",
      snippet: msg.snippet || "",
      date: headers.Date || "",
      unread: (msg.labelIds || []).includes("UNREAD")
    };
  }

  async function fetchByIds(ids) {
    const items = [];
    for (const id of ids) {
      const msg = await gmailFetch(`/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
      items.push(toListItem(id, msg.threadId, msg));
    }
    return items;
  }

  async function fetchFolder(labelId) {
    const list = await gmailFetch(`/messages?labelIds=${labelId}&maxResults=${itemsPerFolder}`);
    const ids = (list.messages || []).map(m => m.id);
    return fetchByIds(ids);
  }

  async function fetchByQuery(query, maxResults) {
    const list = await gmailFetch(`/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
    const ids = (list.messages || []).map(m => m.id);
    return fetchByIds(ids);
  }

  async function pollOnce() {
    try {
      for (const folder of FOLDERS) cache[folder] = await fetchFolder(folder);
      const labelsRes = await gmailFetch("/labels");
      labelsCache = labelsRes.labels || [];
      lastError = null;
      broadcast("sync", { at: Date.now() });
    } catch (e) {
      lastError = e.message;
      console.error("[jarvis-mail] Poll-Fehler:", e.message);
      broadcast("error", { message: e.message });
    }
    await checkSnoozed();
  }

  async function checkSnoozed() {
    const now = Date.now();
    for (const [id, v] of Object.entries(snoozeStore)) {
      if (v.until <= now) {
        try {
          await gmailFetch(`/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: ["INBOX"] }) });
          delete snoozeStore[id];
          broadcast("unsnoozed", { id, subject: v.meta.subject });
        } catch (e) { console.error("[jarvis-mail] Unsnooze-Fehler:", e.message); }
      }
    }
  }

  setInterval(pollOnce, pollIntervalMs);
  pollOnce();

  // ---- SSE Live-Stream ----
  router.get("/stream", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });

  router.get("/status", (req, res) => res.json({ ok: !lastError, lastError, folders: FOLDERS, snoozed: Object.keys(snoozeStore).length }));
  router.get("/list", (req, res) => res.json(cache[req.query.folder || "INBOX"] || []));
  router.get("/labels", (req, res) => res.json(labelsCache));
  router.get("/snoozed", (req, res) => res.json(snoozeStore));

  router.get("/search", async (req, res) => {
    const q = req.query.q || "";
    if (!q.trim()) return res.json([]);
    try { res.json(await fetchByQuery(q, 12)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get("/message/:id", async (req, res) => {
    try {
      const msg = await gmailFetch(`/messages/${req.params.id}?format=full`);
      const headers = Object.fromEntries((msg.payload?.headers || []).map(h => [h.name, h.value]));
      const bodyText = extractPlainText(msg.payload) || msg.snippet || "";
      res.json({
        from: (headers.From || "").replace(/<.*>/, "").trim() || headers.From,
        fromEmail: parseEmail(headers.From || ""),
        to: headers.To || "",
        subject: headers.Subject || "(kein Betreff)",
        date: headers.Date || "",
        bodyText: bodyText.slice(0, 6000)
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/send", async (req, res) => {
    const { to, subject, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: "to und body erforderlich" });
    try {
      const raw = buildRawMessage({ to, subject, body });
      await gmailFetch("/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/reply", async (req, res) => {
    const { messageId, body } = req.body;
    if (!messageId || !body) return res.status(400).json({ error: "messageId und body erforderlich" });
    try {
      const orig = await gmailFetch(`/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`);
      const h = Object.fromEntries((orig.payload?.headers || []).map(x => [x.name, x.value]));
      const to = parseEmail(h.From || "");
      const subject = (h.Subject || "").startsWith("Re:") ? h.Subject : "Re: " + (h.Subject || "");
      const raw = buildRawMessage({ to, subject, body, inReplyTo: h["Message-ID"] });
      await gmailFetch("/messages/send", { method: "POST", body: JSON.stringify({ raw, threadId: orig.threadId }) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/draft", async (req, res) => {
    const { to, subject, body } = req.body;
    try {
      const raw = buildRawMessage({ to, subject, body });
      await gmailFetch("/drafts", { method: "POST", body: JSON.stringify({ message: { raw } }) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/label", async (req, res) => {
    const { messageId, add = [], remove = [] } = req.body;
    try {
      await gmailFetch(`/messages/${messageId}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/label/create", async (req, res) => {
    const { name } = req.body;
    try {
      const r = await gmailFetch("/labels", { method: "POST", body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }) });
      res.json({ id: r.id, name: r.name });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/archive", async (req, res) => {
    try {
      await gmailFetch(`/messages/${req.body.messageId}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["INBOX"] }) });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/trash", async (req, res) => {
    try {
      await gmailFetch(`/messages/${req.body.messageId}/trash`, { method: "POST" });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post("/snooze", (req, res) => {
    const { messageId, hours, subject, from } = req.body;
    if (!messageId || !hours) return res.status(400).json({ error: "messageId und hours erforderlich" });
    snoozeStore[messageId] = { until: Date.now() + hours * 3600 * 1000, meta: { subject, from } };
    res.json({ ok: true, until: snoozeStore[messageId].until });
  });

  return router;
}
