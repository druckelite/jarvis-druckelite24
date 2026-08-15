/* =========================================================
   DRUCKELITE24 · JARVIS SERVER

   V9.1 · REALTIME + BUSINESS TOOLS
   ========================================================= */

import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const JARVIS_VERSION = "V9.1";


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
  if (!PUBLIC_FILES.has(req.params.file)) {
    return next();
  }

  return res.sendFile(req.params.file, {
    root: "."
  });
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
   BERLIN TIME
   ========================================================= */

function berlinDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function berlinDateTimeText() {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());
}

function getBerlinHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(date);

  const hour = Number(
    parts.find(part => part.type === "hour")?.value
  );

  return Number.isNaN(hour)
    ? date.getHours()
    : hour;
}

function nextDateString(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function berlinUtcOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "shortOffset"
  }).formatToParts(date);

  const label =
    parts.find(
      part =>
        part.type ===
        "timeZoneName"
    )?.value ||
    "GMT+0";

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
    ? hours * 60 + minutes
    : hours * 60 - minutes;
}

function berlinMidnightUtcIso(dateString) {
  const noon =
    new Date(
      `${dateString}T12:00:00Z`
    );

  const offset =
    berlinUtcOffsetMinutes(noon);

  return new Date(
    Date.parse(
      `${dateString}T00:00:00Z`
    ) -
      offset * 60000
  ).toISOString();
}

function getPeriodDates(period) {
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
        nextDateString(today)
      )
  };
}


/* =========================================================
   JARVIS PERSONALITY
   ========================================================= */

function buildJarvisInstructions() {
  return `
Du bist JARVIS, der persönliche Assistent und Business-Sparringspartner von Mattl.

AKTUELLE ZEIT:
${berlinDateTimeText()}.
Zeitzone ist Europe/Berlin.

SPRACHE:
- ausschließlich Deutsch
- klares natürliches Hochdeutsch
- andere Sprache nur auf ausdrücklichen Wunsch

NAME:
- Benutzer heißt Mattl
- T in Mattl deutlich aussprechen
- nicht Maddl

CHARAKTER:
- intelligent
- ruhig
- souverän
- direkt
- locker
- warm
- trocken humorvoll
- gelegentlich frech
- kein Butler
- kein Callcenter
- kein künstliches Dauerlob

SPRACHGESPRÄCH:
- normales direktes Sprachgespräch
- antworte schnell
- kurze Frage = kurze Antwort
- meist 1 bis 5 Sätze
- keine unnötigen Einleitungen
- keine unnötigen Rückfragen
- Unterbrechungen sofort akzeptieren
- keine Links vorlesen
- keine Markdown-Tabellen

TOOLS:
Du besitzt echte Tools.
Wenn Mattl nach Live-Daten fragt, MUSST du das passende Tool benutzen.
Erfinde keine aktuellen Werte.

SHOPIFY:
Bei Fragen nach:
- Umsatz
- Bestellungen
- Shop
- Verkäufen
- Bestellwert
- offenen Bestellungen
- letzter Woche

benutze das passende Shopify-Tool.

Druckelite24 ist der einzige verbundene Shop.

GMAIL:
Wenn Mattl nach:
- neuen Mails
- ungelesenen Mails
- Posteingang
- wichtigen Kundenmails
fragt, benutze get_unread_emails.

WETTER:
Bei Wetterfragen benutze get_weather.

NOTIZEN:
Bei "notiere", "merk dir", "schreib auf" benutze save_note.
Bei Fragen nach gespeicherten Notizen benutze list_notes.

ERINNERUNGEN:
Bei "erinnere mich", "Timer", "Wecker" benutze set_reminder.
Berechne minutes_from_now anhand der aktuellen Europe/Berlin-Zeit.
Bei Fragen nach laufenden Erinnerungen benutze list_reminders.

E-MAIL-ENTWÜRFE:
Wenn Mattl einen E-Mail-Text oder Entwurf schreiben lassen möchte,
benutze create_email_draft.
Sag danach nur kurz, dass der Entwurf im HUD angezeigt wird.
Lies nicht die komplette lange Mail vor.

DRUCKELITE24:
Unternehmen für individuell bedruckte Textilien.

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

SICHERHEIT:
Vor Aktionen wie:
- Geld ausgeben
- Preise ändern
- Kampagnen ändern
- Bestellung stornieren
- Rückerstattung
- E-Mail tatsächlich senden
- Daten löschen
brauchst du ausdrückliche Bestätigung.

Die aktuell vorhandenen Tools versenden keine E-Mails und ändern keine Kampagnen.
`;
}


/* =========================================================
   REALTIME TOOL DEFINITIONS
   ========================================================= */

const REALTIME_TOOLS = [
  {
    type: "function",
    name: "get_shopify_summary",
    description:
      "Liest live den Shopify-Umsatz, die Anzahl Bestellungen und den durchschnittlichen Bestellwert für heute oder gestern bei Druckelite24.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: [
            "today",
            "yesterday"
          ]
        }
      },
      required: [
        "period"
      ],
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "get_shopify_open_orders",
    description:
      "Liest die aktuell noch nicht erfüllten beziehungsweise unbearbeiteten Shopify-Bestellungen von Druckelite24.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "get_shopify_week",
    description:
      "Liest Umsatz und Anzahl Bestellungen für die letzten sieben Kalendertage aus Shopify.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "get_unread_emails",
    description:
      "Liest bis zu zehn ungelesene Gmail-Nachrichten mit Absender, Betreff und kurzem Ausschnitt. Erkennt auch mögliche Angebots- oder Preisanfragen.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "get_weather",
    description:
      "Liest aktuelle Wetterdaten und Vorhersage für heute oder morgen. Standardort ist Ludwigshafen am Rhein.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string"
        },
        day: {
          type: "string",
          enum: [
            "today",
            "tomorrow"
          ]
        }
      },
      required: [
        "location",
        "day"
      ],
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "save_note",
    description:
      "Speichert eine Notiz oder Idee von Mattl dauerhaft im JARVIS-Shopify-Metafeld.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string"
        }
      },
      required: [
        "text"
      ],
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "list_notes",
    description:
      "Liest die gespeicherten JARVIS-Notizen.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "set_reminder",
    description:
      "Speichert eine Erinnerung. minutes_from_now ist die Anzahl Minuten ab jetzt, reminder_text ist der eigentliche Inhalt.",
    parameters: {
      type: "object",
      properties: {
        minutes_from_now: {
          type: "integer",
          minimum: 1
        },
        reminder_text: {
          type: "string"
        }
      },
      required: [
        "minutes_from_now",
        "reminder_text"
      ],
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "list_reminders",
    description:
      "Liest alle aktuell noch aktiven Erinnerungen.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "create_email_draft",
    description:
      "Erstellt einen vollständigen deutschen E-Mail-Entwurf mit Betreff und Text und zeigt ihn im JARVIS-HUD an. Versendet nichts.",
    parameters: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description:
            "Mattls vollständige Anweisung für den gewünschten E-Mail-Entwurf."
        }
      },
      required: [
        "instruction"
      ],
      additionalProperties: false
    }
  }
];


/* =========================================================
   REALTIME SESSION
   WICHTIG: MUSS VOR express.json() STEHEN
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
        !process.env.OPENAI_API_KEY
      ) {
        return res
          .status(500)
          .send(
            "OPENAI_API_KEY fehlt."
          );
      }

      const sdp =
        req.body;

      if (
        typeof sdp !== "string" ||
        !sdp.startsWith("v=0")
      ) {
        return res
          .status(400)
          .send(
            "Ungültiges SDP."
          );
      }

      const model =
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1";

      const voice =
        process.env.OPENAI_REALTIME_VOICE ||
        "cedar";

      const sessionConfig =
        JSON.stringify({
          type: "realtime",
          model,
          instructions:
            buildJarvisInstructions(),
          tools:
            REALTIME_TOOLS,
          tool_choice:
            "auto",
          audio: {
            input: {
              turn_detection: {
                type: "server_vad"
              }
            },
            output: {
              voice
            }
          }
        });

      const form =
        new FormData();

      form.set(
        "sdp",
        sdp
      );

      form.set(
        "session",
        sessionConfig
      );

      console.log(
        `[REALTIME] ${model} / ${voice} / ${REALTIME_TOOLS.length} Tools`
      );

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

      const answer =
        await response.text();

      if (!response.ok) {
        console.error(
          "Realtime OpenAI Fehler:",
          response.status,
          answer
        );

        return res
          .status(
            response.status
          )
          .send(answer);
      }

      res.setHeader(
        "Content-Type",
        "application/sdp"
      );

      return res.send(
        answer
      );

    } catch (error) {
      console.error(
        "Realtime session:",
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
   ========================================================= */

app.use(
  express.json({
    limit: "2mb"
  })
);


/* =========================================================
   OPENAI RESPONSE TEXT HELPER
   ========================================================= */

function extractResponseText(data) {
  if (!data) {
    return "";
  }

  if (
    data.output_text
  ) {
    return String(
      data.output_text
    ).trim();
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
        content.text
      ) {
        pieces.push(
          content.text
        );
      }
    }
  }

  return pieces
    .join("\n")
    .trim();
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

  shopifyTokenCache = {
    token:
      data.access_token,
    expiresAt:
      Date.now() +
      Number(
        data.expires_in ||
        86399
      ) *
        1000
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
    process.env.SHOPIFY_STORE_DOMAIN;

  const version =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const {
    start,
    end
  } =
    getPeriodDates(period);

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
      `https://${domain}/admin/api/${version}/graphql.json`,
      {
        method: "POST",
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

  const startDate =
    new Date(start);

  const endDate =
    new Date(end);

  const valid =
    (
      data.data?.orders
        ?.nodes || []
    ).filter(
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
          created >= startDate &&
          created < endDate
        );
      }
    );

  const revenue =
    valid.reduce(
      (sum, order) =>
        sum +
        Number(
          order
            .currentTotalPriceSet
            ?.shopMoney
            ?.amount ||
          0
        ),
      0
    );

  return {
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
      valid.length
        ? Number(
            (
              revenue /
              valid.length
            ).toFixed(2)
          )
        : 0,
    currency:
      valid[0]
        ?.currentTotalPriceSet
        ?.shopMoney
        ?.currencyCode ||
      "EUR"
  };
}


/* =========================================================
   OPEN ORDERS
   ========================================================= */

async function getShopifyOpenOrders() {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const version =
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

  const response =
    await fetch(
      `https://${domain}/admin/api/${version}/graphql.json`,
      {
        method: "POST",
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

  return {
    count:
      orders.length,
    oldest_order_name:
      orders[0]?.name ||
      null,
    oldest_order_created_at:
      orders[0]?.createdAt ||
      null,
    orders:
      orders.slice(
        0,
        15
      )
  };
}


/* =========================================================
   SHOPIFY WEEK
   ========================================================= */

async function getShopifyWeek() {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const version =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const query = `
    query JarvisWeek {
      orders(
        first: 250,
        sortKey: CREATED_AT,
        reverse: true
      ) {
        nodes {
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
      `https://${domain}/admin/api/${version}/graphql.json`,
      {
        method: "POST",
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
      "Shopify-Wochendaten konnten nicht gelesen werden."
    );
  }

  const today =
    berlinDate();

  const days = [];

  for (
    let i = 6;
    i >= 0;
    i--
  ) {
    const date =
      new Date(
        `${today}T12:00:00Z`
      );

    date.setUTCDate(
      date.getUTCDate() - i
    );

    days.push({
      date:
        date
          .toISOString()
          .slice(0, 10),
      orders: 0,
      revenue: 0
    });
  }

  const map =
    new Map(
      days.map(
        day => [
          day.date,
          day
        ]
      )
    );

  for (
    const order of
    data.data?.orders
      ?.nodes || []
  ) {
    if (
      order.cancelledAt
    ) {
      continue;
    }

    const date =
      new Intl.DateTimeFormat(
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
      ).format(
        new Date(
          order.createdAt
        )
      );

    const bucket =
      map.get(date);

    if (!bucket) {
      continue;
    }

    bucket.orders += 1;

    bucket.revenue +=
      Number(
        order
          .currentTotalPriceSet
          ?.shopMoney
          ?.amount ||
        0
      );
  }

  for (
    const day of days
  ) {
    day.revenue =
      Number(
        day.revenue.toFixed(2)
      );
  }

  return {
    days,
    currency:
      "EUR"
  };
}


/* =========================================================
   SHOPIFY METAFIELDS
   ========================================================= */

async function getShopId() {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const version =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const response =
    await fetch(
      `https://${domain}/admin/api/${version}/graphql.json`,
      {
        method: "POST",
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
    !data.data?.shop?.id
  ) {
    throw new Error(
      "Shop-ID nicht verfügbar."
    );
  }

  return data.data.shop.id;
}


async function readJarvisField(key) {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const version =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const query = `
    query {
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
      `https://${domain}/admin/api/${version}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "X-Shopify-Access-Token":
            token
        },
        body:
          JSON.stringify({
            query
          })
      }
    );

  const data =
    await response.json();

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

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch {
    return [];
  }
}


async function writeJarvisField(
  key,
  value
) {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const version =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const shopId =
    await getShopId();

  const mutation = `
    mutation SetJarvis(
      $metafields:
        [MetafieldsSetInput!]!
    ) {
      metafieldsSet(
        metafields:
          $metafields
      ) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response =
    await fetch(
      `https://${domain}/admin/api/${version}/graphql.json`,
      {
        method: "POST",
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
            variables: {
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
            }
          })
      }
    );

  const data =
    await response.json();

  const errors =
    data.data
      ?.metafieldsSet
      ?.userErrors ||
    [];

  if (
    !response.ok ||
    data.errors ||
    errors.length
  ) {
    throw new Error(
      `Speichern von ${key} fehlgeschlagen.`
    );
  }
}


/* =========================================================
   NOTES
   ========================================================= */

async function saveNote(text) {
  const notes =
    await readJarvisField(
      "notes"
    );

  notes.push({
    text:
      String(text).trim(),
    created_at:
      new Date()
        .toISOString()
  });

  await writeJarvisField(
    "notes",
    notes
  );

  return {
    saved: true,
    text:
      String(text).trim(),
    total:
      notes.length
  };
}


/* =========================================================
   REMINDERS
   ========================================================= */

async function setReminder(
  minutes,
  text
) {
  const reminders =
    await readJarvisField(
      "reminders"
    );

  const safeMinutes =
    Math.max(
      1,
      Math.round(
        Number(minutes) ||
        1
      )
    );

  const dueAt =
    new Date(
      Date.now() +
      safeMinutes *
        60000
    ).toISOString();

  reminders.push({
    id:
      `${Date.now()}`,
    text:
      String(text).trim(),
    due_at:
      dueAt,
    fired:
      false
  });

  await writeJarvisField(
    "reminders",
    reminders
  );

  return {
    saved:
      true,
    reminder_text:
      String(text).trim(),
    minutes_from_now:
      safeMinutes,
    due_at:
      dueAt
  };
}


async function getActiveReminders() {
  const reminders =
    await readJarvisField(
      "reminders"
    );

  return reminders.filter(
    reminder =>
      !reminder.fired
  );
}


async function checkAndFireDueReminders() {
  const reminders =
    await readJarvisField(
      "reminders"
    );

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

  const ids =
    new Set(
      due.map(
        reminder =>
          reminder.id
      )
    );

  const updated =
    reminders.map(
      reminder =>
        ids.has(
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

  await writeJarvisField(
    "reminders",
    updated
  );

  return due;
}


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
        process.env.GOOGLE_CLIENT_ID,
      client_secret:
        process.env.GOOGLE_CLIENT_SECRET,
      refresh_token:
        process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:
        "refresh_token"
    });

  const response =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body:
          params
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.access_token
  ) {
    throw new Error(
      "Gmail-Anmeldung fehlgeschlagen."
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


function looksLikeOffer(email) {
  const text =
    normalize(
      `${email.subject} ${email.snippet}`
    );

  return [
    "angebot",
    "anfrage",
    "preisanfrage",
    "kostenvoranschlag",
    "was kostet",
    "wie viel kostet",
    "wieviel kostet",
    "angebot anfordern"
  ].some(
    word =>
      text.includes(word)
  );
}


async function getUnreadEmails() {
  const token =
    await getGmailAccessToken();

  const list =
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
    await list.json();

  if (!list.ok) {
    throw new Error(
      "Gmail konnte nicht gelesen werden."
    );
  }

  const result = [];

  for (
    const ref of
    listData.messages ||
    []
  ) {
    const response =
      await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      );

    if (!response.ok) {
      continue;
    }

    const data =
      await response.json();

    const headers =
      data.payload?.headers ||
      [];

    const email = {
      id:
        ref.id,
      subject:
        headers.find(
          h =>
            h.name ===
            "Subject"
        )?.value ||
        "(kein Betreff)",
      from:
        headers.find(
          h =>
            h.name ===
            "From"
        )?.value ||
        "unbekannt",
      snippet:
        data.snippet ||
        ""
    };

    email.possible_offer_inquiry =
      looksLikeOffer(email);

    result.push(email);
  }

  return result;
}


/* =========================================================
   WEATHER
   ========================================================= */

async function getWeatherData(
  location,
  day
) {
  const placeName =
    String(
      location ||
      "Ludwigshafen am Rhein"
    );

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

  const place =
    (
      geoData.results ||
      []
    ).find(
      candidate =>
        candidate.country_code ===
        "DE"
    ) ||
    geoData.results?.[0];

  if (!place) {
    throw new Error(
      "Ort nicht gefunden."
    );
  }

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
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
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

  const index =
    day === "tomorrow"
      ? 1
      : 0;

  return {
    location: {
      name:
        place.name,
      region:
        place.admin1 ||
        ""
    },
    requested_day:
      day,
    current:
      day === "today"
        ? data.current
        : null,
    forecast: {
      date:
        data.daily?.time?.[
          index
        ],
      max_temperature:
        data.daily
          ?.temperature_2m_max
          ?.[index],
      min_temperature:
        data.daily
          ?.temperature_2m_min
          ?.[index],
      precipitation_probability:
        data.daily
          ?.precipitation_probability_max
          ?.[index],
      weather_code:
        data.daily
          ?.weather_code
          ?.[index]
    }
  };
}


/* =========================================================
   EMAIL DRAFT
   ========================================================= */

async function createEmailDraft(
  instruction
) {
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
              process.env.OPENAI_TEXT_MODEL ||
              "gpt-5-mini",
            instructions:
              `Erstelle einen professionellen deutschen E-Mail-Entwurf für Mattl von Druckelite24.
Gib ausschließlich Betreff und vollständigen Mailtext als JSON zurück.`,
            input:
              String(
                instruction
              ),
            reasoning: {
              effort:
                "low"
            },
            text: {
              format: {
                type:
                  "json_schema",
                name:
                  "email_draft",
                strict:
                  true,
                schema: {
                  type:
                    "object",
                  properties: {
                    subject: {
                      type:
                        "string"
                    },
                    body: {
                      type:
                        "string"
                    }
                  },
                  required: [
                    "subject",
                    "body"
                  ],
                  additionalProperties:
                    false
                }
              }
            },
            store:
              false
          }),
        signal:
          timeoutSignal(
            30000
          )
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "E-Mail-Entwurf fehlgeschlagen."
    );
  }

  const parsed =
    JSON.parse(
      extractResponseText(
        data
      )
    );

  return {
    subject:
      parsed.subject,
    body:
      parsed.body
  };
}


/* =========================================================
   REALTIME TOOL DISPATCHER
   ========================================================= */

app.post(
  "/api/realtime-tool",
  async (req, res) => {
    const name =
      String(
        req.body?.name ||
        ""
      );

    const args =
      req.body?.arguments ||
      {};

    console.log(
      "[TOOL]",
      name,
      args
    );

    try {
      let data;

      switch (name) {
        case "get_shopify_summary":
          data =
            await getShopifySummary(
              args.period ===
                "yesterday"
                ? "yesterday"
                : "today"
            );
          break;

        case "get_shopify_open_orders":
          data =
            await getShopifyOpenOrders();
          break;

        case "get_shopify_week":
          data =
            await getShopifyWeek();
          break;

        case "get_unread_emails":
          data = {
            emails:
              await getUnreadEmails()
          };
          break;

        case "get_weather":
          data =
            await getWeatherData(
              args.location ||
                "Ludwigshafen am Rhein",
              args.day ===
                "tomorrow"
                ? "tomorrow"
                : "today"
            );
          break;

        case "save_note":
          data =
            await saveNote(
              args.text
            );
          break;

        case "list_notes":
          data = {
            notes:
              await readJarvisField(
                "notes"
              )
          };
          break;

        case "set_reminder":
          data =
            await setReminder(
              args.minutes_from_now,
              args.reminder_text
            );
          break;

        case "list_reminders":
          data = {
            reminders:
              await getActiveReminders()
          };
          break;

        case "create_email_draft": {
          const draft =
            await createEmailDraft(
              args.instruction
            );

          return res.json({
            ok:
              true,
            draft,
            result: {
              created:
                true,
              subject:
                draft.subject,
              instruction:
                "Der vollständige Entwurf wird im HUD angezeigt. Sag Mattl nur kurz, dass er fertig ist."
            }
          });
        }

        default:
          return res
            .status(400)
            .json({
              ok:
                false,
              error:
                `Unbekanntes Tool: ${name}`
            });
      }

      return res.json({
        ok:
          true,
        result:
          data
      });

    } catch (error) {
      console.error(
        "Realtime Tool Fehler:",
        name,
        error
      );

      return res
        .status(500)
        .json({
          ok:
            false,
          error:
            error.message ||
            "Tool fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   REMINDER BACKGROUND CHECK
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

      return res.json({
        ok:
          true,
        hasNotice:
          true,
        text:
          `Mattl, Erinnerung: ${due
            .map(
              reminder =>
                reminder.text
            )
            .join("; ")}.`
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
   PROACTIVE CHECK
   ========================================================= */

let lastOpenOrdersNotice = {
  count:
    null,
  at:
    0
};

const notifiedEmailIds =
  new Set();

app.post(
  "/api/jarvis-checkin",
  async (req, res) => {
    try {
      if (
        isGmailConfigured()
      ) {
        try {
          const emails =
            await getUnreadEmails();

          const fresh =
            emails.filter(
              email =>
                !notifiedEmailIds.has(
                  email.id
                )
            );

          if (
            fresh.length
          ) {
            for (
              const email of
              fresh
            ) {
              notifiedEmailIds.add(
                email.id
              );
            }

            const offerCount =
              fresh.filter(
                email =>
                  email.possible_offer_inquiry
              ).length;

            return res.json({
              ok:
                true,
              hasNotice:
                true,
              text:
                `Mattl, ${fresh.length} neue ungelesene ${
                  fresh.length === 1
                    ? "Mail"
                    : "Mails"
                }.${
                  offerCount
                    ? ` ${offerCount} davon sieht nach einer Angebots- oder Preisanfrage aus.`
                    : ""
                }`
            });
          }

        } catch (error) {
          console.warn(
            "Gmail Hintergrund:",
            error
          );
        }
      }

      try {
        const open =
          await getShopifyOpenOrders();

        if (!open.count) {
          lastOpenOrdersNotice = {
            count:
              0,
            at:
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
          lastOpenOrdersNotice.count !==
          open.count;

        const cooldown =
          Date.now() -
            lastOpenOrdersNotice.at >
          2 *
            60 *
            60 *
            1000;

        if (
          changed ||
          cooldown
        ) {
          lastOpenOrdersNotice = {
            count:
              open.count,
            at:
              Date.now()
          };

          return res.json({
            ok:
              true,
            hasNotice:
              true,
            text:
              `Mattl, aktuell sind ${open.count} Bestellungen noch unbearbeitet.`
          });
        }

      } catch (error) {
        console.warn(
          "Shopify Hintergrund:",
          error
        );
      }

      return res.json({
        ok:
          true,
        hasNotice:
          false
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
   MANUAL DEBUG ENDPOINTS
   ========================================================= */

app.post(
  "/api/shopify-summary",
  async (req, res) => {
    try {
      return res.json(
        await getShopifySummary(
          req.body?.period ===
            "yesterday"
            ? "yesterday"
            : "today"
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

app.post(
  "/api/weather",
  async (req, res) => {
    try {
      return res.json(
        await getWeatherData(
          req.body?.location ||
            "Ludwigshafen am Rhein",
          req.body?.day ===
            "tomorrow"
            ? "tomorrow"
            : "today"
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
      realtime:
        true,
      realtime_model:
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1",
      realtime_voice:
        process.env.OPENAI_REALTIME_VOICE ||
        "cedar",
      realtime_tools:
        REALTIME_TOOLS.map(
          tool =>
            tool.name
        ),
      shopify:
        Boolean(
          process.env.SHOPIFY_STORE_DOMAIN &&
          process.env.SHOPIFY_CLIENT_ID &&
          process.env.SHOPIFY_CLIENT_SECRET
        ),
      gmail:
        isGmailConfigured(),
      notes:
        true,
      reminders:
        true,
      weather:
        true,
      email_drafts:
        true
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
      `Realtime: ${
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1"
      }`
    );

    console.log(
      `Voice: ${
        process.env.OPENAI_REALTIME_VOICE ||
        "cedar"
      }`
    );

    console.log(
      `Tools: ${REALTIME_TOOLS
        .map(
          tool =>
            tool.name
        )
        .join(", ")}`
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
