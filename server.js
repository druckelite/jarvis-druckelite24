/* DRUCKELITE24 · JARVIS SERVER V9.3 */

import express from "express";


const app =
  express();


const PORT =
  process.env.PORT ||
  3000;


const JARVIS_VERSION =
  "V9.3";


const TZ =
  "Europe/Berlin";


/* =========================================================
   PUBLIC
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

  (
    req,
    res,
    next
  ) => {

    if (
      PUBLIC_FILES.has(
        req.params.file
      )
    ) {

      return res.sendFile(
        req.params.file,
        {
          root: "."
        }
      );
    }


    next();
  }
);


/* =========================================================
   HELPERS
   ========================================================= */

function timeoutSignal(ms) {

  try {

    return AbortSignal
      ?.timeout?.(
        ms
      );

  } catch {

    return undefined;
  }
}


function normalize(text) {

  return String(
    text || ""
  )
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


function berlinDate(
  date =
    new Date()
) {

  return new Intl.DateTimeFormat(
    "en-CA",
    {

      timeZone:
        TZ,

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit"
    }
  ).format(
    date
  );
}


function berlinDateTimeText() {

  return new Intl.DateTimeFormat(
    "de-DE",
    {

      timeZone:
        TZ,

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
    date.getUTCDate() +
    1
  );


  return date
    .toISOString()
    .slice(
      0,
      10
    );
}


function berlinUtcOffsetMinutes(
  date
) {

  const label =
    new Intl.DateTimeFormat(
      "en-US",
      {

        timeZone:
          TZ,

        timeZoneName:
          "shortOffset"
      }
    )
      .formatToParts(
        date
      )
      .find(
        part =>
          part.type ===
          "timeZoneName"
      )
      ?.value ||
    "GMT+0";


  const match =
    label.match(
      /GMT([+-]\d+)(?::(\d+))?/
    );


  if (!match) {
    return 0;
  }


  const hours =
    Number(
      match[1]
    );


  const minutes =
    Number(
      match[2] ||
      0
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

  const guess =
    new Date(
      `${dateString}T12:00:00Z`
    );


  return new Date(

    Date.parse(
      `${dateString}T00:00:00Z`
    ) -

    berlinUtcOffsetMinutes(
      guess
    ) *
    60000

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
      date.getUTCDate() -
      1
    );


    const yesterday =
      date
        .toISOString()
        .slice(
          0,
          10
        );


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

Aktuelle Zeit:
${berlinDateTimeText()}.

Zeitzone:
Europe/Berlin.


=========================================================
SPRACHE UND AUSSPRACHE
=========================================================

Sprich ausschließlich natürliches deutsches Hochdeutsch.

Klinge wie ein deutscher Muttersprachler.

Kein:
- englischer Akzent
- amerikanischer Akzent
- britischer Akzent
- französischer Akzent
- osteuropäischer Akzent

Nutze eine natürliche deutsche Satzmelodie.

Englische Marken, Produktnamen oder Eigennamen dürfen passend ausgesprochen werden.
Danach sofort wieder normales deutsches Hochdeutsch.

Der Benutzer heißt:

Mattl

Das T muss klar hörbar sein.

Nicht:
Maddl
Madel
Mattle

Sprich schwierige Wörter erst, wenn du sie vollständig erfasst hast.

Keine hörbaren Selbstkorrekturen mitten im Wort.

Bei ungewöhnlichen:
- Namen
- Orten
- Produktnamen
- Firmennamen
- Zahlen
- Datumsangaben

lieber minimal langsamer und sauber aussprechen.


=========================================================
STIMME
=========================================================

Sprich:

- tief
- ruhig
- warm
- souverän
- entspannt
- männlich wirkend
- nicht nasal
- nicht schrill
- nicht hektisch

Halte die wahrgenommene Lautstärke vom ersten bis zum letzten Wort möglichst gleich.

WICHTIG:

Nicht leise beginnen und anschließend lauter werden.

Nicht flüstern.

Keine dramatischen Lautstärkesprünge.

Keine stark wechselnde Dynamik.

Sprich flüssig und verbunden.

Keine abgehackten Mini-Sätze.

Keine künstlichen Pausen nach jedem Komma.

Keine übertriebene Synchronsprecher-Betonung.

Standardtempo:

Leicht ruhiger als normale Alltagssprache,
aber nicht langsam oder schleppend.


=========================================================
GESPRÄCHSVERHALTEN
=========================================================

Mattl darf:

- nachdenken
- "ähm" sagen
- kurz pausieren
- mitten in einer Aufzählung innehalten
- einen Satz langsam formulieren

Antworte erst,
wenn seine Aussage wirklich abgeschlossen wirkt.

Unterbrich Mattl nicht unnötig.

Wenn Mattl dich während deiner Antwort unterbricht,
hör auf und höre ihm zu.


=========================================================
CHARAKTER
=========================================================

Du bist:

- intelligent
- ruhig
- direkt
- locker
- freundlich
- souverän
- trocken humorvoll
- gelegentlich frech

Sarkasmus darf spontan vorkommen.

Aber:

Nicht bei jeder Antwort.

Nicht gezwungen.

Nicht bei ernsten Themen.

Entscheide selbst anhand der Situation,
ob ein kurzer trockener Kommentar gerade passt.

Passender Stil:

"Feierabend scheint heute wieder eher ein theoretisches Konzept zu sein."

"Langweilig wird uns heute jedenfalls nicht."

"Ausnahmsweise brennt gerade nichts. Ich würde den Moment genießen."

"Das lief erstaunlich sauber. Fast verdächtig."

Der Humor soll spontan wirken
und nicht wie eine vorbereitete Spruchliste.

Kein Butler-Ton.

Keine künstlichen Motivationssprüche.


=========================================================
ANTWORTLÄNGE
=========================================================

Kurze Frage:
kurze Antwort.

Normale Frage:
meist ein bis fünf natürliche Sätze.

Komplexe Frage:
ausführlicher, wenn nötig.

Keine unnötigen Einleitungen.

Nicht ständig:

"Natürlich Mattl"

"Sehr gerne Mattl"

"Selbstverständlich Mattl"


=========================================================
DATUM, UHRZEIT UND ZAHLEN
=========================================================

Technische Schreibweisen niemals roh vorlesen.

Beispiel Datum:

16.08.2026

oder:

2026-08-16

sprich als:

16. August 2026


Beispiel Uhrzeit:

14:30

sprich:

14 Uhr 30

oder natürlich:

halb drei

wenn es zum Satz passt.


Beispiel Geld:

1234,56 EUR

sprich:

1.234 Euro und 56 Cent


Beispiel Prozent:

45 %

sprich:

45 Prozent


ISO-Zeitstempel niemals roh vorlesen.

Immer zuerst in natürliches deutsches Datum
und deutsche Uhrzeit umwandeln.


=========================================================
LIVE INFORMATIONEN UND INTERNET
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
- aktuelle Ereignisse

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
außer Mattl verlangt das ausdrücklich.


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
   REALTIME TOOLS
   ========================================================= */

const REALTIME_TOOLS = [

  {
    type:
      "function",

    name:
      "search_internet",

    description:
      "Durchsucht das aktuelle Internet für allgemeine oder aktuelle Fragen.",

    parameters: {

      type:
        "object",

      properties: {

        query: {

          type:
            "string"
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
      "Liest live Shopify-Umsatz, Bestellungen und durchschnittlichen Bestellwert für heute oder gestern.",

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
      "Liest aktuell noch nicht erfüllte Shopify-Bestellungen.",

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
      "Liest bis zu zehn ungelesene Gmail-Nachrichten.",

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
      "Liest Wetter für heute oder morgen.",

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
      "Liest aktive Erinnerungen.",

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
      "Erstellt einen deutschen E-Mail-Entwurf. Versendet nichts.",

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


      const voice =
        process.env
          .OPENAI_REALTIME_VOICE ||
        "cedar";


      const session =
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

                eagerness:
                  "low",

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
        session
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


    } catch (error) {

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
   JSON
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

  const direct =
    String(
      data?.output_text ||
      ""
    ).trim();


  if (direct) {
    return direct;
  }


  const pieces =
    [];


  for (
    const item of
    data?.output || []
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
   INTERNET
   ========================================================= */

async function searchInternet(
  query
) {

  const clean =
    String(
      query || ""
    ).trim();


  if (!clean) {

    throw new Error(
      "Keine Suchanfrage angegeben."
    );
  }


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
              `Beantworte diese Frage mithilfe aktueller Informationen aus dem Web:

${clean}

Vorgaben:

- Deutsch
- kompakt
- zuverlässige aktuelle Quellen
- konkrete Daten und Zahlen wenn relevant
- natürliche Formulierung für Sprachausgabe
- keine langen URLs
- keine Markdown-Tabelle
- technische Datumsangaben natürlich auf Deutsch formulieren`,


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
      "Internetsuche fehlgeschlagen."
    );
  }


  const answer =
    extractResponseText(
      data
    );


  if (!answer) {

    throw new Error(
      "Die Internetsuche hat keine Antwort geliefert."
    );
  }


  return {

    query:
      clean,

    answer,

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
      300000
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


  const body =
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

        body,

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
   SHOPIFY GRAPHQL
   ========================================================= */

async function shopifyGraphQL(
  query,
  variables = {}
) {

  const domain =
    process.env
      .SHOPIFY_STORE_DOMAIN;


  const version =
    process.env
      .SHOPIFY_API_VERSION ||
    "2026-07";


  const token =
    await getShopifyAccessToken();


  const response =
    await fetch(
      `https://${domain}/admin/api/${version}/graphql.json`,
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

            variables
          }),

        signal:
          timeoutSignal(
            12000
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
      data.errors?.[0]?.message ||
      "Shopify-Daten konnten nicht gelesen werden."
    );
  }


  return data.data;
}


/* =========================================================
   SHOPIFY SUMMARY
   ========================================================= */

async function getShopifySummary(
  period =
    "today"
) {

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


  const data =
    await shopifyGraphQL(
      `
      query {

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
      `
    );


  const orders =
    (
      data.orders?.nodes ||
      []
    ).filter(
      order =>

        !order.cancelledAt &&

        new Date(
          order.createdAt
        ) >=
        startDate &&

        new Date(
          order.createdAt
        ) <
        endDate
    );


  const revenue =
    orders.reduce(
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


  return {

    shop:
      "Druckelite24",

    period,

    orders:
      orders.length,

    revenue:
      Number(
        revenue.toFixed(
          2
        )
      ),

    average_order_value:
      Number(
        (
          orders.length
            ? revenue /
              orders.length
            : 0
        ).toFixed(
          2
        )
      ),

    currency:
      orders[0]
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

  const data =
    await shopifyGraphQL(
      `
      query {

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
      `
    );


  const orders =
    (
      data.orders?.nodes ||
      []
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

  const data =
    await shopifyGraphQL(
      `
      query {

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
      `
    );


  const today =
    berlinDate();


  const days =
    [];


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
          .slice(
            0,
            10
          ),

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
    data.orders?.nodes ||
    []
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
            TZ,

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


    bucket.orders++;


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
        day.revenue.toFixed(
          2
        )
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

  const data =
    await shopifyGraphQL(
      `
      query {
        shop {
          id
        }
      }
      `
    );


  return data.shop.id;
}


async function readJarvisField(
  key
) {

  const data =
    await shopifyGraphQL(
      `
      query($key: String!) {

        shop {

          metafield(
            namespace: "jarvis",
            key: $key
          ) {

            value
          }
        }
      }
      `,
      {
        key
      }
    );


  const raw =
    data.shop
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

  const ownerId =
    await getShopId();


  const data =
    await shopifyGraphQL(
      `
      mutation(
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
      `,
      {

        metafields: [

          {

            ownerId,

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
    );


  const errors =
    data
      .metafieldsSet
      ?.userErrors ||
    [];


  if (
    errors.length
  ) {

    throw new Error(
      errors[0].message ||
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

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {

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
      clean,

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
      clean,

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

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {

    throw new Error(
      "Erinnerungstext fehlt."
    );
  }


  const safeMinutes =
    Math.max(

      1,

      Math.round(
        Number(
          minutes
        ) ||
        1
      )
    );


  const reminders =
    await readJarvisField(
      "reminders"
    );


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
      clean,

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
      clean,

    minutes_from_now:
      safeMinutes,

    due_at:
      dueAt
  };
}


async function getActiveReminders() {

  return (
    await readJarvisField(
      "reminders"
    )
  ).filter(
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
      300000
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


  const body =
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

        body,

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


  const response =
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


  const list =
    await response.json();


  if (
    !response.ok
  ) {

    throw new Error(
      "E-Mails konnten nicht gelesen werden."
    );
  }


  const emails =
    [];


  for (
    const ref of
    list.messages ||
    []
  ) {

    try {

      const mailResponse =
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
        await mailResponse.json();


      if (
        !mailResponse.ok
      ) {

        continue;
      }


      const headers =
        data.payload?.headers ||
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


    } catch {}
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

  const geo =
    new URL(
      "https://geocoding-api.open-meteo.com/v1/search"
    );


  geo.searchParams.set(
    "name",
    String(
      location ||
      "Ludwigshafen am Rhein"
    ).trim()
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
      candidate =>
        candidate.country_code ===
        "DE"
    ) ||
    candidates[0];


  const weather =
    new URL(
      "https://api.open-meteo.com/v1/forecast"
    );


  weather.searchParams.set(
    "latitude",
    place.latitude
  );


  weather.searchParams.set(
    "longitude",
    place.longitude
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
          ?.time
          ?.[index],

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


  return JSON.parse(
    extractResponseText(
      data
    )
  );
}


/* =========================================================
   TOOL DISPATCHER
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


    } catch (error) {

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
   REMINDER CHECK
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


    } catch (error) {

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

      /*
       * Gmail
       */

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

            fresh.forEach(
              email =>
                notifiedEmailIds.add(
                  email.id
                )
            );


            const offers =
              fresh.filter(
                email =>
                  email
                    .possible_offer_inquiry
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
                  offers
                    ? ` ${offers} davon sieht nach einer Angebots- oder Preisanfrage aus.`
                    : ""
                }`
            });
          }


        } catch (error) {

          console.warn(
            "[GMAIL BACKGROUND ERROR]",
            error
          );
        }
      }


      /*
       * Shopify
       */

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


      } catch (error) {

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


    } catch (error) {

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
   DEBUG
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
        "low",

      realtime_model:
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1",

      realtime_voice:
        process.env
          .OPENAI_REALTIME_VOICE ||
        "cedar",

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
      `JARVIS ${JARVIS_VERSION} läuft auf Port ${PORT}`
    );


    console.log(
      `Realtime: ${
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1"
      }`
    );


    console.log(
      `Voice: ${
        process.env
          .OPENAI_REALTIME_VOICE ||
        "cedar"
      }`
    );


    console.log(
      "VAD: semantic_vad / low"
    );


    console.log(
      `Web: ${
        process.env
          .OPENAI_WEB_MODEL ||
        "gpt-5.6-terra"
      }`
    );


    console.log(
      `Tools: ${
        REALTIME_TOOLS
          .map(
            tool =>
              tool.name
          )
          .join(", ")
      }`
    );


    console.log(
      "=============================================="
    );
  }
);
