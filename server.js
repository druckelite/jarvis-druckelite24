import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "1mb" }));

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, Mattls persönlicher Voice- und Business-Assistent für Druckelite24.

SPRACHE UND PERSÖNLICHKEIT
- Sprich standardmäßig Deutsch.
- Sprich natürlich, direkt und nicht wie ein Callcenter-Bot.
- Du bist intelligent, vorausschauend und lösungsorientiert.
- Du darfst trocken, frech und ironisch sein.
- Bei ernsten oder geschäftskritischen Themen bist du klar und präzise.
- Halte gesprochene Antworten normalerweise kompakt.
- Mattl kann mit dir über Business, Technik, Alltag und allgemeine Fragen sprechen.

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Wichtige Bereiche:
- Firmenbekleidung
- Vereinsbekleidung
- Teamsport
- Gastro
- Events
- Arbeitsbekleidung
- personalisierte Textilien
- DTF und Textildruck
- Shopify E-Commerce

DEINE AUFGABE
Du beantwortest nicht nur Fragen, sondern denkst mit.

Achte insbesondere auf:
- Umsatz
- Bestellungen
- Conversion
- Traffic
- durchschnittlichen Bestellwert
- Kundenanfragen
- wichtige E-Mails
- Termine und Fristen
- Werbeperformance
- Chancen und Probleme
- mögliche Umsatzverluste
- Follow-ups

LIVE-DATEN
Wenn Mattl nach Shopify-Umsatz, Bestellungen oder Shopdaten fragt,
verwende das Shopify-Tool.

Wenn Mattl nach wichtigen Mails fragt,
verwende das Gmail-Tool.

Wenn Mattl nach Terminen oder seinem Kalender fragt,
verwende das Kalender-Tool.

Erfinde niemals Live-Daten.

Wenn eine Verbindung noch nicht eingerichtet ist, sage das offen und kurz.

SICHERHEIT
Du darfst analysieren, suchen, zusammenfassen und Empfehlungen geben.

Bei kritischen Aktionen wie:
- Geld ausgeben
- Werbebudget verändern
- Kampagnen pausieren
- E-Mails versenden
- Preise ändern
- Bestellungen stornieren
- Rückerstattungen
- Daten löschen

musst du vorher Mattls ausdrückliche Zustimmung einholen.

STILBEISPIELE
"Mattl, der Shop läuft. Begeisterung wäre übertrieben, aber wir haben schon Schlimmeres gesehen."

"Meta scheint heute wieder der Meinung zu sein, dein Geld hätte zu viel Freizeit."

"Ich würde das beobachten, aber noch nicht hektisch irgendwo draufdrücken."

Wenn Mattl sagt:
"Jarvis, Status"
oder
"Jarvis, gib mir mein Briefing"

gib einen kompakten Überblick über:
1. Shop
2. wichtige Mails
3. Termine
4. Probleme
5. Chancen
6. klare Priorität

Dein Ziel ist nicht, Mattl möglichst viele Informationen zu geben.
Dein Ziel ist, dass er schnell weiß, was wichtig ist und was als Nächstes zu tun ist.
`;

const tools = [
  {
    type: "function",
    name: "get_shopify_summary",
    description:
      "Liest aktuelle Shopify-Geschäftsdaten. Verwenden bei Fragen zu Umsatz, Bestellungen oder Shop-Status.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday"],
          description: "Zeitraum für die Shopify-Auswertung."
        }
      },
      required: ["period"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_important_emails",
    description:
      "Liest wichtige aktuelle Geschäftsmails aus Gmail.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Maximale Anzahl wichtiger Mails."
        }
      },
      required: ["limit"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_calendar_today",
    description:
      "Liest die heutigen Termine aus Google Kalender.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];


/* =========================================================
   OPENAI REALTIME / VOICE
   ========================================================= */

app.post(
  "/session",
  express.text({
    type: "application/sdp",
    limit: "1mb"
  }),
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res
          .status(500)
          .send("OPENAI_API_KEY ist auf dem Server nicht hinterlegt.");
      }

      if (!req.body || typeof req.body !== "string") {
        return res.status(400).send("SDP Offer fehlt.");
      }

      const sessionConfig = {
        type: "realtime",
        model: "gpt-realtime",
        output_modalities: ["audio"],
        instructions: JARVIS_INSTRUCTIONS,
        tools,
        tool_choice: "auto"
      };

      const form = new FormData();

      // WICHTIG:
      // SDP als normales Multipart-Textfeld senden.
      form.append("sdp", req.body);

      // Session-Konfiguration als JSON-Part.
      form.append(
        "session",
        new Blob(
          [JSON.stringify(sessionConfig)],
          { type: "application/json" }
        )
      );

      const openAIResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: form
        }
      );

      const responseBody = await openAIResponse.text();

      if (!openAIResponse.ok) {
        console.error(
          "OpenAI Realtime error:",
          openAIResponse.status,
          responseBody
        );

        return res
          .status(openAIResponse.status)
          .send(responseBody);
      }

      res
        .status(201)
        .type("application/sdp")
        .send(responseBody);

    } catch (error) {
      console.error("Realtime bridge error:", error);

      res
        .status(500)
        .send("Realtime-Verbindung konnte nicht aufgebaut werden.");
    }
  }
);


/* =========================================================
   SHOPIFY
   ========================================================= */

function berlinDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getDateRange(period) {
  const todayText = berlinDateString();

  const base = new Date(`${todayText}T00:00:00+02:00`);

  if (period === "yesterday") {
    base.setUTCDate(base.getUTCDate() - 1);
  }

  const start = new Date(base);
  const end = new Date(base);

  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

app.post("/api/shopify-summary", async (req, res) => {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion =
    process.env.SHOPIFY_API_VERSION || "2026-07";

  if (!domain || !token) {
    return res.status(503).json({
      configured: false,
      message:
        "Shopify ist im Voice-JARVIS noch nicht verbunden."
    });
  }

  try {
    const period =
      req.body?.period === "yesterday"
        ? "yesterday"
        : "today";

    const { start, end } = getDateRange(period);

    const queryString =
      `created_at:>=${start} created_at:<${end}`;

    const query = `
      query JarvisOrders($query: String!) {
        orders(
          first: 100,
          query: $query,
          sortKey: CREATED_AT
        ) {
          nodes {
            name
            createdAt
            cancelledAt
            displayFinancialStatus

            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `;

    const shopifyResponse = await fetch(
      `https://${domain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token
        },
        body: JSON.stringify({
          query,
          variables: {
            query: queryString
          }
        })
      }
    );

    const data = await shopifyResponse.json();

    if (!shopifyResponse.ok || data.errors) {
      console.error("Shopify error:", data);

      return res.status(502).json({
        configured: true,
        error: data.errors || data
      });
    }

    const orders =
      data.data?.orders?.nodes || [];

    const validOrders =
      orders.filter(order => !order.cancelledAt);

    const revenue =
      validOrders.reduce((sum, order) => {
        return (
          sum +
          Number(
            order.currentTotalPriceSet?.shopMoney?.amount || 0
          )
        );
      }, 0);

    const currency =
      validOrders[0]?.currentTotalPriceSet?.shopMoney
        ?.currencyCode || "EUR";

    res.json({
      configured: true,
      period,
      orders: validOrders.length,
      order_value_sum:
        Number(revenue.toFixed(2)),
      currency,
      note:
        "Summe der aktuellen Bestellwerte aus Shopify. Kann von Shopify Analytics total_sales abweichen."
    });

  } catch (error) {
    console.error("Shopify request error:", error);

    res.status(500).json({
      configured: true,
      error: "Shopify-Abfrage fehlgeschlagen."
    });
  }
});


/* =========================================================
   GOOGLE OAUTH
   ========================================================= */

async function getGoogleAccessToken() {
  const clientId =
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;

  const refreshToken =
    process.env.GOOGLE_REFRESH_TOKEN;

  if (
    !clientId ||
    !clientSecret ||
    !refreshToken
  ) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "Google OAuth error:",
      errorText
    );

    throw new Error(
      "Google Access Token konnte nicht erneuert werden."
    );
  }

  const data = await response.json();

  return data.access_token;
}


/* =========================================================
   GMAIL
   ========================================================= */

app.post("/api/important-emails", async (req, res) => {
  try {
    const accessToken =
      await getGoogleAccessToken();

    if (!accessToken) {
      return res.status(503).json({
        configured: false,
        message:
          "Gmail ist im Voice-JARVIS noch nicht verbunden."
      });
    }

    const requestedLimit =
      Number(req.body?.limit || 3);

    const limit =
      Math.min(
        Math.max(requestedLimit, 1),
        10
      );

    const gmailQuery =
      encodeURIComponent(
        "newer_than:2d -in:spam -in:trash -category:promotions"
      );

    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${gmailQuery}&maxResults=${limit}`,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

    const listData =
      await listResponse.json();

    if (!listResponse.ok) {
      console.error(
        "Gmail list error:",
        listData
      );

      return res.status(502).json({
        configured: true,
        error: listData
      });
    }

    const messageIds =
      listData.messages || [];

    const emails = [];

    for (const item of messageIds) {
      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

      const message =
        await messageResponse.json();

      if (!messageResponse.ok) {
        continue;
      }

      const headerArray =
        message.payload?.headers || [];

      const headers =
        Object.fromEntries(
          headerArray.map(header => [
            header.name.toLowerCase(),
            header.value
          ])
        );

      emails.push({
        from: headers.from || "",
        subject: headers.subject || "",
        date: headers.date || "",
        snippet: message.snippet || ""
      });
    }

    res.json({
      configured: true,
      emails
    });

  } catch (error) {
    console.error("Gmail error:", error);

    res.status(500).json({
      configured: true,
      error:
        "Gmail-Abfrage fehlgeschlagen."
    });
  }
});


/* =========================================================
   GOOGLE CALENDAR
   ========================================================= */

app.post("/api/calendar-today", async (req, res) => {
  try {
    const accessToken =
      await getGoogleAccessToken();

    if (!accessToken) {
      return res.status(503).json({
        configured: false,
        message:
          "Google Kalender ist im Voice-JARVIS noch nicht verbunden."
      });
    }

    const todayText =
      berlinDateString();

    const start =
      new Date(
        `${todayText}T00:00:00+02:00`
      );

    const end =
      new Date(start);

    end.setUTCDate(
      end.getUTCDate() + 1
    );

    const url =
      new URL(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events"
      );

    url.searchParams.set(
      "timeMin",
      start.toISOString()
    );

    url.searchParams.set(
      "timeMax",
      end.toISOString()
    );

    url.searchParams.set(
      "singleEvents",
      "true"
    );

    url.searchParams.set(
      "orderBy",
      "startTime"
    );

    const calendarResponse =
      await fetch(url, {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      });

    const data =
      await calendarResponse.json();

    if (!calendarResponse.ok) {
      console.error(
        "Calendar error:",
        data
      );

      return res.status(502).json({
        configured: true,
        error: data
      });
    }

    const events =
      (data.items || []).map(event => ({
        summary:
          event.summary || "(ohne Titel)",

        start:
          event.start?.dateTime ||
          event.start?.date,

        end:
          event.end?.dateTime ||
          event.end?.date,

        location:
          event.location || ""
      }));

    res.json({
      configured: true,
      events
    });

  } catch (error) {
    console.error(
      "Calendar request error:",
      error
    );

    res.status(500).json({
      configured: true,
      error:
        "Kalender-Abfrage fehlgeschlagen."
    });
  }
});


/* =========================================================
   HOMEPAGE + HEALTH
   ========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    "index.html",
    { root: "." }
  );
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "jarvis-druckelite24"
  });
});


/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `JARVIS läuft auf Port ${PORT}`
    );
  }
);
