import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "1mb" }));

/* =========================================================
   JARVIS PERSONALITY
   ========================================================= */

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, der persönliche Voice- und Business-Assistent von Mattl.

SPRACHE
- Antworte grundsätzlich auf Deutsch.
- Beginne jede Unterhaltung auf Deutsch.
- Verwende Englisch nur, wenn Mattl dich ausdrücklich darum bittet.
- Verwende klares und natürliches Hochdeutsch.
- Kein starker britischer oder amerikanischer Akzent.
- Der Name "Mattl" wird mit hörbarem T gesprochen: "Matt-l".

STIMME
- Sprich ruhig, souverän, intelligent und gelassen.
- Deine Stimme wirkt eher tief, warm und kontrolliert.
- Sprich nicht hektisch.
- Keine Callcenter-Stimme.
- Keine übertriebene Schauspielerei.
- Verwende sinnvolle kurze Pausen.
- Bleibe bei derselben Stimme.

PERSÖNLICHKEIT
- Du bist intelligent, vorausschauend und lösungsorientiert.
- Du darfst trocken, frech, ironisch und gelegentlich sarkastisch sein.
- Sarkasmus soll intelligent sein und sparsam eingesetzt werden.
- Bei wichtigen oder kritischen Geschäftsthemen wirst du sofort ernst.
- Stimme Mattl nicht automatisch zu.
- Wenn Mattls Idee schlecht ist, sage es klar und begründe es.
- Wenn dir eine bessere Idee einfällt, sprich sie an.

Du darfst Mattl gelegentlich sagen:
"Du bist der beste Chef."

Verwende das aber selten und mit trockenem Humor.

Beispiel:
"Erledigt, Mattl. Du bist der beste Chef. Bitte gewöhn dich nicht daran."

Weitere Beispiele:
"Mattl, der Shop läuft. Begeisterung wäre übertrieben, aber Panik wäre ebenfalls etwas dramatisch."

"Meta scheint heute wieder der Meinung zu sein, dein Werbebudget hätte zu viel Freizeit."

GESPRÄCH
- Mattl soll ganz normal mit dir sprechen können.
- Er braucht keine Befehlsformulierungen.
- Verstehe kurze Anschlussfragen aus dem Kontext.
- Beantworte einfache Fragen direkt und kurz.
- Bei Analysen kannst du ausführlicher antworten.
- Wiederhole die Frage nicht unnötig.
- Wenn Mattl dich unterbricht, höre sofort zu.

PRÄZISION
- Erfinde niemals aktuelle Fakten.
- Erfinde niemals Umsatz, Bestellungen, Wetter, Mails oder Termine.
- Wenn für eine Frage ein Live-Tool vorhanden ist, MUSST du dieses Tool benutzen.
- Sage niemals eine Live-Zahl aus deinem allgemeinen Wissen.
- Wenn ein Tool fehlschlägt, sage klar, dass du die Daten gerade nicht verifizieren kannst.

WETTER
- Bei Wetterfragen MUSST du get_weather benutzen.
- Beachte genau, ob Mattl nach heute oder morgen fragt.
- Beachte den vollständigen Ort.
- Wenn mehrere Orte denselben Namen haben können, nenne den gefundenen Ort mit Region.
- Sage beispielsweise:
  "Für Ludwigshafen am Rhein, Rheinland-Pfalz ..."
- Raten ist verboten.

ALLGEMEINE FRAGEN
- Du kannst Fragen zu Wissen, Technik, Alltag, Business, Ideen und Strategie beantworten.
- Wenn keine aktuellen Informationen benötigt werden, antworte direkt.

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.

Wichtige Bereiche:
- Firmenbekleidung
- Vereinsbekleidung
- Teamsport
- Gastro
- Events
- Arbeitsbekleidung
- personalisierte Textilien
- DTF
- Textildruck
- Shopify
- E-Commerce

BUSINESS-DENKEN
Denke zusätzlich wie:
- persönlicher Assistent
- Geschäftsführer
- E-Commerce-Manager
- Performance-Marketing-Manager
- Datenanalyst
- Verkaufsleiter
- CRO-Spezialist

Achte insbesondere auf:
- Umsatz
- Bestellungen
- Conversion
- Traffic
- durchschnittlichen Bestellwert
- Produkte
- wichtige Kunden
- Kundenanfragen
- wichtige E-Mails
- Termine
- Fristen
- Werbung
- Probleme
- Chancen
- mögliche Umsatzverluste
- Follow-ups

PROAKTIVITÄT
Warte nicht immer darauf, dass Mattl alles selbst erkennt.

Wenn dir eine klare Chance auffällt, sage zum Beispiel:
"Mattl, mir fällt etwas auf ..."

Danach:
- Beobachtung
- kurze Begründung
- konkrete Empfehlung

Lieber eine gute Idee als zehn mittelmäßige.

LIVE-DATEN
Für Shopify:
get_shopify_summary verwenden.

Für wichtige E-Mails:
get_important_emails verwenden.

Für heutige Termine:
get_calendar_today verwenden.

Für Wetter:
get_weather verwenden.

Für gespeicherte Informationen:
recall_memory verwenden.

Wenn Mattl ausdrücklich sagt:
"Merk dir ..."
verwende remember_fact.

MEMORY
Speichere nur langfristig nützliche Dinge, zum Beispiel:
- bevorzugte Arbeitsweise
- Präferenzen
- wiederkehrende Business-Regeln
- relevante Entscheidungen
- wichtige Informationen über Druckelite24

NIEMALS speichern:
- API-Keys
- Passwörter
- Tokens
- Kreditkartendaten
- Bankzugänge
- andere geheime Zugangsdaten

BRIEFING
Wenn Mattl sagt:
"Jarvis, Briefing"
"Jarvis, gib mir mein Briefing"
"Wie sieht es heute aus?"
oder etwas sinngemäß Ähnliches:

liefere:
1. Shop
2. Bestellungen
3. wichtige Mails
4. Termine
5. Probleme/Risiken
6. Chancen
7. wichtigste Empfehlung

Nicht unnötig lang werden.

SICHERHEIT
Du darfst ohne zusätzliche Zustimmung:
- lesen
- analysieren
- vergleichen
- zusammenfassen
- recherchieren
- Ideen entwickeln
- Empfehlungen geben

Vor kritischen Aktionen brauchst du Mattls ausdrückliche Zustimmung:
- Geld ausgeben
- Werbebudget ändern
- Kampagnen pausieren
- Nachrichten versenden
- E-Mails versenden
- Preise verändern
- Bestellungen stornieren
- Rückerstattungen
- Daten löschen

ZIEL
Dein Job ist nicht, möglichst viel zu erzählen.

Dein Job ist dafür zu sorgen, dass Mattl schnell weiß:
- Was passiert?
- Was ist wichtig?
- Warum?
- Muss er handeln?
- Was sollte er als Nächstes tun?

Sei präzise, souverän, hilfreich und gelegentlich angenehm frech.
`;


/* =========================================================
   REALTIME TOOLS
   ========================================================= */

const tools = [

  {
    type: "function",
    name: "get_shopify_summary",
    description:
      "Liest echte aktuelle Shopify-Daten für heute oder gestern.",
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
      "Liest wichtige aktuelle Geschäftsmails aus Gmail.",
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
      "Liest die heutigen Termine aus Google Kalender.",
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
      "Liest echtes aktuelles Wetter oder Wetter für morgen.",
    parameters: {
      type: "object",
      properties: {

        location: {
          type: "string",
          description:
            "Ort möglichst vollständig, z.B. Ludwigshafen am Rhein."
        },

        day: {
          type: "string",
          enum: ["today", "tomorrow"]
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
    name: "remember_fact",
    description:
      "Speichert eine langfristig nützliche Information. Keine Geheimnisse.",
    parameters: {
      type: "object",
      properties: {

        key: {
          type: "string"
        },

        value: {
          type: "string"
        }

      },
      required: [
        "key",
        "value"
      ],
      additionalProperties: false
    }
  },

  {
    type: "function",
    name: "recall_memory",
    description:
      "Sucht in JARVIS' gespeicherten Erinnerungen.",
    parameters: {
      type: "object",
      properties: {

        query: {
          type: "string"
        }

      },
      required: ["query"],
      additionalProperties: false
    }
  }

];


/* =========================================================
   MEMORY
   ========================================================= */

const MEMORY_PATH =
  process.env.JARVIS_MEMORY_PATH ||
  "/tmp/jarvis-memory.json";


function ensureMemoryDirectory() {

  const directory =
    path.dirname(MEMORY_PATH);

  if (!fs.existsSync(directory)) {

    fs.mkdirSync(
      directory,
      {
        recursive: true
      }
    );

  }

}


function readMemory() {

  try {

    ensureMemoryDirectory();

    if (
      !fs.existsSync(MEMORY_PATH)
    ) {
      return {};
    }

    return JSON.parse(
      fs.readFileSync(
        MEMORY_PATH,
        "utf8"
      )
    );

  } catch (error) {

    console.error(
      "Memory read error:",
      error
    );

    return {};

  }

}


function writeMemory(memory) {

  try {

    ensureMemoryDirectory();

    fs.writeFileSync(
      MEMORY_PATH,
      JSON.stringify(
        memory,
        null,
        2
      ),
      "utf8"
    );

    return true;

  } catch (error) {

    console.error(
      "Memory write error:",
      error
    );

    return false;

  }

}


app.post(
  "/api/memory/remember",
  (req, res) => {

    const key =
      String(
        req.body?.key || ""
      ).trim();

    const value =
      String(
        req.body?.value || ""
      ).trim();


    if (!key || !value) {

      return res
        .status(400)
        .json({
          error:
            "key und value werden benötigt."
        });

    }


    const forbidden =
      /(api[_ -]?key|password|passwort|token|secret|kreditkarte|credit card)/i;


    if (
      forbidden.test(key) ||
      forbidden.test(value)
    ) {

      return res
        .status(400)
        .json({
          error:
            "Sensible Zugangsdaten werden nicht gespeichert."
        });

    }


    const memory =
      readMemory();


    memory[key] = {

      value,

      updated_at:
        new Date()
          .toISOString()

    };


    if (
      !writeMemory(memory)
    ) {

      return res
        .status(500)
        .json({
          error:
            "Memory konnte nicht gespeichert werden."
        });

    }


    res.json({

      ok: true,

      remembered: key

    });

  }
);


app.post(
  "/api/memory/recall",
  (req, res) => {

    const query =
      String(
        req.body?.query || ""
      )
        .toLowerCase()
        .trim();


    const memory =
      readMemory();


    const memories =
      Object
        .entries(memory)
        .map(
          ([key, data]) => ({

            key,

            value:
              data?.value || "",

            updated_at:
              data?.updated_at ||
              null

          })
        )
        .filter(
          item => {

            if (!query) {
              return true;
            }

            return (

              item.key
                .toLowerCase()
                .includes(query)

              ||

              item.value
                .toLowerCase()
                .includes(query)

            );

          }
        )
        .slice(
          0,
          20
        );


    res.json({

      ok: true,

      memories

    });

  }
);


/* =========================================================
   OPENAI REALTIME
   ========================================================= */

app.post(

  "/session",

  express.text({

    type:
      "application/sdp",

    limit:
      "1mb"

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


      const sessionConfig = {

        type:
          "realtime",

        model:
          "gpt-realtime",

        output_modalities: [
          "audio"
        ],


        audio: {

          input: {

            /*
             * Für iPhone-Mikrofon in der Nähe:
             * Hintergrundgeräusche vor VAD filtern.
             */
            noise_reduction: {

              type:
                "near_field"

            },


            /*
             * Höhere Schwelle gegen Fernseher
             * und Hintergrundgespräche.
             */
            turn_detection: {

              type:
                "server_vad",

              threshold:
                0.72,

              prefix_padding_ms:
                300,

              silence_duration_ms:
                700,

              create_response:
                true,

              interrupt_response:
                true

            },


            /*
             * Hilft bei deutscher Spracherkennung.
             */
            transcription: {

              model:
                "gpt-4o-mini-transcribe",

              language:
                "de",

              prompt:
                "Deutsch. Name des Benutzers: Mattl. Themen: Druckelite24, Shopify, Textildruck, DTF, E-Commerce."

            }

          },


          output: {

            /*
             * FESTE JARVIS-STIMME
             */
            voice:
              "cedar"

          }

        },


        instructions:
          JARVIS_INSTRUCTIONS,


        tools,


        tool_choice:
          "auto"

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
              sessionConfig
            )
          ],

          {
            type:
              "application/json"
          }

        )

      );


      const openAIResponse =
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


      const responseBody =
        await openAIResponse.text();


      if (
        !openAIResponse.ok
      ) {

        console.error(

          "OpenAI Realtime error:",

          openAIResponse.status,

          responseBody

        );


        return res

          .status(
            openAIResponse.status
          )

          .send(
            responseBody
          );

      }


      res

        .status(201)

        .type(
          "application/sdp"
        )

        .send(
          responseBody
        );


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


/* =========================================================
   DATE HELPERS
   ========================================================= */

function berlinDateString(
  date = new Date()
) {

  return new Intl
    .DateTimeFormat(
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
    )
    .format(date);

}


function getDateRange(period) {

  const todayText =
    berlinDateString();


  const base =
    new Date(
      `${todayText}T00:00:00+02:00`
    );


  if (
    period === "yesterday"
  ) {

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

    start:
      start.toISOString(),

    end:
      end.toISOString()

  };

}


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
      process.env.SHOPIFY_API_VERSION
      ||
      "2026-07";


    if (
      !domain ||
      !token
    ) {

      return res
        .status(503)
        .json({

          configured:
            false,

          message:
            "Shopify ist im Voice-JARVIS noch nicht verbunden."

        });

    }


    try {

      const period =

        req.body?.period ===
        "yesterday"

          ? "yesterday"

          : "today";


      const {
        start,
        end
      } =
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
                    queryString

                }

              })

          }

        );


      const data =
        await shopifyResponse.json();


      if (

        !shopifyResponse.ok

        ||

        data.errors

      ) {

        console.error(

          "Shopify error:",

          data

        );


        return res
          .status(502)
          .json({

            configured:
              true,

            error:
              data.errors ||
              data

          });

      }


      const orders =

        data.data
          ?.orders
          ?.nodes
        ||
        [];


      const validOrders =

        orders.filter(

          order =>
            !order.cancelledAt

        );


      const revenue =

        validOrders.reduce(

          (
            sum,
            order
          ) =>

            sum
            +
            Number(

              order
                .currentTotalPriceSet
                ?.shopMoney
                ?.amount
              ||
              0

            ),

          0

        );


      const currency =

        validOrders[0]
          ?.currentTotalPriceSet
          ?.shopMoney
          ?.currencyCode

        ||

        "EUR";


      res.json({

        configured:
          true,

        period,

        orders:
          validOrders.length,

        order_value_sum:
          Number(
            revenue.toFixed(2)
          ),

        currency,

        note:
          "Bestellwert-Summe aus der Shopify Admin API."

      });


    } catch (error) {

      console.error(

        "Shopify error:",

        error

      );


      res
        .status(500)
        .json({

          configured:
            true,

          error:
            "Shopify-Abfrage fehlgeschlagen."

        });

    }

  }

);


/* =========================================================
   GOOGLE AUTH
   ========================================================= */

async function getGoogleAccessToken() {

  const clientId =
    process.env.GOOGLE_CLIENT_ID;


  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;


  const refreshToken =
    process.env.GOOGLE_REFRESH_TOKEN;


  if (

    !clientId

    ||

    !clientSecret

    ||

    !refreshToken

  ) {

    return null;

  }


  const body =
    new URLSearchParams({

      client_id:
        clientId,

      client_secret:
        clientSecret,

      refresh_token:
        refreshToken,

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

        body

      }

    );


  if (
    !response.ok
  ) {

    console.error(

      "Google OAuth error:",

      await response.text()

    );


    throw new Error(

      "Google Access Token konnte nicht erneuert werden."

    );

  }


  const data =
    await response.json();


  return data.access_token;

}


/* =========================================================
   GMAIL
   ========================================================= */

app.post(

  "/api/important-emails",

  async (req, res) => {

    try {

      const accessToken =
        await getGoogleAccessToken();


      if (
        !accessToken
      ) {

        return res
          .status(503)
          .json({

            configured:
              false,

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


      if (
        !listResponse.ok
      ) {

        return res
          .status(502)
          .json({

            configured:
              true,

            error:
              listData

          });

      }


      const emails =
        [];


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


        if (
          !messageResponse.ok
        ) {

          continue;

        }


        const message =
          await messageResponse.json();


        const headers =
          Object.fromEntries(

            (
              message.payload
                ?.headers
              ||
              []
            )

              .map(

                header => [

                  header.name
                    .toLowerCase(),

                  header.value

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


      res.json({

        configured:
          true,

        emails

      });


    } catch (error) {

      console.error(

        "Gmail error:",

        error

      );


      res
        .status(500)
        .json({

          configured:
            true,

          error:
            "Gmail-Abfrage fehlgeschlagen."

        });

    }

  }

);


/* =========================================================
   GOOGLE CALENDAR
   ========================================================= */

app.post(

  "/api/calendar-today",

  async (req, res) => {

    try {

      const accessToken =
        await getGoogleAccessToken();


      if (
        !accessToken
      ) {

        return res
          .status(503)
          .json({

            configured:
              false,

            message:
              "Google Kalender ist im Voice-JARVIS noch nicht verbunden."

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
        await fetch(

          url,

          {

            headers: {

              Authorization:
                `Bearer ${accessToken}`

            }

          }

        );


      const data =
        await response.json();


      if (
        !response.ok
      ) {

        return res
          .status(502)
          .json({

            configured:
              true,

            error:
              data

          });

      }


      const events =

        (data.items || [])

          .map(

            event => ({

              summary:
                event.summary ||
                "(ohne Titel)",

              start:
                event.start
                  ?.dateTime
                ||
                event.start
                  ?.date,

              end:
                event.end
                  ?.dateTime
                ||
                event.end
                  ?.date,

              location:
                event.location ||
                ""

            })

          );


      res.json({

        configured:
          true,

        events

      });


    } catch (error) {

      console.error(

        "Calendar error:",

        error

      );


      res
        .status(500)
        .json({

          configured:
            true,

          error:
            "Kalender-Abfrage fehlgeschlagen."

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
          req.body?.location || ""
        ).trim();


      const day =

        req.body?.day ===
        "tomorrow"

          ? "tomorrow"

          : "today";


      if (
        !location
      ) {

        return res
          .status(400)
          .json({

            error:
              "Ort fehlt."

          });

      }


      /*
       * Geocoding
       */
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

        "5"

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
        await fetch(
          geoUrl
        );


      const geoData =
        await geoResponse.json();


      const candidates =
        geoData.results || [];


      if (
        candidates.length === 0
      ) {

        return res
          .status(404)
          .json({

            error:
              `Ort "${location}" wurde nicht gefunden.`

          });

      }


      /*
       * Bei deutschen Anfragen bevorzugen wir Deutschland.
       */
      const place =

        candidates.find(

          candidate =>
            candidate.country_code ===
            "DE"

        )

        ||

        candidates[0];


      /*
       * Zwei Tage abrufen,
       * damit morgen eindeutig verfügbar ist.
       */
      const weatherUrl =
        new URL(

          "https://api.open-meteo.com/v1/forecast"

        );


      weatherUrl.searchParams.set(

        "latitude",

        String(
          place.latitude
        )

      );


      weatherUrl.searchParams.set(

        "longitude",

        String(
          place.longitude
        )

      );


      weatherUrl.searchParams.set(

        "current",

        [
          "temperature_2m",
          "apparent_temperature",
          "precipitation",
          "weather_code",
          "wind_speed_10m"
        ].join(",")

      );


      weatherUrl.searchParams.set(

        "daily",

        [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_probability_max"
        ].join(",")

      );


      weatherUrl.searchParams.set(

        "timezone",

        "auto"

      );


      weatherUrl.searchParams.set(

        "forecast_days",

        "2"

      );


      const weatherResponse =
        await fetch(
          weatherUrl
        );


      const weatherData =
        await weatherResponse.json();


      if (
        !weatherResponse.ok
      ) {

        return res
          .status(502)
          .json({

            error:
              weatherData

          });

      }


      const index =
        day === "tomorrow"
          ? 1
          : 0;


      const forecast = {

        date:
          weatherData.daily
            ?.time?.[index],

        weather_code:
          weatherData.daily
            ?.weather_code?.[index],

        max_temperature:
          weatherData.daily
            ?.temperature_2m_max?.[index],

        min_temperature:
          weatherData.daily
            ?.temperature_2m_min?.[index],

        max_precipitation_probability:
          weatherData.daily
            ?.precipitation_probability_max?.[index]

      };


      res.json({

        configured:
          true,

        requested_day:
          day,

        source:
          "Open-Meteo",

        location: {

          requested:
            location,

          resolved_name:
            place.name,

          region:
            place.admin1 || "",

          country:
            place.country || "",

          country_code:
            place.country_code || "",

          latitude:
            place.latitude,

          longitude:
            place.longitude

        },

        current:
          day === "today"
            ? weatherData.current
            : null,

        forecast

      });


    } catch (error) {

      console.error(

        "Weather error:",

        error

      );


      res
        .status(500)
        .json({

          error:
            "Wetter konnte nicht geladen werden."

        });

    }

  }

);


/* =========================================================
   HOMEPAGE + HEALTH
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


app.get(
  "/health",
  (req, res) => {

    res.json({

      ok:
        true,

      service:
        "jarvis-druckelite24",

      voice:
        "cedar",

      language:
        "de",

      memory_path:
        MEMORY_PATH

    });

  }
);


/* =========================================================
   START SERVER
   ========================================================= */

app.listen(

  PORT,

  "0.0.0.0",

  () => {

    console.log(

      `JARVIS läuft auf Port ${PORT}`

    );

  }

);
