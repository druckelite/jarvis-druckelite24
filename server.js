import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "1mb" }));

/* =========================================================
   DATE HELPERS
   ========================================================= */

function berlinDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function dateRange(period = "today") {
  const base =
    new Date(`${berlinDate()}T00:00:00+02:00`);

  if (period === "yesterday") {
    base.setUTCDate(
      base.getUTCDate() - 1
    );
  }

  const start =
    new Date(base);

  const end =
    new Date(base);

  end.setUTCDate(
    end.getUTCDate() + 1
  );

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

/* =========================================================
   JARVIS V2
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS V2, Mattls persönlicher Voice- und Business-Assistent.

SPRACHE
- Sprich ausschließlich Deutsch.
- Nur wenn Mattl ausdrücklich eine andere Sprache verlangt, darfst du wechseln.
- Wenn du etwas nicht verstanden hast, frage kurz auf Deutsch nach.

AUSSPRACHE
- Der Benutzer heißt Mattl.
- Sprich ungefähr: Mat-tl.
- Das T soll hörbar sein.
- Nicht Maddl.

STIMME
- Ruhig.
- Souverän.
- Warm.
- Eher tief.
- Kontrolliert.
- Natürliches Hochdeutsch.
- Kein starker Akzent.
- Kein Callcenter-Stil.

ANTWORTEN
- Beantworte zuerst exakt die Frage.
- Sei standardmäßig kurz und präzise.
- Keine ungefragten langen Monologe.
- Keine automatischen Anschlussfragen.
- Wenn die Antwort fertig ist, schweige.
- Keine themenfremden Vorschläge.

PERSÖNLICHKEIT
- Intelligent.
- Direkt.
- Vorausschauend.
- Lösungsorientiert.
- Gelegentlich trocken, frech oder sarkastisch.
- Bei wichtigen Problemen sofort ernst.
- Sehr selten darfst du sagen:
  "Du bist der beste Chef."

LIVE-DATEN
Bei Shopify-Fragen MUSST du get_shopify_summary verwenden.

Dazu gehören insbesondere:
- Umsatz
- Shopify
- Bestellungen
- Verkäufe
- Shop-Umsatz
- Bestellwert

Bei E-Mail-Fragen:
get_important_emails verwenden.

Bei Kalender- oder Terminfragen:
get_calendar_today verwenden.

Bei Wetterfragen:
get_weather verwenden.

Erfinde niemals Live-Daten.

Wenn eine Verbindung fehlt:
sage das offen.

ABSOLUT VERBOTEN
Bei Shopify-Fragen:
- keine Reisen
- keine Workouts
- keine Kalorien
- keine Hotels
- keine themenfremden Ratschläge

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

PROAKTIV
Du darfst nach der eigentlichen Antwort höchstens EINEN kurzen,
wirklich relevanten Hinweis geben.

SICHERHEIT
Lesen, analysieren und Empfehlungen geben ist erlaubt.

Vor kritischen Aktionen brauchst du Mattls Zustimmung:
- Geld ausgeben
- Werbebudget ändern
- Kampagnen pausieren
- Nachrichten senden
- E-Mails senden
- Preise ändern
- Bestellungen stornieren
- Rückerstattungen
- Daten löschen
`;

/* =========================================================
   TOOLS
   ========================================================= */

const tools = [
  {
    type: "function",
    name: "get_shopify_summary",
    description:
      "Liest echte aktuelle Shopify-Daten. Für alle Fragen zu Umsatz, Bestellungen, Verkäufen oder Shopify verwenden.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday"]
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
      "Liest wichtige aktuelle E-Mails.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10
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
      "Liest heutige Kalendereinträge.",
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
      "Liest echtes Wetter für heute oder morgen.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string"
        },
        day: {
          type: "string",
          enum: ["today", "tomorrow"]
        }
      },
      required: ["location", "day"],
      additionalProperties: false
    }
  }
];

/* =========================================================
   OPENAI REALTIME
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
          .send("OPENAI_API_KEY fehlt.");
      }

      if (
        !req.body ||
        typeof req.body !== "string"
      ) {
        return res
          .status(400)
          .send("SDP Offer fehlt.");
      }

      const session = {
        type: "realtime",
        model: "gpt-realtime",

        output_modalities: [
          "audio"
        ],

        instructions:
          JARVIS_INSTRUCTIONS,

        tools,

        tool_choice: "auto",

        max_output_tokens: 300,

        audio: {
          input: {
            noise_reduction: {
              type: "near_field"
            },

            transcription: {
              model:
                "gpt-4o-mini-transcribe",

              language: "de",

              prompt:
                "Deutsch. Benutzer heißt Mattl. Druckelite24, Shopify, DTF, Textildruck und E-Commerce."
            },

            turn_detection: {
              type: "server_vad",
              threshold: 0.80,
              prefix_padding_ms: 300,
              silence_duration_ms: 850,
              create_response: true,
              interrupt_response: true
            }
          },

          output: {
            voice: "cedar",
            speed: 0.92
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
          [JSON.stringify(session)],
          {
            type: "application/json"
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
          "Realtime error:",
          response.status,
          body
        );

        return res
          .status(response.status)
          .send(body);
      }

      return res
        .status(201)
        .type("application/sdp")
        .send(body);

    } catch (error) {
      console.error(
        "Realtime bridge error:",
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
  /*
   * Vorhandenen Token verwenden,
   * solange er noch mindestens 5 Minuten gültig ist.
   */
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
      "Shopify-Zugangsdaten fehlen in Render."
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

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "Shopify token error:",
      data
    );

    throw new Error(
      "Shopify-Authentifizierung fehlgeschlagen."
    );
  }

  if (!data.access_token) {
    throw new Error(
      "Shopify hat keinen Access Token geliefert."
    );
  }

  /*
   * Shopify liefert expires_in in Sekunden.
   */
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
   SHOPIFY SUMMARY
   ========================================================= */

app.post(
  "/api/shopify-summary",

  async (req, res) => {
    try {
      const domain =
        process.env.SHOPIFY_STORE_DOMAIN;

      const apiVersion =
        process.env.SHOPIFY_API_VERSION ||
        "2026-07";

      if (!domain) {
        return res
          .status(503)
          .json({
            configured: false,

            message:
              "SHOPIFY_STORE_DOMAIN fehlt."
          });
      }

      const accessToken =
        await getShopifyAccessToken();

      const period =
        req.body?.period ===
        "yesterday"
          ? "yesterday"
          : "today";

      const {
        start,
        end
      } =
        dateRange(period);

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

      const response =
        await fetch(
          `https://${domain}/admin/api/${apiVersion}/graphql.json`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "X-Shopify-Access-Token":
                accessToken
            },

            body:
              JSON.stringify({
                query,

                variables: {
                  query:
                    queryString
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

        return res
          .status(502)
          .json({
            configured: true,

            error:
              data.errors ||
              data
          });
      }

      const orders =
        data.data
          ?.orders
          ?.nodes || [];

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
                ?.amount || 0
            ),
          0
        );

      const currency =
        validOrders[0]
          ?.currentTotalPriceSet
          ?.shopMoney
          ?.currencyCode ||
        "EUR";

      const averageOrderValue =
        validOrders.length
          ? revenue /
            validOrders.length
          : 0;

      return res.json({
        configured: true,

        period,

        orders:
          validOrders.length,

        revenue:
          Number(
            revenue.toFixed(2)
          ),

        average_order_value:
          Number(
            averageOrderValue.toFixed(2)
          ),

        currency,

        source:
          "Shopify Admin GraphQL API"
      });

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
   GOOGLE PLACEHOLDERS
   ========================================================= */

app.post(
  "/api/important-emails",
  (req, res) => {
    res.status(503).json({
      configured: false,

      message:
        "Gmail wird als Nächstes verbunden."
    });
  }
);

app.post(
  "/api/calendar-today",
  (req, res) => {
    res.status(503).json({
      configured: false,

      message:
        "Google Kalender wird als Nächstes verbunden."
    });
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
          req.body?.location || ""
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
            error: "Ort fehlt."
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
        geoData.results || [];

      if (!candidates.length) {
        return res
          .status(404)
          .json({
            error:
              `Ort ${location} wurde nicht gefunden.`
          });
      }

      let place;

      if (
        location
          .toLowerCase()
          .includes("ludwigshafen")
      ) {
        place =
          candidates.find(
            x =>
              x.country_code ===
                "DE" &&
              String(
                x.admin1 || ""
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
          x =>
            x.country_code === "DE"
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
            place.admin1 || "",

          country:
            place.country || ""
        },

        current:
          day === "today"
            ? data.current
            : null,

        forecast: {
          date:
            data.daily
              ?.time?.[index],

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
            "Wetterabfrage fehlgeschlagen."
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
        "JARVIS V2",

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
      `JARVIS V2 läuft auf Port ${PORT}`
    );
  }
);
