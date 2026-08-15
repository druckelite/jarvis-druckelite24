/* =========================================================
   DRUCKELITE24 · JARVIS SERVER
   V9.0 · OPENAI REALTIME / WEBRTC
   ========================================================= */

import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const JARVIS_VERSION = "V9.0";


/* =========================================================
   PUBLIC FILES
   ========================================================= */

const PUBLIC_FILES = new Set([
  "index.html",
  "app.js",
  "styles.css",
  "Intro.mp3"
]);

app.get("/:file", (req, res, next) => {
  if (!PUBLIC_FILES.has(req.params.file)) return next();
  return res.sendFile(req.params.file, { root: "." });
});


/* =========================================================
   HELPERS
   ========================================================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function timeoutSignal(ms) {
  try {
    if (
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
    ) {
      return AbortSignal.timeout(ms);
    }
  } catch {}

  return undefined;
}


/* =========================================================
   BERLIN DATE HELPERS
   ========================================================= */

function berlinDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getBerlinHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(date);

  const hourPart = parts.find(part => part.type === "hour");
  const hour = Number(hourPart?.value);

  return Number.isNaN(hour) ? date.getHours() : hour;
}

function nextDateString(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function berlinUtcOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "shortOffset"
  }).formatToParts(date);

  const offsetLabel =
    parts.find(part => part.type === "timeZoneName")?.value || "GMT+0";

  const match = offsetLabel.match(/GMT([+-]\d+)(?::(\d+))?/);

  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);

  return hours >= 0
    ? hours * 60 + minutes
    : hours * 60 - minutes;
}

function berlinMidnightUtcIso(dateString) {
  const noonGuess = new Date(`${dateString}T12:00:00Z`);
  const offsetMinutes = berlinUtcOffsetMinutes(noonGuess);

  const utcMillis =
    Date.parse(`${dateString}T00:00:00Z`) -
    offsetMinutes * 60000;

  return new Date(utcMillis).toISOString();
}

function getPeriodDates(period) {
  const today = berlinDate();

  if (period === "yesterday") {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);

    const yesterday = date.toISOString().slice(0, 10);

    return {
      start: berlinMidnightUtcIso(yesterday),
      end: berlinMidnightUtcIso(today)
    };
  }

  return {
    start: berlinMidnightUtcIso(today),
    end: berlinMidnightUtcIso(nextDateString(today))
  };
}


/* =========================================================
   JARVIS PERSONALITY
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, der persönliche Assistent und Business-Sparringspartner von Mattl.

SPRACHE:
- Antworte ausschließlich auf Deutsch.
- Natürliches, klares Hochdeutsch.
- Wechsle nur dann in eine andere Sprache, wenn Mattl es ausdrücklich verlangt.

NAME:
- Der Benutzer heißt Mattl.
- Sprich den Namen mit hörbarem T aus: Mat-tl.
- Nicht Maddl.

CHARAKTER:
- intelligent
- ruhig
- souverän
- warm
- direkt
- locker
- trocken humorvoll
- gelegentlich frech
- kein Butler-Stil
- kein Callcenter
- kein künstliches Dauerlob

SPRACHGESPRÄCH:
- Du befindest dich in einem direkten Sprachgespräch mit Mattl.
- Antworte natürlich gesprochen.
- Beginne möglichst schnell mit der eigentlichen Antwort.
- Kurze Fragen bekommen kurze Antworten.
- Keine unnötigen Einleitungen.
- Keine langen Monologe, wenn sie nicht nötig sind.
- Standardmäßig ungefähr 1 bis 5 gesprochene Sätze.
- Wenn Mattl ausführliche Informationen verlangt, darfst du ausführlicher antworten.
- Stelle nicht nach jeder Antwort eine Gegenfrage.
- Wenn Mattl dich unterbricht, akzeptiere die Unterbrechung und reagiere auf seine neue Aussage.
- Keine Markdown-Tabellen.
- Keine technischen Erklärungen über interne APIs, sofern Mattl nicht ausdrücklich danach fragt.

ZAHLEN:
- Geldbeträge natürlich auf Deutsch aussprechen.
- 1234.56 EUR bedeutet 1234 Euro 56.
- Prozentwerte natürlich aussprechen.
- Vermeide rohe URLs.

AKTUELLE INFORMATIONEN:
- Erfinde niemals aktuelle Zahlen.
- Shopify-, E-Mail-, Wetter- und Business-Zahlen dürfen nur verwendet werden, wenn echte Live-Daten bereitgestellt wurden.
- Wenn aktuelle Daten fehlen, sag das ehrlich.

DRUCKELITE24:
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Bereiche:
- Firmenbekleidung
- Vereinsbekleidung
- Teamsport
- Gastro
- Arbeitsbekleidung
- Events
- personalisierte Textilien
- DTF
- Textildruck
- Shopify
- E-Commerce
- Marketing
- Verkauf

SHOPIFY:
Es gibt genau einen verbundenen Shopify-Shop:
Druckelite24.

Wenn Mattl von
- meinem Shop
- unserem Shop
- Shopify
- Bestellungen
- Umsatz
- Verkäufen
spricht, ist Druckelite24 gemeint.

BUSINESS:
Bei passenden Themen darfst du wie ein
Geschäftsführer,
E-Commerce-Manager,
Verkaufsleiter,
Performance-Marketer
und Datenanalyst denken.

SICHERHEIT:
Vor kritischen Aktionen braucht Mattl ausdrückliche Zustimmung:
- Geld ausgeben
- Preise ändern
- Kampagnen ändern
- Bestellungen stornieren
- Rückerstattungen
- Nachrichten versenden
- E-Mails versenden
- Daten löschen

PROAKTIVE HINWEISE:
Wenn du von selbst einen Business-Hinweis oder eine Erinnerung ausgibst:
- sprich Mattl direkt an
- halte dich kurz
- tu nicht so, als hätte Mattl gerade etwas gefragt
- trockener Humor ist erlaubt
`;


/* =========================================================
   OPENAI REALTIME · WEBRTC
   MUSS VOR express.json() STEHEN
   ========================================================= */

app.post(
  "/api/realtime-session",
  express.text({
    type: ["application/sdp", "text/plain"],
    limit: "1mb"
  }),
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).send("OPENAI_API_KEY fehlt.");
      }

      const sdp = String(req.body || "").trim();

      if (!sdp) {
        return res.status(400).send("SDP fehlt.");
      }

      const realtimeModel =
        process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";

      const realtimeVoice =
        process.env.OPENAI_REALTIME_VOICE || "cedar";

      const sessionConfig = {
        type: "realtime",
        model: realtimeModel,
        instructions: JARVIS_INSTRUCTIONS,

        output_modalities: ["audio"],

        audio: {
          input: {
            turn_detection: {
              type: "server_vad"
            }
          },
          output: {
            voice: realtimeVoice
          }
        }
      };

      const form = new FormData();

      form.set("sdp", sdp);
      form.set("session", JSON.stringify(sessionConfig));

      console.log(
        `Realtime Session startet: ${realtimeModel} / ${realtimeVoice}`
      );

      const startedAt = Date.now();

      const response = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: form,
          signal: timeoutSignal(20000)
        }
      );

      const answerSdp = await response.text();

      console.log(
        `[TIMING] Realtime Session: ${Date.now() - startedAt}ms`
      );

      if (!response.ok) {
        console.error(
          "Realtime OpenAI Fehler:",
          response.status,
          answerSdp
        );

        return res
          .status(response.status)
          .send(answerSdp || "Realtime-Verbindung fehlgeschlagen.");
      }

      res.status(200);
      res.setHeader("Content-Type", "application/sdp");

      return res.send(answerSdp);

    } catch (error) {
      console.error("Realtime session error:", error);

      return res.status(500).send(
        error.name === "TimeoutError"
          ? "Realtime-Verbindung hat zu lange gebraucht."
          : error.message || "Realtime-Verbindung fehlgeschlagen."
      );
    }
  }
);


/* =========================================================
   JSON
   ========================================================= */

app.use(express.json({ limit: "2mb" }));


/* =========================================================
   RESPONSES API HELPERS
   ========================================================= */

function extractResponseText(data) {
  if (!data) return "";

  const direct = String(data.output_text || "").trim();
  if (direct) return direct;

  const pieces = [];

  for (const item of data.output || []) {
    if (item?.type !== "message") continue;

    for (const content of item.content || []) {
      if (
        content?.type === "output_text" &&
        content?.text
      ) {
        pieces.push(content.text);
      }
    }
  }

  return pieces.join(" ").trim();
}


async function requestOpenAIResponse({
  inputText,
  previousResponseId,
  maxOutputTokens = 1200,
  reasoningEffort = "minimal",
  enableWebSearch = false
}) {
  const body = {
    model:
      process.env.OPENAI_TEXT_MODEL ||
      "gpt-5-mini",

    instructions:
      JARVIS_INSTRUCTIONS,

    input:
      inputText,

    max_output_tokens:
      maxOutputTokens,

    reasoning: {
      effort:
        reasoningEffort
    },

    text: {
      format: {
        type: "text"
      }
    },

    store: true
  };

  if (enableWebSearch) {
    body.tools = [
      {
        type: "web_search"
      }
    ];
  }

  if (previousResponseId) {
    body.previous_response_id =
      previousResponseId;
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(45000)
    }
  );

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "OpenAI hat keine gültige JSON-Antwort geliefert."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `OpenAI HTTP ${response.status}`
    );
  }

  return data;
}


async function createJarvisResponse({
  message,
  previousResponseId = null,
  liveData = null
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  let inputText =
    String(message || "").trim();

  if (!inputText) {
    throw new Error(
      "Leere Benutzernachricht."
    );
  }

  if (liveData) {
    inputText += `

LIVE-DATEN:
${JSON.stringify(liveData, null, 2)}

Nutze ausschließlich diese Live-Daten für aktuelle Werte.
Erfinde keine weiteren aktuellen Zahlen.`;
  }

  const fastPath =
    inputText.startsWith("[SYSTEM-HINWEIS") ||
    [
      "shopify",
      "weather",
      "note_saved",
      "notes_list",
      "reminder_set",
      "reminders_list",
      "emails_list"
    ].includes(liveData?.type);

  const reasoningEffort =
    fastPath ? "minimal" : "low";

  const enableWebSearch =
    !fastPath;

  let data =
    await requestOpenAIResponse({
      inputText,
      previousResponseId,
      maxOutputTokens: 1200,
      reasoningEffort,
      enableWebSearch
    });

  let outputText =
    extractResponseText(data);

  if (
    !outputText ||
    data.status === "incomplete"
  ) {
    data =
      await requestOpenAIResponse({
        inputText:
          `${inputText}

Antworte jetzt direkt und kurz auf Deutsch.`,

        previousResponseId,
        maxOutputTokens: 2400,
        reasoningEffort,
        enableWebSearch
      });

    outputText =
      extractResponseText(data);
  }

  if (!outputText) {
    throw new Error(
      "OpenAI hat keinen Antworttext geliefert."
    );
  }

  return {
    text: outputText,
    response_id: data.id || null
  };
}


/* =========================================================
   SHOPIFY AUTH
   ========================================================= */

let shopifyTokenCache = {
  token: null,
  expiresAt: 0
};

async function getShopifyAccessToken() {
  if (
    shopifyTokenCache.token &&
    Date.now() <
      shopifyTokenCache.expiresAt -
        5 * 60 * 1000
  ) {
    return shopifyTokenCache.token;
  }

  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const clientId =
    process.env.SHOPIFY_CLIENT_ID;

  const clientSecret =
    process.env.SHOPIFY_CLIENT_SECRET;

  if (
    !domain ||
    !clientId ||
    !clientSecret
  ) {
    throw new Error(
      "Shopify ist nicht vollständig konfiguriert."
    );
  }

  const params =
    new URLSearchParams({
      grant_type:
        "client_credentials",
      client_id:
        clientId,
      client_secret:
        clientSecret
    });

  const response = await fetch(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: params,
      signal: timeoutSignal(10000)
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.access_token
  ) {
    throw new Error(
      "Shopify-Authentifizierung fehlgeschlagen."
    );
  }

  const expiresIn =
    Number(
      data.expires_in ||
      86399
    );

  shopifyTokenCache = {
    token:
      data.access_token,
    expiresAt:
      Date.now() +
      expiresIn * 1000
  };

  return data.access_token;
}


/* =========================================================
   SHOPIFY SUMMARY
   ========================================================= */

async function getShopifySummary(period = "today") {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const { start, end } =
    getPeriodDates(period);

  const startDate =
    new Date(start);

  const endDate =
    new Date(end);

  const query = `
    query JarvisOrders {
      orders(
        first: 100,
        sortKey: CREATED_AT,
        reverse: true
      ) {
        nodes {
          name
          createdAt
          cancelledAt

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

  const response = await fetch(
    `https://${domain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        "X-Shopify-Access-Token":
          token
      },
      body: JSON.stringify({ query }),
      signal: timeoutSignal(10000)
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.errors
  ) {
    throw new Error(
      "Shopify-Daten konnten nicht gelesen werden."
    );
  }

  const orders =
    data.data?.orders?.nodes ||
    [];

  const valid =
    orders.filter(order => {
      if (order.cancelledAt) {
        return false;
      }

      const created =
        new Date(order.createdAt);

      return (
        created >= startDate &&
        created < endDate
      );
    });

  const revenue =
    valid.reduce(
      (total, order) =>
        total +
        Number(
          order
            .currentTotalPriceSet
            ?.shopMoney
            ?.amount ||
          0
        ),
      0
    );

  const currency =
    valid[0]
      ?.currentTotalPriceSet
      ?.shopMoney
      ?.currencyCode ||
    "EUR";

  const average =
    valid.length
      ? revenue /
        valid.length
      : 0;

  return {
    configured: true,
    shop: "Druckelite24",
    period,
    orders: valid.length,
    revenue: Number(
      revenue.toFixed(2)
    ),
    average_order_value:
      Number(
        average.toFixed(2)
      ),
    currency,
    source: "Shopify"
  };
}


app.post(
  "/api/shopify-summary",
  async (req, res) => {
    try {
      const period =
        req.body?.period ===
        "yesterday"
          ? "yesterday"
          : "today";

      return res.json(
        await getShopifySummary(
          period
        )
      );

    } catch (error) {
      return res
        .status(500)
        .json({
          configured: false,
          shop: "Druckelite24",
          error:
            error.message ||
            "Shopify-Abfrage fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   OPEN ORDERS
   ========================================================= */

async function getShopifyOpenOrders() {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const query = `
    query JarvisOpenOrders {
      orders(
        first: 50,
        query: "fulfillment_status:unfulfilled",
        sortKey: CREATED_AT,
        reverse: false
      ) {
        nodes {
          name
          createdAt
          cancelledAt
        }
      }
    }
  `;

  const response = await fetch(
    `https://${domain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        "X-Shopify-Access-Token":
          token
      },
      body: JSON.stringify({ query }),
      signal: timeoutSignal(10000)
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.errors
  ) {
    throw new Error(
      "Offene Bestellungen konnten nicht gelesen werden."
    );
  }

  const orders =
    (
      data.data?.orders?.nodes ||
      []
    ).filter(
      order =>
        !order.cancelledAt
    );

  const oldest =
    orders.length
      ? orders[0]
      : null;

  return {
    count: orders.length,
    oldest_order_name:
      oldest?.name || null,
    oldest_order_created_at:
      oldest?.createdAt || null
  };
}


/* =========================================================
   SHOP ID / METAFIELDS
   ========================================================= */

async function getShopId() {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const response = await fetch(
    `https://${domain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        "X-Shopify-Access-Token":
          token
      },
      body: JSON.stringify({
        query:
          "query { shop { id } }"
      }),
      signal: timeoutSignal(10000)
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.errors ||
    !data.data?.shop?.id
  ) {
    throw new Error(
      "Shop-ID konnte nicht ermittelt werden."
    );
  }

  return data.data.shop.id;
}


async function getJarvisMetafield(key) {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const query = `
    query JarvisMeta {
      shop {
        metafield(
          namespace: "jarvis",
          key: "${key}"
        ) {
          value
        }
      }
    }
  `;

  const response = await fetch(
    `https://${domain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        "X-Shopify-Access-Token":
          token
      },
      body: JSON.stringify({ query }),
      signal: timeoutSignal(10000)
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.errors
  ) {
    throw new Error(
      `${key} konnte nicht gelesen werden.`
    );
  }

  const raw =
    data.data?.shop
      ?.metafield?.value;

  if (!raw) return [];

  try {
    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch {
    return [];
  }
}


async function saveJarvisMetafield(
  key,
  value
) {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const shopId =
    await getShopId();

  const mutation = `
    mutation JarvisSaveMeta(
      $metafields: [MetafieldsSetInput!]!
    ) {
      metafieldsSet(
        metafields: $metafields
      ) {
        metafields {
          id
        }

        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: shopId,
        namespace: "jarvis",
        key,
        type: "json",
        value:
          JSON.stringify(value)
      }
    ]
  };

  const response = await fetch(
    `https://${domain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        "X-Shopify-Access-Token":
          token
      },
      body: JSON.stringify({
        query: mutation,
        variables
      }),
      signal: timeoutSignal(10000)
    }
  );

  const data =
    await response.json();

  const errors =
    data.data
      ?.metafieldsSet
      ?.userErrors;

  if (
    !response.ok ||
    data.errors ||
    (
      errors &&
      errors.length
    )
  ) {
    throw new Error(
      `${key} konnte nicht gespeichert werden.`
    );
  }
}


/* =========================================================
   NOTES
   ========================================================= */

async function getNotes() {
  return getJarvisMetafield(
    "notes"
  );
}

async function saveNotes(notes) {
  return saveJarvisMetafield(
    "notes",
    notes
  );
}


/* =========================================================
   REMINDERS
   ========================================================= */

async function getReminders() {
  return getJarvisMetafield(
    "reminders"
  );
}

async function saveReminders(reminders) {
  return saveJarvisMetafield(
    "reminders",
    reminders
  );
}

async function checkAndFireDueReminders() {
  const reminders =
    await getReminders();

  const now =
    Date.now();

  const due =
    reminders.filter(
      reminder =>
        !reminder.fired &&
        new Date(
          reminder.due_at
        ).getTime() <= now
    );

  if (!due.length) {
    return [];
  }

  const dueIds =
    new Set(
      due.map(
        reminder =>
          reminder.id
      )
    );

  const kept =
    reminders
      .map(reminder =>
        dueIds.has(
          reminder.id
        )
          ? {
              ...reminder,
              fired: true,
              fired_at:
                new Date()
                  .toISOString()
            }
          : reminder
      )
      .filter(reminder => {
        if (!reminder.fired) {
          return true;
        }

        const firedAt =
          reminder.fired_at
            ? new Date(
                reminder.fired_at
              ).getTime()
            : now;

        return (
          now - firedAt <
          24 *
            60 *
            60 *
            1000
        );
      });

  await saveReminders(kept);

  return due;
}


/* =========================================================
   REMINDER CHECK
   ========================================================= */

app.post(
  "/api/jarvis-reminder-check",
  async (req, res) => {
    try {
      const due =
        await checkAndFireDueReminders();

      if (!due.length) {
        return res.json({
          ok: true,
          hasNotice: false
        });
      }

      const text =
        due
          .map(
            reminder =>
              reminder.text
          )
          .join("; ");

      return res.json({
        ok: true,
        hasNotice: true,
        text:
          `Mattl, Erinnerung: ${text}.`
      });

    } catch (error) {
      console.error(
        "Reminder check:",
        error
      );

      return res.json({
        ok: true,
        hasNotice: false
      });
    }
  }
);


/* =========================================================
   GMAIL
   ========================================================= */

let gmailTokenCache = {
  token: null,
  expiresAt: 0
};

function isGmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

async function getGmailAccessToken() {
  if (
    gmailTokenCache.token &&
    Date.now() <
      gmailTokenCache.expiresAt -
        5 * 60 * 1000
  ) {
    return gmailTokenCache.token;
  }

  if (!isGmailConfigured()) {
    throw new Error(
      "Gmail ist nicht vollständig konfiguriert."
    );
  }

  const params =
    new URLSearchParams({
      client_id:
        process.env.GOOGLE_CLIENT_ID,
      client_secret:
        process.env.GOOGLE_CLIENT_SECRET,
      refresh_token:
        process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:
        "refresh_token"
    });

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: params,
      signal: timeoutSignal(10000)
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.access_token
  ) {
    throw new Error(
      "Gmail-Authentifizierung fehlgeschlagen."
    );
  }

  gmailTokenCache = {
    token:
      data.access_token,
    expiresAt:
      Date.now() +
      Number(
        data.expires_in ||
        3600
      ) *
        1000
  };

  return data.access_token;
}


async function getNewEmails() {
  const token =
    await getGmailAccessToken();

  const listResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=10",
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        },
        signal:
          timeoutSignal(10000)
      }
    );

  const listData =
    await listResponse.json();

  if (!listResponse.ok) {
    throw new Error(
      "E-Mails konnten nicht gelesen werden."
    );
  }

  const refs =
    listData.messages || [];

  if (!refs.length) {
    return [];
  }

  const emails = [];

  for (const ref of refs) {
    try {
      const response =
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            },
            signal:
              timeoutSignal(10000)
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        continue;
      }

      const headers =
        data.payload?.headers ||
        [];

      const subject =
        headers.find(
          h =>
            h.name === "Subject"
        )?.value ||
        "(kein Betreff)";

      const from =
        headers.find(
          h =>
            h.name === "From"
        )?.value ||
        "unbekannt";

      emails.push({
        id: ref.id,
        subject,
        from,
        snippet:
          data.snippet || ""
      });

    } catch (error) {
      console.warn(
        "Gmail Einzelmail:",
        error
      );
    }
  }

  return emails;
}


/* =========================================================
   PROACTIVE CHECK
   ========================================================= */

let lastBriefingDate = null;

let lastProactiveNotice = {
  unfulfilledCount: null,
  notifiedAt: 0
};

const PROACTIVE_REMINDER_COOLDOWN_MS =
  2 * 60 * 60 * 1000;

const notifiedEmailIds =
  new Set();


app.post(
  "/api/jarvis-checkin",
  async (req, res) => {
    try {
      const today =
        berlinDate();

      const hour =
        getBerlinHour();

      const morning =
        hour >= 5 &&
        hour < 11;


      /* MORNING BRIEFING */

      if (
        today !==
          lastBriefingDate &&
        morning
      ) {
        try {
          const yesterday =
            await getShopifySummary(
              "yesterday"
            );

          const openOrders =
            await getShopifyOpenOrders();

          const message =
            `[SYSTEM-HINWEIS] Morgen-Briefing: Gestern ${yesterday.revenue} ${yesterday.currency} Umsatz bei ${yesterday.orders} Bestellungen. Aktuell ${openOrders.count} unbearbeitete Bestellungen. Gib Mattl ein kurzes Morgen-Briefing.`;

          const result =
            await createJarvisResponse({
              message
            });

          lastBriefingDate =
            today;

          return res.json({
            ok: true,
            hasNotice: true,
            text: result.text
          });

        } catch (error) {
          console.error(
            "Morning Briefing:",
            error
          );
        }
      }


      /* EMAILS */

      if (isGmailConfigured()) {
        try {
          const emails =
            await getNewEmails();

          const newEmails =
            emails.filter(
              email =>
                !notifiedEmailIds.has(
                  email.id
                )
            );

          if (newEmails.length) {
            for (
              const email of
              newEmails
            ) {
              notifiedEmailIds.add(
                email.id
              );
            }

            const list =
              newEmails
                .map(
                  email =>
                    `${email.from}, Betreff ${email.subject}`
                )
                .join("; ");

            const result =
              await createJarvisResponse({
                message:
                  `[SYSTEM-HINWEIS] Es gibt ${newEmails.length} neue ungelesene E-Mails: ${list}. Weise Mattl kurz darauf hin.`
              });

            return res.json({
              ok: true,
              hasNotice: true,
              text: result.text
            });
          }

        } catch (error) {
          console.error(
            "Gmail check:",
            error
          );
        }
      }


      /* OPEN ORDERS */

      const openOrders =
        await getShopifyOpenOrders();

      if (!openOrders.count) {
        lastProactiveNotice = {
          unfulfilledCount: 0,
          notifiedAt:
            Date.now()
        };

        return res.json({
          ok: true,
          hasNotice: false
        });
      }

      const changed =
        lastProactiveNotice
          .unfulfilledCount !==
        openOrders.count;

      const cooldownElapsed =
        Date.now() -
          lastProactiveNotice
            .notifiedAt >
        PROACTIVE_REMINDER_COOLDOWN_MS;

      if (
        !changed &&
        !cooldownElapsed
      ) {
        return res.json({
          ok: true,
          hasNotice: false
        });
      }

      lastProactiveNotice = {
        unfulfilledCount:
          openOrders.count,
        notifiedAt:
          Date.now()
      };

      const result =
        await createJarvisResponse({
          message:
            `[SYSTEM-HINWEIS] Bei Druckelite24 gibt es aktuell ${openOrders.count} unbearbeitete Bestellungen. Sprich Mattl kurz darauf an.`
        });

      return res.json({
        ok: true,
        hasNotice: true,
        text: result.text
      });

    } catch (error) {
      console.error(
        "Proactive check:",
        error
      );

      return res.json({
        ok: true,
        hasNotice: false
      });
    }
  }
);


/* =========================================================
   LEGACY CHAT
   Bleibt noch vorhanden.
   ========================================================= */

app.post(
  "/api/jarvis-chat",
  async (req, res) => {
    try {
      const message =
        String(
          req.body?.message ||
          ""
        ).trim();

      if (!message) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Nachricht fehlt."
          });
      }

      const result =
        await createJarvisResponse({
          message
        });

      return res.json({
        ok: true,
        text: result.text,
        response_id:
          result.response_id
      });

    } catch (error) {
      console.error(
        "Legacy chat:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message ||
            "JARVIS konnte nicht antworten."
        });
    }
  }
);


/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/health",
  (req, res) => {
    return res.json({
      ok: true,

      version:
        `JARVIS ${JARVIS_VERSION}`,

      architecture:
        "browser -> webrtc -> openai realtime",

      realtime: true,

      realtime_model:
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1",

      realtime_voice:
        process.env.OPENAI_REALTIME_VOICE ||
        "cedar",

      transport:
        "WebRTC",

      language:
        "de",

      connected_shop:
        "Druckelite24",

      openai_configured:
        Boolean(
          process.env.OPENAI_API_KEY
        ),

      gmail_configured:
        isGmailConfigured(),

      shopify_configured:
        Boolean(
          process.env.SHOPIFY_STORE_DOMAIN &&
          process.env.SHOPIFY_CLIENT_ID &&
          process.env.SHOPIFY_CLIENT_SECRET
        )
    });
  }
);


/* =========================================================
   ROOT
   ========================================================= */

app.get("/", (req, res) => {
  return res.sendFile(
    "index.html",
    { root: "." }
  );
});


/* =========================================================
   START
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `JARVIS ${JARVIS_VERSION} läuft auf Port ${PORT}`
    );

    console.log(
      "Realtime: AKTIVIERT"
    );

    console.log(
      `Realtime Modell: ${
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1"
      }`
    );

    console.log(
      `Realtime Stimme: ${
        process.env.OPENAI_REALTIME_VOICE ||
        "cedar"
      }`
    );

    console.log(
      "Transport: WebRTC"
    );

    console.log(
      `Shopify: ${
        process.env.SHOPIFY_STORE_DOMAIN &&
        process.env.SHOPIFY_CLIENT_ID &&
        process.env.SHOPIFY_CLIENT_SECRET
          ? "verbunden"
          : "nicht verbunden"
      }`
    );

    console.log(
      `Gmail: ${
        isGmailConfigured()
          ? "verbunden"
          : "nicht verbunden"
      }`
    );
  }
);
