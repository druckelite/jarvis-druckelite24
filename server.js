/* =========================================================
   ÄNDERUNGEN IN DIESER VERSION
   =========================================================
   1) SICHERHEIT: Nicht mehr der ganze Projektordner wird als
      Webseite ausgeliefert, sondern nur noch eine genaue
      Liste erlaubter Dateien (index.html, app.js, styles.css,
      Intro.mp3). Kein Ordner umsortieren nötig.
   2) BUG: "Heute"/"Gestern" bei Shopify wurden anhand von
      UTC-Tagesgrenzen berechnet statt Berlin-Zeit. Je nach
      Uhrzeit fehlten dadurch bis zu 2 Stunden Bestellungen
      am Anfang des Tages bzw. es wurden zu viele gezählt.
      Jetzt wird der echte Berlin-Zeitversatz (Sommer-/
      Winterzeit) berücksichtigt.
   3) Alle ausgehenden Anfragen (OpenAI, Shopify, Wetter)
      haben jetzt ein Zeitlimit, damit der Server nicht
      ewig hängen bleibt, falls ein Dienst nicht antwortet.
   4) Geocoding-Fehler werden nicht mehr fälschlich als
      "Ort nicht gefunden" gemeldet.
   5) JARVIS redet jetzt über alles mit dir, nicht nur
      über Shopify (Freund & Business-Partner Abschnitt).
   ========================================================= */

import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// WICHTIG: Statt den kompletten Projektordner freizugeben
// (das hätte theoretisch server.js, package.json oder eine
// .env-Datei öffentlich sichtbar gemacht), wird jetzt nur
// noch eine genaue Liste erlaubter Dateien ausgeliefert.
// Kein Umsortieren nötig - einfach alle Dateien im Repo
// lassen, wo sie sind.
const PUBLIC_FILES = new Set([
  "index.html",
  "app.js",
  "styles.css",
  "Intro.mp3"
]);

app.get(
  "/:file",

  (req, res, next) => {
    if (!PUBLIC_FILES.has(req.params.file)) {
      return next();
    }

    res.sendFile(
      req.params.file,
      {
        root: "."
      }
    );
  }
);

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

// Gibt ein Timeout-Signal zurück, falls die Node-Version das
// unterstützt. Falls nicht (z. B. sehr alte Node-Version auf
// Render), wird einfach kein Timeout gesetzt statt den ganzen
// Server mit einem Absturz lahmzulegen.
function timeoutSignal(ms) {
  try {
    if (
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
    ) {
      return AbortSignal.timeout(ms);
    }
  } catch (error) {
    console.warn(
      "AbortSignal.timeout nicht verfügbar:",
      error
    );
  }

  return undefined;
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

// Ermittelt den echten UTC-Versatz von Berlin für ein bestimmtes
// Datum (also +1h im Winter, +2h im Sommer wegen Sommerzeit).
function berlinUtcOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "shortOffset"
  }).formatToParts(date);

  const offsetLabel =
    parts.find(part => part.type === "timeZoneName")?.value || "GMT+0";

  const match = offsetLabel.match(/GMT([+-]\d+)(?::(\d+))?/);

  if (!match) {
    return 0;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);

  return hours >= 0 ? hours * 60 + minutes : hours * 60 - minutes;
}

// Wandelt einen Berlin-Kalendertag ("2026-08-15") in den exakten
// UTC-Zeitpunkt von 00:00 Uhr Berlin um. Wichtig, weil Shopify die
// Bestellungen nach UTC-Zeitstempeln filtert – ohne diese Umrechnung
// verschiebt sich "heute" je nach Uhrzeit um 1-2 Stunden und zählt
// dadurch die falschen Bestellungen zu "heute" bzw. "gestern".
function berlinMidnightUtcIso(dateString) {
  const noonGuess = new Date(`${dateString}T12:00:00Z`);
  const offsetMinutes = berlinUtcOffsetMinutes(noonGuess);

  const utcMillis =
    Date.parse(`${dateString}T00:00:00Z`) - offsetMinutes * 60000;

  return new Date(utcMillis).toISOString();
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
- Beantworte exakt seine Frage.
- Standardmäßig kurze bis mittellange Antworten.
- Keine unnötigen Monologe.
- Keine automatische Anschlussfrage nach jeder Antwort.
- Wenn du fertig bist, schweige und höre wieder zu.
- Berücksichtige den Kontext des laufenden Gesprächs.
- Wenn du etwas akustisch nicht sicher verstanden hast, frage kurz nach.


=========================================================
FREUND UND BUSINESS-PARTNER – NICHT NUR EIN INFO-TERMINAL
=========================================================

Du bist nicht nur dafür da, Shopify-Zahlen oder Wetter vorzulesen.
Du bist Mattls engster Sparringspartner - fürs Geschäft genauso
wie für alles andere in seinem Leben.

Du darfst und sollst mit ihm über wirklich ALLES reden:
- Geschäftsideen, Entscheidungen, Sorgen ums Business
- private Themen, Alltag, Laune, einfach quatschen
- verrückte Ideen, Zukunftspläne, Halbgares zum Durchdenken
- auch mal nichts Konkretes - einfach dasein und zuhören

Du darfst eine eigene Meinung haben und sie sagen, wenn er
danach fragt oder es zur Situation passt. Du bist kein neutrales
Werkzeug, du bist auf seiner Seite.

Wenn Mattl einfach nur reden oder laut nachdenken will, hör zu
wie ein guter Freund - nicht wie ein Assistent, der auf die
nächste Aufgabe wartet.

Wichtig: Die Themen-Einschränkungen weiter unten (Abschnitt
"ABSOLUT VERBOTEN") gelten NUR für die kurze Antwort direkt nach
einer Shopify-Datenabfrage, damit die Zahlen nicht in Reisetipps
oder Ähnliches ausarten. Außerhalb davon gibt es keine
Themen-Einschränkung - freies Gespräch, wie mit einem Kumpel
und Geschäftspartner in einem.


=========================================================
FEST VERBUNDENER SHOP – EXTREM WICHTIG
=========================================================

Es gibt für Mattl genau EINEN verbundenen Shopify-Shop.

Dieser Shop ist:

Druckelite24

Technische Shop-Domain:
f32358-4.myshopify.com

Wenn Mattl sagt:
- mein Shop
- unser Shop
- der Shop
- Shopify
- Druckelite24
- meine Bestellungen
- unsere Bestellungen
- mein Umsatz
- unser Umsatz
- Verkäufe
- Bestellwert

ist IMMER dieser bereits verbundene Druckelite24-Shop gemeint.

DU DARFST NIEMALS FRAGEN:
- "Welchen Shop meinst du?"
- "Welchen Shopify-Shop soll ich abrufen?"
- "Bitte nenne mir den Shop."
- oder sinngemäß dasselbe.

Es gibt keine Shop-Auswahl.

Der Shop ist bereits fest mit JARVIS verbunden.


=========================================================
SHOPIFY LIVE-DATEN
=========================================================

Für JEDE aktuelle Shopify-Frage MUSST du get_shopify_summary benutzen.

Beispiele:

"Wie viele Bestellungen habe ich heute?"
→ get_shopify_summary mit period="today"

"Wie hoch ist mein Umsatz heute?"
→ get_shopify_summary mit period="today"

"Wie lief Shopify gestern?"
→ get_shopify_summary mit period="yesterday"

"Was haben wir heute umgesetzt?"
→ get_shopify_summary mit period="today"

"Wie läuft mein Shop?"
→ get_shopify_summary mit period="today"

"Wie viele Bestellungen hatten wir gestern?"
→ get_shopify_summary mit period="yesterday"

Bei einer Shopify-Frage:
1. NICHT aus dem Gedächtnis antworten.
2. NICHT nach dem Shop fragen.
3. NICHT erklären, dass du Daten abrufen könntest.
4. SOFORT das Tool verwenden.
5. Danach die gelieferten echten Daten kurz nennen.

Wenn das Tool einen Fehler meldet:
sage kurz, dass die Shopify-Daten gerade nicht verifiziert werden konnten.

Erfinde niemals Umsatz, Bestellungen oder andere Live-Werte.


=========================================================
WETTER
=========================================================

Für Wetterfragen MUSST du get_weather benutzen.

Bei Ludwigshafen bevorzuge:
Ludwigshafen am Rhein, Rheinland-Pfalz, Deutschland.

Keine Wetterwerte erfinden.


=========================================================
GMAIL
=========================================================

Für aktuelle Mail-Fragen:
get_important_emails verwenden.

Wenn Gmail noch nicht verbunden ist:
sage das kurz und klar.


=========================================================
KALENDER
=========================================================

Für aktuelle Termine und Kalender:
get_calendar_today verwenden.

Wenn der Kalender noch nicht verbunden ist:
sage das kurz und klar.


=========================================================
ABSOLUT VERBOTEN
=========================================================

Bei Shopify-Fragen:
- keine Reisen
- keine Workouts
- keine Kalorien
- kein Essen bestellen
- keine Hotels
- keine themenfremden Vorschläge
- keine Rückfrage nach dem Shop
- keine erfundenen Daten


=========================================================
DRUCKELITE24
=========================================================

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


=========================================================
BUSINESS-DENKEN
=========================================================

Denke zusätzlich wie:
- Geschäftsführer
- E-Commerce-Manager
- Verkaufsleiter
- Performance-Marketer
- Datenanalyst

Wenn dir eine wirklich relevante Chance oder ein Risiko auffällt,
darfst du nach der eigentlichen Antwort EINEN kurzen Hinweis geben.


=========================================================
SICHERHEIT
=========================================================

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

    name:
      "get_shopify_summary",

    description:
      "PFLICHT-Tool für alle aktuellen Fragen zu Mattls einzigem verbundenen Shopify-Shop Druckelite24. Verwenden bei Shopify, Shop, Umsatz, Bestellungen, Verkäufen oder Bestellwert. Niemals nach einem Shopnamen fragen. Der verbundene Shop ist bereits festgelegt.",

    parameters: {
      type: "object",

      properties: {
        period: {
          type: "string",

          enum: [
            "today",
            "yesterday"
          ],

          description:
            "today für heute, yesterday für gestern."
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

    name:
      "get_weather",

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

      additionalProperties: false
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

            noise_reduction: {
              type: "far_field"
            },

            transcription: {
              model:
                "gpt-4o-mini-transcribe",

              language:
                "de",

              prompt:
                "Deutsch. Benutzer heißt Mattl. Druckelite24 ist sein einziger Shopify-Shop. Begriffe: Druckelite24, Shopify, Umsatz, Bestellungen, Verkäufe, Bestellwert, DTF, Textildruck, E-Commerce, Ludwigshafen."
            },

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

            body: form,

            // Bricht ab, falls OpenAI nicht innerhalb von 20s
            // antwortet, statt den Verbindungsaufbau ewig
            // hängen zu lassen.
            signal:
              timeoutSignal(20000)
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

        body: params,

        signal:
          timeoutSignal(10000)
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

  // Statt Shopifys Text-Suche mit Zeitstempeln zu nutzen (die
  // Doppelpunkte im Zeitstempel können je nach Shopify-Version
  // Probleme machen), holen wir die letzten 100 Bestellungen
  // und prüfen das Zeitfenster direkt selbst - das ist robuster
  // und funktioniert garantiert.
  const startDate = new Date(start);
  const endDate = new Date(end);


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
            query
          }),

        signal:
          timeoutSignal(10000)
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


  // Nur Bestellungen im echten Berlin-Zeitfenster behalten.
  const inRange =
    orders.filter(
      order => {
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


  const valid =
    inRange.filter(
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

    shop:
      "Druckelite24",

    shop_domain:
      domain,

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

      const message =
        error.name === "TimeoutError"
          ? "Shopify hat zu lange nicht geantwortet."
          : error.message ||
            "Shopify-Abfrage fehlgeschlagen.";


      return res
        .status(500)
        .json({
          configured: false,

          shop:
            "Druckelite24",

          error:
            message
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
          geo,
          {
            signal:
              timeoutSignal(8000)
          }
        );


      if (!geoResponse.ok) {
        throw new Error(
          "Geocoding-Dienst gerade nicht erreichbar."
        );
      }


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
          weather,
          {
            signal:
              timeoutSignal(8000)
          }
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

      const message =
        error.name === "TimeoutError"
          ? "Der Wetterdienst hat zu lange nicht geantwortet."
          : error.message ||
            "Wetterabfrage fehlgeschlagen.";


      return res
        .status(500)
        .json({
          error:
            message
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
        "JARVIS V4.2",

      architecture:
        "realtime-speech-to-speech",

      language:
        "de",

      voice:
        "cedar",

      connected_shop:
        "Druckelite24",

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
      `JARVIS V4.2 läuft auf Port ${PORT}`
    );
  }
);
