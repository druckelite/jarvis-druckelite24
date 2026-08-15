import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "2mb" }));

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
  const date = new Date(`${dateString}T12:00:00Z`);

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function getPeriodDates(period) {
  const today = berlinDate();

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


/* =========================================================
   JARVIS PERSONALITY
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, der persönliche Voice- und Business-Assistent von Mattl.

SPRACHE
- Sprich ausschließlich Deutsch.
- Nur wenn Mattl ausdrücklich eine andere Sprache verlangt, darfst du wechseln.
- Natürliches, klares Hochdeutsch.
- Kein unnötiges Englisch.

AUSSPRACHE
- Der Benutzer heißt Mattl.
- Sprich ungefähr: Mat-tl.
- Das T muss hörbar bleiben.
- Nicht Maddl.

CHARAKTER
- Locker.
- Intelligent.
- Ruhig.
- Souverän.
- Warm.
- Direkt.
- Trocken humorvoll.
- Gelegentlich frech oder sarkastisch.
- Nicht förmlich.
- Kein Butler-Stil.
- Kein Callcenter-Stil.

Beispiele:
"Klar, Mattl."
"Hab ich."
"Sieht gut aus."
"Das war jetzt überraschend vernünftig."
"Da bist du ja. Ich hatte schon Hoffnung auf einen ruhigen Tag."

Sehr selten darfst du sagen:
"Du bist der beste Chef."

Aber nicht schleimen.

GESPRÄCH
- Sprich natürlich mit Mattl.
- Beantworte zuerst exakt seine Frage.
- Standardmäßig kurze bis mittellange Antworten.
- Keine unnötigen Monologe.
- Keine automatische Anschlussfrage nach jeder Antwort.
- Wenn du fertig bist, schweige und höre wieder zu.
- Berücksichtige den Kontext des laufenden Gesprächs.
- Wenn du etwas akustisch nicht sicher verstanden hast, frage kurz nach.

LIVE-DATEN
Erfinde niemals aktuelle Daten.

SHOPIFY
Für aktuelle Shopify-Fragen MUSST du get_shopify_summary benutzen.

Dazu gehören:
- Umsatz
- Bestellungen
- Verkäufe
- Bestellwert
- Shop-Umsatz
- Wie läuft Shopify?
- Wie viele Bestellungen heute?
- Was haben wir heute umgesetzt?

WETTER
Für Wetterfragen MUSST du get_weather benutzen.

Bei Ludwigshafen bevorzuge:
Ludwigshafen am Rhein, Rheinland-Pfalz, Deutschland.

GMAIL
Für aktuelle Mail-Fragen:
get_important_emails verwenden.

KALENDER
Für Termine und Kalender:
get_calendar_today verwenden.

ABSOLUT VERBOTEN
Bei Shopify-Fragen:
- keine Reisen
- keine Workouts
- keine Kalorien
- kein Essen bestellen
- keine Hotels
- keine erfundenen Daten

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Relevante Bereiche:
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

BUSINESS-DENKEN
Denke zusätzlich wie:
- Geschäftsführer
- E-Commerce-Manager
- Verkaufsleiter
- Performance-Marketer
- Datenanalyst

Wenn dir eine wirklich relevante Chance oder ein Risiko auffällt,
darfst du nach der eigentlichen Antwort EINEN kurzen Hinweis geben.

SICHERHEIT
Lesen, analysieren und Empfehlungen geben ist erlaubt.

Vor kritischen Aktionen brauchst du Mattls ausdrückliche Zustimmung:
- Geld ausgeben
- Werbebudgets ändern
- Kampagnen pausieren
- E-Mails senden
- Nachrichten senden
- Preise ändern
- Bestellungen stornieren
- Rückerstattungen
- Daten löschen
`;


/* =========================================================
   REALTIME TOOLS
   ========================================================= */

const realtimeTools = [
  {
    type: "function",
    name: "get_shopify_summary",

    description:
      "Liest echte aktuelle Shopify-Bestellungen, Umsatz und durchschnittlichen Bestellwert für heute oder gestern.",

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
    name: "get_weather",

    description:
      "Liest echtes Wetter für einen Ort für heute oder morgen.",

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
    name: "get_important_emails",

    description:
      "Liest aktuelle wichtige E-Mails.",

    parameters: {
      type: "object",

      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10
        }
      },

      required: [
        "limit"
      ],

      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "get_calendar_today",

    description:
      "Liest die heutigen Kalendereinträge.",

    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];


/* =========================================================
   OPENAI REALTIME SESSION
   ========================================================= */

app.post(
  "/session",

  express.text({
    type: "application/sdp",
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

      if (
        !req.body ||
        typeof req.body !== "string"
      ) {
        return res
          .status(400)
          .send(
            "SDP Offer fehlt."
          );
      }

      const session = {
        type: "realtime",

        model: "gpt-realtime",

        output_modalities: [
          "audio"
        ],

        instructions:
          JARVIS_INSTRUCTIONS,

        tools:
          realtimeTools,

        tool_choice:
          "auto",

        max_output_tokens:
          350,

        audio: {
          input: {

            /*
             * Laptop-/Raummikrofon:
             * Noise Reduction läuft vor VAD.
             */
            noise_reduction: {
              type: "far_field"
            },

            transcription: {
              model:
                "gpt-4o-mini-transcribe",

              language:
                "de",

              prompt:
                "Deutsch. Benutzer heißt Mattl. Begriffe: Druckelite24, Shopify, Umsatz, Bestellungen, DTF, Textildruck, E-Commerce, Ludwigshafen."
            },

            /*
             * STRIKTERE GERÄUSCHERKENNUNG
             *
             * 0.98:
             * Leise Raumgeräusche und TV sollen
             * deutlich schwerer auslösen.
             *
             * interrupt_response false:
             * Ein VAD-Trigger darf JARVIS beim
             * Sprechen nicht automatisch abbrechen.
             */
            turn_detection: {
              type: "server_vad",

              threshold: 0.98,

              prefix_padding_ms: 180,

              silence_duration_ms: 600,

              create_response: true,

              interrupt_response: false
            }
          },

          output: {
            voice: "cedar"
          }
        }
      };


      const form =
        new FormData();


      form.append(
        "sdp",
        req.body
      );


      form.append(
        "session",

        new Blob(
          [
            JSON.stringify(
              session
            )
          ],

          {
            type:
              "application/json"
          }
        )
      );


      const response =
        await fetch(
          "https://api.openai.com/v1/realtime/calls?model=gpt-realtime",

          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`
            },

            body: form
          }
        );


      const body =
        await response.text();


      if (!response.ok) {
        console.error(
          "OpenAI Realtime error:",
          response.status,
          body
        );

        return res
          .status(
            response.status
          )
          .send(
            body
          );
      }


      return res
        .status(201)
        .type(
          "application/sdp"
        )
        .send(
          body
        );


    } catch (error) {
      console.error(
        "Realtime bridge error:",
        error
      );


      return res
        .status(500)
        .send(
          "Realtime-Verbindung konnte nicht aufgebaut werden."
        );
    }
  }
);


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

        body: params
      }
    );


  const raw =
    await response.text();


  let data;


  try {
    data =
      JSON.parse(raw);

  } catch {
    console.error(
      "Shopify token raw response:",
      raw
    );

    throw new Error(
      "Shopify hat keine gültige Token-Antwort geliefert."
    );
  }


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


  console.log(
    "Shopify access token refreshed."
  );


  return data.access_token;
}


/* =========================================================
   SHOPIFY DATA
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
    configured: true,

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

    source: "Shopify"
  };
}


/* =========================================================
   SHOPIFY ENDPOINT
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


      return res.json(
        data
      );


    } catch (error) {
      console.error(
        "Shopify summary error:",
        error
      );


      return res
        .status(500)
        .json({
          configured: false,

          error:
            error.message ||
            "Shopify-Abfrage fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   WEATHER
   ========================================================= */

app.post(
  "/api/weather",

  async (req, res) => {
    try {
      let location =
        String(
          req.body?.location ||
          ""
        ).trim();


      const day =
        req.body?.day ===
          "tomorrow"
          ? "tomorrow"
          : "today";


      if (
        normalize(location)
          .includes(
            "ludwigshafen"
          )
      ) {
        location =
          "Ludwigshafen am Rhein";
      }


      if (!location) {
        return res
          .status(400)
          .json({
            error:
              "Ort fehlt."
          });
      }


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
        await fetch(
          geo
        );


      const geoData =
        await geoResponse.json();


      const candidates =
        geoData.results ||
        [];


      if (
        !candidates.length
      ) {
        return res
          .status(404)
          .json({
            error:
              `Ort ${location} wurde nicht gefunden.`
          });
      }


      let place = null;


      if (
        normalize(location)
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
                item.admin1 ||
                ""
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
          weather
        );


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


      return res.json({
        source:
          "Open-Meteo",

        requested_day:
          day,

        location: {
          name:
            place.name,

          region:
            place.admin1 ||
            "",

          country:
            place.country ||
            ""
        },

        current:
          day === "today"
            ? data.current
            : null,

        forecast: {
          date:
            data.daily
              ?.time?.[index],

          weather_code:
            data.daily
              ?.weather_code?.[index],

          max_temperature:
            data.daily
              ?.temperature_2m_max?.[index],

          min_temperature:
            data.daily
              ?.temperature_2m_min?.[index],

          precipitation_probability:
            data.daily
              ?.precipitation_probability_max?.[index]
        }
      });


    } catch (error) {
      console.error(
        "Weather error:",
        error
      );


      return res
        .status(500)
        .json({
          error:
            error.message ||
            "Wetterabfrage fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   GMAIL PLACEHOLDER
   ========================================================= */

app.post(
  "/api/important-emails",

  (req, res) => {
    return res
      .status(503)
      .json({
        configured: false,

        message:
          "Mattl, Gmail ist noch nicht verbunden."
      });
  }
);


/* =========================================================
   CALENDAR PLACEHOLDER
   ========================================================= */

app.post(
  "/api/calendar-today",

  (req, res) => {
    return res
      .status(503)
      .json({
        configured: false,

        message:
          "Mattl, Google Kalender ist noch nicht verbunden."
      });
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
        "JARVIS V4.1",

      architecture:
        "realtime-speech-to-speech",

      language:
        "de",

      voice:
        "cedar",

      noise_reduction:
        "far_field",

      vad_threshold:
        0.98,

      interrupt_response:
        false,

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


/* =========================================================
   ROOT
   ========================================================= */

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


/* =========================================================
   START
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",

  () => {
    console.log(
      `JARVIS V4.1 läuft auf Port ${PORT}`
    );
  }
);
