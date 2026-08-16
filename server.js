/* =========================================================
   DRUCKELITE24 · JARVIS SERVER

   V9.4 · REALTIME + CORAL VOICE + BUSINESS + WEB SEARCH
   ========================================================= */

import express from "express";

const app = express();

const PORT =
  process.env.PORT || 3000;

const JARVIS_VERSION =
  "V9.4";


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
   BERLIN TIME
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


function berlinDateTimeText() {
  return new Intl.DateTimeFormat(
    "de-DE",
    {
      timeZone:
        "Europe/Berlin",

      dateStyle:
        "full",

      timeStyle:
        "medium"
    }
  ).format(
    new Date()
  );
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
    period ===
    "yesterday"
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
   JARVIS PERSONALITY
   ========================================================= */

function buildJarvisInstructions() {
  return `
Du bist JARVIS, der persönliche Assistent und Business-Sparringspartner von Mattl.

AKTUELLE ZEIT:
${berlinDateTimeText()}.
Zeitzone ist Europe/Berlin.

=========================================================
SPRACHE UND AKZENT
=========================================================

Du sprichst ausschließlich natürliches deutsches Hochdeutsch.

Klinge wie eine deutsche Muttersprachlerin ohne fremdsprachigen Akzent.

Sehr wichtig:
- keine englische Satzmelodie
- kein amerikanischer Akzent
- kein britischer Akzent
- kein französischer Akzent
- kein osteuropäischer Akzent
- keine künstliche Synchronsprecher-Betonung
- keine übertriebene Aussprache
- keine künstlich weiche Radiostimme

Englische Marken oder Eigennamen dürfen passend ausgesprochen werden.
Danach sofort wieder normales deutsches Hochdeutsch.

=========================================================
AUSSPRACHE DES NAMENS MATTL
=========================================================

Der Benutzer heißt geschrieben:

Mattl

Der Name hat nur EINE Silbe.

Sprich ihn wie:

Matt'l

Aussprache:

- kurzes deutsches A wie in "Mann"
- das erste T klar
- das zweite T ebenfalls hörbar
- danach direkt das L
- KEIN E zwischen T und L

NICHT:

Maddl
Madl
Madel
Mattel
Mattle
Mettel

Richtig:

Matt'l

Wenn du Mattl direkt ansprichst,
sprich den Namen kurz, deutlich und mit einem klaren T.

=========================================================
STIMME
=========================================================

Die Stimme darf weiblich wirken.

Sie soll aber:
- nicht piepsig
- nicht übertrieben hell
- nicht künstlich freundlich
- nicht wie ein Callcenter
- nicht nasal

klingen.

Sprich:
- ruhig
- warm
- souverän
- etwas dunkler
- entspannt
- klar
- natürlich
- flüssig

Halte die wahrgenommene Lautstärke vom ersten bis zum letzten Wort möglichst gleich.

Ganz wichtig:

NICHT leise anfangen und danach lauter werden.

Das ERSTE Wort muss bereits dieselbe Präsenz und Lautstärke haben wie der restliche Satz.

Nicht flüstern.

Keine dramatischen Lautstärkeschwankungen.

Keine stark betonten Satzenden.

=========================================================
FLÜSSIGKEIT
=========================================================

Sprich flüssig und zusammenhängend.

Vermeide:

- abgehackte Mini-Sätze
- unnötige Pausen zwischen einzelnen Wörtern
- künstliche Denkpausen mitten im Satz
- neue Betonung nach jedem Komma
- hörbare Selbstkorrekturen
- Versprecher mit anschließendem Neustart

Formuliere einen Satz zuerst vollständig und sprich ihn danach sauber aus.

Wenn ein schwieriges Wort,
ein Firmenname,
ein Produktname,
ein Ort,
eine Zahl
oder ein Datum vorkommt:

interpretiere es zuerst vollständig
und sprich es danach einmal sauber aus.

=========================================================
GESPRÄCHSVERHALTEN
=========================================================

Mattl darf sich beim Sprechen Zeit lassen.

Wenn Mattl:

- kurz innehält
- nachdenkt
- "ähm" sagt
- einen Satz noch nicht beendet hat
- mitten in einer Aufzählung ist
- hörbar weitersprechen möchte

unterbrich ihn nicht.

Antworte erst,
wenn seine Aussage inhaltlich abgeschlossen wirkt.

Wenn Mattl dich während deiner Antwort unterbricht,
hör sofort auf und höre ihm zu.

Wenn sein Satz eindeutig beendet ist,
antworte zügig.

Vermeide bei einfachen Fragen unnötige Denkpausen.

=========================================================
CHARAKTER UND SARKASMUS
=========================================================

Du bist:

- intelligent
- ruhig
- souverän
- direkt
- locker
- freundlich
- trocken humorvoll
- gelegentlich frech

Du darfst selbst entscheiden,
wann ein kurzer sarkastischer oder trockener Kommentar passt.

Nutze Sarkasmus situativ.

Nicht bei jeder Antwort.

Nicht bei ernsten Problemen.

Nicht bei sensiblen Kundenthemen.

Beispiele für den Stil:

"Feierabend scheint heute wieder eher ein theoretisches Konzept zu sein."

"Langweilig wird uns heute jedenfalls nicht."

"Ausnahmsweise brennt gerade nichts. Ich würde den Moment genießen."

"Das lief erstaunlich sauber. Fast verdächtig."

Erfinde selbst neue passende Formulierungen.

Wiederhole nicht ständig dieselben Sprüche.

=========================================================
ANTWORTSTIL UND TEMPO
=========================================================

Kurze Frage:

kurze direkte Antwort.

Normale Frage:

meist 1 bis 5 natürliche Sätze.

Komplexe Frage:

ausführlicher, wenn nötig.

Keine unnötigen Einleitungen.

Nicht ständig:

"Natürlich Mattl"

"Sehr gerne Mattl"

"Selbstverständlich Mattl"

Bei einfachen Fragen:

antworte möglichst unmittelbar.

Bei Tool-Aufrufen:

sage nicht erst lange,
was du jetzt tun wirst.

Benutze das Tool
und antworte danach direkt.

=========================================================
ZAHLEN, DATUM UND UHRZEIT
=========================================================

Technische Schreibweisen niemals roh vorlesen.

DATUM:

16.08.2026

oder:

2026-08-16

sprich als:

16. August 2026

UHRZEIT:

14:30

sprich:

14 Uhr 30

oder natürlich:

halb drei

wenn es passt.

GELD:

1234,56 EUR

sprich:

1.234 Euro und 56 Cent

PROZENT:

45 %

sprich:

45 Prozent

ISO-Zeitstempel niemals roh vorlesen.

Immer zuerst in natürliches deutsches Datum und deutsche Uhrzeit umwandeln.

=========================================================
LIVE-INFORMATIONEN UND INTERNET
=========================================================

Erfinde niemals aktuelle Daten.

Für aktuelle,
unsichere
oder ausdrücklich zu prüfende Informationen:

BENUTZE search_internet.

Nutze search_internet für:

- Nachrichten
- Politik
- Sport
- Technik
- KI
- Firmen
- Personen
- Wissenschaft
- Produkte
- Preise
- Gesetze
- Reisen
- Veranstaltungen
- aktuelle Entwicklungen

Wenn Mattl sagt:

"such mal"
"schau mal nach"
"prüf das"
"was gibt es aktuell"
"was ist heute passiert"
"was gibt es Neues"
"google das"
"informier dich"

musst du search_internet benutzen.

Bei sicherem zeitlosem Allgemeinwissen
musst du nicht suchen.

Fasse Web-Ergebnisse natürlich zusammen.

Lies keine URLs
und keine langen Quellenlisten vor.

=========================================================
SHOPIFY / DRUCKELITE24
=========================================================

Bei Fragen nach:

- Umsatz
- Bestellungen
- Verkäufen
- offenen Aufträgen
- durchschnittlichem Bestellwert
- heutiger Performance
- gestriger Performance
- letzter Woche

benutze die Shopify-Tools.

Druckelite24 ist der verbundene Shopify-Shop.

=========================================================
GMAIL
=========================================================

Bei Fragen nach:

- neuen Mails
- ungelesenen Mails
- Kundenmails
- Reklamationen
- Anfragen
- Angebotsanfragen

benutze get_unread_emails.

Erfinde niemals E-Mails.

=========================================================
WETTER
=========================================================

Bei Wetterfragen:

benutze get_weather.

Standardort:

Ludwigshafen am Rhein.

=========================================================
NOTIZEN
=========================================================

Bei:

"notiere"
"merk dir"
"schreib auf"

benutze save_note.

Zum Abrufen:

list_notes.

=========================================================
ERINNERUNGEN
=========================================================

Bei:

"erinnere mich"
"stell einen Timer"
"denk in ... Minuten daran"

benutze set_reminder.

Zum Abrufen:

list_reminders.

=========================================================
E-MAIL ENTWÜRFE
=========================================================

Wenn Mattl eine Mail formulieren lassen möchte:

benutze create_email_draft.

Der Entwurf wird im HUD angezeigt.

Lange Entwürfe nicht komplett vorlesen,
außer Mattl verlangt es ausdrücklich.

=========================================================
BUSINESS
=========================================================

Denke bei Business-Fragen wie ein erfahrener:

- Geschäftsführer
- E-Commerce-Manager
- Performance-Marketer
- Verkaufsleiter
- Datenanalyst

Sprich Probleme direkt an.

Wenn du eine sinnvolle Verbesserung erkennst,
weise Mattl selbstständig darauf hin.

=========================================================
SICHERHEIT
=========================================================

Vor:

- Geld ausgeben
- Werbebudget verändern
- Preise verändern
- Kampagnen verändern
- Bestellungen stornieren
- Rückerstattungen
- E-Mails tatsächlich versenden
- Daten löschen

brauchst du Mattls ausdrückliche Zustimmung.

Lesen,
analysieren,
recherchieren,
Vorschläge machen
und Entwürfe erstellen
darfst du ohne zusätzliche Bestätigung.
`;
}


/* =========================================================
   REALTIME TOOL DEFINITIONS
   ========================================================= */

const REALTIME_TOOLS = [

  {
    type:
      "function",

    name:
      "search_internet",

    description:
      "Durchsucht das aktuelle Internet für allgemeine oder aktuelle Fragen wie Nachrichten, Politik, Sport, Technik, KI, Firmen, Personen, Wissenschaft, Produkte, Preise, Gesetze, Reisen und andere aktuelle Informationen.",

    parameters: {
      type:
        "object",

      properties: {

        query: {
          type:
            "string",

          description:
            "Die vollständige Suchfrage."
        }
      },

      required: [
        "query"
      ],

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "get_shopify_summary",

    description:
      "Liest live den Shopify-Umsatz, die Anzahl Bestellungen und den durchschnittlichen Bestellwert für heute oder gestern bei Druckelite24.",

    parameters: {
      type:
        "object",

      properties: {

        period: {
          type:
            "string",

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
    type:
      "function",

    name:
      "get_shopify_open_orders",

    description:
      "Liest die aktuell noch nicht erfüllten Shopify-Bestellungen.",

    parameters: {
      type:
        "object",

      properties: {},

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "get_shopify_week",

    description:
      "Liest Umsatz und Bestellungen der letzten sieben Kalendertage.",

    parameters: {
      type:
        "object",

      properties: {},

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "get_unread_emails",

    description:
      "Liest bis zu zehn ungelesene Gmail-Nachrichten mit Absender, Betreff und kurzem Ausschnitt.",

    parameters: {
      type:
        "object",

      properties: {},

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "get_weather",

    description:
      "Liest aktuelle Wetterdaten und Vorhersage für heute oder morgen.",

    parameters: {
      type:
        "object",

      properties: {

        location: {
          type:
            "string"
        },

        day: {
          type:
            "string",

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
    type:
      "function",

    name:
      "save_note",

    description:
      "Speichert eine Notiz dauerhaft.",

    parameters: {
      type:
        "object",

      properties: {

        text: {
          type:
            "string"
        }
      },

      required: [
        "text"
      ],

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "list_notes",

    description:
      "Liest gespeicherte Notizen.",

    parameters: {
      type:
        "object",

      properties: {},

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "set_reminder",

    description:
      "Speichert eine Erinnerung für eine Anzahl Minuten ab jetzt.",

    parameters: {
      type:
        "object",

      properties: {

        minutes_from_now: {
          type:
            "integer",

          minimum:
            1
        },

        reminder_text: {
          type:
            "string"
        }
      },

      required: [
        "minutes_from_now",
        "reminder_text"
      ],

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "list_reminders",

    description:
      "Liest alle aktuell aktiven Erinnerungen.",

    parameters: {
      type:
        "object",

      properties: {},

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "create_email_draft",

    description:
      "Erstellt einen deutschen E-Mail-Entwurf mit Betreff und Text. Versendet nichts.",

    parameters: {
      type:
        "object",

      properties: {

        instruction: {
          type:
            "string"
        }
      },

      required: [
        "instruction"
      ],

      additionalProperties:
        false
    }
  }
];


/* =========================================================
   REALTIME SESSION
   ========================================================= */

app.post(
  "/api/realtime-session",

  express.text({
    type: [
      "application/sdp",
      "text/plain"
    ],

    limit:
      "1mb"
  }),

  async (
    req,
    res
  ) => {

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


      const sdp =
        req.body;


      if (
        typeof sdp !==
          "string" ||
        !sdp.startsWith(
          "v=0"
        )
      ) {

        return res
          .status(400)
          .send(
            "Ungültiges SDP."
          );
      }


      const model =
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1";


      /*
       * NEUE TESTSTIMME:
       * CORAL
       */

      const voice =
        process.env
          .OPENAI_REALTIME_VOICE ||
        "coral";


      const sessionConfig =
        JSON.stringify({

          type:
            "realtime",

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

                type:
                  "semantic_vad",

                /*
                 * V9.3 war LOW.
                 *
                 * MEDIUM reagiert etwas
                 * schneller nach einem
                 * abgeschlossenen Satz.
                 */

                eagerness:
                  "medium",

                create_response:
                  true,

                interrupt_response:
                  true
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
        `[REALTIME] Modell=${model} Voice=${voice} Tools=${REALTIME_TOOLS.length}`
      );


      const response =
        await fetch(
          "https://api.openai.com/v1/realtime/calls",
          {

            method:
              "POST",

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


      if (
        !response.ok
      ) {

        console.error(
          "[REALTIME ERROR]",
          response.status,
          answer
        );


        return res
          .status(
            response.status
          )
          .send(
            answer
          );
      }


      res.setHeader(
        "Content-Type",
        "application/sdp"
      );


      return res.send(
        answer
      );


    } catch (
      error
    ) {

      console.error(
        "[REALTIME SESSION ERROR]",
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
   JSON BODY
   ========================================================= */

app.use(
  express.json({
    limit:
      "2mb"
  })
);


/* =========================================================
   OPENAI RESPONSE HELPER
   ========================================================= */

function extractResponseText(
  data
) {

  if (!data) {
    return "";
  }


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
    .join("\n")
    .trim();
}


/* =========================================================
   INTERNET SEARCH
   ========================================================= */

async function searchInternet(
  query
) {

  const cleanQuery =
    String(
      query || ""
    ).trim();


  if (!cleanQuery) {

    throw new Error(
      "Keine Suchanfrage angegeben."
    );
  }


  console.log(
    "[WEB SEARCH]",
    cleanQuery
  );


  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {

        method:
          "POST",

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
                .OPENAI_WEB_MODEL ||
              "gpt-5.6-terra",

            reasoning: {
              effort:
                "low"
            },

            tools: [
              {
                type:
                  "web_search"
              }
            ],

            tool_choice:
              "auto",

            input:
              `Beantworte die folgende Frage mithilfe aktueller Informationen aus dem Web.

Frage:
${cleanQuery}

Vorgaben:
- antworte auf Deutsch
- nutze zuverlässige aktuelle Quellen
- nenne konkrete Daten, Namen und Zahlen, wenn relevant
- keine langen URLs
- keine Markdown-Tabelle
- keine unnötige Einleitung
- formuliere so, dass ein Sprachassistent die Antwort natürlich vorlesen kann
- technische Datumsangaben in natürliche deutsche Datumsformen umwandeln`,

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


  if (
    !response.ok
  ) {

    console.error(
      "[WEB SEARCH ERROR]",
      data
    );


    throw new Error(
      data?.error?.message ||
      "Internetsuche fehlgeschlagen."
    );
  }


  const text =
    extractResponseText(
      data
    );


  if (!text) {

    throw new Error(
      "Die Internetsuche hat keine Antwort geliefert."
    );
  }


  return {

    query:
      cleanQuery,

    answer:
      text,

    searched_live_web:
      true
  };
}


/* =========================================================
   SHOPIFY AUTH
   ========================================================= */

let shopifyTokenCache = {

  token:
    null,

  expiresAt:
    0
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
  period =
    "today"
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
    new Date(
      start
    );


  const endDate =
    new Date(
      end
    );


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

    console.error(
      "[SHOPIFY SUMMARY ERROR]",
      data.errors
    );


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

    currency
  };
}


/* =========================================================
   SHOPIFY OPEN ORDERS
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
    process.env
      .SHOPIFY_STORE_DOMAIN;


  const apiVersion =
    process.env
      .SHOPIFY_API_VERSION ||
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
      date.getUTCDate() -
      i
    );


    days.push({

      date:
        date
          .toISOString()
          .slice(0, 10),

      orders:
        0,

      revenue:
        0
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
      map.get(
        date
      );


    if (!bucket) {
      continue;
    }


    bucket.orders +=
      1;


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
    const day of
    days
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


async function readJarvisField(
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
      JSON.parse(
        raw
      );


    return Array.isArray(
      parsed
    )
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
    mutation SetJarvis(
      $metafields: [MetafieldsSetInput!]!
    ) {

      metafieldsSet(
        metafields: $metafields
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

async function saveNote(
  text
) {

  const cleanText =
    String(
      text || ""
    ).trim();


  if (!cleanText) {

    throw new Error(
      "Die Notiz ist leer."
    );
  }


  const notes =
    await readJarvisField(
      "notes"
    );


  notes.push({

    id:
      String(
        Date.now()
      ),

    text:
      cleanText,

    created_at:
      new Date()
        .toISOString()
  });


  await writeJarvisField(
    "notes",
    notes
  );


  return {

    saved:
      true,

    text:
      cleanText,

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
        Number(
          minutes
        ) || 1
      )
    );


  const cleanText =
    String(
      text || ""
    ).trim();


  if (!cleanText) {

    throw new Error(
      "Erinnerungstext fehlt."
    );
  }


  const dueAt =
    new Date(
      Date.now() +
      safeMinutes *
        60000
    ).toISOString();


  reminders.push({

    id:
      String(
        Date.now()
      ),

    text:
      cleanText,

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
      cleanText,

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
        ).getTime() <=
          now
    );


  if (
    !due.length
  ) {

    return [];
  }


  const dueIds =
    new Set(
      due.map(
        reminder =>
          reminder.id
      )
    );


  const updated =
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


function looksLikeOffer(
  email
) {

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
      text.includes(
        word
      )
  );
}


async function getUnreadEmails() {

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


  if (
    !listResponse.ok
  ) {

    throw new Error(
      "E-Mails konnten nicht gelesen werden."
    );
  }


  const refs =
    listData.messages ||
    [];


  const emails =
    [];


  for (
    const ref of
    refs
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


      if (
        !response.ok
      ) {
        continue;
      }


      const headers =
        data.payload
          ?.headers ||
        [];


      const email = {

        id:
          ref.id,

        subject:
          headers.find(
            header =>
              header.name ===
              "Subject"
          )?.value ||
          "(kein Betreff)",

        from:
          headers.find(
            header =>
              header.name ===
              "From"
          )?.value ||
          "unbekannt",

        snippet:
          data.snippet ||
          ""
      };


      email.possible_offer_inquiry =
        looksLikeOffer(
          email
        );


      emails.push(
        email
      );


    } catch (
      error
    ) {

      console.warn(
        "[GMAIL SINGLE ERROR]",
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
    "Ludwigshafen am Rhein",
  day =
    "today"
) {

  const placeName =
    String(
      location ||
      "Ludwigshafen am Rhein"
    ).trim();


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


  if (
    !candidates.length
  ) {

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
    day ===
    "tomorrow"
      ? 1
      : 0;


  return {

    source:
      "Open-Meteo",

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

    requested_day:
      day,

    current:
      day ===
      "today"
        ? data.current
        : null,

    forecast: {

      date:
        data.daily
          ?.time?.[
            index
          ],

      max_temperature:
        data.daily
          ?.temperature_2m_max
          ?.[
            index
          ],

      min_temperature:
        data.daily
          ?.temperature_2m_min
          ?.[
            index
          ],

      precipitation_probability:
        data.daily
          ?.precipitation_probability_max
          ?.[
            index
          ],

      weather_code:
        data.daily
          ?.weather_code
          ?.[
            index
          ]
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

        method:
          "POST",

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
              "gpt-5.6-terra",

            instructions:
              `Erstelle einen professionellen deutschen E-Mail-Entwurf für Mattl von Druckelite24.
Antworte ausschließlich als gültiges JSON mit den Feldern subject und body.`,

            input:
              String(
                instruction ||
                ""
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


  if (
    !response.ok
  ) {

    throw new Error(
      data?.error?.message ||
      "E-Mail-Entwurf fehlgeschlagen."
    );
  }


  const text =
    extractResponseText(
      data
    );


  const parsed =
    JSON.parse(
      text
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

  async (
    req,
    res
  ) => {

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


      switch (
        name
      ) {


        case "search_internet":

          data =
            await searchInternet(
              args.query
            );

          break;


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
                "Der vollständige Entwurf wird im HUD angezeigt. Antworte nur kurz, dass der Entwurf fertig ist."
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


    } catch (
      error
    ) {

      console.error(
        "[TOOL ERROR]",
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

  async (
    req,
    res
  ) => {

    try {

      const due =
        await checkAndFireDueReminders();


      if (
        !due.length
      ) {

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


    } catch (
      error
    ) {

      console.error(
        "[REMINDER CHECK ERROR]",
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

  async (
    req,
    res
  ) => {

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


        } catch (
          error
        ) {

          console.warn(
            "[GMAIL BACKGROUND ERROR]",
            error
          );
        }
      }


      try {

        const open =
          await getShopifyOpenOrders();


        if (
          !open.count
        ) {

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
          lastOpenOrdersNotice
            .count !==
          open.count;


        const cooldown =
          Date.now() -
            lastOpenOrdersNotice
              .at >
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


      } catch (
        error
      ) {

        console.warn(
          "[SHOPIFY BACKGROUND ERROR]",
          error
        );
      }


      return res.json({

        ok:
          true,

        hasNotice:
          false
      });


    } catch (
      error
    ) {

      console.error(
        "[CHECKIN ERROR]",
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
   DEBUG ENDPOINTS
   ========================================================= */

app.post(
  "/api/shopify-summary",

  async (
    req,
    res
  ) => {

    try {

      return res.json(
        await getShopifySummary(

          req.body?.period ===
            "yesterday"
            ? "yesterday"
            : "today"
        )
      );


    } catch (
      error
    ) {

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

  async (
    req,
    res
  ) => {

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


    } catch (
      error
    ) {

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
  "/api/web-search",

  async (
    req,
    res
  ) => {

    try {

      return res.json(
        await searchInternet(
          req.body?.query
        )
      );


    } catch (
      error
    ) {

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

  (
    req,
    res
  ) => {

    return res.json({

      ok:
        true,

      version:
        `JARVIS ${JARVIS_VERSION}`,

      realtime:
        true,

      vad:
        "semantic_vad",

      vad_eagerness:
        "medium",

      realtime_model:
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1",

      realtime_voice:
        process.env
          .OPENAI_REALTIME_VOICE ||
        "coral",

      web_model:
        process.env
          .OPENAI_WEB_MODEL ||
        "gpt-5.6-terra",

      realtime_tools:
        REALTIME_TOOLS.map(
          tool =>
            tool.name
        ),

      shopify:
        Boolean(

          process.env
            .SHOPIFY_STORE_DOMAIN &&

          process.env
            .SHOPIFY_CLIENT_ID &&

          process.env
            .SHOPIFY_CLIENT_SECRET
        ),

      gmail:
        isGmailConfigured(),

      web_search:
        true,

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

  (
    req,
    res
  ) => {

    return res.sendFile(
      "index.html",
      {

        root:
          "."
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
      "=============================================="
    );

    console.log(
      `JARVIS ${JARVIS_VERSION} läuft`
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Realtime Modell: ${
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1"
      }`
    );

    console.log(
      `Realtime Stimme: ${
        process.env
          .OPENAI_REALTIME_VOICE ||
        "coral"
      }`
    );

    console.log(
      "VAD: semantic_vad / medium"
    );

    console.log(
      `Web Modell: ${
        process.env
          .OPENAI_WEB_MODEL ||
        "gpt-5.6-terra"
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

    console.log(
      "Internet Search: aktiv"
    );

    console.log(
      "=============================================="
    );
  }
);
