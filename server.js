import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   BASIC
   ========================================================= */

app.use(express.static("."));
app.use(express.json({ limit: "2mb" }));


/* =========================================================
   JARVIS PERSONALITY
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, der persönliche Voice- und Business-Assistent von Mattl.

SPRACHE
- Sprich ausschließlich Deutsch.
- Nur wenn Mattl ausdrücklich eine andere Sprache verlangt, darfst du wechseln.
- Natürliches, klares Hochdeutsch.
- Keine englischen Standardantworten.

AUSSPRACHE
- Der Benutzer heißt Mattl.
- Das T soll deutlich hörbar sein.
- Aussprache ungefähr: Mat-tl.
- Nicht Maddl.

CHARAKTER
- Ruhig.
- Souverän.
- Intelligent.
- Warm.
- Eher tief und kontrolliert.
- Präzise.
- Trocken humorvoll.
- Gelegentlich frech oder sarkastisch.
- Bei ernsten Themen sofort sachlich.

Du darfst sehr selten sagen:
"Du bist der beste Chef."

Aber nicht schleimen.

GESPRÄCH
- Mattl kann ganz normal mit dir reden.
- Beantworte seine eigentliche Frage zuerst.
- Standardmäßig eher kurz.
- Keine ungefragten langen Monologe.
- Keine automatischen Anschlussfragen.
- Wenn die Antwort fertig ist, schweigen.
- Wenn du etwas nicht verstanden hast, frage kurz nach.

LIVE-DATEN
- Erfinde niemals aktuelle Daten.
- Aktuelle Shopify-Daten kommen ausschließlich aus Shopify.
- Wetterdaten kommen ausschließlich aus dem Wetterdienst.
- Aktuelle E-Mails und Termine dürfen niemals erfunden werden.

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Wichtige Themen:
- Firmenbekleidung
- Vereinsbekleidung
- Teamsport
- Gastro
- Events
- Arbeitsbekleidung
- DTF
- Textildruck
- Shopify
- E-Commerce

BUSINESS
Denke zusätzlich wie ein guter Geschäftsführer und E-Commerce-Berater.
Wenn dir eine wirklich relevante Chance oder ein Risiko auffällt,
darfst du nach der eigentlichen Antwort EINEN kurzen Hinweis geben.

ABSOLUT VERBOTEN
Wenn Mattl nach Shopify, Umsatz oder Bestellungen fragt:
- keine Reisen
- keine Workouts
- keine Kalorien
- kein Essen bestellen
- keine Hotels
- keine themenfremden Vorschläge

Wenn du eine Information nicht hast:
sage es klar.
`;


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


function berlinDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}


function nextDateString(dateString) {
  const date =
    new Date(`${dateString}T12:00:00Z`);

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}


function getPeriodDates(period) {
  const today =
    berlinDate();

  if (period === "yesterday") {
    const date =
      new Date(`${today}T12:00:00Z`);

    date.setUTCDate(
      date.getUTCDate() - 1
    );

    const yesterday =
      date
        .toISOString()
        .slice(0, 10);

    return {
      start: yesterday,
      end: today
    };
  }

  return {
    start: today,
    end: nextDateString(today)
  };
}


function formatMoney(
  value,
  currency = "EUR"
) {
  return new Intl.NumberFormat(
    "de-DE",
    {
      style: "currency",
      currency
    }
  ).format(
    Number(value || 0)
  );
}


/* =========================================================
   OPENAI TRANSCRIPTION
   ========================================================= */

/*
 * Browser sendet direkt Audio/WebM.
 * Kein Multer und kein zusätzliches Paket nötig.
 */

app.post(
  "/api/transcribe",

  express.raw({
    type: [
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "application/octet-stream"
    ],

    limit: "20mb"
  }),

  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res
          .status(500)
          .json({
            error:
              "OPENAI_API_KEY fehlt."
          });
      }

      if (
        !req.body ||
        !req.body.length
      ) {
        return res
          .status(400)
          .json({
            error:
              "Keine Audioaufnahme erhalten."
          });
      }

      const incomingType =
        req.headers["content-type"] ||
        "audio/webm";

      let extension = "webm";

      if (
        incomingType.includes("mp4")
      ) {
        extension = "mp4";
      } else if (
        incomingType.includes("mpeg")
      ) {
        extension = "mp3";
      } else if (
        incomingType.includes("wav")
      ) {
        extension = "wav";
      } else if (
        incomingType.includes("ogg")
      ) {
        extension = "ogg";
      }

      const form =
        new FormData();

      form.append(
        "file",

        new Blob(
          [req.body],
          {
            type: incomingType
          }
        ),

        `jarvis.${extension}`
      );

      form.append(
        "model",
        "gpt-4o-mini-transcribe"
      );

      form.append(
        "language",
        "de"
      );

      form.append(
        "prompt",
        "Deutsch. Benutzer heißt Mattl. Begriffe: Druckelite24, Shopify, Umsatz, Bestellungen, DTF, Textildruck, E-Commerce, Gmail und Kalender."
      );

      const response =
        await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`
            },

            body: form
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        console.error(
          "Transcription error:",
          data
        );

        return res
          .status(response.status)
          .json({
            error:
              "Spracherkennung fehlgeschlagen.",

            details:
              data
          });
      }

      const text =
        String(
          data.text || ""
        ).trim();

      return res.json({
        ok: true,
        text
      });

    } catch (error) {
      console.error(
        "Transcription server error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Spracherkennung fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   OPENAI SPEECH
   ========================================================= */

app.post(
  "/api/speak",

  async (req, res) => {
    try {
      const text =
        String(
          req.body?.text || ""
        ).trim();

      if (!text) {
        return res
          .status(400)
          .json({
            error:
              "Kein Text zum Sprechen."
          });
      }

      const response =
        await fetch(
          "https://api.openai.com/v1/audio/speech",
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
                  "gpt-4o-mini-tts",

                voice:
                  "cedar",

                input:
                  text,

                response_format:
                  "mp3",

                speed:
                  0.92,

                instructions:
                  `Sprich ausschließlich Deutsch.
Ruhig, souverän, warm und eher tief.
Natürliches Hochdeutsch.
Keine hektische oder übertrieben freundliche Stimme.
Trockenes, kontrolliertes Auftreten.
Den Namen Mattl mit hörbarem T sprechen: Mat-tl.`
              })
          }
        );

      if (!response.ok) {
        const error =
          await response.text();

        console.error(
          "Speech error:",
          error
        );

        return res
          .status(response.status)
          .send(error);
      }

      const audio =
        Buffer.from(
          await response.arrayBuffer()
        );

      res.setHeader(
        "Content-Type",
        "audio/mpeg"
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      return res.send(audio);

    } catch (error) {
      console.error(
        "Speech server error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Sprachausgabe fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   GENERAL HUMAN-LIKE CONVERSATION
   ========================================================= */

function extractResponseText(data) {
  if (!data?.output) {
    return "";
  }

  const parts = [];

  for (
    const item of
    data.output
  ) {
    if (
      !Array.isArray(
        item.content
      )
    ) {
      continue;
    }

    for (
      const content of
      item.content
    ) {
      if (
        content.type ===
          "output_text" &&
        content.text
      ) {
        parts.push(
          content.text
        );
      }
    }
  }

  return parts.join("\n").trim();
}


async function generalConversation(
  message,
  history = []
) {
  const compactHistory =
    Array.isArray(history)
      ? history.slice(-8)
      : [];

  const historyText =
    compactHistory
      .map(item => {
        const role =
          item.role === "assistant"
            ? "JARVIS"
            : "Mattl";

        return `${role}: ${String(
          item.text || ""
        )}`;
      })
      .join("\n");

  const input =
    historyText
      ? `${historyText}\nMattl: ${message}`
      : `Mattl: ${message}`;

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
              "gpt-5",

            instructions:
              JARVIS_INSTRUCTIONS,

            input,

            max_output_tokens:
              500
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "General response error:",
      data
    );

    throw new Error(
      "Allgemeine Antwort fehlgeschlagen."
    );
  }

  return (
    extractResponseText(data) ||
    "Das konnte ich gerade nicht sinnvoll beantworten."
  );
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
          params
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.access_token
  ) {
    console.error(
      "Shopify token error:",
      data
    );

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
   SHOPIFY DATA
   ========================================================= */

async function getShopifySummary(
  period = "today"
) {
  const domain =
    process.env.SHOPIFY_STORE_DOMAIN;

  const apiVersion =
    process.env.SHOPIFY_API_VERSION ||
    "2026-07";

  const token =
    await getShopifyAccessToken();

  const {
    start,
    end
  } =
    getPeriodDates(period);

  const search =
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

  const response =
    await fetch(
      `https://${domain}/admin/api/${apiVersion}/graphql.json`,
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
            query,

            variables: {
              query:
                search
            }
          })
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    data.errors
  ) {
    console.error(
      "Shopify GraphQL error:",
      data
    );

    throw new Error(
      "Shopify-Daten konnten nicht gelesen werden."
    );
  }

  const orders =
    data.data
      ?.orders
      ?.nodes ||
    [];

  const valid =
    orders.filter(
      order =>
        !order.cancelledAt
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
    period,

    orders:
      valid.length,

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    averageOrderValue:
      Number(
        average.toFixed(2)
      ),

    currency
  };
}


/* =========================================================
   WEATHER
   ========================================================= */

async function getWeather(
  location,
  day
) {
  const geo =
    new URL(
      "https://geocoding-api.open-meteo.com/v1/search"
    );

  geo.searchParams.set(
    "name",
    location
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
    await fetch(geo);

  const geoData =
    await geoResponse.json();

  const candidates =
    geoData.results || [];

  if (!candidates.length) {
    throw new Error(
      "Ort wurde nicht gefunden."
    );
  }

  let place;

  if (
    String(location)
      .toLowerCase()
      .includes(
        "ludwigshafen"
      )
  ) {
    place =
      candidates.find(
        item =>
          item.country_code ===
            "DE" &&
          String(
            item.admin1 || ""
          )
            .toLowerCase()
            .includes(
              "rheinland"
            )
      );
  }

  place =
    place ||
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
    await fetch(weather);

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      "Wetterdienst fehlgeschlagen."
    );
  }

  const index =
    day === "tomorrow"
      ? 1
      : 0;

  return {
    name:
      place.name,

    region:
      place.admin1 || "",

    country:
      place.country || "",

    day,

    current:
      day === "today"
        ? data.current
        : null,

    max:
      data.daily
        ?.temperature_2m_max
        ?.[index],

    min:
      data.daily
        ?.temperature_2m_min
        ?.[index],

    rain:
      data.daily
        ?.precipitation_probability_max
        ?.[index]
  };
}


/* =========================================================
   ROUTING
   ========================================================= */

function isShopifyQuery(text) {
  const t =
    normalize(text);

  return (
    /\bshopify\b/.test(t) ||
    /\bumsatz\b/.test(t) ||
    /\bbestellungen?\b/.test(t) ||
    /\bverkäufe?\b/.test(t) ||
    /\bverkauf\b/.test(t) ||
    /\bbestellwert\b/.test(t)
  );
}


function isWeatherQuery(text) {
  const t =
    normalize(text);

  return (
    /\bwetter\b/.test(t) ||
    /\btemperatur\b/.test(t) ||
    /\bregen\b/.test(t) ||
    /\bgrad\b/.test(t)
  );
}


function isEmailQuery(text) {
  const t =
    normalize(text);

  return (
    /\bmails?\b/.test(t) ||
    /\be mail\b/.test(t) ||
    /\bpostfach\b/.test(t)
  );
}


function isCalendarQuery(text) {
  const t =
    normalize(text);

  return (
    /\bkalender\b/.test(t) ||
    /\btermine?\b/.test(t) ||
    /\bwas steht heute an\b/.test(t)
  );
}


function extractWeatherLocation(
  text
) {
  const normalized =
    normalize(text);

  if (
    normalized.includes(
      "ludwigshafen"
    )
  ) {
    return "Ludwigshafen am Rhein";
  }

  const match =
    String(text)
      .match(
        /\bin\s+(.+?)(?:\s+(?:heute|morgen))?[?.!,]*$/i
      );

  if (
    match &&
    match[1]
  ) {
    return match[1].trim();
  }

  return null;
}


/* =========================================================
   ONE CENTRAL JARVIS ENDPOINT
   ========================================================= */

app.post(
  "/api/ask",

  async (req, res) => {
    try {
      const message =
        String(
          req.body?.message || ""
        ).trim();

      const history =
        Array.isArray(
          req.body?.history
        )
          ? req.body.history
          : [];

      if (!message) {
        return res
          .status(400)
          .json({
            error:
              "Nachricht fehlt."
          });
      }

      const normalized =
        normalize(message);


      /* -----------------------------
         SHOPIFY
         ----------------------------- */

      if (
        isShopifyQuery(
          normalized
        )
      ) {
        const period =
          /\bgestern\b/.test(
            normalized
          )
            ? "yesterday"
            : "today";

        const data =
          await getShopifySummary(
            period
          );

        const day =
          period === "yesterday"
            ? "Gestern"
            : "Heute";

        let reply;

        if (
          /\bwie viele\b/.test(
            normalized
          ) &&
          /\bbestellungen?\b/.test(
            normalized
          )
        ) {
          reply =
            `${day} hast du ${data.orders} Shopify-Bestellungen.`;

        } else if (
          /\bumsatz\b/.test(
            normalized
          )
        ) {
          reply =
            `${day} hast du ${formatMoney(
              data.revenue,
              data.currency
            )} Shopify-Umsatz mit ${data.orders} Bestellungen. Der durchschnittliche Bestellwert liegt bei ${formatMoney(
              data.averageOrderValue,
              data.currency
            )}.`;

        } else {
          reply =
            `${day} hast du ${data.orders} Shopify-Bestellungen mit ${formatMoney(
              data.revenue,
              data.currency
            )} Umsatz.`;
        }

        return res.json({
          ok: true,
          route: "shopify",
          reply,
          data
        });
      }


      /* -----------------------------
         WEATHER
         ----------------------------- */

      if (
        isWeatherQuery(
          normalized
        )
      ) {
        const location =
          extractWeatherLocation(
            message
          );

        if (!location) {
          return res.json({
            ok: true,
            route:
              "weather_clarification",
            reply:
              "Für welchen Ort soll ich das Wetter prüfen?"
          });
        }

        const day =
          /\bmorgen\b/.test(
            normalized
          )
            ? "tomorrow"
            : "today";

        const data =
          await getWeather(
            location,
            day
          );

        const label =
          day === "tomorrow"
            ? "Morgen"
            : "Heute";

        const reply =
          `${label} in ${data.name}: maximal ${data.max} Grad, minimal ${data.min} Grad. Die höchste Regenwahrscheinlichkeit liegt bei ${data.rain} Prozent.`;

        return res.json({
          ok: true,
          route: "weather",
          reply,
          data
        });
      }


      /* -----------------------------
         GMAIL
         ----------------------------- */

      if (
        isEmailQuery(
          normalized
        )
      ) {
        return res.json({
          ok: true,
          route: "gmail",
          reply:
            "Mattl, Gmail ist im neuen JARVIS noch nicht wieder verbunden. Das machen wir als Nächstes."
        });
      }


      /* -----------------------------
         CALENDAR
         ----------------------------- */

      if (
        isCalendarQuery(
          normalized
        )
      ) {
        return res.json({
          ok: true,
          route: "calendar",
          reply:
            "Mattl, Google Kalender ist im neuen JARVIS noch nicht wieder verbunden. Das machen wir danach."
        });
      }


      /* -----------------------------
         NORMAL HUMAN CONVERSATION
         ----------------------------- */

      const reply =
        await generalConversation(
          message,
          history
        );

      return res.json({
        ok: true,
        route: "conversation",
        reply
      });

    } catch (error) {
      console.error(
        "JARVIS ASK ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            error.message ||
            "JARVIS konnte die Anfrage nicht bearbeiten."
        });
    }
  }
);


/* =========================================================
   DIRECT SHOPIFY TEST
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

      const data =
        await getShopifySummary(
          period
        );

      return res.json({
        configured: true,

        orders:
          data.orders,

        revenue:
          data.revenue,

        average_order_value:
          data.averageOrderValue,

        currency:
          data.currency,

        period:
          data.period
      });

    } catch (error) {
      console.error(
        "Shopify endpoint error:",
        error
      );

      return res
        .status(500)
        .json({
          configured: false,
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
    res.json({
      ok: true,

      version:
        "JARVIS V3",

      architecture:
        "record-transcribe-route-speak",

      language:
        "de",

      voice:
        "cedar",

      shopify_configured:
        Boolean(
          process.env
            .SHOPIFY_STORE_DOMAIN &&
          process.env
            .SHOPIFY_CLIENT_ID &&
          process.env
            .SHOPIFY_CLIENT_SECRET
        )
    });
  }
);


app.get(
  "/",

  (req, res) => {
    res.sendFile(
      "index.html",
      {
        root: "."
      }
    );
  }
);


app.listen(
  PORT,
  "0.0.0.0",

  () => {
    console.log(
      `JARVIS V3 läuft auf Port ${PORT}`
    );
  }
);
