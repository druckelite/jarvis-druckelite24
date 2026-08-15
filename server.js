/* =========================================================
   DRUCKELITE24 · JARVIS SERVER

   V9.0.1 · OPENAI REALTIME / WEBRTC
   FIX: SDP HANDSHAKE

   ========================================================= */

import express from "express";

const app = express();

const PORT =
  process.env.PORT || 3000;

const JARVIS_VERSION =
  "V9.0.1";


/* =========================================================
   PUBLIC FILES
   ========================================================= */

const PUBLIC_FILES =
  new Set([
    "index.html",
    "app.js",
    "styles.css",
    "Intro.mp3"
  ]);


app.get(
  "/:file",
  (req, res, next) => {

    if (
      !PUBLIC_FILES.has(
        req.params.file
      )
    ) {
      return next();
    }

    return res.sendFile(
      req.params.file,
      {
        root: "."
      }
    );
  }
);


/* =========================================================
   HELPERS
   ========================================================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(
      /[.,!?;:]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function timeoutSignal(ms) {
  try {
    if (
      typeof AbortSignal !==
        "undefined" &&
      typeof AbortSignal.timeout ===
        "function"
    ) {
      return AbortSignal.timeout(
        ms
      );
    }
  } catch {}

  return undefined;
}


/* =========================================================
   BERLIN DATE
   ========================================================= */

function berlinDate(
  date = new Date()
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "Europe/Berlin",

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit"
    }
  ).format(date);
}


function getBerlinHour(
  date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Europe/Berlin",

        hour:
          "numeric",

        hourCycle:
          "h23"
      }
    ).formatToParts(date);

  const hourPart =
    parts.find(
      part =>
        part.type === "hour"
    );

  const hour =
    Number(
      hourPart?.value
    );

  return Number.isNaN(
    hour
  )
    ? date.getHours()
    : hour;
}


function nextDateString(
  dateString
) {
  const date =
    new Date(
      `${dateString}T12:00:00Z`
    );

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}


function berlinUtcOffsetMinutes(
  date
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Europe/Berlin",

        timeZoneName:
          "shortOffset"
      }
    ).formatToParts(date);

  const label =
    parts.find(
      part =>
        part.type ===
        "timeZoneName"
    )?.value || "GMT+0";

  const match =
    label.match(
      /GMT([+-]\d+)(?::(\d+))?/
    );

  if (!match) {
    return 0;
  }

  const hours =
    Number(match[1]);

  const minutes =
    Number(
      match[2] || 0
    );

  return hours >= 0
    ? hours * 60 +
        minutes
    : hours * 60 -
        minutes;
}


function berlinMidnightUtcIso(
  dateString
) {
  const noonGuess =
    new Date(
      `${dateString}T12:00:00Z`
    );

  const offsetMinutes =
    berlinUtcOffsetMinutes(
      noonGuess
    );

  const utcMillis =
    Date.parse(
      `${dateString}T00:00:00Z`
    ) -
    offsetMinutes *
      60000;

  return new Date(
    utcMillis
  ).toISOString();
}


function getPeriodDates(
  period
) {
  const today =
    berlinDate();

  if (
    period === "yesterday"
  ) {
    const date =
      new Date(
        `${today}T12:00:00Z`
      );

    date.setUTCDate(
      date.getUTCDate() - 1
    );

    const yesterday =
      date
        .toISOString()
        .slice(0, 10);

    return {
      start:
        berlinMidnightUtcIso(
          yesterday
        ),

      end:
        berlinMidnightUtcIso(
          today
        )
    };
  }

  return {
    start:
      berlinMidnightUtcIso(
        today
      ),

    end:
      berlinMidnightUtcIso(
        nextDateString(
          today
        )
      )
  };
}


/* =========================================================
   JARVIS INSTRUCTIONS
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, der persönliche Assistent und Business-Sparringspartner von Mattl.

SPRACHE:
- Antworte ausschließlich auf Deutsch.
- Natürliches klares Hochdeutsch.
- Nur auf ausdrücklichen Wunsch eine andere Sprache.

NAME:
- Der Benutzer heißt Mattl.
- Sprich Mattl mit hörbarem T aus.
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
- kein Butler
- kein Callcenter
- kein künstliches Dauerlob

GESPRÄCH:
- Du führst ein echtes direktes Sprachgespräch mit Mattl.
- Antworte schnell und direkt.
- Kurze Fragen bekommen kurze Antworten.
- Standardmäßig 1 bis 5 gesprochene Sätze.
- Keine unnötigen Einleitungen.
- Keine unnötigen Rückfragen.
- Wenn Mattl dich unterbricht, akzeptiere die Unterbrechung sofort.
- Keine Markdown-Tabellen.
- Keine Links vorlesen.

DRUCKELITE24:
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Bereiche:
- Firmenbekleidung
- Vereinsbekleidung
- Teamsport
- Gastro
- Arbeitsbekleidung
- Events
- DTF
- Textildruck
- Shopify
- E-Commerce
- Marketing
- Verkauf

SHOPIFY:
Es gibt genau einen verbundenen Shopify-Shop:
Druckelite24.

Wenn Mattl sagt:
- mein Shop
- unser Shop
- Shopify
- Bestellungen
- Umsatz
- Verkäufe

ist Druckelite24 gemeint.

BUSINESS:
Bei passenden Fragen denke auch wie:
- Geschäftsführer
- E-Commerce-Manager
- Verkaufsleiter
- Performance-Marketer
- Datenanalyst

AKTUELLE DATEN:
Erfinde niemals aktuelle Zahlen.
Shopify, E-Mails, Wetter, Bestellungen und andere Live-Werte dürfen nur aus echten Live-Daten stammen.

SICHERHEIT:
Vor kritischen Aktionen braucht Mattl ausdrückliche Zustimmung:
- Geld ausgeben
- Preise ändern
- Kampagnen ändern
- Bestellungen stornieren
- Rückerstattungen
- Nachrichten senden
- E-Mails senden
- Daten löschen
`;


/* =========================================================
   REALTIME WEBRTC

   WICHTIG:
   MUSS VOR express.json STEHEN.
   ========================================================= */

app.post(
  "/api/realtime-session",

  express.text({
    type: [
      "application/sdp",
      "text/plain"
    ],

    limit: "1mb"
  }),

  async (req, res) => {

    try {

      if (
        !process.env
          .OPENAI_API_KEY
      ) {
        return res
          .status(500)
          .send(
            "OPENAI_API_KEY fehlt."
          );
      }


      /*
       * ABSICHTLICH NICHT trimmen.
       * SDP wird exakt weitergegeben.
       */
      const sdp =
        req.body;


      console.log(
        "[REALTIME] Body Typ:",
        typeof sdp
      );


      console.log(
        "[REALTIME] SDP Länge:",
        typeof sdp === "string"
          ? sdp.length
          : 0
      );


      console.log(
        "[REALTIME] SDP Anfang:",
        typeof sdp === "string"
          ? JSON.stringify(
              sdp.slice(
                0,
                100
              )
            )
          : "KEIN STRING"
      );


      if (
        typeof sdp !==
          "string" ||
        sdp.length === 0
      ) {
        return res
          .status(400)
          .send(
            "Kein SDP empfangen."
          );
      }


      if (
        !sdp.startsWith(
          "v=0"
        )
      ) {
        return res
          .status(400)
          .send(
            "Ungültiges SDP: beginnt nicht mit v=0."
          );
      }


      if (
        !sdp.includes(
          "m=audio"
        )
      ) {
        return res
          .status(400)
          .send(
            "Ungültiges SDP: keine Audiospur."
          );
      }


      const realtimeModel =
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1";


      const realtimeVoice =
        process.env
          .OPENAI_REALTIME_VOICE ||
        "cedar";


      /*
       * Absichtlich einfache,
       * robuste Session-Konfiguration.
       */
      const sessionConfig =
        JSON.stringify({
          type: "realtime",

          model:
            realtimeModel,

          instructions:
            JARVIS_INSTRUCTIONS,

          audio: {
            output: {
              voice:
                realtimeVoice
            }
          }
        });


      const form =
        new FormData();


      /*
       * OFFIZIELLER FLOW:
       * SDP exakt als multipart Feld.
       */
      form.set(
        "sdp",
        sdp
      );


      form.set(
        "session",
        sessionConfig
      );


      console.log(
        `[REALTIME] Sende SDP an OpenAI. Modell=${realtimeModel}, Stimme=${realtimeVoice}`
      );


      const start =
        Date.now();


      const response =
        await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`
            },

            body:
              form,

            signal:
              timeoutSignal(
                20000
              )
          }
        );


      const answerSdp =
        await response.text();


      console.log(
        `[REALTIME] OpenAI Antwort nach ${
          Date.now() -
          start
        }ms`
      );


      if (!response.ok) {
        console.error(
          "[REALTIME] OpenAI Fehler:",
          response.status,
          answerSdp
        );

        return res
          .status(
            response.status
          )
          .send(
            answerSdp
          );
      }


      console.log(
        "[REALTIME] Answer SDP Länge:",
        answerSdp.length
      );


      console.log(
        "[REALTIME] Answer SDP Anfang:",
        JSON.stringify(
          answerSdp.slice(
            0,
            100
          )
        )
      );


      res.status(200);

      res.setHeader(
        "Content-Type",
        "application/sdp"
      );

      return res.send(
        answerSdp
      );

    } catch (error) {

      console.error(
        "[REALTIME] Endpoint Fehler:",
        error
      );

      return res
        .status(500)
        .send(
          error.message ||
          "Realtime-Verbindung fehlgeschlagen."
        );
    }
  }
);


/* =========================================================
   JSON
   ERST NACH REALTIME
   ========================================================= */

app.use(
  express.json({
    limit: "2mb"
  })
);


/* =========================================================
   RESPONSES HELPERS
   ========================================================= */

function extractResponseText(
  data
) {
  if (!data) return "";

  const direct =
    String(
      data.output_text ||
      ""
    ).trim();

  if (direct) {
    return direct;
  }

  const pieces = [];

  for (
    const item of
    data.output || []
  ) {
    if (
      item?.type !==
      "message"
    ) {
      continue;
    }

    for (
      const content of
      item.content || []
    ) {
      if (
        content?.type ===
          "output_text" &&
        content?.text
      ) {
        pieces.push(
          content.text
        );
      }
    }
  }

  return pieces
    .join(" ")
    .trim();
}


/* =========================================================
   TEXT RESPONSE
   ========================================================= */

async function createJarvisResponse({
  message,
  liveData = null
}) {
  if (
    !process.env
      .OPENAI_API_KEY
  ) {
    throw new Error(
      "OPENAI_API_KEY fehlt."
    );
  }

  let input =
    String(
      message || ""
    ).trim();

  if (!input) {
    throw new Error(
      "Leere Nachricht."
    );
  }

  if (liveData) {
    input += `

LIVE-DATEN:
${JSON.stringify(
  liveData,
  null,
  2
)}

Nutze für aktuelle Werte ausschließlich diese Daten.
`;
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            model:
              process.env
                .OPENAI_TEXT_MODEL ||
              "gpt-5-mini",

            instructions:
              JARVIS_INSTRUCTIONS,

            input,

            reasoning: {
              effort:
                "minimal"
            },

            max_output_tokens:
              1200,

            store:
              false
          }),

        signal:
          timeoutSignal(
            30000
          )
      }
    );


  const raw =
    await response.text();


  let data;

  try {
    data =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "Ungültige OpenAI-Antwort."
    );
  }


  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `OpenAI HTTP ${response.status}`
    );
  }


  const text =
    extractResponseText(
      data
    );


  if (!text) {
    throw new Error(
      "Keine Antwort erzeugt."
    );
  }


  return {
    text,
    response_id:
      data.id || null
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
    process.env
      .SHOPIFY_STORE_DOMAIN;

  const clientId =
    process.env
      .SHOPIFY_CLIENT_ID;

  const clientSecret =
    process.env
      .SHOPIFY_CLIENT_SECRET;


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


  const response =
    await fetch(
      `https://${domain}/admin/oauth/access_token`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          params,

        signal:
          timeoutSignal(
            10000
          )
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

async function getShopifySummary(
  period = "today"
) {
  const domain =
    process.env
      .SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env
      .SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const {
    start,
    end
  } =
    getPeriodDates(
      period
    );

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


  const response =
    await fetch(
      `https://${domain}/admin/api/${apiVersion}/graphql.json`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Shopify-Access-Token":
            token
        },

        body:
          JSON.stringify({
            query
          }),

        signal:
          timeoutSignal(
            10000
          )
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
    data.data?.orders
      ?.nodes || [];


  const valid =
    orders.filter(
      order => {
        if (
          order.cancelledAt
        ) {
          return false;
        }

        const created =
          new Date(
            order.createdAt
          );

        return (
          created >=
            startDate &&
          created <
            endDate
        );
      }
    );


  const revenue =
    valid.reduce(
      (
        total,
        order
      ) =>
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

    shop:
      "Druckelite24",

    period,

    orders:
      valid.length,

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    average_order_value:
      Number(
        average.toFixed(2)
      ),

    currency,

    source:
      "Shopify"
  };
}


/* =========================================================
   SHOPIFY SUMMARY ENDPOINT
   ========================================================= */

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
      console.error(
        "Shopify summary:",
        error
      );

      return res
        .status(500)
        .json({
          configured:
            false,

          error:
            error.message
        });
    }
  }
);


/* =========================================================
   OPEN ORDERS
   ========================================================= */

async function getShopifyOpenOrders() {
  const domain =
    process.env
      .SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env
      .SHOPIFY_API_VERSION ||
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


  const response =
    await fetch(
      `https://${domain}/admin/api/${apiVersion}/graphql.json`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Shopify-Access-Token":
            token
        },

        body:
          JSON.stringify({
            query
          }),

        signal:
          timeoutSignal(
            10000
          )
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
      data.data?.orders
        ?.nodes || []
    ).filter(
      order =>
        !order.cancelledAt
    );


  const oldest =
    orders.length
      ? orders[0]
      : null;


  return {
    count:
      orders.length,

    oldest_order_name:
      oldest?.name ||
      null,

    oldest_order_created_at:
      oldest?.createdAt ||
      null
  };
}


/* =========================================================
   SHOP ID
   ========================================================= */

async function getShopId() {
  const domain =
    process.env
      .SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env
      .SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();


  const response =
    await fetch(
      `https://${domain}/admin/api/${apiVersion}/graphql.json`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Shopify-Access-Token":
            token
        },

        body:
          JSON.stringify({
            query:
              "query { shop { id } }"
          }),

        signal:
          timeoutSignal(
            10000
          )
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


/* =========================================================
   METAFIELDS
   ========================================================= */

async function getJarvisMetafield(
  key
) {
  const domain =
    process.env
      .SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env
      .SHOPIFY_API_VERSION ||
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


  const response =
    await fetch(
      `https://${domain}/admin/api/${apiVersion}/graphql.json`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Shopify-Access-Token":
            token
        },

        body:
          JSON.stringify({
            query
          }),

        signal:
          timeoutSignal(
            10000
          )
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
      ?.metafield
      ?.value;


  if (!raw) {
    return [];
  }


  try {
    const parsed =
      JSON.parse(raw);

    return Array.isArray(
      parsed
    )
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
    process.env
      .SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env
      .SHOPIFY_API_VERSION ||
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
        ownerId:
          shopId,

        namespace:
          "jarvis",

        key,

        type:
          "json",

        value:
          JSON.stringify(
            value
          )
      }
    ]
  };


  const response =
    await fetch(
      `https://${domain}/admin/api/${apiVersion}/graphql.json`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Shopify-Access-Token":
            token
        },

        body:
          JSON.stringify({
            query:
              mutation,

            variables
          }),

        signal:
          timeoutSignal(
            10000
          )
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


async function saveNotes(
  notes
) {
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


async function saveReminders(
  reminders
) {
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
    reminders.map(
      reminder =>
        dueIds.has(
          reminder.id
        )
          ? {
              ...reminder,

              fired:
                true,

              fired_at:
                new Date()
                  .toISOString()
            }
          : reminder
    );


  await saveReminders(
    kept
  );


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
          ok:
            true,

          hasNotice:
            false
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
        ok:
          true,

        hasNotice:
          true,

        text:
          `Mattl, Erinnerung: ${text}.`
      });

    } catch (error) {
      console.error(
        "Reminder Check:",
        error
      );

      return res.json({
        ok:
          true,

        hasNotice:
          false
      });
    }
  }
);


/* =========================================================
   GMAIL
   ========================================================= */

let gmailTokenCache = {
  token:
    null,

  expiresAt:
    0
};


function isGmailConfigured() {
  return Boolean(
    process.env
      .GOOGLE_CLIENT_ID &&

    process.env
      .GOOGLE_CLIENT_SECRET &&

    process.env
      .GOOGLE_REFRESH_TOKEN
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


  if (
    !isGmailConfigured()
  ) {
    throw new Error(
      "Gmail ist nicht konfiguriert."
    );
  }


  const params =
    new URLSearchParams({
      client_id:
        process.env
          .GOOGLE_CLIENT_ID,

      client_secret:
        process.env
          .GOOGLE_CLIENT_SECRET,

      refresh_token:
        process.env
          .GOOGLE_REFRESH_TOKEN,

      grant_type:
        "refresh_token"
    });


  const response =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          params,

        signal:
          timeoutSignal(
            10000
          )
      }
    );


  const data =
    await response.json();


  if (
    !response.ok ||
    !data.access_token
  ) {
    throw new Error(
      "Gmail Auth fehlgeschlagen."
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


/* =========================================================
   GET NEW EMAILS
   ========================================================= */

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
          timeoutSignal(
            10000
          )
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
    listData.messages ||
    [];


  if (!refs.length) {
    return [];
  }


  const emails = [];


  for (
    const ref of refs
  ) {
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
              timeoutSignal(
                10000
              )
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        continue;
      }


      const headers =
        data.payload
          ?.headers || [];


      const subject =
        headers.find(
          item =>
            item.name ===
            "Subject"
        )?.value ||
        "(kein Betreff)";


      const from =
        headers.find(
          item =>
            item.name ===
            "From"
        )?.value ||
        "unbekannt";


      emails.push({
        id:
          ref.id,

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
   WEATHER
   ========================================================= */

async function getWeatherData(
  location =
    "Ludwigshafen am Rhein"
) {
  let placeName =
    String(
      location || ""
    ).trim();


  if (!placeName) {
    placeName =
      "Ludwigshafen am Rhein";
  }


  const geo =
    new URL(
      "https://geocoding-api.open-meteo.com/v1/search"
    );


  geo.searchParams.set(
    "name",
    placeName
  );

  geo.searchParams.set(
    "count",
    "5"
  );

  geo.searchParams.set(
    "language",
    "de"
  );

  geo.searchParams.set(
    "format",
    "json"
  );


  const geoResponse =
    await fetch(
      geo,
      {
        signal:
          timeoutSignal(
            8000
          )
      }
    );


  const geoData =
    await geoResponse.json();


  const candidates =
    geoData.results ||
    [];


  if (!candidates.length) {
    throw new Error(
      "Ort nicht gefunden."
    );
  }


  const place =
    candidates.find(
      item =>
        item.country_code ===
        "DE"
    ) ||
    candidates[0];


  const weather =
    new URL(
      "https://api.open-meteo.com/v1/forecast"
    );


  weather.searchParams.set(
    "latitude",
    String(
      place.latitude
    )
  );

  weather.searchParams.set(
    "longitude",
    String(
      place.longitude
    )
  );

  weather.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
  );

  weather.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max"
  );

  weather.searchParams.set(
    "timezone",
    "auto"
  );

  weather.searchParams.set(
    "forecast_days",
    "2"
  );


  const response =
    await fetch(
      weather,
      {
        signal:
          timeoutSignal(
            8000
          )
      }
    );


  const data =
    await response.json();


  return {
    source:
      "Open-Meteo",

    location: {
      name:
        place.name,

      region:
        place.admin1 || "",

      country:
        place.country || ""
    },

    current:
      data.current,

    forecast: {
      max_temperature:
        data.daily
          ?.temperature_2m_max
          ?.[0],

      min_temperature:
        data.daily
          ?.temperature_2m_min
          ?.[0],

      precipitation_probability:
        data.daily
          ?.precipitation_probability_max
          ?.[0]
    }
  };
}


/* =========================================================
   WEATHER ENDPOINT
   ========================================================= */

app.post(
  "/api/weather",
  async (req, res) => {
    try {
      return res.json(
        await getWeatherData(
          req.body?.location ||
          "Ludwigshafen am Rhein"
        )
      );

    } catch (error) {
      return res
        .status(500)
        .json({
          error:
            error.message
        });
    }
  }
);


/* =========================================================
   PROACTIVE CHECK
   ========================================================= */

let lastBriefingDate =
  null;


let lastProactiveNotice = {
  unfulfilledCount:
    null,

  notifiedAt:
    0
};


const notifiedEmailIds =
  new Set();


const PROACTIVE_REMINDER_COOLDOWN_MS =
  2 *
  60 *
  60 *
  1000;


app.post(
  "/api/jarvis-checkin",
  async (req, res) => {

    try {

      const today =
        berlinDate();

      const hour =
        getBerlinHour();


      /* Morgenbriefing */

      if (
        hour >= 5 &&
        hour < 11 &&
        lastBriefingDate !==
          today
      ) {
        try {
          const yesterday =
            await getShopifySummary(
              "yesterday"
            );

          const open =
            await getShopifyOpenOrders();

          const weather =
            await getWeatherData();


          const result =
            await createJarvisResponse({
              message:
                `[SYSTEM-HINWEIS] Morgen-Briefing für Mattl. ` +
                `Gestern: ${yesterday.revenue} Euro Umsatz bei ${yesterday.orders} Bestellungen. ` +
                `Aktuell ${open.count} unbearbeitete Bestellungen. ` +
                `Temperatur aktuell ${weather.current?.temperature_2m} Grad. ` +
                `Fasse das locker in maximal vier Sätzen zusammen.`
            });


          lastBriefingDate =
            today;


          return res.json({
            ok:
              true,

            hasNotice:
              true,

            text:
              result.text
          });

        } catch (error) {
          console.warn(
            "Morning briefing:",
            error
          );
        }
      }


      /* Gmail */

      if (
        isGmailConfigured()
      ) {
        try {
          const emails =
            await getNewEmails();


          const unseen =
            emails.filter(
              email =>
                !notifiedEmailIds.has(
                  email.id
                )
            );


          if (
            unseen.length
          ) {
            for (
              const email of
              unseen
            ) {
              notifiedEmailIds.add(
                email.id
              );
            }


            const emailText =
              unseen
                .map(
                  email =>
                    `Von ${email.from}, Betreff ${email.subject}`
                )
                .join("; ");


            const result =
              await createJarvisResponse({
                message:
                  `[SYSTEM-HINWEIS] ${unseen.length} neue ungelesene E-Mails: ${emailText}. Weise Mattl kurz darauf hin.`
              });


            return res.json({
              ok:
                true,

              hasNotice:
                true,

              text:
                result.text
            });
          }

        } catch (error) {
          console.warn(
            "Gmail Check:",
            error
          );
        }
      }


      /* offene Bestellungen */

      const open =
        await getShopifyOpenOrders();


      if (!open.count) {
        lastProactiveNotice = {
          unfulfilledCount:
            0,

          notifiedAt:
            Date.now()
        };


        return res.json({
          ok:
            true,

          hasNotice:
            false
        });
      }


      const changed =
        lastProactiveNotice
          .unfulfilledCount !==
        open.count;


      const cooldown =
        Date.now() -
          lastProactiveNotice
            .notifiedAt >
        PROACTIVE_REMINDER_COOLDOWN_MS;


      if (
        !changed &&
        !cooldown
      ) {
        return res.json({
          ok:
            true,

          hasNotice:
            false
        });
      }


      lastProactiveNotice = {
        unfulfilledCount:
          open.count,

        notifiedAt:
          Date.now()
      };


      const result =
        await createJarvisResponse({
          message:
            `[SYSTEM-HINWEIS] Aktuell gibt es ${open.count} unbearbeitete Bestellungen bei Druckelite24. Sag Mattl kurz Bescheid.`
        });


      return res.json({
        ok:
          true,

        hasNotice:
          true,

        text:
          result.text
      });


    } catch (error) {
      console.error(
        "Checkin:",
        error
      );


      return res.json({
        ok:
          true,

        hasNotice:
          false
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
      ok:
        true,

      version:
        `JARVIS ${JARVIS_VERSION}`,

      architecture:
        "WebRTC OpenAI Realtime",

      realtime:
        true,

      realtime_model:
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1",

      realtime_voice:
        process.env
          .OPENAI_REALTIME_VOICE ||
        "cedar",

      transport:
        "WebRTC",

      openai_configured:
        Boolean(
          process.env
            .OPENAI_API_KEY
        ),

      shopify_configured:
        Boolean(
          process.env
            .SHOPIFY_STORE_DOMAIN &&
          process.env
            .SHOPIFY_CLIENT_ID &&
          process.env
            .SHOPIFY_CLIENT_SECRET
        ),

      gmail_configured:
        isGmailConfigured()
    });
  }
);


/* =========================================================
   ROOT
   ========================================================= */

app.get(
  "/",
  (req, res) => {
    return res.sendFile(
      "index.html",
      {
        root: "."
      }
    );
  }
);


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
      "Realtime: AKTIV"
    );

    console.log(
      `Modell: ${
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1"
      }`
    );

    console.log(
      `Stimme: ${
        process.env
          .OPENAI_REALTIME_VOICE ||
        "cedar"
      }`
    );

    console.log(
      `Shopify: ${
        process.env
            .SHOPIFY_STORE_DOMAIN &&
        process.env
            .SHOPIFY_CLIENT_ID &&
        process.env
            .SHOPIFY_CLIENT_SECRET
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
