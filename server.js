import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "1mb" }));

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, Mattls persönlicher Voice- und Business-Assistent für Druckelite24.
Sprich natürlich auf Deutsch, kurz und klar. Du darfst trocken, frech und ironisch sein,
aber wichtige Informationen müssen immer eindeutig bleiben.

Du kannst allgemeine Fragen normal beantworten. Wenn eine Frage Live-Geschäftsdaten
betrifft, verwende das passende Tool und erfinde niemals Zahlen oder Inhalte.

Geschäftsprioritäten:
1. Umsatz, Gewinn, Bestellungen, Conversion und Shop-Probleme.
2. Wichtige Kundenmails, Fristen und Termine.
3. Später: Meta Ads, WhatsApp und Telefonie.
4. Bei kritischen Aktionen (Geld ausgeben, Mails senden, Preise ändern, löschen)
immer vorher Mattls ausdrückliche Zustimmung einholen.

Wenn ein Daten-Tool meldet, dass eine Verbindung noch nicht konfiguriert ist, sag das
kurz und konkret. Tu niemals so, als hättest du Live-Zugriff, wenn er fehlt.
`;

const tools = [
  {
    type: "function",
    name: "get_shopify_summary",
    description: "Liest eine Live-Zusammenfassung aus Shopify. Nutze es für Fragen zu Umsatz, Bestellungen oder Shop-Status.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday"],
          description: "Zeitraum der Auswertung."
        }
      },
      required: ["period"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_important_emails",
    description: "Liest wichtige aktuelle Geschäftsmails aus Gmail.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 10 }
      },
      required: ["limit"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_calendar_today",
    description: "Liest die heutigen Termine aus Google Kalender.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

// Secure WebRTC bridge: the permanent API key stays only on this server.
app.post("/session", express.text({ type: "application/sdp", limit: "1mb" }), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).send("OPENAI_API_KEY fehlt auf dem Server.");
    }

    const form = new FormData();
    form.append("sdp", new Blob([req.body], { type: "application/sdp" }), "offer.sdp");
    form.append(
      "session",
      new Blob(
        [JSON.stringify({
          type: "realtime",
          model: "gpt-realtime",
          output_modalities: ["audio"],
          instructions: JARVIS_INSTRUCTIONS,
          tools,
          tool_choice: "auto"
        })],
        { type: "application/json" }
      ),
      "session.json"
    );

    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const body = await response.text();
    if (!response.ok) {
      console.error("OpenAI Realtime error:", response.status, body);
      return res.status(response.status).send(body);
    }

    res.type("application/sdp").send(body);
  } catch (error) {
    console.error(error);
    res.status(500).send("Realtime-Verbindung fehlgeschlagen.");
  }
});

function dateRange(period) {
  const now = new Date();
  // Europe/Berlin approximation using Intl date parts to define local calendar day.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const localDate = formatter.format(now); // YYYY-MM-DD
  const d = new Date(`${localDate}T00:00:00+02:00`);
  if (period === "yesterday") d.setUTCDate(d.getUTCDate() - 1);
  const start = new Date(d);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

app.post("/api/shopify-summary", async (req, res) => {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-07";

  if (!domain || !token) {
    return res.status(503).json({
      configured: false,
      message: "Shopify ist im Voice-JARVIS noch nicht verbunden."
    });
  }

  try {
    const period = req.body?.period === "yesterday" ? "yesterday" : "today";
    const { start, end } = dateRange(period);
    const queryString = `created_at:>=${start} created_at:<${end}`;

    const query = `
      query JarvisOrders($query: String!) {
        orders(first: 100, query: $query, sortKey: CREATED_AT) {
          nodes {
            name
            createdAt
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            displayFinancialStatus
            cancelledAt
          }
        }
      }
    `;

    const r = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({ query, variables: { query: queryString } })
    });

    const data = await r.json();
    if (!r.ok || data.errors) {
      return res.status(502).json({ configured: true, error: data.errors || data });
    }

    const orders = data.data?.orders?.nodes || [];
    const valid = orders.filter(o => !o.cancelledAt);
    const currency = valid[0]?.currentTotalPriceSet?.shopMoney?.currencyCode || "EUR";
    const revenue = valid.reduce((sum, o) => sum + Number(o.currentTotalPriceSet?.shopMoney?.amount || 0), 0);

    res.json({
      configured: true,
      period,
      orders: valid.length,
      order_value_sum: Number(revenue.toFixed(2)),
      currency,
      note: "Summe der aktuellen Bestellwerte aus Shopify Admin API; kann von Shopify Analytics total_sales abweichen."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ configured: true, error: "Shopify-Abfrage fehlgeschlagen." });
  }
});

async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) throw new Error("Google token refresh failed");
  return (await r.json()).access_token;
}

app.post("/api/important-emails", async (req, res) => {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return res.status(503).json({
        configured: false,
        message: "Gmail ist im Voice-JARVIS noch nicht verbunden."
      });
    }

    const limit = Math.min(Math.max(Number(req.body?.limit || 3), 1), 10);
    const q = encodeURIComponent("newer_than:2d -in:spam -in:trash -category:promotions");
    const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${limit}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listData = await list.json();
    const ids = listData.messages || [];

    const emails = [];
    for (const item of ids) {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const m = await r.json();
      const headers = Object.fromEntries((m.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
      emails.push({
        from: headers.from || "",
        subject: headers.subject || "",
        date: headers.date || "",
        snippet: m.snippet || ""
      });
    }
    res.json({ configured: true, emails });
  } catch (error) {
    console.error(error);
    res.status(500).json({ configured: true, error: "Gmail-Abfrage fehlgeschlagen." });
  }
});

app.post("/api/calendar-today", async (req, res) => {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return res.status(503).json({
        configured: false,
        message: "Google Kalender ist im Voice-JARVIS noch nicht verbunden."
      });
    }

    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now);
    const timeMin = new Date(`${parts}T00:00:00+02:00`).toISOString();
    const timeMaxDate = new Date(`${parts}T00:00:00+02:00`);
    timeMaxDate.setUTCDate(timeMaxDate.getUTCDate() + 1);
    const timeMax = timeMaxDate.toISOString();

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ configured: true, error: data });

    const events = (data.items || []).map(e => ({
      summary: e.summary || "(ohne Titel)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || ""
    }));
    res.json({ configured: true, events });
  } catch (error) {
    console.error(error);
    res.status(500).json({ configured: true, error: "Kalender-Abfrage fehlgeschlagen." });
  }
});

app.get("/", (req, res) => res.sendFile("index.html", { root: "." }));
app.get("/health", (req, res) => res.json({ ok: true, service: "jarvis-druckelite24" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`JARVIS läuft auf Port ${PORT}`);
});
