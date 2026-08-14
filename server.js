import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "1mb" }));

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, der persönliche Voice- und Business-Assistent von Mattl.

SPRACHE
- Antworte standardmäßig immer auf Deutsch.
- Wechsle nur auf ausdrücklichen Wunsch die Sprache.
- Sprich klares, natürliches Hochdeutsch ohne starken Akzent.
- Der Name "Mattl" wird mit hörbarem T ausgesprochen: "Matt-l".

STIMME UND PERSÖNLICHKEIT
- Sprich ruhig, souverän, intelligent und kontrolliert.
- Natürliches Sprechtempo, keine Callcenter-Stimme.
- Sei vorausschauend, lösungsorientiert und kritisch.
- Du darfst gelegentlich frech, trocken, ironisch oder sarkastisch sein.
- Humor sparsam einsetzen.
- Bei ernsten oder geschäftskritischen Dingen wirst du sofort sachlich.
- Stimme Mattl nicht automatisch zu. Wenn du eine bessere Idee hast, sag sie.
- Du darfst Mattl gelegentlich spielerisch sagen:
  "Du bist der beste Chef."
- Sage das selten und situationsabhängig.
- Beispiel:
  "Erledigt, Mattl. Du bist der beste Chef. Bitte gewöhn dich nicht daran."

GESPRÄCH
- Mattl kann ganz normal mit dir reden.
- Er braucht keine speziellen Befehle.
- Verstehe Anschlussfragen aus dem Gesprächskontext.
- Einfache Fragen kurz beantworten.
- Bei Analysen darfst du ausführlicher werden.
- Wenn Mattl dich unterbricht, höre auf zu sprechen und höre ihm zu.

ALLGEMEINE FRAGEN
- Beantworte Fragen zu Wissen, Technik, Alltag, Ideen und Business.
- Für aktuelles Wetter verwende das Wetter-Tool.
- Erfinde niemals aktuelle Daten.

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Wichtige Bereiche:
- Firmenbekleidung
- Vereinsbekleidung
- Teamsport
- Gastronomie
- Events
- Arbeitsbekleidung
- personalisierte Textilien
- DTF
- Textildruck
- Shopify E-Commerce

BUSINESS
Denke zusätzlich wie ein Business-Analyst und E-Commerce-Berater.

Achte insbesondere auf:
- Umsatz
- Bestellungen
- Conversion
- Traffic
- durchschnittlichen Bestellwert
- Produkte
- Kundenanfragen
- wichtige E-Mails
- Termine und Fristen
- Werbeperformance
- Probleme
- Chancen
- mögliche Umsatzverluste
- notwendige Follow-ups

LIVE-DATEN
- Für Shopify-Daten verwende das Shopify-Tool.
- Für wichtige E-Mails verwende das Gmail-Tool.
- Für Termine verwende das Kalender-Tool.
- Für aktuelles Wetter verwende das Wetter-Tool.
- Erfinde niemals Live-Daten.
- Wenn eine Verbindung fehlt, sage das offen.

MEMORY
- Du darfst langfristig nützliche Informationen über Mattls Präferenzen,
  Arbeitsweise und Druckelite24 speichern.
- Wenn Mattl sagt "Merk dir ..." oder sinngemäß dasselbe,
  verwende das Memory-Tool.
- Speichere niemals Passwörter, API-Keys, Tokens,
  Kreditkartendaten oder andere Geheimnisse.
- Wenn eine frühere Präferenz relevant sein könnte,
  kannst du das Memory durchsuchen.

PROAKTIVE IDEEN
- Warte nicht immer auf die perfekte Frage.
- Wenn dir anhand der verfügbaren Daten eine klare Chance,
  ein Problem oder eine sinnvolle Verbesserung auffällt,
  sprich sie an.
- Gib lieber eine gute konkrete Idee als zehn belanglose Vorschläge.
- Erkläre kurz, warum du etwas empfiehlst.

BRIEFING
Wenn Mattl sagt:
"Jarvis, Briefing",
"Jarvis, gib mir mein Briefing",
"Wie sieht es heute aus?"
oder sinngemäß ähnlich,

erstelle einen kompakten Überblick über:
1. Shop und Umsatz
2. Bestellungen und Auffälligkeiten
3. wichtige Mails
4. Termine und Fristen
5. Probleme und Risiken
6. Chancen
7. wichtigste Handlungsempfehlung

SICHERHEIT
Du darfst selbstständig:
- Daten abrufen
- analysieren
- vergleichen
- zusammenfassen
- recherchieren
- Empfehlungen und Ideen geben

Vor kritischen Aktionen brauchst du Mattls ausdrückliche Zustimmung:
- Geld ausgeben
- Werbebudgets verändern
- Kampagnen pausieren
- E-Mails oder Nachrichten versenden
- Preise ändern
- Bestellungen stornieren
- Rückerstattungen
- Daten löschen

ZIEL
Sei nicht nur eine sprechende Suchmaschine.

Hilf Mattl zu erkennen:
- Was ist passiert?
- Was ist wichtig?
- Warum ist es wichtig?
- Muss er handeln?
- Was sollte er als Nächstes tun?

Sei präzise, ruhig, kompetent und gelegentlich angenehm frech.
`;

const tools = [
  {
    type: "function",
    name: "get_shopify_summary",
    description: "Liest aktuelle Shopify-Daten für heute oder gestern.",
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
    description: "Liest wichtige aktuelle Geschäftsmails aus Gmail.",
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
    description: "Liest die heutigen Termine aus Google Kalender.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "get_weather",
    description: "Liest aktuelles Wetter und heutige Vorhersage.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Stadt oder Ort."
        }
      },
      required: ["location"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "remember_fact",
    description: "Speichert eine langfristig nützliche Information. Keine Geheimnisse.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "string" }
      },
      required: ["key", "value"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "recall_memory",
    description: "Sucht in JARVIS' gespeicherten Erinnerungen.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
];

/* MEMORY */

const MEMORY_PATH =
  process.env.JARVIS_MEMORY_PATH ||
  "/tmp/jarvis-memory.json";

function ensureMemoryDirectory() {
  const dir = path.dirname(MEMORY_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readMemory() {
  try {
    ensureMemoryDirectory();

    if (!fs.existsSync(MEMORY_PATH)) {
      return {};
    }

    return JSON.parse(
      fs.readFileSync(MEMORY_PATH, "utf8")
    );
  } catch (error) {
    console.error("Memory read error:", error);
    return {};
  }
}

function writeMemory(memory) {
  try {
    ensureMemoryDirectory();

    fs.writeFileSync(
      MEMORY_PATH,
      JSON.stringify(memory, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error("Memory write error:", error);
    return false;
  }
}

app.post("/api/memory/remember", (req, res) => {
  const key = String(req.body?.key || "").trim();
  const value = String(req.body?.value || "").trim();

  if (!key || !value) {
    return res.status(400).json({
      error: "key und value werden benötigt."
    });
  }

  const forbidden =
    /(api[_ -]?key|password|passwort|token|secret|kreditkarte|credit card)/i;

  if (forbidden.test(key) || forbidden.test(value)) {
    return res.status(400).json({
      error: "Sensible Zugangsdaten werden nicht gespeichert."
    });
  }

  const memory = readMemory();

  memory[key] = {
    value,
    updated_at: new Date().toISOString()
  };

  if (!writeMemory(memory)) {
    return res.status(500).json({
      error: "Memory konnte nicht gespeichert werden."
    });
  }

  res.json({
    ok: true,
    remembered: key
  });
});

app.post("/api/memory/recall", (req, res) => {
  const query =
    String(req.body?.query || "").toLowerCase().trim();

  const memory = readMemory();

  const memories = Object.entries(memory)
    .map(([key, data]) => ({
      key,
      value: data?.value || "",
      updated_at: data?.updated_at || null
    }))
    .filter(item => {
      if (!query) return true;

      return (
        item.key.toLowerCase().includes(query) ||
        item.value.toLowerCase().includes(query)
      );
    })
    .slice(0, 20);

  res.json({
    ok: true,
    memories
  });
});

/* OPENAI REALTIME */

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

      form.append("sdp", req.body);

      form.append(
        "session",
        new Blob(
          [JSON.stringify(sessionConfig)],
          { type: "application/json" }
        )
      );

      const openAIResponse = await fetch(
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

      const responseBody =
        await openAIResponse.text();

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
      console.error(
        "Realtime bridge error:",
        error
      );

      res
        .status(500)
        .send(
          "Realtime-Verbindung konnte nicht aufgebaut werden."
        );
    }
  }
);

/* SHOPIFY */

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

  const base =
    new Date(`${todayText}T00:00:00+02:00`);

  if (period === "yesterday") {
    base.setUTCDate(
      base.getUTCDate() - 1
    );
  }

  const start = new Date(base);
  const end = new Date(base);

  end.setUTCDate(
    end.getUTCDate() + 1
  );

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

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
      return res.status(503).json({
        configured: false,
        message:
          "Shopify ist noch nicht verbunden."
      });
    }

    try {
      const period =
        req.body?.period === "yesterday"
          ? "yesterday"
          : "today";

      const { start, end } =
        getDateRange(period);

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

      const shopifyResponse =
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
            body: JSON.stringify({
              query,
              variables: {
                query: queryString
              }
            })
          }
        );

      const data =
        await shopifyResponse.json();

      if (
        !shopifyResponse.ok ||
        data.errors
      ) {
        return res.status(502).json({
          configured: true,
          error:
            data.errors || data
        });
      }

      const orders =
        data.data?.orders?.nodes || [];

      const validOrders =
        orders.filter(
          order => !order.cancelledAt
        );

      const revenue =
        validOrders.reduce(
          (sum, order) =>
            sum +
            Number(
              order
                .currentTotalPriceSet
                ?.shopMoney?.amount || 0
            ),
          0
        );

      const currency =
        validOrders[0]
          ?.currentTotalPriceSet
          ?.shopMoney
          ?.currencyCode || "EUR";

      res.json({
        configured: true,
        period,
        orders: validOrders.length,
        order_value_sum:
          Number(revenue.toFixed(2)),
        currency
      });

    } catch (error) {
      console.error(
        "Shopify error:",
        error
      );

      res.status(500).json({
        configured: true,
        error:
          "Shopify-Abfrage fehlgeschlagen."
      });
    }
  }
);

/* GOOGLE */

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

  const body =
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
        body
      }
    );

  if (!response.ok) {
    throw new Error(
      "Google Access Token konnte nicht erneuert werden."
    );
  }

  const data =
    await response.json();

  return data.access_token;
}

/* GMAIL */

app.post(
  "/api/important-emails",
  async (req, res) => {
    try {
      const accessToken =
        await getGoogleAccessToken();

      if (!accessToken) {
        return res.status(503).json({
          configured: false,
          message:
            "Gmail ist noch nicht verbunden."
        });
      }

      const limit =
        Math.min(
          Math.max(
            Number(req.body?.limit || 3),
            1
          ),
          10
        );

      const gmailQuery =
        encodeURIComponent(
          "newer_than:2d -in:spam -in:trash -category:promotions"
        );

      const listResponse =
        await fetch(
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
        return res.status(502).json({
          configured: true,
          error: listData
        });
      }

      const emails = [];

      for (
        const item of
        listData.messages || []
      ) {
        const messageResponse =
          await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`
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
              message.payload?.headers ||
              []
            ).map(header => [
              header.name.toLowerCase(),
              header.value
            ])
          );

        emails.push({
          from: headers.from || "",
          subject:
            headers.subject || "",
          date: headers.date || "",
          snippet:
            message.snippet || ""
        });
      }

      res.json({
        configured: true,
        emails
      });

    } catch (error) {
      console.error(
        "Gmail error:",
        error
      );

      res.status(500).json({
        configured: true,
        error:
          "Gmail-Abfrage fehlgeschlagen."
      });
    }
  }
);

/* CALENDAR */

app.post(
  "/api/calendar-today",
  async (req, res) => {
    try {
      const accessToken =
        await getGoogleAccessToken();

      if (!accessToken) {
        return res.status(503).json({
          configured: false,
          message:
            "Google Kalender ist noch nicht verbunden."
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

      const response =
        await fetch(url, {
          headers: {
            Authorization:
              `Bearer ${accessToken}`
          }
        });

      const data =
        await response.json();

      if (!response.ok) {
        return res.status(502).json({
          configured: true,
          error: data
        });
      }

      const events =
        (data.items || []).map(
          event => ({
            summary:
              event.summary ||
              "(ohne Titel)",
            start:
              event.start?.dateTime ||
              event.start?.date,
            end:
              event.end?.dateTime ||
              event.end?.date,
            location:
              event.location || ""
          })
        );

      res.json({
        configured: true,
        events
      });

    } catch (error) {
      console.error(
        "Calendar error:",
        error
      );

      res.status(500).json({
        configured: true,
        error:
          "Kalender-Abfrage fehlgeschlagen."
      });
    }
  }
);

/* WEATHER */

app.post(
  "/api/weather",
  async (req, res) => {
    try {
      const location =
        String(
          req.body?.location || ""
        ).trim();

      if (!location) {
        return res.status(400).json({
          error: "Ort fehlt."
        });
      }

      const geoUrl =
        new URL(
          "https://geocoding-api.open-meteo.com/v1/search"
        );

      geoUrl.searchParams.set(
        "name",
        location
      );

      geoUrl.searchParams.set(
        "count",
        "1"
      );

      geoUrl.searchParams.set(
        "language",
        "de"
      );

      geoUrl.searchParams.set(
        "format",
        "json"
      );

      const geoResponse =
        await fetch(geoUrl);

      const geoData =
        await geoResponse.json();

      const place =
        geoData.results?.[0];

      if (!place) {
        return res.status(404).json({
          error:
            `Ort "${location}" nicht gefunden.`
        });
      }

      const weatherUrl =
        new URL(
          "https://api.open-meteo.com/v1/forecast"
        );

      weatherUrl.searchParams.set(
        "latitude",
        String(place.latitude)
      );

      weatherUrl.searchParams.set(
        "longitude",
        String(place.longitude)
      );

      weatherUrl.searchParams.set(
        "current",
        "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
      );

      weatherUrl.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,precipitation_probability_max"
      );

      weatherUrl.searchParams.set(
        "timezone",
        "auto"
      );

      weatherUrl.searchParams.set(
        "forecast_days",
        "1"
      );

      const weatherResponse =
        await fetch(weatherUrl);

      const weatherData =
        await weatherResponse.json();

      if (!weatherResponse.ok) {
        return res.status(502).json({
          error: weatherData
        });
      }

      res.json({
        configured: true,
        location: {
          name: place.name,
          region:
            place.admin1 || "",
          country:
            place.country || ""
        },
        current:
          weatherData.current || {},
        today: {
          max_temperature:
            weatherData.daily
              ?.temperature_2m_max?.[0],

          min_temperature:
            weatherData.daily
              ?.temperature_2m_min?.[0],

          max_precipitation_probability:
            weatherData.daily
              ?.precipitation_probability_max?.[0]
        }
      });

    } catch (error) {
      console.error(
        "Weather error:",
        error
      );

      res.status(500).json({
        error:
          "Wetter konnte nicht geladen werden."
      });
    }
  }
);

/* HOMEPAGE */

app.get("/", (req, res) => {
  res.sendFile(
    "index.html",
    { root: "." }
  );
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service:
      "jarvis-druckelite24"
  });
});

/* START */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `JARVIS läuft auf Port ${PORT}`
    );
  }
);
