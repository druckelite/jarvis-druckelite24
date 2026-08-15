import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "2mb" }));

/* =========================================================
   HELPERS
   ========================================================= */

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

function getPeriodDates(period = "today") {
  const today = berlinDate();

  if (period === "yesterday") {
    const date =
      new Date(`${today}T12:00:00Z`);

    date.setUTCDate(
      date.getUTCDate() - 1
    );

    return {
      start:
        date
          .toISOString()
          .slice(0, 10),

      end:
        today
    };
  }

  return {
    start: today,
    end: nextDateString(today)
  };
}

/* =========================================================
   JARVIS
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, Mattls persönlicher Voice- und Business-Assistent.

SPRACHE
- Sprich Deutsch.
- Locker, natürlich und direkt.
- Nicht förmlich.
- Kein Butler-Stil.
- Kein Callcenter-Stil.

CHARAKTER
- intelligent
- ruhig
- trocken humorvoll
- gelegentlich sarkastisch
- präzise

Der Benutzer heißt Mattl.
Sprich ungefähr: Mat-tl.
Nicht Maddl.

GESPRÄCH
- Antworte zuerst exakt auf die Frage.
- Standardmäßig kurz bis mittellang.
- Keine unnötigen Monologe.
- Keine automatische Anschlussfrage.
- Wenn du fertig bist, schweige und höre wieder zu.

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen.

Es gibt genau EINEN verbundenen Shopify-Shop:
Druckelite24.

Wenn Mattl sagt:
- Shopify
- mein Shop
- unser Shop
- Bestellungen
- Umsatz
- Verkäufe
- Bestellwert

ist immer Druckelite24 gemeint.

Frage NIEMALS:
"Welchen Shop meinst du?"

SHOPIFY
Bei aktuellen Shopify-Fragen MUSST du get_shopify_summary verwenden.

Beispiele:

"Wie viele Bestellungen habe ich heute?"
=> get_shopify_summary period=today

"Wie hoch ist mein Umsatz heute?"
=> get_shopify_summary period=today

"Wie lief es gestern?"
wenn der Gesprächskontext Shopify ist:
=> get_shopify_summary period=yesterday

WICHTIG:
Erfinde NIEMALS:
- Bestellnamen
- Produktnamen
- Produkte
- Kunden
- Umsätze
- Bestellzahlen
- Bestellwerte

Das Tool liefert derzeit ausschließlich:
- Anzahl Bestellungen
- Umsatz
- durchschnittlichen Bestellwert
- Währung
- Zeitraum

Wenn das Tool keinen Produktnamen liefert,
darfst du keinen Produktnamen nennen.

Bei Fehler:
"Ich kann die Shopify-Daten gerade nicht verifizieren."

WETTER
Für aktuelle Wetterfragen MUSST du get_weather benutzen.

Bei Ludwigshafen:
Ludwigshafen am Rhein, Rheinland-Pfalz, Deutschland.

GMAIL
Für aktuelle E-Mails:
get_important_emails

KALENDER
Für aktuelle Termine:
get_calendar_today

Bei nicht verbundenen Diensten:
sage kurz und klar, dass der Dienst noch nicht verbunden ist.

VERBOTEN BEI SHOPIFY-FRAGEN
- Reisen
- Essen bestellen
- Workouts
- Kalorien
- Hotels
- erfundene Produkte
- erfundene Daten
`;

/* =========================================================
   REALTIME TOOLS
   ========================================================= */

const realtimeTools = [
  {
    type: "function",

    name:
      "get_shopify_summary",

    description:
      "Pflicht-Tool für aktuelle Bestell-, Umsatz- und Bestellwertdaten aus Mattls einzigem verbundenen Shopify-Shop Druckelite24. Liefert keine Produktnamen.",

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

      additionalProperties:
        false
    }
  },

  {
    type: "function",

    name:
      "get_weather",

    description:
      "Liest echtes Wetter für heute oder morgen.",

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

      additionalProperties:
        false
    }
  },

  {
    type: "function",

    name:
      "get_important_emails",

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

      additionalProperties:
        false
    }
  },

  {
    type: "function",

    name:
      "get_calendar_today",

    description:
      "Liest die heutigen Kalendereinträge.",

    parameters: {
      type: "object",
      properties: {},
      additionalProperties:
        false
    }
  }
];

/* =========================================================
   REALTIME SESSION
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
        type:
          "realtime",

        model:
          "gpt-realtime",

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
          300,

        audio: {
          input: {
            noise_reduction: {
              type:
                "far_field"
            },

            transcription: {
              model:
                "gpt-4o-mini-transcribe",

              language:
                "de",

              prompt:
                "Deutsch. Benutzer heißt Mattl. Druckelite24, Shopify, Umsatz, Bestellungen, Bestellwert, DTF, Textildruck, E-Commerce, Ludwigshafen."
            },

            turn_detection: {
              type:
                "server_vad",

              threshold:
                0.98,

              prefix_padding_ms:
                180,

              silence_duration_ms:
                600,

              create_response:
                true,

              interrupt_response:
                false
            }
          },

          output: {
            voice:
              "cedar"
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
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`
            },

            body:
              form
          }
        );

      const body =
        await response.text();

      if (!response.ok) {
        console.error(
          "Realtime error:",
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
        "Realtime bridge:",
        error
      );

      return res
        .status(500)
        .send(
          "Realtime-Verbindung fehlgeschlagen."
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
      "Shopify-Konfiguration fehlt."
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
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          params
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
      "Shopify token raw:",
      raw
    );

    throw new Error(
      "Shopify-Token-Antwort ungültig."
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
      "Shopify-Anmeldung fehlgeschlagen."
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
      "Shopify GraphQL:",
      data
    );

    throw new Error(
      "Shopify-Abfrage fehlgeschlagen."
    );
  }

  const orders =
    data.data
      ?.orders
      ?.nodes ||
    [];

  const validOrders =
    orders.filter(
      order =>
        !order.cancelledAt
    );

  const revenue =
    validOrders.reduce(
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
    validOrders[0]
      ?.currentTotalPriceSet
      ?.shopMoney
      ?.currencyCode ||
    "EUR";

  const average =
    validOrders.length
      ? revenue /
        validOrders.length
      : 0;

  /*
   * Absichtlich KEINE Produktdaten.
   *
   * Dadurch kann der Tool-Output
   * keine Kopfhörer, Shirts usw.
   * enthalten.
   */
  return {
    ok: true,

    shop:
      "Druckelite24",

    period,

    orders:
      validOrders.length,

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    average_order_value:
      Number(
        average.toFixed(2)
      ),

    currency
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
        "Shopify endpoint:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          shop:
            "Druckelite24",

          error:
            "Shopify-Daten konnten gerade nicht verifiziert werden."
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
      const location =
        String(
          req.body?.location ||
          ""
        ).trim();

      const day =
        req.body?.day ===
          "tomorrow"
          ? "tomorrow"
          : "today";

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
        await fetch(geo);

      const geoData =
        await geoResponse.json();

      const candidates =
        geoData.results ||
        [];

      if (!candidates.length) {
        return res
          .status(404)
          .json({
            error:
              "Ort nicht gefunden."
          });
      }

      let place =
        candidates[0];

      if (
        location
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
                item.admin1 ||
                ""
              )
                .toLowerCase()
                .includes(
                  "rheinland"
                )
          ) ||
          place;
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

      const index =
        day === "tomorrow"
          ? 1
          : 0;

      return res.json({
        ok: true,

        location: {
          name:
            place.name,

          region:
            place.admin1 || "",

          country:
            place.country || ""
        },

        day,

        forecast: {
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
              ?.[index]
        }
      });

    } catch (error) {
      console.error(
        "Weather:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,
          error:
            "Wetterdaten konnten nicht geladen werden."
        });
    }
  }
);

/* =========================================================
   GMAIL / CALENDAR
   ========================================================= */

app.post(
  "/api/important-emails",

  (req, res) => {
    return res
      .status(503)
      .json({
        ok: false,
        configured: false,
        message:
          "Gmail ist noch nicht verbunden."
      });
  }
);

app.post(
  "/api/calendar-today",

  (req, res) => {
    return res
      .status(503)
      .json({
        ok: false,
        configured: false,
        message:
          "Google Kalender ist noch nicht verbunden."
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
        "JARVIS V5",

      architecture:
        "realtime-controlled-tools",

      language:
        "de",

      voice:
        "cedar",

      shop:
        "Druckelite24",

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
      `JARVIS V5 läuft auf Port ${PORT}`
    );
  }
);
