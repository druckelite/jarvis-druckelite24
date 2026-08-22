/**
 * JARVIS – Gmail-Sync-Modul für Druckelite24 Mail-Client
 * ---------------------------------------------------------
 * Läuft dauerhaft auf dem bestehenden JARVIS-Server (Render).
 * Pollt Gmail im Hintergrund, hält einen Cache und pusht Änderungen
 * per Server-Sent-Events an verbundene Browser-Clients.
 *
 * VORAUSSETZUNG: oauth2Client muss mit einem Refresh-Token laufen,
 * das den Scope "https://www.googleapis.com/auth/gmail.modify" hat
 * (readonly + send reicht NICHT für Verschieben/Archivieren/Löschen/Snooze).
 *
 * Einbindung in eure bestehende app.js / index.js:
 *
 *   const { createMailRouter } = require('./jarvis-mail-sync');
 *   app.use('/api/mail', createMailRouter({
 *     oauth2Client,                       // bereits konfigurierter Google OAuth2Client
 *     apiKey: process.env.MAIL_API_KEY,   // frei wählbarer geheimer Schlüssel, s.u.
 *     pollIntervalMs: 8000
 *   }));
 *
 * ENV-Variable ergänzen: MAIL_API_KEY=ein-langes-zufaelliges-secret
 * (im Frontend unter Einstellungen > "JARVIS API-Key" denselben Wert eintragen)
 *
 * npm-Paket ergänzen: npm install googleapis
 */

const express = require('express');
const { google } = require('googleapis');

const FOLDERS = ['INBOX', 'SENT', 'DRAFT', 'TRASH'];

function createMailRouter({ oauth2Client, apiKey, pollIntervalMs = 8000, itemsPerFolder = 15 }) {
  const router = express.Router();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const cache = { INBOX: [], SENT: [], DRAFT: [], TRASH: [] };
  let labelsCache = [];
  let snoozeStore = {}; // messageId -> { until: ms, meta: { subject, from } }
  const sseClients = new Set();
  let lastError = null;

  // ---- Auth-Middleware: einfacher gemeinsamer Schlüssel ----
  router.use((req, res, next) => {
    if (!apiKey) return next(); // kein Key konfiguriert -> offen (nur für lokale Tests!)
    const provided = req.headers['x-jarvis-key'] || req.query.key;
    if (provided !== apiKey) return res.status(401).json({ error: 'Ungültiger oder fehlender API-Key' });
    next();
  });

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) { try { res.write(payload); } catch (e) { /* client weg */ } }
  }

  function parseEmail(fromHeader = '') {
    const m = fromHeader.match(/<(.+)>/);
    return m ? m[1] : fromHeader;
  }

  function extractPlainText(payload) {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        const t = extractPlainText(part);
        if (t) return t;
      }
    }
    return '';
  }

  function buildRawMessage({ to, subject, body, inReplyTo }) {
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
      inReplyTo ? `References: ${inReplyTo}` : null,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body
    ].filter(Boolean).join('\r\n');
    return Buffer.from(lines).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function fetchByQuery(query, maxResults) {
    const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
    const ids = (list.data.messages || []).map(m => m.id);
    const items = [];
    for (const id of ids) {
      const msg = await gmail.users.messages.get({
        userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date']
      });
      const headers = Object.fromEntries((msg.data.payload.headers || []).map(h => [h.name, h.value]));
      items.push({
        id,
        threadId: msg.data.threadId,
        from: (headers.From || '').replace(/<.*>/, '').trim() || headers.From || '',
        fromEmail: parseEmail(headers.From || ''),
        subject: headers.Subject || '(kein Betreff)',
        snippet: msg.data.snippet || '',
        date: headers.Date || '',
        unread: (msg.data.labelIds || []).includes('UNREAD')
      });
    }
    return items;
  }

  async function fetchFolder(labelId) {
    const list = await gmail.users.messages.list({ userId: 'me', labelIds: [labelId], maxResults: itemsPerFolder });
    const ids = (list.data.messages || []).map(m => m.id);
    const items = [];
    for (const id of ids) {
      const msg = await gmail.users.messages.get({
        userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date']
      });
      const headers = Object.fromEntries((msg.data.payload.headers || []).map(h => [h.name, h.value]));
      items.push({
        id,
        threadId: msg.data.threadId,
        from: (headers.From || '').replace(/<.*>/, '').trim() || headers.From || '',
        fromEmail: parseEmail(headers.From || ''),
        subject: headers.Subject || '(kein Betreff)',
        snippet: msg.data.snippet || '',
        date: headers.Date || '',
        unread: (msg.data.labelIds || []).includes('UNREAD')
      });
    }
    return items;
  }

  async function pollOnce() {
    try {
      for (const folder of FOLDERS) cache[folder] = await fetchFolder(folder);
      const labelsRes = await gmail.users.labels.list({ userId: 'me' });
      labelsCache = labelsRes.data.labels || [];
      lastError = null;
      broadcast('sync', { at: Date.now() });
    } catch (e) {
      lastError = e.message;
      console.error('[jarvis-mail] Poll-Fehler:', e.message);
      broadcast('error', { message: e.message });
    }
    await checkSnoozed();
  }

  async function checkSnoozed() {
    const now = Date.now();
    for (const [id, v] of Object.entries(snoozeStore)) {
      if (v.until <= now) {
        try {
          await gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: ['INBOX'] } });
          delete snoozeStore[id];
          broadcast('unsnoozed', { id, subject: v.meta.subject });
        } catch (e) { console.error('[jarvis-mail] Unsnooze-Fehler:', e.message); }
      }
    }
  }

  setInterval(pollOnce, pollIntervalMs);
  pollOnce();

  // ---- SSE Live-Stream ----
  router.get('/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  router.get('/status', (req, res) => res.json({ ok: !lastError, lastError, folders: FOLDERS, snoozed: Object.keys(snoozeStore).length }));

  router.get('/list', (req, res) => {
    const folder = req.query.folder || 'INBOX';
    res.json(cache[folder] || []);
  });

  router.get('/labels', (req, res) => res.json(labelsCache));
  router.get('/snoozed', (req, res) => res.json(snoozeStore));

  router.get('/search', async (req, res) => {
    const q = req.query.q || '';
    if (!q.trim()) return res.json([]);
    try {
      const items = await fetchByQuery(q, 12);
      res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/message/:id', async (req, res) => {
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'full' });
      const headers = Object.fromEntries((msg.data.payload.headers || []).map(h => [h.name, h.value]));
      const bodyText = extractPlainText(msg.data.payload) || msg.data.snippet || '';
      res.json({
        from: (headers.From || '').replace(/<.*>/, '').trim() || headers.From,
        fromEmail: parseEmail(headers.From || ''),
        to: headers.To || '',
        subject: headers.Subject || '(kein Betreff)',
        date: headers.Date || '',
        bodyText: bodyText.slice(0, 6000)
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/send', async (req, res) => {
    const { to, subject, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'to und body erforderlich' });
    try {
      const raw = buildRawMessage({ to, subject, body });
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/reply', async (req, res) => {
    const { messageId, body } = req.body;
    if (!messageId || !body) return res.status(400).json({ error: 'messageId und body erforderlich' });
    try {
      const orig = await gmail.users.messages.get({
        userId: 'me', id: messageId, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Message-ID']
      });
      const h = Object.fromEntries((orig.data.payload.headers || []).map(x => [x.name, x.value]));
      const to = parseEmail(h.From || '');
      const subject = (h.Subject || '').startsWith('Re:') ? h.Subject : 'Re: ' + (h.Subject || '');
      const raw = buildRawMessage({ to, subject, body, inReplyTo: h['Message-ID'] });
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: orig.data.threadId } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/draft', async (req, res) => {
    const { to, subject, body } = req.body;
    try {
      const raw = buildRawMessage({ to, subject, body });
      await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/label', async (req, res) => {
    const { messageId, add = [], remove = [] } = req.body;
    try {
      await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds: add, removeLabelIds: remove } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/label/create', async (req, res) => {
    const { name } = req.body;
    try {
      const r = await gmail.users.labels.create({ userId: 'me', requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
      res.json({ id: r.data.id, name: r.data.name });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/archive', async (req, res) => {
    try {
      await gmail.users.messages.modify({ userId: 'me', id: req.body.messageId, requestBody: { removeLabelIds: ['INBOX'] } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/trash', async (req, res) => {
    try {
      await gmail.users.messages.trash({ userId: 'me', id: req.body.messageId });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/snooze', (req, res) => {
    const { messageId, hours, subject, from } = req.body;
    if (!messageId || !hours) return res.status(400).json({ error: 'messageId und hours erforderlich' });
    snoozeStore[messageId] = { until: Date.now() + hours * 3600 * 1000, meta: { subject, from } };
    res.json({ ok: true, until: snoozeStore[messageId].until });
  });

  return router;
}

module.exports = { createMailRouter };
