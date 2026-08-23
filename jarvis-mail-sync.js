import express from "express";

function timeoutSignal(ms) {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

function encodeBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  if (!value) return "";
  const normalized =
    String(value)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
  const padding =
    "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(
    normalized + padding,
    "base64"
  ).toString("utf8");
}

function getHeader(headers, name) {
  return (headers || []).find(
    h =>
      String(h?.name || "").toLowerCase() ===
      String(name || "").toLowerCase()
  )?.value || "";
}

function collectBodies(part, result) {
  if (!part) return;
  const mime = String(part.mimeType || "").toLowerCase();
  const data = part.body?.data;
  if (data) {
    const decoded = decodeBase64Url(data);
    if (mime === "text/plain") result.plain.push(decoded);
    if (mime === "text/html") result.html.push(decoded);
  }
  for (const child of part.parts || []) {
    collectBodies(child, result);
  }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function createMailRouter({
  getAccessToken,
  apiKey,
  pollIntervalMs = 8000
}) {
  const router = express.Router();

  router.use(express.json({ limit: "2mb" }));

  router.use((req, res, next) => {
    if (
      apiKey &&
      req.headers["x-jarvis-key"] !== apiKey
    ) {
      return res
        .status(401)
        .json({
          ok: false,
          error: "Ungültiger oder fehlender API-Key."
        });
    }
    next();
  });

  async function gmail(path, options = {}) {
    const token = await getAccessToken();
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body
            ? { "Content-Type": "application/json" }
            : {}),
          ...(options.headers || {})
        },
        signal: timeoutSignal(15000)
      }
    );

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      throw new Error(
        data?.error?.message ||
        `Gmail Fehler ${response.status}`
      );
    }
    return data;
  }

  async function readMessage(id) {
    const data = await gmail(
      `/messages/${encodeURIComponent(id)}?format=full`
    );

    const headers = data.payload?.headers || [];
    const bodies = { plain: [], html: [] };
    collectBodies(data.payload, bodies);

    const body =
      bodies.plain.join("\n\n").trim() ||
      stripHtml(bodies.html.join("\n\n")) ||
      data.snippet ||
      "";

    return {
      id: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds || [],
      unread:
        (data.labelIds || []).includes("UNREAD"),
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject:
        getHeader(headers, "Subject") ||
        "(kein Betreff)",
      date: getHeader(headers, "Date"),
      snippet: data.snippet || "",
      body: body.slice(0, 50000)
    };
  }

  router.get("/status", async (req, res) => {
    try {
      await getAccessToken();
      res.json({
        ok: true,
        poll_interval_ms: pollIntervalMs
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        error: error.message
      });
    }
  });

  router.get("/inbox", async (req, res) => {
    try {
      const max =
        Math.max(
          1,
          Math.min(50, Number(req.query.limit) || 20)
        );

      const q =
        String(req.query.q || "in:inbox").trim();

      const list = await gmail(
        `/messages?q=${encodeURIComponent(q)}&maxResults=${max}`
      );

      const messages =
        await Promise.all(
          (list.messages || []).map(
            item => readMessage(item.id)
          )
        );

      res.json({ ok: true, messages });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  router.get("/message/:id", async (req, res) => {
    try {
      res.json({
        ok: true,
        message: await readMessage(req.params.id)
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  router.get("/labels", async (req, res) => {
    try {
      const data = await gmail("/labels");
      res.json({
        ok: true,
        labels: data.labels || []
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  router.post("/modify", async (req, res) => {
    try {
      const id = String(req.body?.messageId || "").trim();
      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "messageId fehlt."
        });
      }
      const data = await gmail(
        `/messages/${encodeURIComponent(id)}/modify`,
        {
          method: "POST",
          body: JSON.stringify({
            addLabelIds:
              Array.isArray(req.body?.addLabelIds)
                ? req.body.addLabelIds
                : [],
            removeLabelIds:
              Array.isArray(req.body?.removeLabelIds)
                ? req.body.removeLabelIds
                : []
          })
        }
      );
      res.json({ ok: true, message: data });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  router.post("/draft", async (req, res) => {
    try {
      const to = String(req.body?.to || "").trim();
      const subject = String(req.body?.subject || "").trim();
      const body = String(req.body?.body || "").trim();
      if (!to || !body) {
        return res.status(400).json({
          ok: false,
          error: "Empfänger und Inhalt sind erforderlich."
        });
      }

      const raw = encodeBase64Url(
        [
          `To: ${to}`,
          `Subject: ${subject}`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="UTF-8"',
          "Content-Transfer-Encoding: 8bit",
          "",
          body
        ].join("\r\n")
      );

      const draft = await gmail(
        "/drafts",
        {
          method: "POST",
          body: JSON.stringify({
            message: { raw }
          })
        }
      );

      res.json({
        ok: true,
        draft
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  router.get("/drafts", async (req, res) => {
    try {
      const data = await gmail("/drafts?maxResults=30");
      res.json({
        ok: true,
        drafts: data.drafts || []
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  router.post("/send-draft", async (req, res) => {
    try {
      const id = String(req.body?.draftId || "").trim();
      if (!id) {
        return res.status(400).json({
          ok: false,
          error: "draftId fehlt."
        });
      }
      const data = await gmail(
        "/drafts/send",
        {
          method: "POST",
          body: JSON.stringify({ id })
        }
      );
      res.json({
        ok: true,
        sent: data
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  return router;
}
