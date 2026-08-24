/* =========================================================
   JARVIS V12.5 · GMAIL / MAIL STUDIO ROUTER

   - liest ALLE Mails im Posteingang, unabhängig vom UNREAD-Status
   - echte Gmail-Entwürfe
   - Reply-Drafts im richtigen Thread
   - Suche / Labels / Archiv / Papierkorb / Anhänge
   - SSE-Sync mit serverseitigem Polling
   - persistentes lokales Snooze über JARVIS-Storage Hooks
   ========================================================= */

import express from "express";
import crypto from "node:crypto";

function timeoutSignal(ms) {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}

function clean(value) {
  return String(value ?? "").trim();
}

function decodeBase64Url(value) {
  if (!value) return Buffer.alloc(0);
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function encodeBase64Url(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ""), "utf8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function header(headers, name) {
  return (headers || []).find(
    h => clean(h?.name).toLowerCase() === clean(name).toLowerCase()
  )?.value || "";
}

function extractEmailAddress(value) {
  const text = clean(value);
  const angle = text.match(/<([^>]+)>/);
  return clean(angle?.[1] || text);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectParts(part, result) {
  if (!part) return;

  const mime = clean(part.mimeType).toLowerCase();
  const filename = clean(part.filename);
  const body = part.body || {};

  // Eingebettete Signatur-/Logo-Bilder (Outlook: "image001.png" etc.) sind KEINE
  // echten Anhänge — sie werden per Content-ID im HTML-Body referenziert (cid:...)
  // oder explizit als "inline" markiert. Ohne diesen Filter verschwinden echte
  // Kunden-Anhänge (PDF, JPG von Bestellungen) optisch zwischen Signatur-Grafiken.
  const disposition = header(part.headers, "Content-Disposition");
  const contentId = header(part.headers, "Content-ID") || header(part.headers, "Content-Id");
  const isInlineAsset = /inline/i.test(disposition) || !!contentId;

  if (body.data) {
    const buffer = decodeBase64Url(body.data);

    if (mime === "text/plain") {
      result.plain.push(buffer.toString("utf8"));
    } else if (mime === "text/html") {
      result.html.push(buffer.toString("utf8"));
    } else if (filename && !isInlineAsset) {
      result.attachments.push({
        filename,
        mimeType: mime || "application/octet-stream",
        size: body.size || buffer.length,
        inlineDataBase64: buffer.toString("base64"),
        attachmentId: body.attachmentId || null
      });
    }
  } else if (filename && body.attachmentId && !isInlineAsset) {
    result.attachments.push({
      filename,
      mimeType: mime || "application/octet-stream",
      size: body.size || 0,
      attachmentId: body.attachmentId
    });
  }

  for (const child of part.parts || []) {
    collectParts(child, result);
  }
}

// Trennt die eigentliche Kundennachricht vom zitierten Verlauf darunter
// (">"-Zitate, "Am ... schrieb ...:", Outlook-Block "Von:/Gesendet:/Betreff:").
// Macht die Vorschau übersichtlich, ohne Infos zu verlieren — der Verlauf bleibt
// als separates Feld erhalten und wird im Mail Studio nur eingeklappt angezeigt.
function splitQuotedContent(text) {
  const original = String(text || "");
  const lines = original.split("\n");

  const strongMarkers = [
    /^Am .+ schrieb .+:$/i,
    /^On .+ wrote:$/i,
    /^-{2,}\s*Urspr(ü|u)ngliche Nachricht\s*-{2,}/i,
    /^-{2,}\s*Original Message\s*-{2,}/i
  ];

  let cutIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith(">")) { cutIndex = i; break; }
    if (strongMarkers.some(re => re.test(line))) { cutIndex = i; break; }

    // Outlook-Weiterleitungs-/Antwortblock: "Von:" nur als Trenner werten, wenn
    // in den nächsten Zeilen auch "Betreff:"/"Subject:" folgt (sonst zu unsicher).
    if (/^(Von|From):\s/i.test(line)) {
      const windowLines = lines.slice(i, i + 6).map(l => l.trim());
      if (windowLines.some(l => /^(Betreff|Subject):\s/i.test(l))) { cutIndex = i; break; }
    }
  }

  if (cutIndex <= 0) return { main: original.trim(), quoted: "" };

  const main = lines.slice(0, cutIndex).join("\n").trim();
  const quoted = lines.slice(cutIndex).join("\n").trim();

  if (!main) return { main: original.trim(), quoted: "" };

  return { main, quoted };
}

function ensureReplySubject(subject) {
  const value = clean(subject);
  return /^re:/i.test(value) ? value : `Re: ${value || "Ihre Nachricht"}`;
}

function folderQuery(folder) {
  switch (clean(folder).toUpperCase()) {
    case "SENT": return "in:sent";
    case "DRAFT": return "in:drafts";
    case "TRASH": return "in:trash";
    case "SPAM": return "in:spam";
    case "INBOX":
    default:
      // ABSICHTLICH KEIN is:unread
      return "in:inbox";
  }
}

/* ---------- Anhänge: MIME-Aufbau für Gmail-Drafts ---------- */

const MAX_ATTACHMENT_COUNT = 10;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024; // Gmail-Limit pro Nachricht ~25 MB

// Betreffzeilen mit Umlauten (z. B. "Re: Angebot für Müller GmbH") müssen als
// MIME encoded-word kodiert werden, sonst zerlegt Gmail/andere Clients sie falsch.
function encodeMimeHeaderValue(value) {
  const str = clean(value);
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  return "=?UTF-8?B?" + Buffer.from(str, "utf8").toString("base64") + "?=";
}

// ASCII-Fallback-Dateiname für ältere Mail-Clients, die filename* nicht lesen.
function asciiFallbackFilename(name) {
  const base = clean(name) || "anhang";
  return base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "'");
}

// Content-Disposition mit RFC-2231-Variante (filename*) für korrekte Umlaute
// (ä/ö/ü/ß in Dateinamen von Kundenangeboten, Techpacks etc.), plus ASCII-Fallback.
function contentDispositionHeader(filename) {
  const original = clean(filename) || "anhang";
  const asciiName = asciiFallbackFilename(original);
  const encoded = encodeURIComponent(original).replace(/'/g, "%27");
  return `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

// MIME verlangt Base64-Inhalte in Zeilen von max. 76 Zeichen.
function wrapBase64(base64) {
  const compact = String(base64 || "").replace(/\s+/g, "");
  const lines = [];
  for (let i = 0; i < compact.length; i += 76) lines.push(compact.slice(i, i + 76));
  return lines.join("\r\n");
}

// Prüft/normalisiert die vom Mail Studio geschickten Anhänge (base64, ohne data:-Prefix).
function sanitizeAttachments(list) {
  if (!Array.isArray(list) || !list.length) return [];

  if (list.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`Zu viele Anhänge (max. ${MAX_ATTACHMENT_COUNT}).`);
  }

  let totalBytes = 0;
  const result = list.map((item, idx) => {
    const filename = clean(item?.filename) || `anhang-${idx + 1}`;
    const mimeType = clean(item?.mimeType) || "application/octet-stream";
    const data = String(item?.data || "").replace(/\s+/g, "");

    if (!data) throw new Error(`Anhang "${filename}" hat keinen Inhalt.`);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      throw new Error(`Anhang "${filename}" ist kein gültiges Base64.`);
    }

    totalBytes += Math.floor((data.length * 3) / 4);
    return { filename, mimeType, data };
  });

  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error("Anhänge zusammen zu groß (Gmail-Limit liegt bei ca. 25 MB pro Mail).");
  }

  return result;
}

// Baut die rohe RFC-822-Nachricht. Ohne Anhänge: einfache text/plain-Mail wie bisher.
// Mit Anhängen: multipart/mixed mit Text-Part + je einem base64-kodierten Attachment-Part.
function buildRawMessage({ to, subject, body, attachments = [], inReplyTo, references }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeaderValue(subject)}`,
    "MIME-Version: 1.0"
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${clean(`${references || ""} ${inReplyTo}`)}`);
  }

  if (!attachments.length) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push("Content-Transfer-Encoding: 8bit");
    return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8");
  }

  const boundary = "de24_" + crypto.randomBytes(12).toString("hex");
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const bodyPart =
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset="UTF-8"\r\n' +
    "Content-Transfer-Encoding: 8bit\r\n\r\n" +
    `${body}\r\n`;

  const attachmentParts = attachments.map(att =>
    `--${boundary}\r\n` +
    `Content-Type: ${att.mimeType}; name="${asciiFallbackFilename(att.filename)}"\r\n` +
    `${contentDispositionHeader(att.filename)}\r\n` +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    `${wrapBase64(att.data)}\r\n`
  );

  const closing = `--${boundary}--`;

  return Buffer.concat([
    Buffer.from(`${headers.join("\r\n")}\r\n\r\n`, "utf8"),
    Buffer.from([bodyPart, ...attachmentParts, closing].join("\r\n"), "utf8")
  ]);
}

export function createMailRouter({
  getAccessToken,
  apiKey = "",
  pollIntervalMs = 8000,
  openaiApiKey = "",
  openaiModel = "gpt-5.6",
  readStore = null,
  writeStore = null
}) {
  const router = express.Router();
  const sseClients = new Set();
  let lastInboxFingerprint = "";
  let pollTimer = null;

  function cors(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  }

  function auth(req, res, next) {
    if (!apiKey) return next();

    const provided =
      req.headers["x-jarvis-key"] ||
      req.query?.key ||
      "";

    if (provided !== apiKey) {
      return res.status(401).json({
        ok: false,
        error: "Ungültiger oder fehlender API-Key"
      });
    }

    next();
  }

  router.use(cors);
  router.use(auth);

  async function gmail(path, options = {}) {
    const token = await getAccessToken();
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {})
        },
        signal: timeoutSignal(options.timeoutMs || 15000)
      }
    );

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        `Gmail Fehler ${response.status}`
      );
    }

    return data;
  }

  async function listRefs(q, maxResults = 50) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", String(Math.max(1, Math.min(100, maxResults))));

    const token = await getAccessToken();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: timeoutSignal(15000)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || "Gmail-Liste konnte nicht geladen werden.");
    }

    return data.messages || [];
  }

  async function getMetadata(id) {
    const data = await gmail(
      `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
      {}
    );

    const headers = data.payload?.headers || [];

    return {
      id: data.id,
      threadId: data.threadId || null,
      from: header(headers, "From") || "unbekannt",
      fromEmail: extractEmailAddress(header(headers, "From")),
      to: header(headers, "To") || "",
      subject: header(headers, "Subject") || "(kein Betreff)",
      date: header(headers, "Date") || (data.internalDate ? new Date(Number(data.internalDate)).toISOString() : null),
      internalDate: data.internalDate || null,
      snippet: data.snippet || "",
      unread: Array.isArray(data.labelIds) && data.labelIds.includes("UNREAD"),
      labelIds: data.labelIds || []
    };
  }

  async function getFullMessage(id) {
    const data = await gmail(`/messages/${encodeURIComponent(id)}?format=full`);
    const headers = data.payload?.headers || [];
    const parts = { plain: [], html: [], attachments: [] };

    collectParts(data.payload, parts);

    let bodyText = parts.plain.filter(Boolean).join("\n\n").trim();

    if (!bodyText && parts.html.length) {
      bodyText = stripHtml(parts.html.join("\n\n"));
    }

    if (!bodyText) {
      bodyText = clean(data.snippet);
    }

    const { main, quoted } = splitQuotedContent(bodyText);

    return {
      id: data.id,
      threadId: data.threadId || null,
      from: header(headers, "From") || "unbekannt",
      fromEmail: extractEmailAddress(header(headers, "From")),
      replyTo: header(headers, "Reply-To") || "",
      to: header(headers, "To") || "",
      subject: header(headers, "Subject") || "(kein Betreff)",
      date: header(headers, "Date") || null,
      messageIdHeader: header(headers, "Message-ID") || header(headers, "Message-Id") || "",
      references: header(headers, "References") || "",
      snippet: data.snippet || "",
      unread: Array.isArray(data.labelIds) && data.labelIds.includes("UNREAD"),
      labelIds: data.labelIds || [],
      bodyText: main.slice(0, 50000),
      quotedText: quoted.slice(0, 20000),
      attachments: parts.attachments
    };
  }

  async function createRawDraft({ to, subject, body, threadId, inReplyTo, references, attachments = [] }) {
    const message = buildRawMessage({ to, subject, body, attachments, inReplyTo, references });
    const raw = encodeBase64Url(message);

    const payload = {
      message: {
        raw,
        ...(threadId ? { threadId } : {})
      }
    };

    const draft = await gmail("/drafts", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    return {
      draftId: draft.id,
      messageId: draft.message?.id || null,
      threadId: draft.message?.threadId || threadId || null,
      to,
      subject,
      body,
      attachmentCount: attachments.length,
      createdAt: new Date().toISOString(),
      sent: false
    };
  }

  async function createReplyDraft(messageId, body, attachments = []) {
    const original = await getFullMessage(messageId);
    const to = extractEmailAddress(original.replyTo || original.from);

    if (!to) throw new Error("Empfänger der Antwort konnte nicht ermittelt werden.");

    return createRawDraft({
      to,
      subject: ensureReplySubject(original.subject),
      body: clean(body),
      threadId: original.threadId,
      inReplyTo: original.messageIdHeader,
      references: original.references,
      attachments
    });
  }

  async function listDrafts(limit = 30) {
    const data = await gmail(`/drafts?maxResults=${Math.max(1, Math.min(100, Number(limit) || 30))}`);
    const drafts = [];

    for (const ref of data.drafts || []) {
      try {
        const draft = await gmail(`/drafts/${encodeURIComponent(ref.id)}?format=metadata`);
        const msg = draft.message || {};
        const headers = msg.payload?.headers || [];

        drafts.push({
          draftId: draft.id,
          messageId: msg.id || null,
          threadId: msg.threadId || null,
          to: header(headers, "To") || "",
          subject: header(headers, "Subject") || "(kein Betreff)",
          date: header(headers, "Date") || null,
          snippet: msg.snippet || ""
        });
      } catch {}
    }

    return drafts;
  }

  async function getSnoozed() {
    if (typeof readStore !== "function") return {};
    try {
      const value = await readStore("mail_snoozed");
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {}
    return {};
  }

  async function setSnoozed(value) {
    if (typeof writeStore !== "function") return;
    await writeStore("mail_snoozed", value);
  }

  async function unsnoozeDue() {
    const snoozed = await getSnoozed();
    const now = Date.now();
    let changed = false;

    for (const [id, entry] of Object.entries(snoozed)) {
      if (new Date(entry.until).getTime() <= now) {
        try {
          await gmail(`/messages/${encodeURIComponent(id)}/modify`, {
            method: "POST",
            body: JSON.stringify({
              addLabelIds: ["INBOX"],
              removeLabelIds: []
            })
          });
          emit("unsnoozed", {
            messageId: id,
            subject: entry.meta?.subject || ""
          });
        } catch {}

        delete snoozed[id];
        changed = true;
      }
    }

    if (changed) await setSnoozed(snoozed);
  }

  function emit(event, payload) {
    const text = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
    for (const client of [...sseClients]) {
      try { client.write(text); } catch { sseClients.delete(client); }
    }
  }

  async function pollInbox() {
    try {
      await unsnoozeDue();
      const refs = await listRefs("in:inbox", 20);
      const fingerprint = refs.map(x => x.id).join("|");

      if (lastInboxFingerprint && fingerprint !== lastInboxFingerprint) {
        emit("sync", { changed: true, at: new Date().toISOString() });
      }

      lastInboxFingerprint = fingerprint;
    } catch (error) {
      console.warn("[MAIL ROUTER POLL]", error.message);
    }
  }

  function ensurePoller() {
    if (pollTimer) return;
    pollTimer = setInterval(pollInbox, Math.max(5000, Number(pollIntervalMs) || 8000));
    pollTimer.unref?.();
    pollInbox();
  }

  router.get("/status", async (req, res) => {
    try {
      const profile = await gmail("/profile");
      res.json({ ok: true, emailAddress: profile.emailAddress || "" });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  router.get("/list", async (req, res) => {
    try {
      const q = folderQuery(req.query.folder);
      const refs = await listRefs(q, 50);
      const messages = [];

      for (const ref of refs) {
        try { messages.push(await getMetadata(ref.id)); } catch {}
      }

      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/message/:id", async (req, res) => {
    try {
      res.json(await getFullMessage(req.params.id));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/attachment/:messageId/:attachmentId", async (req, res) => {
    try {
      const data = await gmail(
        `/messages/${encodeURIComponent(req.params.messageId)}/attachments/${encodeURIComponent(req.params.attachmentId)}`
      );

      res.json({
        dataBase64: decodeBase64Url(data.data || "").toString("base64"),
        size: data.size || 0
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/search", async (req, res) => {
    try {
      const q = clean(req.query.q);
      if (!q) return res.json([]);

      // Suche absichtlich in ALLEN Mails, nicht nur unread.
      const refs = await listRefs(q, 50);
      const messages = [];

      for (const ref of refs) {
        try { messages.push(await getMetadata(ref.id)); } catch {}
      }

      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/labels", async (req, res) => {
    try {
      const data = await gmail("/labels");
      res.json(data.labels || []);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/label/create", async (req, res) => {
    try {
      const name = clean(req.body?.name);
      if (!name) return res.status(400).json({ error: "Label-Name fehlt." });

      const label = await gmail("/labels", {
        method: "POST",
        body: JSON.stringify({
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show"
        })
      });

      res.json(label);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/label", async (req, res) => {
    try {
      const id = clean(req.body?.messageId);
      if (!id) return res.status(400).json({ error: "messageId fehlt." });

      const result = await gmail(`/messages/${encodeURIComponent(id)}/modify`, {
        method: "POST",
        body: JSON.stringify({
          addLabelIds: Array.isArray(req.body?.add) ? req.body.add : [],
          removeLabelIds: Array.isArray(req.body?.remove) ? req.body.remove : []
        })
      });

      res.json(result);
      emit("sync", { changed: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/archive", async (req, res) => {
    try {
      const id = clean(req.body?.messageId);
      const result = await gmail(`/messages/${encodeURIComponent(id)}/modify`, {
        method: "POST",
        body: JSON.stringify({ removeLabelIds: ["INBOX"] })
      });
      res.json(result);
      emit("sync", { changed: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/mark-unread", async (req, res) => {
    try {
      const id = clean(req.body?.messageId);
      const result = await gmail(`/messages/${encodeURIComponent(id)}/modify`, {
        method: "POST",
        body: JSON.stringify({ addLabelIds: ["UNREAD"] })
      });
      res.json(result);
      emit("sync", { changed: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/trash", async (req, res) => {
    try {
      const id = clean(req.body?.messageId);
      const result = await gmail(`/messages/${encodeURIComponent(id)}/trash`, {
        method: "POST",
        body: JSON.stringify({})
      });
      res.json(result);
      emit("sync", { changed: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/snooze", async (req, res) => {
    try {
      const id = clean(req.body?.messageId);
      const hours = Math.max(0.1, Number(req.body?.hours) || 24);

      if (!id) return res.status(400).json({ error: "messageId fehlt." });

      const snoozed = await getSnoozed();

      snoozed[id] = {
        until: new Date(Date.now() + hours * 3600000).toISOString(),
        meta: {
          subject: clean(req.body?.subject),
          from: clean(req.body?.from)
        }
      };

      await setSnoozed(snoozed);

      await gmail(`/messages/${encodeURIComponent(id)}/modify`, {
        method: "POST",
        body: JSON.stringify({ removeLabelIds: ["INBOX"] })
      });

      res.json({ ok: true, ...snoozed[id] });
      emit("sync", { changed: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/snoozed", async (req, res) => {
    try {
      await unsnoozeDue();
      res.json(await getSnoozed());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/draft", async (req, res) => {
    try {
      const to = clean(req.body?.to);
      const subject = clean(req.body?.subject);
      const body = clean(req.body?.body);

      if (!to || !body) {
        return res.status(400).json({ error: "Empfänger und Text erforderlich." });
      }

      let attachments;
      try {
        attachments = sanitizeAttachments(req.body?.attachments);
      } catch (attError) {
        return res.status(400).json({ error: attError.message });
      }

      const draft = await createRawDraft({
        to,
        subject: subject || "(kein Betreff)",
        body,
        attachments
      });

      res.json({ ok: true, draft });
      emit("sync", { changed: true, draftCreated: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/reply-draft", async (req, res) => {
    try {
      const messageId = clean(req.body?.messageId);
      const body = clean(req.body?.body);

      if (!messageId || !body) {
        return res.status(400).json({ error: "Mail und Antworttext erforderlich." });
      }

      let attachments;
      try {
        attachments = sanitizeAttachments(req.body?.attachments);
      } catch (attError) {
        return res.status(400).json({ error: attError.message });
      }

      const draft = await createReplyDraft(messageId, body, attachments);

      res.json({ ok: true, draft });
      emit("sync", { changed: true, draftCreated: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Nur für explizit bestätigtes Senden aus dem Mail Studio.
  router.post("/send-draft", async (req, res) => {
    try {
      const draftId = clean(req.body?.draftId);
      const confirmation = clean(req.body?.confirmation_text);

      if (!draftId) return res.status(400).json({ error: "draftId fehlt." });

      if (!/\b(senden|abschicken|versenden|ja|ok|okay)\b/i.test(confirmation)) {
        return res.status(400).json({ error: "Ausdrückliche Sendebestätigung fehlt." });
      }

      const sent = await gmail("/drafts/send", {
        method: "POST",
        body: JSON.stringify({ id: draftId })
      });

      res.json({ ok: true, sent });
      emit("sync", { changed: true, draftSent: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/drafts", async (req, res) => {
    try {
      res.json({ ok: true, drafts: await listDrafts(50) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/suggest", async (req, res) => {
    try {
      if (!openaiApiKey) {
        return res.status(503).json({ error: "OPENAI_API_KEY fehlt." });
      }

      const tone = clean(req.body?.tone) || "freundlich-professionell";
      const template = clean(req.body?.template) || "auto";
      const instruction = clean(req.body?.instruction);

      const prompt = `
Du bist der interne E-Mail-Assistent von Druckelite24.

Kundenmail:
Absender: ${clean(req.body?.from)}
Betreff: ${clean(req.body?.subject)}
Inhalt:
${clean(req.body?.bodyText)}

Gewünschter Ton: ${tone}
Vorlage: ${template}
Zusatzanweisung von Mattl: ${instruction || "keine"}

WICHTIG:
- professionelles natürliches Deutsch
- keine erfundenen Preise, Liefertermine, Zusagen oder Fakten
- keine internen JARVIS-Kommentare
- kein Sarkasmus gegenüber Kunden
- wenn Informationen fehlen, neutral formulieren oder passend nachfragen
- Lieferzeit nur nennen, wenn es zur Mail passt
- Entwurf wird NICHT automatisch gesendet

Antworte als JSON:
{
  "text": "...",
  "insight": "...",
  "category": "..."
}
`;

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: openaiModel,
          input: prompt,
          reasoning: { effort: "low" },
          text: {
            format: {
              type: "json_schema",
              name: "mail_suggestion",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  insight: { type: "string" },
                  category: { type: "string" }
                },
                required: ["text", "insight", "category"],
                additionalProperties: false
              }
            }
          },
          store: false
        }),
        signal: timeoutSignal(30000)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || "KI-Vorschlag fehlgeschlagen.");
      }

      let outputText = clean(data.output_text);

      if (!outputText) {
        const pieces = [];
        for (const item of data.output || []) {
          if (item?.type !== "message") continue;
          for (const content of item.content || []) {
            if (content?.type === "output_text" && content?.text) {
              pieces.push(content.text);
            }
          }
        }
        outputText = pieces.join("\n");
      }

      res.json(JSON.parse(outputText));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    sseClients.add(res);
    ensurePoller();

    const heartbeat = setInterval(() => {
      try { res.write(`event: ping\ndata: {}\n\n`); } catch {}
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  ensurePoller();

  return router;
}
