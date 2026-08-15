/* =========================================================
   DRUCKELITE24 · JARVIS SERVER
   V7.2 · ROBUST TEXT RESPONSE + NOISE FILTER

   =========================================================
   ARCHITEKTUR
   =========================================================

   Browser-Mikrofon
        ↓
   MediaRecorder
        ↓
   POST /api/transcribe
        ↓
   OpenAI Audio Transcription
        ↓
   deutscher Text
        ↓
   POST /api/jarvis-chat
        ↓
   OpenAI Responses API
        ↓
   Antworttext
        ↓
   POST /api/elevenlabs-tts
        ↓
   ElevenLabs · einzige Stimme

   ---------------------------------------------------------
   KEIN OPENAI REALTIME
   KEIN CEDAR
   KEIN response.create
   KEIN WEBRTC AUF DEM SERVER
   =========================================================
*/


import express from "express";


const app =
  express();


const PORT =
  process.env.PORT ||
  3000;


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
        root:
          "."
      }
    );
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
   HELPERS
   ========================================================= */

function normalize(text) {

  return String(
    text ||
    ""
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
   BERLIN DATE HELPERS
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
  ).format(
    date
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

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "Europe/Berlin",

        timeZoneName:
          "shortOffset"
      }
    )
      .formatToParts(
        date
      );


  const offsetLabel =
    parts.find(
      part =>
        part.type ===
        "timeZoneName"
    )?.value ||
    "GMT+0";


  const match =
    offsetLabel.match(
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

const JARVIS_INSTRUCTIONS = `
Du bist JARVIS, der persönliche Assistent und Business-Sparringspartner von Mattl.

SPRACHE:
- Antworte ausschließlich auf Deutsch.
- Wechsle niemals selbstständig auf Spanisch, Englisch oder eine andere Sprache.
- Nur wenn Mattl ausdrücklich eine andere Sprache verlangt, darfst du wechseln.
- Natürliches, klares Hochdeutsch.

NAME:
- Der Benutzer heißt Mattl.
- Aussprache ungefähr: Mat-tl.
- Das T muss hörbar bleiben.
- Nicht "Maddl".

CHARAKTER:
- intelligent
- ruhig
- souverän
- warm
- direkt
- locker
- trocken humorvoll
- gelegentlich frech
- kein Butler-Stil
- kein Callcenter
- kein künstliches Dauerlob

GESPRÄCH:
- Beantworte exakt Mattls Frage.
- Standardmäßig kurz bis mittellang.
- Keine unnötigen Monologe.
- Nicht nach jeder Antwort eine Rückfrage stellen.
- Berücksichtige den Gesprächskontext.
- Formuliere ausschließlich Text, der anschließend natürlich gesprochen werden kann.
- Keine Markdown-Tabellen.
- Keine komplizierten Aufzählungszeichen in gesprochenen Antworten.
- Keine Meta-Erklärungen über das technische System.
- Beginne direkt mit der eigentlichen Antwort.
- Antworte möglichst innerhalb von 2 bis 6 gesprochenen Sätzen, sofern Mattl nicht mehr Details verlangt.

WICHTIG ZUR STIMME:
- Deine Antwort wird ausschließlich von ElevenLabs gesprochen.
- Du selbst erzeugst keinen Audiostream.
- Schreibe deshalb natürlich gesprochenes Deutsch.
- Zahlen sollen sich gut vorlesen lassen.
- Vermeide unnötige Sonderzeichen.

DRUCKELITE24:
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
- Marketing
- Verkauf

SHOPIFY:
Es gibt genau einen verbundenen Shopify-Shop:
Druckelite24.

Wenn Mattl sagt:
- mein Shop
- unser Shop
- Shopify
- Bestellungen
- Umsatz
- Verkäufe
- Bestellwert

ist immer Druckelite24 gemeint.

Frage niemals nach, welchen Shop er meint.

LIVE-DATEN:
Wenn dem Prompt ein Abschnitt LIVE-DATEN beigefügt ist,
sind ausschließlich diese Werte für aktuelle Zahlen maßgeblich.

Erfinde niemals aktuelle:
- Umsätze
- Bestellungen
- Wetterwerte
- Bestellwerte
- sonstige Live-Daten

BUSINESS:
Bei passenden Themen darfst du zusätzlich wie ein
Geschäftsführer, E-Commerce-Manager, Verkaufsleiter,
Performance-Marketer und Datenanalyst denken.

SICHERHEIT:
Vor kritischen Aktionen braucht Mattl ausdrückliche Zustimmung,
zum Beispiel:
- Geld ausgeben
- Preise ändern
- Kampagnen ändern
- Bestellungen stornieren
- Rückerstattungen
- Nachrichten oder E-Mails senden
- Daten löschen
`;


/* =========================================================
   OPENAI TRANSCRIPTION
   ========================================================= */

app.post(
  "/api/transcribe",

  express.raw({
    type: [
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "application/octet-stream"
    ],

    limit:
      "20mb"
  }),

  async (req, res) => {

    try {

      if (
        !process.env.OPENAI_API_KEY
      ) {

        return res
          .status(500)
          .json({

            ok:
              false,

            error:
              "OPENAI_API_KEY fehlt."
          });
      }


      if (
        !req.body ||
        !Buffer.isBuffer(
          req.body
        ) ||
        req.body.length ===
          0
      ) {

        return res
          .status(400)
          .json({

            ok:
              false,

            error:
              "Keine Audiodaten empfangen."
          });
      }


      const incomingType =
        String(
          req.headers[
            "content-type"
          ] ||
          "audio/webm"
        )
          .split(
            ";"
          )[0]
          .trim();


      let extension =
        "webm";


      if (
        incomingType.includes(
          "ogg"
        )
      ) {

        extension =
          "ogg";

      } else if (
        incomingType.includes(
          "mp4"
        )
      ) {

        extension =
          "mp4";

      } else if (
        incomingType.includes(
          "mpeg"
        )
      ) {

        extension =
          "mp3";

      } else if (
        incomingType.includes(
          "wav"
        )
      ) {

        extension =
          "wav";
      }


      const audioBlob =
        new Blob(
          [
            req.body
          ],
          {
            type:
              incomingType
          }
        );


      const form =
        new FormData();


      form.append(
        "file",
        audioBlob,
        `jarvis-input.${extension}`
      );


      form.append(
        "model",
        process.env.OPENAI_TRANSCRIBE_MODEL ||
        "gpt-4o-mini-transcribe"
      );


      form.append(
        "language",
        "de"
      );


      /*
       * Weniger empfindlich gegen
       * Hintergrundgeräusche.
       */
      form.append(
        "threshold",
        process.env.OPENAI_TRANSCRIBE_THRESHOLD ||
        "0.65"
      );


      form.append(
        "response_format",
        "json"
      );


      form.append(
        "prompt",
        "Deutsche Sprache. Transkribiere nur tatsächlich gesprochene Wörter. Ignoriere Hintergrundgeräusche, Musik, Fernseher, Lüfter, Tastatur und unverständliche Nebengeräusche. Der Benutzer heißt Mattl. Begriffe: Druckelite24, Shopify, Umsatz, Bestellungen, Verkäufe, Bestellwert, DTF, Textildruck, E-Commerce, Ludwigshafen am Rhein."
      );


      console.log(
        `Transcription input: ${req.body.length} Bytes`
      );


      const response =
        await fetch(
          "https://api.openai.com/v1/audio/transcriptions",
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
                30000
              )
          }
        );


      const raw =
        await response.text();


      let data;


      try {

        data =
          JSON.parse(
            raw
          );

      } catch {

        console.error(
          "Transcription raw response:",
          raw
        );


        throw new Error(
          "OpenAI hat keine gültige Transkriptionsantwort geliefert."
        );
      }


      if (
        !response.ok
      ) {

        console.error(
          "OpenAI transcription error:",
          response.status,
          data
        );


        return res
          .status(
            response.status
          )
          .json({

            ok:
              false,

            error:
              data?.error?.message ||
              "Spracherkennung fehlgeschlagen."
          });
      }


      const text =
        String(
          data.text ||
          ""
        ).trim();


      if (
        !text
      ) {

        return res
          .status(422)
          .json({

            ok:
              false,

            error:
              "Keine verständliche Sprache erkannt."
          });
      }


      console.log(
        "Transkript:",
        text
      );


      return res.json({

        ok:
          true,

        text
      });


    } catch (error) {

      console.error(
        "Transcription endpoint error:",
        error
      );


      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            error.name ===
              "TimeoutError"

              ? "Die Spracherkennung hat zu lange gebraucht."

              : error.message ||
                "Spracherkennung fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   RESPONSES API HELPERS
   ========================================================= */

function extractResponseText(
  data
) {

  if (!data) {

    return "";
  }


  /*
   * SDK-kompatibler Fall.
   */
  const direct =
    String(
      data.output_text ||
      ""
    ).trim();


  if (direct) {

    return direct;
  }


  /*
   * Direkter REST-Fall:
   * data.output[] durchsuchen.
   */
  const pieces =
    [];


  for (
    const item of
    data.output ||
    []
  ) {

    if (
      item?.type !==
        "message"
    ) {

      continue;
    }


    for (
      const content of
      item.content ||
      []
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
    .join(
      " "
    )
    .trim();
}


/* =========================================================
   ONE RESPONSES API REQUEST
   ========================================================= */

async function requestOpenAIResponse({
  inputText,
  previousResponseId,
  maxOutputTokens,
  reasoningEffort
}) {

  const body = {

    model:
      process.env.OPENAI_TEXT_MODEL ||
      "gpt-5-mini",

    instructions:
      JARVIS_INSTRUCTIONS,

    input:
      inputText,

    /*
     * GPT-5:
     * sichtbare Ausgabe UND
     * Reasoning teilen sich dieses Limit.
     */
    max_output_tokens:
      maxOutputTokens,

    reasoning: {

      effort:
        reasoningEffort
    },

    text: {

      format: {

        type:
          "text"
      }
    },

    store:
      true
  };


  if (
    previousResponseId
  ) {

    body.previous_response_id =
      previousResponseId;
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
          JSON.stringify(
            body
          ),

        signal:
          timeoutSignal(
            45000
          )
      }
    );


  const raw =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(
        raw
      );

  } catch {

    console.error(
      "Responses raw response:",
      raw
    );


    throw new Error(
      "OpenAI hat keine gültige JSON-Antwort geliefert."
    );
  }


  if (
    !response.ok
  ) {

    console.error(
      "OpenAI Responses HTTP error:",
      response.status,
      data
    );


    throw new Error(
      data?.error?.message ||
      `OpenAI HTTP ${response.status}`
    );
  }


  return data;
}


/* =========================================================
   OPENAI TEXT RESPONSE
   ========================================================= */

async function createJarvisResponse({
  message,
  previousResponseId = null,
  liveData = null
}) {

  if (
    !process.env.OPENAI_API_KEY
  ) {

    throw new Error(
      "OPENAI_API_KEY fehlt."
    );
  }


  let inputText =
    String(
      message ||
      ""
    ).trim();


  if (
    !inputText
  ) {

    throw new Error(
      "Leere Benutzernachricht."
    );
  }


  if (
    liveData
  ) {

    inputText +=
      `

LIVE-DATEN:
${JSON.stringify(
  liveData,
  null,
  2
)}

Beantworte Mattls ursprüngliche Frage jetzt kurz und konkret anhand dieser Live-Daten.
Für aktuelle Werte sind ausschließlich die LIVE-DATEN maßgeblich.
Erfinde keine weiteren aktuellen Zahlen.`;
  }


  /*
   * =====================================================
   * ERSTER VERSUCH
   * =====================================================
   *
   * Niedriger Reasoning-Aufwand,
   * damit genug Tokens für den
   * sichtbaren Antworttext bleiben.
   */
  let data =
    await requestOpenAIResponse({

      inputText,

      previousResponseId,

      maxOutputTokens:
        1200,

      reasoningEffort:
        "low"
    });


  let outputText =
    extractResponseText(
      data
    );


  console.log(
    "OpenAI response status:",
    data.status
  );


  console.log(
    "OpenAI response id:",
    data.id
  );


  console.log(
    "OpenAI output tokens:",
    data.usage?.output_tokens
  );


  console.log(
    "OpenAI reasoning tokens:",
    data.usage
      ?.output_tokens_details
      ?.reasoning_tokens
  );


  /*
   * =====================================================
   * FALLBACK
   * =====================================================
   *
   * Falls GPT-5 das komplette
   * Tokenbudget fürs Reasoning
   * verbraucht hat oder die Antwort
   * sonst unvollständig ist,
   * automatisch einmal neu versuchen.
   *
   * Wichtig:
   * Wir verwenden hierbei NICHT
   * die incomplete response als
   * previous_response_id.
   *
   * Wir gehen wieder vom letzten
   * erfolgreichen Gesprächszustand aus.
   */
  if (
    !outputText ||
    data.status ===
      "incomplete"
  ) {

    console.warn(
      "OpenAI Antwort unvollständig.",
      {
        status:
          data.status,

        incomplete_reason:
          data.incomplete_details
            ?.reason,

        output_items:
          data.output?.length ||
          0
      }
    );


    data =
      await requestOpenAIResponse({

        inputText:
          `${inputText}

WICHTIG:
Gib jetzt direkt eine kurze sichtbare Antwort auf Deutsch aus.
Keine lange interne Analyse.
Die Antwort soll für eine Sprachausgabe geeignet sein.`,

        previousResponseId,

        maxOutputTokens:
          2400,

        reasoningEffort:
          "low"
      });


    outputText =
      extractResponseText(
        data
      );


    console.log(
      "OpenAI fallback status:",
      data.status
    );


    console.log(
      "OpenAI fallback reasoning tokens:",
      data.usage
        ?.output_tokens_details
        ?.reasoning_tokens
    );
  }


  /*
   * Immer noch kein Text:
   * aussagekräftigen Fehler ausgeben.
   */
  if (
    !outputText
  ) {

    const incompleteReason =
      data.incomplete_details
        ?.reason;


    console.error(
      "OpenAI lieferte keinen sichtbaren Text:",
      JSON.stringify(
        {
          id:
            data.id,

          status:
            data.status,

          incomplete_details:
            data.incomplete_details,

          usage:
            data.usage,

          output:
            data.output
        },
        null,
        2
      )
    );


    if (
      incompleteReason ===
      "max_output_tokens"
    ) {

      throw new Error(
        "OpenAI hat das Antwortlimit erreicht, bevor sichtbarer Text erzeugt wurde."
      );
    }


    if (
      incompleteReason ===
      "max_tokens"
    ) {

      throw new Error(
        "OpenAI hat das Tokenlimit erreicht, bevor sichtbarer Text erzeugt wurde."
      );
    }


    throw new Error(
      `OpenAI hat keinen Antworttext geliefert. Status: ${data.status || "unbekannt"}.`
    );
  }


  return {

    text:
      outputText,

    response_id:
      data.id ||
      null
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
      5 *
      60 *
      1000
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


  const raw =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(
        raw
      );

  } catch {

    console.error(
      "Shopify token raw:",
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
      expiresIn *
      1000
  };


  console.log(
    "Shopify access token refreshed."
  );


  return data.access_token;
}


/* =========================================================
   SHOPIFY SUMMARY
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


  const inRange =
    orders.filter(
      order => {

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

    configured:
      true,

    shop:
      "Druckelite24",

    shop_domain:
      domain,

    period,

    orders:
      valid.length,

    revenue:
      Number(
        revenue.toFixed(
          2
        )
      ),

    average_order_value:
      Number(
        average.toFixed(
          2
        )
      ),

    currency,

    source:
      "Shopify"
  };
}


/* =========================================================
   SHOPIFY SUMMARY ENDPOINT
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

          configured:
            false,

          shop:
            "Druckelite24",

          error:
            error.message ||
            "Shopify-Abfrage fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   SHOPIFY WEEK
   ========================================================= */

function berlinDayOf(
  isoTimestamp
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
  ).format(
    new Date(
      isoTimestamp
    )
  );
}


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

    console.error(
      "Shopify week error:",
      data
    );


    throw new Error(
      "Shopify-Wochendaten konnten nicht gelesen werden."
    );
  }


  const orders =
    data.data
      ?.orders
      ?.nodes ||
    [];


  const weekdayNames = [
    "So",
    "Mo",
    "Di",
    "Mi",
    "Do",
    "Fr",
    "Sa"
  ];


  const days =
    [];


  const buckets =
    {};


  const today =
    berlinDate();


  for (
    let i = 6;
    i >= 0;
    i--
  ) {

    const d =
      new Date(
        `${today}T12:00:00Z`
      );


    d.setUTCDate(
      d.getUTCDate() -
      i
    );


    const dayString =
      d
        .toISOString()
        .slice(
          0,
          10
        );


    const entry = {

      date:
        dayString,

      label:
        weekdayNames[
          d.getUTCDay()
        ],

      orders:
        0,

      revenue:
        0
    };


    days.push(
      entry
    );


    buckets[
      dayString
    ] =
      entry;
  }


  for (
    const order of
    orders
  ) {

    if (
      order.cancelledAt
    ) {

      continue;
    }


    const day =
      berlinDayOf(
        order.createdAt
      );


    const bucket =
      buckets[
        day
      ];


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
    const entry of
    days
  ) {

    entry.revenue =
      Number(
        entry.revenue
          .toFixed(
            2
          )
      );
  }


  return {

    days,

    currency:
      "EUR",

    source:
      "Shopify"
  };
}


app.post(
  "/api/shopify-week",

  async (req, res) => {

    try {

      return res.json(
        await getShopifyWeek()
      );


    } catch (error) {

      console.error(
        "Shopify week endpoint error:",
        error
      );


      return res
        .status(500)
        .json({

          error:
            error.message ||
            "Wochendaten fehlgeschlagen."
        });
    }
  }
);


/* =========================================================
   WEATHER
   ========================================================= */

async function getWeatherData(
  location,
  day = "today"
) {

  let placeName =
    String(
      location ||
      ""
    ).trim();


  if (
    !placeName
  ) {

    placeName =
      "Ludwigshafen am Rhein";
  }


  if (
    normalize(
      placeName
    ).includes(
      "ludwigshafen"
    )
  ) {

    placeName =
      "Ludwigshafen am Rhein";
  }


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


  if (
    !geoResponse.ok
  ) {

    throw new Error(
      "Geocoding-Dienst ist nicht erreichbar."
    );
  }


  const geoData =
    await geoResponse.json();


  const candidates =
    geoData.results ||
    [];


  if (
    !candidates.length
  ) {

    throw new Error(
      `Ort ${placeName} wurde nicht gefunden.`
    );
  }


  let place =
    null;


  if (
    normalize(
      placeName
    ).includes(
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
          timeoutSignal(
            8000
          )
      }
    );


  if (
    !response.ok
  ) {

    throw new Error(
      "Wetterdienst ist nicht erreichbar."
    );
  }


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
      day ===
        "today"

        ? data.current

        : null,

    forecast: {

      date:
        data.daily
          ?.time
          ?.[index],

      weather_code:
        data.daily
          ?.weather_code
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
          ?.[index]
    }
  };
}


app.post(
  "/api/weather",

  async (req, res) => {

    try {

      const location =
        String(
          req.body?.location ||
          "Ludwigshafen am Rhein"
        );


      const day =
        req.body?.day ===
          "tomorrow"

          ? "tomorrow"

          : "today";


      return res.json(
        await getWeatherData(
          location,
          day
        )
      );


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
   LIVE-DATA INTENT HELPERS
   ========================================================= */

function isShopifyQuestion(
  text
) {

  const n =
    normalize(
      text
    );


  const keywords = [
    "shopify",
    "mein shop",
    "unser shop",
    "druckelite24",
    "bestellung",
    "bestellungen",
    "umsatz",
    "verkauf",
    "verkäufe",
    "bestellwert"
  ];


  return keywords.some(
    word =>
      n.includes(
        word
      )
  );
}


function isWeatherQuestion(
  text
) {

  const n =
    normalize(
      text
    );


  return (
    n.includes(
      "wetter"
    ) ||
    n.includes(
      "temperatur"
    ) ||
    n.includes(
      "regen"
    ) ||
    n.includes(
      "regnet"
    ) ||
    n.includes(
      "wind"
    )
  );
}


function getShopifyPeriodFromText(
  text
) {

  return normalize(
    text
  ).includes(
    "gestern"
  )
    ? "yesterday"
    : "today";
}


function getWeatherDayFromText(
  text
) {

  return normalize(
    text
  ).includes(
    "morgen"
  )
    ? "tomorrow"
    : "today";
}


/* =========================================================
   JARVIS CHAT ENDPOINT
   ========================================================= */

app.post(
  "/api/jarvis-chat",

  async (req, res) => {

    try {

      const message =
        String(
          req.body?.message ||
          ""
        ).trim();


      const previousResponseId =
        String(
          req.body?.previous_response_id ||
          ""
        ).trim() ||
        null;


      if (
        !message
      ) {

        return res
          .status(400)
          .json({

            ok:
              false,

            error:
              "Nachricht fehlt."
          });
      }


      console.log(
        "JARVIS question:",
        message
      );


      let liveData =
        null;


      /*
       * SHOPIFY LIVE
       */
      if (
        isShopifyQuestion(
          message
        )
      ) {

        try {

          const period =
            getShopifyPeriodFromText(
              message
            );


          liveData = {

            type:
              "shopify",

            data:
              await getShopifySummary(
                period
              )
          };


        } catch (error) {

          liveData = {

            type:
              "shopify",

            error:
              error.message ||
              "Shopify-Daten konnten nicht geladen werden."
          };
        }


      /*
       * WEATHER LIVE
       */
      } else if (
        isWeatherQuestion(
          message
        )
      ) {

        try {

          const day =
            getWeatherDayFromText(
              message
            );


          liveData = {

            type:
              "weather",

            data:
              await getWeatherData(
                "Ludwigshafen am Rhein",
                day
              )
          };


        } catch (error) {

          liveData = {

            type:
              "weather",

            error:
              error.message ||
              "Wetterdaten konnten nicht geladen werden."
          };
        }
      }


      const result =
        await createJarvisResponse({

          message,

          previousResponseId,

          liveData
        });


      console.log(
        "JARVIS answer:",
        result.text
      );


      return res.json({

        ok:
          true,

        text:
          result.text,

        response_id:
          result.response_id
      });


    } catch (error) {

      console.error(
        "JARVIS chat error:",
        error
      );


      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            error.name ===
              "TimeoutError"

              ? "Die Antwort hat zu lange gedauert."

              : error.message ||
                "JARVIS konnte nicht antworten."
        });
    }
  }
);


/* =========================================================
   ELEVENLABS · EINZIGE STIMME
   ========================================================= */

app.post(
  "/api/elevenlabs-tts",

  async (req, res) => {

    try {

      const apiKey =
        process.env
          .ELEVENLABS_API_KEY;


      const voiceId =
        process.env
          .ELEVENLABS_VOICE_ID;


      if (
        !apiKey ||
        !voiceId
      ) {

        return res
          .status(500)
          .json({

            error:
              "ElevenLabs ist nicht vollständig konfiguriert."
          });
      }


      const text =
        String(
          req.body?.text ||
          ""
        ).trim();


      if (
        !text
      ) {

        return res
          .status(400)
          .json({

            error:
              "Text fehlt."
          });
      }


      const safeText =
        text.slice(
          0,
          3000
        );


      const elevenUrl =
        new URL(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
            voiceId
          )}/stream`
        );


      elevenUrl.searchParams.set(
        "output_format",
        "mp3_44100_128"
      );


      const response =
        await fetch(
          elevenUrl,
          {
            method:
              "POST",

            headers: {

              "xi-api-key":
                apiKey,

              "Content-Type":
                "application/json",

              Accept:
                "audio/mpeg"
            },

            body:
              JSON.stringify({

                text:
                  safeText,

                model_id:
                  "eleven_flash_v2_5",

                voice_settings: {

                  /*
                   * Etwas stabiler und
                   * deutlicher als vorher.
                   */
                  stability:
                    0.58,

                  similarity_boost:
                    0.84,

                  style:
                    0.12,

                  use_speaker_boost:
                    true,

                  /*
                   * Minimal langsamer,
                   * damit die Aussprache
                   * klarer wird.
                   */
                  speed:
                    0.96
                }
              }),

            signal:
              timeoutSignal(
                25000
              )
          }
        );


      if (
        !response.ok
      ) {

        const errorText =
          await response.text();


        console.error(
          "ElevenLabs error:",
          response.status,
          errorText
        );


        return res
          .status(
            response.status
          )
          .json({

            error:
              "ElevenLabs konnte die Stimme nicht erzeugen."
          });
      }


      if (
        !response.body
      ) {

        return res
          .status(502)
          .json({

            error:
              "ElevenLabs hat keinen Audiostream geliefert."
          });
      }


      res.status(
        200
      );


      res.setHeader(
        "Content-Type",
        response.headers.get(
          "content-type"
        ) ||
        "audio/mpeg"
      );


      res.setHeader(
        "Cache-Control",
        "no-store"
      );


      const reader =
        response.body
          .getReader();


      try {

        while (true) {

          const {
            done,
            value
          } =
            await reader.read();


          if (
            done
          ) {

            break;
          }


          if (
            value
          ) {

            res.write(
              Buffer.from(
                value
              )
            );
          }
        }


        res.end();


      } catch (streamError) {

        console.error(
          "ElevenLabs stream error:",
          streamError
        );


        try {

          res.end();

        } catch {}
      }


    } catch (error) {

      console.error(
        "ElevenLabs endpoint error:",
        error
      );


      if (
        !res.headersSent
      ) {

        return res
          .status(500)
          .json({

            error:
              error.name ===
                "TimeoutError"

                ? "ElevenLabs hat zu lange gebraucht."

                : "ElevenLabs TTS konnte nicht gestartet werden."
          });
      }


      try {

        res.end();

      } catch {}
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

        configured:
          false,

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

        configured:
          false,

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

      ok:
        true,

      version:
        "JARVIS V7.2",

      architecture:
        "mediarecorder -> transcription -> responses -> elevenlabs",

      realtime:
        false,

      cedar:
        false,

      transcription_model:
        process.env.OPENAI_TRANSCRIBE_MODEL ||
        "gpt-4o-mini-transcribe",

      transcription_threshold:
        Number(
          process.env.OPENAI_TRANSCRIBE_THRESHOLD ||
          0.65
        ),

      text_model:
        process.env.OPENAI_TEXT_MODEL ||
        "gpt-5-mini",

      reasoning_effort:
        "low",

      max_output_tokens:
        1200,

      speech_output:
        "elevenlabs-only",

      elevenlabs_speed:
        0.96,

      language:
        "de",

      connected_shop:
        "Druckelite24",

      openai_configured:
        Boolean(
          process.env
            .OPENAI_API_KEY
        ),

      elevenlabs_configured:
        Boolean(
          process.env
            .ELEVENLABS_API_KEY &&
          process.env
            .ELEVENLABS_VOICE_ID
        ),

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
      `JARVIS V7.2 läuft auf Port ${PORT}`
    );


    console.log(
      "Realtime: DEAKTIVIERT"
    );


    console.log(
      "Mikrofon: Browser MediaRecorder"
    );


    console.log(
      "Transkription: OpenAI Audio API"
    );


    console.log(
      "Transkriptions-Threshold: 0.65"
    );


    console.log(
      "Antwort: OpenAI Responses API"
    );


    console.log(
      "Reasoning: LOW"
    );


    console.log(
      "Antwortlimit: 1200 Tokens + automatischer Fallback"
    );


    console.log(
      "Stimme: ElevenLabs ONLY"
    );
  }
);
