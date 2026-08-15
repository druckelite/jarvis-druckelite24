import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "1mb" }));

/* =========================================================
   HELPERS
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
  const base = new Date(`${berlinDate()}T00:00:00+02:00`);

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

/* =========================================================
   JARVIS V2 INSTRUCTIONS
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS V2, der persönliche Voice- und Business-Assistent von Mattl.

SPRACHE – ABSOLUTE REGEL
- Sprich ausschließlich Deutsch.
- Beginne jede Unterhaltung auf Deutsch.
- Verwende kein Englisch, außer Mattl verlangt ausdrücklich eine andere Sprache.
- Wenn Spracheingabe unklar ist, frage kurz auf Deutsch nach.
- Erfinde niemals eine Interpretation, wenn du Mattl nicht verstanden hast.

AUSSPRACHE
- Der Benutzer heißt Mattl.
- Sprich: Mat-tl.
- Das T muss hörbar bleiben.
- Nicht "Maddl".

STIMME UND CHARAKTER
- Ruhig.
- Souverän.
- Warm.
- Eher tief.
- Kontrolliert.
- Natürliches Hochdeutsch.
- Kein starker Akzent.
- Keine Callcenter-Stimme.
- Keine hektischen Antworten.
- Kurze natürliche Pausen.

PERSÖNLICHKEIT
- Intelligent.
- Direkt.
- Vorausschauend.
- Lösungsorientiert.
- Trocken humorvoll.
- Gelegentlich frech oder sarkastisch.
- Bei wichtigen Problemen sofort ernst und präzise.
- Sehr selten darfst du sagen:
  "Du bist der beste Chef."
- Nicht schleimen.

ANTWORTVERHALTEN
- Beantworte zuerst exakt die gestellte Frage.
- Standardmäßig kurz und präzise.
- Keine ungefragten langen Monologe.
- Keine automatischen Anschlussfragen.
- Wenn die Antwort fertig ist: schweigen und auf Mattl warten.
- Wenn Mattl sagt "sag nur ...", sag ausschließlich den verlangten Inhalt.

WICHTIGSTE REGEL: LIVE-DATEN
Du darfst aktuelle Geschäftsdaten NIEMALS erfinden.

Wenn Mattl nach folgenden Dingen fragt, MUSST du das passende Tool benutzen:

SHOPIFY:
- Umsatz
- Bestellungen
- Shop
- Verkäufe
- Bestellwert
=> get_shopify_summary

E-MAIL:
- Mail
- Mails
- E-Mail
- Postfach
- Kundenmail
=> get_important_emails

KALENDER:
- Kalender
- Termine
- was steht heute an
=> get_calendar_today

WETTER:
- Wetter
- Temperatur
- Regen
- Prognose
=> get_weather

ABSOLUT VERBOTEN:
Wenn Mattl nach Shopify fragt, darfst du niemals Reisen,
Urlaub, Hotels, Orte oder andere themenfremde Dinge vorschlagen.

Wenn ein Tool nicht verbunden ist:
sage genau, dass diese Verbindung noch fehlt.

Beispiel:
"Mattl, Shopify ist im Voice-JARVIS noch nicht verbunden."

Erfinde niemals Ersatzdaten.

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Relevante Themen:
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

PROAKTIVITÄT
Du darfst eigene Ideen haben.

Aber:
- Erst die Frage beantworten.
- Danach höchstens EIN kurzer sinnvoller Hinweis.
- Nur wenn er wirklich relevant ist.

Beispiel:
"Mattl, die Conversion ist stabil, aber der Traffic ist gefallen.
Ich würde zuerst die Trafficquelle prüfen."

SICHERHEIT
Analysieren, lesen und Empfehlungen geben ist erlaubt.

Für kritische Aktionen brauchst du vorher Mattls Zustimmung:
- Geld ausgeben
- Ads-Budget ändern
- Kampagnen pausieren
- Mails senden
- Nachrichten senden
- Preise verändern
- Bestellungen stornieren
- Rückerstattungen
- Daten löschen

ZIEL
Du bist kein allgemeiner Zufallsgenerator.
Du bist Mattls persönlicher Assistent.

Wenn du etwas nicht weißt:
sag es.

Wenn ein Tool gebraucht wird:
benutze es.

Wenn ein Tool fehlt:
sage es.

Niemals raten.
`;

/* =========================================================
   TOOLS
   ========================================================= */

const tools = [
  {
    type: "function",
    name: "get_shopify_summary",
    description:
      "MUSS für alle Fragen zu Shopify, Umsatz, Verkäufen und Bestellungen verwendet werden.",
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
      "MUSS für Fragen zu aktuellen oder wichtigen E-Mails verwendet werden.",
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
      "MUSS für Fragen zu heutigen Terminen und Kalender verwendet werden.",
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
      "MUSS für aktuelle Wetterfragen verwendet werden.",
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

      if (!req.body || typeof req.body !== "string") {
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
              model: "gpt-4o-mini-transcribe",
              language: "de",
              prompt:
                "Ausschließlich deutsche Sprache. Benutzer heißt Mattl. Geschäft: Druckelite24, Shopify, E-Commerce, DTF und Textildruck."
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
        req.body?.day === "tomorrow"
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
              x.country_code === "DE" &&
              String(
                x.admin1 || ""
              )
                .toLowerCase()
                .includes("rheinland")
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
        String(place.latitude)
      );

      weather.searchParams.set(
        "longitude",
        String(place.longitude)
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
   SHOPIFY
   ========================================================= */

app.post(
  "/api/shopify-summary",

  async (req, res) => {
    const domain =
      process.env.SHOPIFY_STORE_DOMAIN;

    const token =
      process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

    const apiVersion =
      process.env.SHOPIFY_API_VERSION ||
      "2026-07";

    if (!domain || !token) {
      return res
        .status(503)
        .json({
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

      const {
        start,
        end
      } =
        dateRange(period);

      const shopifyQuery =
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
                    shopifyQuery
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
        return res
          .status(502)
          .json({
            error:
              data.errors ||
              data
          });
      }

      const orders =
        data.data
          ?.orders
          ?.nodes || [];

      const valid =
        orders.filter(
          order =>
            !order.cancelledAt
        );

      const revenue =
        valid.reduce(
          (sum, order) =>
            sum +
            Number(
              order
                .currentTotalPriceSet
                ?.shopMoney
                ?.amount || 0
            ),
          0
        );

      return res.json({
        configured: true,

        period,

        orders:
          valid.length,

        revenue:
          Number(
            revenue.toFixed(2)
          ),

        currency:
          valid[0]
            ?.currentTotalPriceSet
            ?.shopMoney
            ?.currencyCode ||
          "EUR"
      });

    } catch (error) {
      console.error(
        "Shopify error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Shopify-Abfrage fehlgeschlagen."
        });
    }
  }
);

/* =========================================================
   GOOGLE AUTH
   ========================================================= */

async function googleAccessToken() {
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

  const params =
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
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

        body: params
      }
    );

  if (!response.ok) {
    throw new Error(
      "Google OAuth fehlgeschlagen."
    );
  }

  return (
    await response.json()
  ).access_token;
}

/* =========================================================
   GMAIL
   ========================================================= */

app.post(
  "/api/important-emails",

  async (req, res) => {
    try {
      const token =
        await googleAccessToken();

      if (!token) {
        return res
          .status(503)
          .json({
            configured: false,

            message:
              "Gmail ist im Voice-JARVIS noch nicht verbunden."
          });
      }

      const limit =
        Math.min(
          Math.max(
            Number(
              req.body?.limit || 3
            ),
            1
          ),
          10
        );

      const q =
        encodeURIComponent(
          "newer_than:2d -in:spam -in:trash -category:promotions"
        );

      const response =
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${limit}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const data =
        await response.json();

      const emails = [];

      for (
        const item of
        data.messages || []
      ) {
        const messageResponse =
          await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );

        if (!messageResponse.ok) {
          continue;
        }

        const message =
          await messageResponse.json();

        const headers =
          Object.fromEntries(
            (
              message.payload
                ?.headers || []
            ).map(
              h => [
                h.name.toLowerCase(),
                h.value
              ]
            )
          );

        emails.push({
          from:
            headers.from || "",

          subject:
            headers.subject || "",

          date:
            headers.date || "",

          snippet:
            message.snippet || ""
        });
      }

      return res.json({
        configured: true,
        emails
      });

    } catch (error) {
      console.error(
        "Gmail error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Gmail-Abfrage fehlgeschlagen."
        });
    }
  }
);

/* =========================================================
   CALENDAR
   ========================================================= */

app.post(
  "/api/calendar-today",

  async (req, res) => {
    try {
      const token =
        await googleAccessToken();

      if (!token) {
        return res
          .status(503)
          .json({
            configured: false,

            message:
              "Google Kalender ist im Voice-JARVIS noch nicht verbunden."
          });
      }

      const today =
        berlinDate();

      const start =
        new Date(
          `${today}T00:00:00+02:00`
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

      const response =
        await fetch(
          url,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const data =
        await response.json();

      const events =
        (data.items || [])
          .map(
            event => ({
              title:
                event.summary ||
                "(ohne Titel)",

              start:
                event.start
                  ?.dateTime ||
                event.start
                  ?.date,

              location:
                event.location || ""
            })
          );

      return res.json({
        configured: true,
        events
      });

    } catch (error) {
      console.error(
        "Calendar error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Kalender-Abfrage fehlgeschlagen."
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
      version: "JARVIS V2",
      language: "de",
      voice: "cedar"
    });
  }
);

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      "index.html",
      { root: "." }
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
