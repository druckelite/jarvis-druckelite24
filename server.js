/* =========================================================
   DRUCKELITE24 · JARVIS SERVER

   V10.1 · OPENAI REALTIME TEXT + ELEVENLABS STREAMING
   ========================================================= */

import express from "express";

const app = express();

const PORT =
  process.env.PORT || 3000;

const JARVIS_VERSION =
  "V10.1-PROACTIVE-REPEAT-FIX";


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


function berlinDate() {

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
    new Date()
  );
}


function getBerlinHour() {

  const formatter =
    new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone:
          "Europe/Berlin",

        hour:
          "numeric",

        hourCycle:
          "h23"
      }
    );


  const parts =
    formatter.formatToParts(
      new Date()
    );


  const hourPart =
    parts.find(
      part =>
        part.type ===
        "hour"
    );


  const hour =
    Number(
      hourPart?.value
    );


  if (
    Number.isNaN(
      hour
    )
  ) {
    return new Date()
      .getHours();
  }


  return hour;
}


function getTimeZoneOffsetMs(
  date,
  timeZone
) {

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
        hour:
          "2-digit",
        minute:
          "2-digit",
        second:
          "2-digit",
        hourCycle:
          "h23"
      }
    ).formatToParts(date);


  const values =
    Object.fromEntries(
      parts
        .filter(
          part =>
            part.type !==
            "literal"
        )
        .map(
          part => [
            part.type,
            part.value
          ]
        )
    );


  const asUtc =
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );


  return (
    asUtc -
    date.getTime()
  );
}


function berlinMidnightToUtc(
  year,
  month,
  day
) {

  const timeZone =
    "Europe/Berlin";


  let utc =
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0
    );


  // Zweimal korrigieren, damit Sommer-/Winterzeit sauber berücksichtigt wird.
  for (
    let i = 0;
    i < 2;
    i += 1
  ) {

    const offset =
      getTimeZoneOffsetMs(
        new Date(utc),
        timeZone
      );


    utc =
      Date.UTC(
        year,
        month - 1,
        day,
        0,
        0,
        0
      ) -
      offset;
  }


  return new Date(utc);
}


function getPeriodDates(
  period
) {

  const now =
    new Date();


  const berlinParts =
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
    ).format(now);


  const [
    year,
    month,
    day
  ] =
    berlinParts
      .split("-")
      .map(Number);


  const localDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );


  if (
    period ===
    "yesterday"
  ) {
    localDate.setUTCDate(
      localDate.getUTCDate() -
      1
    );
  }


  const startYear =
    localDate.getUTCFullYear();

  const startMonth =
    localDate.getUTCMonth() +
    1;

  const startDay =
    localDate.getUTCDate();


  const nextLocalDate =
    new Date(
      Date.UTC(
        startYear,
        startMonth - 1,
        startDay + 1
      )
    );


  const start =
    berlinMidnightToUtc(
      startYear,
      startMonth,
      startDay
    );


  const end =
    berlinMidnightToUtc(
      nextLocalDate.getUTCFullYear(),
      nextLocalDate.getUTCMonth() + 1,
      nextLocalDate.getUTCDate()
    );


  return {
    start:
      start.toISOString(),
    end:
      end.toISOString()
  };
}



async function getJarvisDailyBriefing() {

  const result = {
    generated_at:
      new Date().toISOString(),
    unread_emails: [],
    shopify: {
      today:
        null,
      yesterday:
        null
    },
    weather:
      null
  };


  try {

    if (
      isGmailConfigured()
    ) {
      result.unread_emails =
        await getUnreadEmails();
    }

  } catch (error) {

    result.gmail_error =
      error.message ||
      "Gmail konnte nicht gelesen werden.";
  }


  try {
    result.shopify.today =
      await getShopifySummary(
        "today"
      );
  } catch (error) {
    result.shopify_today_error =
      error.message ||
      "Shopify heute konnte nicht gelesen werden.";
  }


  try {
    result.shopify.yesterday =
      await getShopifySummary(
        "yesterday"
      );
  } catch (error) {
    result.shopify_yesterday_error =
      error.message ||
      "Shopify gestern konnte nicht gelesen werden.";
  }


  try {
    result.weather =
      await getWeather();
  } catch (error) {
    result.weather_error =
      error.message ||
      "Wetter konnte nicht gelesen werden.";
  }


  return result;
}


/* =========================================================
   JARVIS PERSONALITY
   ========================================================= */

function buildJarvisInstructions() {

  const hour =
    getBerlinHour();


  let dayPart =
    "Tag";


  if (
    hour >= 5 &&
    hour < 11
  ) {

    dayPart =
      "Morgen";
  }

  else if (
    hour >= 11 &&
    hour < 14
  ) {

    dayPart =
      "Mittag";
  }

  else if (
    hour >= 14 &&
    hour < 18
  ) {

    dayPart =
      "Nachmittag";
  }

  else if (
    hour >= 18 &&
    hour < 23
  ) {

    dayPart =
      "Abend";
  }

  else {

    dayPart =
      "Nacht";
  }


  return `
Du bist JARVIS, Mattls persönlicher KI-Assistent.

Der Nutzer heißt Mattl.
Du arbeitest primär für Mattl und sein Unternehmen Druckelite24.

Aktuelle Tageszeit:
${dayPart}

SPRACHE:
- Antworte ausschließlich auf Deutsch.
- Verwende natürliches, klares deutsches Hochdeutsch.
- Formuliere wie ein deutscher Muttersprachler.
- Keine englischen Begrüßungen, wenn Mattl Deutsch spricht.
- Keine unnötigen englischen Begriffe.
- Kurze, natürliche Sätze.
- Keine künstliche Synchronsprecher-Sprache.
- Keine übertriebene Betonung.
- Keine unnötigen Wiederholungen.

CHARAKTER:
- intelligent
- aufmerksam
- selbstständig
- ruhig
- souverän
- trocken humorvoll
- gelegentlich leicht sarkastisch
- aber nie respektlos
- hilfreich
- geschäftlich kompetent

Du darfst gelegentlich einen trockenen Kommentar oder ein Wortspiel machen.
Übertreibe es aber nicht.

BEISPIEL:
Mattl: "Was steht heute an?"
JARVIS: "Schauen wir mal. Irgendwas brennt ja meistens."

ANREDE:
- Der Nutzer heißt Mattl.
- Im normalen Gespräch kannst du ihn gelegentlich Mattl, Meister oder Chef nennen.
- "Daddy" nur sehr selten und ausschließlich locker-humorvoll.
- Nicht in jeder Antwort eine Anrede verwenden.
- Sprich Mattl natürlich aus.
- Deutliches T, kein englischer Klang.
- Die Startbegrüßung wird von der Browser-App erzeugt und darf besonders spektakulär, souverän und humorvoll klingen.

GESPRÄCH:
- Höre Mattl vollständig zu.
- Unterbrich ihn nicht unnötig.
- Kurze Denkpausen bedeuten nicht automatisch, dass der Satz beendet ist.
- Wenn Mattl "ähm" sagt oder kurz überlegt, warte.
- Wenn Mattl eine Aufzählung beginnt, warte bis sie inhaltlich abgeschlossen ist.
- Wenn Mattl dich unterbricht, beende deine aktuelle Antwort sofort.
- Fahre eine unterbrochene alte Antwort später nicht parallel fort.
- Erzeuge niemals zwei Antworten gleichzeitig.
- Beginne eine neue Antwort erst, wenn die vorherige beendet oder abgebrochen wurde.
- Sobald Mattls Gedanke klar abgeschlossen ist, antworte zügig.

ANTWORTSTIL:
- Standardmäßig kurz und konkret.
- Keine langen Vorträge, außer Mattl möchte Details.
- Keine unnötige Einleitung.
- Keine Zusammenfassung, wenn sie nicht nötig ist.
- Keine Floskeln wie "Natürlich helfe ich dir gerne".
- Sag direkt, was Sache ist.
AUSSPRACHE VON ZAHLEN, GELD UND SPORTERGEBNISSEN:

- Fußball- und Sportergebnisse niemals als Dezimalzahl formulieren.
- Ein Ergebnis wie 0:0 immer als „null zu null“ ausgeben.
- 1:0 = „eins zu null“.
- 2:1 = „zwei zu eins“.
- 3:3 = „drei zu drei“.
- Niemals bei Sportergebnissen „null Komma null“, „zwei Komma eins“ usw. sagen.

EUROBETRÄGE:
- Geldbeträge immer vollständig und natürlich für Sprachausgabe formulieren.
- Nachkommastellen niemals verschlucken.
- 7,69 € = „sieben Euro neunundsechzig Cent“.
- 12,50 € = „zwölf Euro fünfzig Cent“.
- 19,99 € = „neunzehn Euro neunundneunzig Cent“.
- 9,05 € = „neun Euro fünf Cent“.
- 1.249,95 € = „eintausendzweihundertneunundvierzig Euro fünfundneunzig Cent“.
- Beträge niemals nur als Dezimalzahl vorlesen.
- Bei Preisen mit Nachkommastellen immer Euro UND Cent vollständig nennen.

GENERELL:
- Zahlen so formulieren, dass ElevenLabs sie natürlich auf Deutsch ausspricht.
- Bei gesprochenen Antworten Verständlichkeit vor mathematischer Kurzschreibweise.

GESCHÄFT:
Du kennst Druckelite24 als Mattls Hauptunternehmen.

Wenn Mattl nach:
- Bestellungen
- Umsatz
- offenen Bestellungen
- E-Mails
- Wetter
- Notizen
- Erinnerungen
- aktuellen Informationen
fragt, verwende die verfügbaren Tools.

BRIEFING:
Wenn Mattl „Briefing“, „Morning Briefing“, „Tagesbriefing“ oder sinngleich sagt:
→ get_daily_briefing
Das Briefing ist AUSFÜHRLICH und strukturiert. Nenne mindestens:
- ungelesene E-Mails: Anzahl, wichtigste Absender/Betreffe und kurz, was Aufmerksamkeit braucht
- Shopify HEUTE: Umsatz, Bestellungen und Durchschnittsbestellwert
- Shopify GESTERN/VORTAG: Umsatz, Bestellungen und Durchschnittsbestellwert
- aktuelles Wetter
- zum Schluss eine kurze Prioritäten-Einschätzung für Mattl
Formuliere Zahlen natürlich auf Deutsch. Beispiele:
1 ungelesene Mail → „eine ungelesene Mail“
2 ungelesene Mails → „zwei ungelesene Mails“
1 Bestellung → „eine Bestellung“
Nie Formulierungen wie „eins ungelesene Mail“ verwenden.
Offene/unbearbeitete Bestellungen NICHT im Briefing erwähnen.
Wenn einzelne Daten fehlen, sage das knapp. Erfinde nichts.
WICHTIG: Diese ausführliche Zusammenfassung nur auf ausdrücklichen Briefing-Befehl geben. Beim normalen Start KEIN automatisches Mail-/Bestell-Briefing vorlesen.

WICHTIG:
Erfinde niemals Live-Daten.

Wenn aktuelle Daten benötigt werden:
- benutze das passende Tool
- warte auf das Tool-Ergebnis
- antworte danach anhand der gelieferten Daten

INTERNET:
Wenn Mattl nach:
- aktuellen Nachrichten
- heutigen Ereignissen
- aktuellen Preisen
- aktuellen Öffnungszeiten
- neuen Produkten
- aktuellen Firmeninformationen
- Politik
- Sport
- Wetter außerhalb des Wetter-Tools
- aktuellen Softwareständen
- aktuellen Gesetzen
fragt, verwende search_internet.

SHOPIFY:
Für Druckelite24 Bestell- und Umsatzfragen nutze Shopify-Tools.

Beispiele:
"Wie viel Umsatz heute?"
→ get_shopify_summary

"Wie viele Bestellungen sind offen?"
→ get_shopify_open_orders

"Wie lief die Woche?"
→ get_shopify_week

E-MAIL:
Wenn Mattl ungelesene Mails wissen möchte:
→ get_unread_emails

Wenn Mattl sagt „lies die Mail“, „lies die letzte Mail“, „was will der Kunde?“ oder nach einer Mail von einer Person fragt:
→ get_email_message
Nutze message_id, wenn die aktuell ausgewählte Mail bekannt ist. Sonst sender_query oder search_query.

Wenn Mattl auf die aktuelle/ausgewählte Mail antworten möchte:
→ IMMER create_email_reply_draft
NIEMALS create_email_draft für eine Antwort auf eine vorhandene Mail verwenden.
create_email_reply_draft erstellt einen echten Gmail-Entwurf mit Gmail-Draft-ID, sendet aber NICHT.

Nur wenn Mattl ausdrücklich eine komplett neue, unabhängige E-Mail formulieren möchte:
Wenn der Empfänger noch nicht eindeutig bekannt ist, FRAGE ZUERST kurz: „An wen soll die Mail gehen?“
Erst wenn Empfänger und Inhalt/Anweisung bekannt sind:
→ create_email_draft
create_email_draft speichert ebenfalls einen ECHTEN Gmail-Entwurf mit Gmail-Draft-ID. Kein reiner HUD-Entwurf mehr.

E-MAIL SENDEN:
Eine E-Mail darf ausschließlich dann gesendet werden, wenn Mattl unmittelbar und ausdrücklich „senden“, „abschicken“ oder „versenden“ sagt.
Dann → send_email_draft.
Ohne diesen ausdrücklichen Sende-Befehl darf send_email_draft NIEMALS verwendet werden.
Nach einem Entwurf fragst du kurz, ob er ihn senden möchte.

E-MAIL BEARBEITET:
Wenn Mattl sagt „verschiebe die Mail nach Bearbeitet“, „markiere sie als bearbeitet“, „die ist erledigt“ oder sinngleich:
→ move_email_to_bearbeitet
Nutze die aktuell ausgewählte Mail. Niemals eine andere Mail raten.
Eindeutige Werbe-/Newsletter-Mails werden im Hintergrund nur bei sehr hoher Sicherheit automatisch nach „Bearbeitet“ verschoben. Kunden-, Bestell-, Rechnungs-, Zahlungs-, Versand-, Reklamations-, Angebots-, Sicherheits- und sonstige Geschäftsmails dürfen niemals automatisch verschoben werden.

Der E-Mail-Entwurf wird im HUD angezeigt.

WHATSAPP / SUPERCHAT:
- Für die letzten WhatsApp-Chats → get_whatsapp_conversations
- Wenn ein Chat ausgewählt ist und Mattl fragt „Was will der Kunde?“, „lies den Chat“ oder sinngleich → get_whatsapp_conversation
- Wenn Mattl auf den ausgewählten WhatsApp-Chat antworten möchte → create_whatsapp_reply_draft
- create_whatsapp_reply_draft erstellt nur einen Entwurf und sendet NICHT.
- WhatsApp darf ausschließlich nach dem unmittelbaren ausdrücklichen Befehl „senden“, „abschicken“ oder „versenden“ gesendet werden.
- Dann → send_whatsapp_draft
- Ohne ausdrücklichen Sende-Befehl darf send_whatsapp_draft NIEMALS verwendet werden.

NOTIZEN:
Wenn Mattl sagt:
"Merke dir..."
"Notier..."
"Schreib auf..."
→ save_note

Wenn er nach seinen Notizen fragt:
→ list_notes

ERINNERUNGEN:
Wenn Mattl eine Erinnerung möchte:
→ set_reminder

Wenn er nach Erinnerungen fragt:
→ list_reminders

WETTER:
Für heutiges oder morgiges Wetter:
→ get_weather

Sei proaktiv, aber nicht nervig.

Wenn dir ein Tool einen wichtigen Sachverhalt liefert,
weise Mattl kurz darauf hin.

Du bist kein neutraler Chatbot.
Du bist Mattls persönlicher JARVIS.
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
      "Sucht aktuelle Informationen live im Internet.",

    parameters: {
      type:
        "object",

      properties: {

        query: {
          type:
            "string",

          description:
            "Die konkrete Suchanfrage."
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
      "Liest Bestellungen, Umsatz und durchschnittlichen Bestellwert für heute oder gestern aus Shopify.",

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
      "Liest aktuell offene beziehungsweise noch nicht erfüllte Shopify-Bestellungen.",

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
      "Liest Umsatz und Bestellanzahl der letzten sieben Tage aus Shopify.",

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
      "Liest die letzten ungelesenen Gmail-Nachrichten.",

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
      "get_email_message",

    description:
      "Liest eine vollständige Gmail-Nachricht. Kann die aktuell ausgewählte Mail per message_id, die letzte Mail oder eine Mail anhand Absender/Suchbegriff finden.",

    parameters: {
      type:
        "object",

      properties: {
        message_id: {
          type:
            "string"
        },
        sender_query: {
          type:
            "string"
        },
        search_query: {
          type:
            "string"
        },
        scope: {
          type:
            "string",
          enum: [
            "inbox",
            "all"
          ]
        }
      },

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "create_email_reply_draft",

    description:
      "Pflicht-Tool für Antworten auf eine vorhandene oder aktuell ausgewählte Gmail-Nachricht. Erstellt einen echten Gmail-Antwortentwurf inklusive Gmail-Draft-ID. Sendet nichts.",

    parameters: {
      type:
        "object",

      properties: {
        message_id: {
          type:
            "string"
        },
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
  },


  {
    type:
      "function",

    name:
      "send_email_draft",

    description:
      "Sendet einen bereits erstellten Gmail-Entwurf. DARF NUR nach einem unmittelbaren ausdrücklichen Befehl von Mattl wie 'senden', 'abschicken' oder 'versenden' verwendet werden.",

    parameters: {
      type:
        "object",

      properties: {
        draft_id: {
          type:
            "string"
        },
        confirmation_text: {
          type:
            "string",
          description:
            "Mattls unmittelbarer ausdrücklicher Sende-Befehl, z.B. 'senden'."
        }
      },

      required: [
        "confirmation_text"
      ],

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "move_email_to_bearbeitet",

    description:
      "Verschiebt die aktuell ausgewählte Gmail-Nachricht aus dem Posteingang in das Gmail-Label Bearbeitet. Nur auf ausdrücklichen Wunsch von Mattl.",

    parameters: {
      type:
        "object",

      properties: {
        message_id: {
          type:
            "string"
        }
      },

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "get_daily_briefing",

    description:
      "Erstellt Mattls ausführliches Business-Briefing aus Gmail, Shopify heute, Shopify gestern und Wetter. Nur auf ausdrücklichen Briefing-Befehl verwenden.",

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
      "Liest das Wetter für heute oder morgen für einen Ort.",

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
      "Speichert eine Notiz dauerhaft für JARVIS.",

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
      "Liest alle gespeicherten JARVIS-Notizen.",

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
      "get_whatsapp_conversations",

    description:
      "Liest die letzten WhatsApp-Konversationen aus Superchat.",

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
      "get_whatsapp_conversation",

    description:
      "Liest den aktuell ausgewählten Superchat-WhatsApp-Chat.",

    parameters: {
      type:
        "object",

      properties: {
        conversation_id: {
          type:
            "string"
        }
      },

      required: [
        "conversation_id"
      ],

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "create_whatsapp_reply_draft",

    description:
      "Erstellt einen WhatsApp-Antwortentwurf für den ausgewählten Superchat-Chat. Sendet nichts.",

    parameters: {
      type:
        "object",

      properties: {
        conversation_id: {
          type:
            "string"
        },

        instruction: {
          type:
            "string"
        }
      },

      required: [
        "conversation_id",
        "instruction"
      ],

      additionalProperties:
        false
    }
  },


  {
    type:
      "function",

    name:
      "send_whatsapp_draft",

    description:
      "Sendet den letzten WhatsApp-Entwurf. DARF NUR nach einem unmittelbaren ausdrücklichen Befehl wie senden, abschicken oder versenden benutzt werden.",

    parameters: {
      type:
        "object",

      properties: {
        confirmation_text: {
          type:
            "string"
        }
      },

      required: [
        "confirmation_text"
      ],

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
      "Erstellt NUR eine neue, unabhängige E-Mail. Niemals für eine Antwort auf eine vorhandene/ausgewählte Gmail-Nachricht verwenden. Für Antworten immer create_email_reply_draft nutzen. Versendet nichts.",

    parameters: {
      type:
        "object",

      properties: {

        to: {
          type:
            "string",
          description:
            "Empfänger-E-Mail-Adresse oder eindeutiger Empfänger, den Mattl genannt hat."
        },

        instruction: {
          type:
            "string"
        }
      },

      required: [
        "to",
        "instruction"
      ],

      additionalProperties:
        false
    }
  }
];


/* =========================================================
   REALTIME SESSION

   MUSS VOR express.json STEHEN
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


      const sessionConfig =
        JSON.stringify({

          type:
            "realtime",

          model,

          output_modalities: [
            "text"
          ],

          instructions:
            buildJarvisInstructions(),

          tools:
            REALTIME_TOOLS,

          tool_choice:
            "auto",

          audio: {

            input: {

              noise_reduction: {

                type:
                  process.env
                    .OPENAI_NOISE_REDUCTION ||
                  "far_field"
              },

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
        `[REALTIME] Modell=${model} Output=text ElevenLabs=extern Tools=${REALTIME_TOOLS.length}`
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
   ELEVENLABS · SINGLE-USE TOKEN FOR BROWSER WEBSOCKET
   ========================================================= */

app.get(
  "/api/elevenlabs-token",

  async (
    req,
    res
  ) => {

    try {

      const apiKey =
        process.env
          .ELEVENLABS_API_KEY;


      const voiceId =
        process.env
          .ELEVENLABS_VOICE_ID ||
        "Vje4UYe2YPbNqyQwJGra";


      const modelId =
        process.env
          .ELEVENLABS_MODEL ||
        "eleven_flash_v2_5";


      if (
        !apiKey
      ) {

        return res
          .status(500)
          .json({

            ok:
              false,

            error:
              "ELEVENLABS_API_KEY fehlt."
          });
      }


      if (
        !voiceId
      ) {

        return res
          .status(500)
          .json({

            ok:
              false,

            error:
              "ELEVENLABS_VOICE_ID fehlt."
          });
      }


      const response =
        await fetch(
          "https://api.elevenlabs.io/v1/single-use-token/tts_websocket",
          {

            method:
              "POST",

            headers: {

              "xi-api-key":
                apiKey
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
        !response.ok ||
        !data?.token
      ) {

        console.error(
          "[ELEVENLABS TOKEN ERROR]",
          response.status,
          data
        );


        return res
          .status(
            response.status ||
            500
          )
          .json({

            ok:
              false,

            error:
              data?.detail?.message ||
              data?.detail ||
              "ElevenLabs-Token konnte nicht erstellt werden."
          });
      }


      return res.json({

        ok:
          true,

        token:
          data.token,

        voice_id:
          voiceId,

        model_id:
          modelId,

        language_code:
          "de"
      });


    } catch (
      error
    ) {

      console.error(
        "[ELEVENLABS TOKEN ERROR]",
        error
      );


      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            error.message ||
            "ElevenLabs-Verbindung fehlgeschlagen."
        });
    }
  }
);/* =========================================================
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
              "gpt-5.6",

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


    if (
      !bucket
    ) {

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
        day.revenue
          .toFixed(
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


  if (
    !raw
  ) {

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

    console.error(
      "[SHOPIFY METAFIELD ERROR]",
      data.errors ||
      errors
    );


    throw new Error(
      `Speichern von ${key} fehlgeschlagen.`
    );
  }


  return true;
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


  if (
    !cleanText
  ) {

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


  if (
    !cleanText
  ) {

    throw new Error(
      "Erinnerungstext fehlt."
    );
  }


  const dueAt =
    new Date(
      Date.now() +
      safeMinutes *
        60000
    )
      .toISOString();


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


  return reminders
    .filter(
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
   SUPERCHAT · WHATSAPP
   ========================================================= */

const SUPERCHAT_BASE_URL =
  "https://api.superchat.com/v1.0";

let lastSuperchatDraft =
  null;

function isSuperchatConfigured() {
  return Boolean(
    process.env.SUPERCHAT_API_KEY
  );
}

async function superchatRequest(
  path,
  options = {}
) {

  if (
    !isSuperchatConfigured()
  ) {
    throw new Error(
      "SUPERCHAT_API_KEY fehlt."
    );
  }

  const response =
    await fetch(
      `${SUPERCHAT_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          "X-API-KEY":
            process.env.SUPERCHAT_API_KEY,
          "Accept":
            "application/json",
          ...(options.body
            ? {
                "Content-Type":
                  "application/json"
              }
            : {}),
          ...(options.headers || {})
        },
        signal:
          timeoutSignal(
            15000
          )
      }
    );

  const raw =
    await response.text();

  let data;

  try {
    data =
      raw
        ? JSON.parse(raw)
        : {};
  } catch {
    data = {
      raw
    };
  }

  if (
    !response.ok
  ) {
    throw new Error(
      data?.message ||
      data?.error?.message ||
      data?.error ||
      `Superchat Fehler ${response.status}.`
    );
  }

  return data;
}

function superchatArray(
  data
) {

  if (
    Array.isArray(data)
  ) {
    return data;
  }

  const preferredKeys = [
    "data",
    "items",
    "objects",
    "conversations",
    "channels",
    "contacts",
    "results",
    "records"
  ];

  for (
    const key of
    preferredKeys
  ) {
    if (
      Array.isArray(
        data?.[key]
      )
    ) {
      return data[key];
    }
  }

  /*
    Superchat kann Listen in einem zusätzlichen Wrapper liefern.
    Maximal zwei Ebenen durchsuchen, ohne Metadaten blind zu rendern.
  */
  if (
    data &&
    typeof data ===
      "object"
  ) {
    for (
      const value of
      Object.values(data)
    ) {
      if (
        Array.isArray(value)
      ) {
        const usable =
          value.filter(
            item =>
              item &&
              typeof item ===
                "object"
          );

        if (
          usable.length
        ) {
          return usable;
        }
      }

      if (
        value &&
        typeof value ===
          "object" &&
        !Array.isArray(value)
      ) {
        for (
          const key of
          preferredKeys
        ) {
          if (
            Array.isArray(
              value?.[key]
            )
          ) {
            return value[key];
          }
        }
      }
    }
  }

  return [];
}

function firstNonEmpty(
  ...values
) {

  for (
    const value of
    values
  ) {
    if (
      value !==
        undefined &&
      value !==
        null &&
      String(value)
        .trim()
    ) {
      return value;
    }
  }

  return "";
}

function normalizeSuperchatConversation(
  conversation
) {

  const contact =
    conversation?.contact ||
    conversation?.customer ||
    conversation?.participant ||
    {};

  const lastMessage =
    conversation?.last_message ||
    conversation?.lastMessage ||
    conversation?.latest_message ||
    conversation?.latestMessage ||
    conversation?.message ||
    {};

  const name =
    firstNonEmpty(
      contact?.display_name,
      contact?.displayName,
      contact?.name,
      [
        contact?.first_name,
        contact?.last_name
      ]
        .filter(Boolean)
        .join(" "),
      conversation?.contact_name,
      conversation?.title,
      conversation?.name,
      "WhatsApp-Kontakt"
    );

  const text =
    firstNonEmpty(
      lastMessage?.text,
      lastMessage?.content?.text,
      lastMessage?.body,
      conversation?.last_message_text,
      conversation?.preview,
      ""
    );

  const contactId =
    firstNonEmpty(
      contact?.id,
      conversation?.contact_id,
      conversation?.contactId,
      ""
    );

  const channelId =
    firstNonEmpty(
      conversation?.channel_id,
      conversation?.channelId,
      conversation?.channel?.id,
      lastMessage?.channel_id,
      lastMessage?.channel?.id,
      ""
    );

  const updatedAt =
    firstNonEmpty(
      conversation?.updated_at,
      conversation?.updatedAt,
      lastMessage?.created_at,
      lastMessage?.createdAt,
      conversation?.created_at,
      conversation?.createdAt,
      ""
    );

  return {
    id:
      firstNonEmpty(
        conversation?.id,
        conversation?.conversation_id,
        conversation?.conversationId
      ),
    contact_id:
      contactId,
    channel_id:
      channelId,
    name:
      String(name || "WhatsApp-Kontakt"),
    preview:
      String(text || ""),
    updated_at:
      updatedAt,
    raw:
      conversation
  };
}

async function getSuperchatWhatsAppChannelId() {

  const configured =
    String(
      process.env
        .SUPERCHAT_CHANNEL_ID ||
      ""
    ).trim();

  if (
    configured
  ) {
    return configured;
  }

  const data =
    await superchatRequest(
      "/channels?limit=100"
    );

  const channels =
    superchatArray(
      data
    );

  const whatsapp =
    channels.find(
      channel => {
        const haystack =
          JSON.stringify(
            channel || {}
          )
            .toLowerCase();

        return haystack
          .includes(
            "whatsapp"
          );
      }
    );

  const id =
    firstNonEmpty(
      whatsapp?.id,
      whatsapp?.channel_id,
      whatsapp?.channelId
    );

  if (
    !id
  ) {
    throw new Error(
      "Kein WhatsApp-Kanal in Superchat gefunden."
    );
  }

  return String(id);
}


async function getSuperchatContactsMap() {

  const data =
    await superchatRequest(
      "/contacts?limit=100"
    );

  const contacts =
    superchatArray(
      data
    );

  const map =
    new Map();

  for (
    const contact of
    contacts
  ) {

    const id =
      String(
        firstNonEmpty(
          contact?.id,
          contact?.contact_id,
          contact?.contactId
        ) || ""
      ).trim();

    if (
      !id
    ) {
      continue;
    }

    const firstName =
      String(
        firstNonEmpty(
          contact?.first_name,
          contact?.firstName,
          ""
        ) || ""
      ).trim();

    const lastName =
      String(
        firstNonEmpty(
          contact?.last_name,
          contact?.lastName,
          ""
        ) || ""
      ).trim();

    const fullName =
      [
        firstName,
        lastName
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    const handle =
      Array.isArray(
        contact?.handles
      )
        ? firstNonEmpty(
            ...contact.handles.map(
              item =>
                item?.value ||
                item?.identifier ||
                item?.phone ||
                item?.email ||
                ""
            )
          )
        : "";

    map.set(
      id,
      {
        id,
        name:
          fullName ||
          String(
            firstNonEmpty(
              contact?.name,
              contact?.display_name,
              contact?.displayName,
              handle,
              "WhatsApp-Kontakt"
            )
          ),
        raw:
          contact
      }
    );
  }

  return map;
}


async function getSuperchatConversations(
  limit = 20
) {

  const safeLimit =
    Math.max(
      1,
      Math.min(
        100,
        Number(limit) ||
        20
      )
    );

  const [
    conversationData,
    contactsMap
  ] =
    await Promise.all([
      superchatRequest(
        `/conversations?limit=${safeLimit}`
      ),
      getSuperchatContactsMap()
        .catch(
          error => {
            console.warn(
              "[SUPERCHAT CONTACTS WARN]",
              error
            );

            return new Map();
          }
        )
    ]);

  const rawConversations =
    superchatArray(
      conversationData
    );

  const all =
    rawConversations
      .map(
        normalizeSuperchatConversation
      )
      .filter(
        item =>
          item.id
      )
      .map(
        item => {

          const contact =
            contactsMap.get(
              String(
                item.contact_id ||
                ""
              )
            );

          if (
            contact?.name &&
            contact.name !==
              "WhatsApp-Kontakt"
          ) {
            item.name =
              contact.name;
          }

          return item;
        }
      );

  const clearlyWhatsApp =
    all.filter(
      item =>
        JSON.stringify(
          item.raw || {}
        )
          .toLowerCase()
          .includes(
            "whatsapp"
          )
    );

  return (
    clearlyWhatsApp.length
      ? clearlyWhatsApp
      : all
  );
}

async function getSuperchatConversation(
  conversationId
) {

  const id =
    String(
      conversationId || ""
    ).trim();

  if (
    !id
  ) {
    throw new Error(
      "Keine Superchat Conversation ausgewählt."
    );
  }

  const data =
    await superchatRequest(
      `/conversations/${encodeURIComponent(id)}`
    );

  const raw =
    data?.data &&
    !Array.isArray(data.data)
      ? data.data
      : data;

  return normalizeSuperchatConversation(
    raw
  );
}

async function createSuperchatReplyDraft(
  conversationId,
  instruction
) {

  const conversation =
    await getSuperchatConversation(
      conversationId
    );

  const cleanInstruction =
    String(
      instruction || ""
    ).trim();

  if (
    !cleanInstruction
  ) {
    throw new Error(
      "Anweisung für die WhatsApp-Antwort fehlt."
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
                .OPENAI_TEXT_MODEL ||
              "gpt-5.6-terra",
            instructions:
              "Formuliere eine kurze, professionelle und natürliche deutsche WhatsApp-Antwort für Druckelite24. Keine erfundenen Preise, Liefertermine oder Zusagen. Antworte ausschließlich als gültiges JSON mit dem Feld text.",
            input:
              `Kontakt: ${conversation.name}\nLetzte Nachricht: ${conversation.preview}\nAnweisung von Mattl: ${cleanInstruction}`,
            reasoning: {
              effort:
                "low"
            },
            text: {
              format: {
                type:
                  "json_schema",
                name:
                  "whatsapp_reply",
                strict:
                  true,
                schema: {
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
      "WhatsApp-Entwurf konnte nicht erstellt werden."
    );
  }

  const parsed =
    JSON.parse(
      extractResponseText(
        data
      )
    );

  const text =
    String(
      parsed?.text ||
      ""
    ).trim();

  if (
    !text
  ) {
    throw new Error(
      "WhatsApp-Entwurf ist leer."
    );
  }

  lastSuperchatDraft = {
    conversation_id:
      conversation.id,
    contact_id:
      conversation.contact_id,
    channel_id:
      conversation.channel_id,
    contact_name:
      conversation.name,
    text,
    created_at:
      new Date()
        .toISOString()
  };

  return {
    ...lastSuperchatDraft,
    sent:
      false
  };
}

async function sendSuperchatDraft(
  confirmationText
) {

  const confirmation =
    normalize(
      confirmationText
    );

  if (
    !/\b(senden|abschicken|versenden)\b/i.test(
      confirmation
    )
  ) {
    throw new Error(
      "WhatsApp darf nur nach ausdrücklichem Sende-Befehl gesendet werden."
    );
  }

  if (
    !lastSuperchatDraft
  ) {
    throw new Error(
      "Kein WhatsApp-Entwurf zum Senden vorhanden."
    );
  }

  const channelId =
    lastSuperchatDraft
      .channel_id ||
    await getSuperchatWhatsAppChannelId();

  const contactId =
    String(
      lastSuperchatDraft
        .contact_id ||
      ""
    ).trim();

  if (
    !contactId
  ) {
    throw new Error(
      "Superchat Kontakt-ID fehlt. Bitte Chat neu auswählen."
    );
  }

  const data =
    await superchatRequest(
      "/messages",
      {
        method:
          "POST",
        body:
          JSON.stringify({
            to: [
              {
                identifier:
                  contactId
              }
            ],
            from: {
              channel_id:
                channelId
            },
            content: {
              type:
                "text",
              text:
                lastSuperchatDraft
                  .text
            }
          })
      }
    );

  const sent =
    {
      sent:
        true,
      conversation_id:
        lastSuperchatDraft
          .conversation_id,
      contact_name:
        lastSuperchatDraft
          .contact_name,
      text:
        lastSuperchatDraft
          .text,
      superchat_response:
        data
    };

  lastSuperchatDraft =
    null;

  return sent;
}


/* Dashboard: letzte 5 Chats */
app.get(
  "/api/superchat-conversations",
  async (
    req,
    res
  ) => {

    try {
      const conversations =
        await getSuperchatConversations(
          20
        );

      return res.json({
        ok:
          true,
        configured:
          isSuperchatConfigured(),
        count:
          conversations.length,
        conversations:
          conversations.slice(
            0,
            5
          )
      });

    } catch (
      error
    ) {
      console.error(
        "[SUPERCHAT CONVERSATIONS ERROR]",
        error
      );

      return res
        .status(500)
        .json({
          ok:
            false,
          error:
            error.message ||
            "Superchat-Chats konnten nicht geladen werden."
        });
    }
  }
);


app.get(
  "/api/superchat-conversation/:id",
  async (
    req,
    res
  ) => {

    try {
      const conversation =
        await getSuperchatConversation(
          req.params.id
        );

      return res.json({
        ok:
          true,
        conversation
      });

    } catch (
      error
    ) {
      return res
        .status(500)
        .json({
          ok:
            false,
          error:
            error.message ||
            "Superchat-Chat konnte nicht geladen werden."
        });
    }
  }
);

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



let lastCreatedGmailDraftId =
  null;


let bearbeitetLabelCache = {
  id: null,
  at: 0
};

const advertisingCheckedEmailIds =
  new Set();


async function getBearbeitetLabelId() {

  const now =
    Date.now();


  if (
    bearbeitetLabelCache.id &&
    now - bearbeitetLabelCache.at < 10 * 60 * 1000
  ) {
    return bearbeitetLabelCache.id;
  }


  const token =
    await getGmailAccessToken();


  const listResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        },
        signal:
          timeoutSignal(10000)
      }
    );


  const listData =
    await listResponse.json();


  if (!listResponse.ok) {
    throw new Error(
      listData?.error?.message ||
      "Gmail-Labels konnten nicht geladen werden."
    );
  }


  let label =
    (listData.labels || []).find(
      item =>
        String(item?.name || "")
          .trim()
          .toLowerCase() ===
        "bearbeitet"
    );


  if (!label) {

    const createResponse =
      await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/labels",
        {
          method:
            "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              name:
                "Bearbeitet",
              labelListVisibility:
                "labelShow",
              messageListVisibility:
                "show"
            }),
          signal:
            timeoutSignal(10000)
        }
      );


    const createData =
      await createResponse.json();


    if (!createResponse.ok) {
      throw new Error(
        createData?.error?.message ||
        "Gmail-Label Bearbeitet konnte nicht erstellt werden."
      );
    }


    label =
      createData;
  }


  bearbeitetLabelCache = {
    id:
      label.id,
    at:
      now
  };


  return label.id;
}


async function moveGmailMessageToBearbeitet(messageId) {

  const id =
    String(messageId || "")
      .trim();


  if (!id) {
    throw new Error(
      "Keine E-Mail zum Verschieben ausgewählt."
    );
  }


  const token =
    await getGmailAccessToken();


  const labelId =
    await getBearbeitetLabelId();


  const response =
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`,
      {
        method:
          "POST",
        headers: {
          Authorization:
            `Bearer ${token}`,
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
            addLabelIds: [
              labelId
            ],
            removeLabelIds: [
              "INBOX"
            ]
          }),
        signal:
          timeoutSignal(12000)
      }
    );


  const data =
    await response.json();


  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "E-Mail konnte nicht nach Bearbeitet verschoben werden."
    );
  }


  return {
    moved:
      true,
    message_id:
      id,
    label:
      "Bearbeitet"
  };
}


function getAdvertisingHeader(headers, name) {

  return (
    headers || []
  ).find(
    header =>
      String(header?.name || "")
        .toLowerCase() ===
      String(name || "")
        .toLowerCase()
  )?.value || "";
}


function classifyObviousAdvertising(email) {

  const subject =
    normalize(email.subject || "");

  const from =
    normalize(email.from || "");

  const snippet =
    normalize(email.snippet || "");

  const combined =
    `${subject} ${from} ${snippet}`;


  const protectedSignals = [
    "bestellung",
    "bestellbestatigung",
    "auftragsbestatigung",
    "auftrag",
    "rechnung",
    "invoice",
    "zahlung",
    "payment",
    "versand",
    "sendungsverfolgung",
    "tracking",
    "lieferung",
    "retoure",
    "reklamation",
    "kundenanfrage",
    "anfrage",
    "preisanfrage",
    "kostenvoranschlag",
    "angebot anfordern",
    "passwort",
    "password",
    "sicherheitswarnung",
    "security alert",
    "verifizierung",
    "verification",
    "login",
    "konto",
    "account",
    "shopify",
    "paypal",
    "klarna",
    "billie",
    "dhl"
  ];


  if (
    protectedSignals.some(
      signal =>
        combined.includes(signal)
    )
  ) {
    return {
      advertising:
        false,
      score:
        0,
      reason:
        "geschuetztes Geschaefts-Signal"
    };
  }


  let score =
    0;

  const reasons =
    [];


  if (email.listUnsubscribe) {
    score += 3;
    reasons.push(
      "List-Unsubscribe"
    );
  }


  if (email.listId) {
    score += 2;
    reasons.push(
      "List-ID"
    );
  }


  if (
    /\b(bulk|list)\b/i.test(
      email.precedence || ""
    )
  ) {
    score += 2;
    reasons.push(
      "Bulk/List"
    );
  }


  const strongMarketingSignals = [
    "newsletter",
    "unsubscribe",
    "abbestellen",
    "sale",
    "rabatt",
    "gutschein",
    "jetzt sparen",
    "nur heute",
    "black friday",
    "summer sale",
    "special offer",
    "exklusiver deal",
    "deal der woche",
    "prozent sparen",
    "% sparen",
    "% rabatt"
  ];


  const marketingHits =
    strongMarketingSignals.filter(
      signal =>
        combined.includes(signal)
    );


  if (marketingHits.length) {
    score += Math.min(
      3,
      marketingHits.length * 2
    );
    reasons.push(
      ...marketingHits.slice(0, 2)
    );
  }


  const advertising =
    score >= 5;


  return {
    advertising,
    score,
    reason:
      reasons.join(", ") ||
      "keine eindeutigen Werbe-Signale"
  };
}


async function autoMoveObviousAdvertising() {

  const token =
    await getGmailAccessToken();


  const listResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox%20is%3Aunread&maxResults=10",
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        },
        signal:
          timeoutSignal(10000)
      }
    );


  const listData =
    await listResponse.json();


  if (!listResponse.ok) {
    throw new Error(
      "Werbe-Mail-Prüfung konnte den Posteingang nicht lesen."
    );
  }


  const moved =
    [];


  for (
    const ref of
    listData.messages || []
  ) {

    if (
      advertisingCheckedEmailIds.has(
        ref.id
      )
    ) {
      continue;
    }


    advertisingCheckedEmailIds.add(
      ref.id
    );


    try {

      const response =
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Id&metadataHeaders=Precedence`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`
            },
            signal:
              timeoutSignal(10000)
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        continue;
      }


      const headers =
        data.payload?.headers || [];


      const email = {
        id:
          ref.id,
        subject:
          getAdvertisingHeader(
            headers,
            "Subject"
          ) || "(kein Betreff)",
        from:
          getAdvertisingHeader(
            headers,
            "From"
          ) || "unbekannt",
        snippet:
          data.snippet || "",
        listUnsubscribe:
          getAdvertisingHeader(
            headers,
            "List-Unsubscribe"
          ),
        listId:
          getAdvertisingHeader(
            headers,
            "List-Id"
          ),
        precedence:
          getAdvertisingHeader(
            headers,
            "Precedence"
          )
      };


      const classification =
        classifyObviousAdvertising(
          email
        );


      if (
        !classification.advertising
      ) {
        continue;
      }


      await moveGmailMessageToBearbeitet(
        email.id
      );


      moved.push({
        id:
          email.id,
        from:
          email.from,
        subject:
          email.subject,
        score:
          classification.score,
        reason:
          classification.reason
      });


      console.log(
        "[GMAIL AUTO-WERBUNG] → Bearbeitet:",
        email.subject,
        classification.reason
      );

    } catch (error) {

      console.warn(
        "[GMAIL AUTO-WERBUNG ERROR]",
        ref.id,
        error
      );
    }
  }


  return moved;
}


async function getUnreadEmails() {

  const token =
    await getGmailAccessToken();


  const listResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox%20is%3Aunread&maxResults=10",
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
   GMAIL · LETZTE 5 IM POSTEINGANG
   Gelesen + ungelesen, aber nur Nachrichten, die aktuell noch
   im Gmail-Posteingang liegen.
   ========================================================= */

async function getLatestInboxEmails() {

  const token =
    await getGmailAccessToken();


  const listResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox&maxResults=5",
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


  if (!listResponse.ok) {
    throw new Error(
      "Posteingang konnte nicht gelesen werden."
    );
  }


  const emails = [];


  for (
    const ref of
    listData.messages || []
  ) {

    try {

      const response =
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
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


      if (!response.ok) {
        continue;
      }


      const headers =
        data.payload?.headers || [];


      const getHeader =
        name =>
          headers.find(
            header =>
              String(header.name || "")
                .toLowerCase() ===
              String(name || "")
                .toLowerCase()
          )?.value || "";


      emails.push({
        id:
          ref.id,
        threadId:
          data.threadId || null,
        from:
          getHeader("From") ||
          "unbekannt",
        subject:
          getHeader("Subject") ||
          "(kein Betreff)",
        date:
          getHeader("Date") ||
          null,
        internalDate:
          data.internalDate ||
          null,
        snippet:
          data.snippet ||
          "",
        unread:
          Array.isArray(data.labelIds) &&
          data.labelIds.includes("UNREAD")
      });

    } catch (error) {
      console.warn(
        "[GMAIL INBOX SINGLE ERROR]",
        error
      );
    }
  }


  return emails;
}


/* =========================================================
   GMAIL · MAIL-KONTEXT / VOLLANSICHT / ANTWORTEN
   ========================================================= */

function decodeGmailBase64Url(value) {

  if (!value) {
    return "";
  }


  const normalized =
    String(value)
      .replace(/-/g, "+")
      .replace(/_/g, "/");


  const padding =
    "=".repeat(
      (4 - normalized.length % 4) % 4
    );


  return Buffer
    .from(
      normalized + padding,
      "base64"
    )
    .toString("utf8");
}


function encodeGmailBase64Url(value) {

  return Buffer
    .from(
      String(value || ""),
      "utf8"
    )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function stripHtmlToText(value) {

  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}


function getGmailHeader(headers, name) {

  return (
    headers || []
  ).find(
    header =>
      String(header?.name || "")
        .toLowerCase() ===
      String(name || "")
        .toLowerCase()
  )?.value || "";
}


function collectGmailBodies(part, result) {

  if (!part) {
    return;
  }


  const mimeType =
    String(part.mimeType || "")
      .toLowerCase();


  const data =
    part.body?.data;


  if (data) {

    const decoded =
      decodeGmailBase64Url(data);


    if (
      mimeType === "text/plain"
    ) {
      result.plain.push(decoded);
    }
    else if (
      mimeType === "text/html"
    ) {
      result.html.push(decoded);
    }
  }


  for (
    const child of
    part.parts || []
  ) {
    collectGmailBodies(
      child,
      result
    );
  }
}


async function getGmailMessageById(messageId) {

  const id =
    String(messageId || "")
      .trim();


  if (!id) {
    throw new Error(
      "Keine Gmail-Message-ID angegeben."
    );
  }


  const token =
    await getGmailAccessToken();


  const response =
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        },
        signal:
          timeoutSignal(
            15000
          )
      }
    );


  const data =
    await response.json();


  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "E-Mail konnte nicht gelesen werden."
    );
  }


  const headers =
    data.payload?.headers || [];


  const bodies = {
    plain: [],
    html: []
  };


  collectGmailBodies(
    data.payload,
    bodies
  );


  let body =
    bodies.plain
      .filter(Boolean)
      .join("\n\n")
      .trim();


  if (!body) {
    body =
      stripHtmlToText(
        bodies.html
          .filter(Boolean)
          .join("\n\n")
      );
  }


  if (!body) {
    body =
      String(
        data.snippet ||
        ""
      ).trim();
  }


  return {
    id:
      data.id,
    threadId:
      data.threadId ||
      null,
    labelIds:
      data.labelIds ||
      [],
    unread:
      Array.isArray(data.labelIds) &&
      data.labelIds.includes("UNREAD"),
    from:
      getGmailHeader(
        headers,
        "From"
      ) || "unbekannt",
    replyTo:
      getGmailHeader(
        headers,
        "Reply-To"
      ) || "",
    to:
      getGmailHeader(
        headers,
        "To"
      ) || "",
    subject:
      getGmailHeader(
        headers,
        "Subject"
      ) || "(kein Betreff)",
    date:
      getGmailHeader(
        headers,
        "Date"
      ) || null,
    messageIdHeader:
      getGmailHeader(
        headers,
        "Message-ID"
      ) ||
      getGmailHeader(
        headers,
        "Message-Id"
      ) ||
      "",
    references:
      getGmailHeader(
        headers,
        "References"
      ) || "",
    snippet:
      data.snippet ||
      "",
    body:
      body.slice(0, 30000)
  };
}


async function findGmailMessage({
  message_id = "",
  sender_query = "",
  search_query = "",
  scope = "inbox"
} = {}) {

  if (
    String(message_id || "")
      .trim()
  ) {
    return getGmailMessageById(
      message_id
    );
  }


  const token =
    await getGmailAccessToken();


  const queryParts = [];


  if (
    scope !== "all"
  ) {
    queryParts.push(
      "in:inbox"
    );
  }


  const sender =
    String(sender_query || "")
      .trim();


  if (sender) {
    queryParts.push(
      `from:${sender}`
    );
  }


  const freeQuery =
    String(search_query || "")
      .trim();


  if (freeQuery) {
    queryParts.push(
      freeQuery
    );
  }


  const q =
    queryParts.join(" ") ||
    "in:inbox";


  const listUrl =
    new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    );


  listUrl.searchParams.set(
    "q",
    q
  );


  listUrl.searchParams.set(
    "maxResults",
    "1"
  );


  const response =
    await fetch(
      listUrl,
      {
        headers: {
          Authorization:
            `Bearer ${token}`
        },
        signal:
          timeoutSignal(
            12000
          )
      }
    );


  const data =
    await response.json();


  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "E-Mail-Suche fehlgeschlagen."
    );
  }


  const id =
    data.messages?.[0]?.id;


  if (!id) {
    throw new Error(
      "Keine passende E-Mail gefunden."
    );
  }


  return getGmailMessageById(id);
}


function extractEmailAddress(value) {

  const text =
    String(value || "")
      .trim();


  const angle =
    text.match(/<([^>]+)>/);


  return (
    angle?.[1] ||
    text
  ).trim();
}


function ensureReplySubject(subject) {

  const clean =
    String(subject || "")
      .trim();


  if (
    /^re:/i.test(clean)
  ) {
    return clean;
  }


  return `Re: ${clean || "Ihre Nachricht"}`;
}


async function createGmailReplyDraft(
  messageId,
  instruction
) {

  const original =
    await getGmailMessageById(
      messageId
    );


  const recipient =
    extractEmailAddress(
      original.replyTo ||
      original.from
    );


  if (!recipient) {
    throw new Error(
      "Empfänger der Antwort konnte nicht ermittelt werden."
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
                .OPENAI_TEXT_MODEL ||
              "gpt-5.6-terra",
            instructions:
              `Formuliere eine professionelle, natürliche deutsche Antwort-E-Mail für Druckelite24.\n` +
              `Antworte nur als gültiges JSON mit dem Feld body.\n` +
              `Keine erfundenen Fakten, Preise, Zusagen oder Liefertermine.\n` +
              `Wenn die Anweisung des Nutzers etwas nicht vorgibt, bleibe neutral und knapp.`,
            input:
              `Kundenmail:\nAbsender: ${original.from}\nBetreff: ${original.subject}\nInhalt:\n${original.body}\n\n` +
              `Anweisung von Mattl:\n${String(instruction || "Bitte professionell antworten.")}`,
            reasoning: {
              effort:
                "low"
            },
            text: {
              format: {
                type:
                  "json_schema",
                name:
                  "gmail_reply_draft",
                strict:
                  true,
                schema: {
                  type:
                    "object",
                  properties: {
                    body: {
                      type:
                        "string"
                    }
                  },
                  required: [
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


  const aiData =
    await response.json();


  if (!response.ok) {
    throw new Error(
      aiData?.error?.message ||
      "Antwortentwurf konnte nicht erstellt werden."
    );
  }


  const parsed =
    JSON.parse(
      extractResponseText(
        aiData
      )
    );


  const subject =
    ensureReplySubject(
      original.subject
    );


  const replyBody =
    String(parsed.body || "")
      .trim();


  const headers = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit"
  ];


  if (
    original.messageIdHeader
  ) {
    headers.push(
      `In-Reply-To: ${original.messageIdHeader}`
    );


    const references =
      `${original.references || ""} ${original.messageIdHeader}`
        .trim();


    headers.push(
      `References: ${references}`
    );
  }


  const raw =
    encodeGmailBase64Url(
      `${headers.join("\r\n")}\r\n\r\n${replyBody}`
    );


  const token =
    await getGmailAccessToken();


  const draftResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method:
          "POST",
        headers: {
          Authorization:
            `Bearer ${token}`,
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
            message: {
              threadId:
                original.threadId ||
                undefined,
              raw
            }
          }),
        signal:
          timeoutSignal(
            15000
          )
      }
    );


  const draftData =
    await draftResponse.json();


  if (!draftResponse.ok) {
    throw new Error(
      draftData?.error?.message ||
      "Gmail-Entwurf konnte nicht gespeichert werden."
    );
  }


  lastCreatedGmailDraftId =
    draftData.id;


  return {
    gmail_draft_id:
      draftData.id,
    message_id:
      original.id,
    thread_id:
      original.threadId,
    to:
      recipient,
    subject,
    body:
      replyBody,
    created_in_gmail:
      true,
    sent:
      false
  };
}


async function sendGmailDraft(
  draftId,
  confirmationText
) {

  const id =
    String(
      draftId ||
      lastCreatedGmailDraftId ||
      ""
    )
      .trim();


  if (!id) {
    throw new Error(
      "Kein Gmail-Entwurf zum Senden ausgewählt."
    );
  }


  const confirmation =
    String(confirmationText || "")
      .trim();


  if (
    !/\b(senden|abschicken|versenden)\b/i.test(
      confirmation
    )
  ) {
    throw new Error(
      "Senden abgebrochen: Es fehlt Mattls ausdrücklicher Sende-Befehl."
    );
  }


  const token =
    await getGmailAccessToken();


  const response =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
      {
        method:
          "POST",
        headers: {
          Authorization:
            `Bearer ${token}`,
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
            id
          }),
        signal:
          timeoutSignal(
            15000
          )
      }
    );


  const data =
    await response.json();


  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "E-Mail konnte nicht gesendet werden."
    );
  }


  if (
    id ===
      lastCreatedGmailDraftId
  ) {
    lastCreatedGmailDraftId =
      null;
  }


  return {
    sent:
      true,
    message_id:
      data.id ||
      null,
    thread_id:
      data.threadId ||
      null
  };
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
  instruction,
  recipient
) {

  const to =
    String(recipient || "")
      .trim();


  if (!to) {
    throw new Error(
      "Für eine neue E-Mail fehlt der Empfänger. Frage Mattl zuerst, an wen die Mail gehen soll."
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


  const subject =
    String(
      parsed.subject || ""
    ).trim();


  const body =
    String(
      parsed.body || ""
    ).trim();


  const raw =
    encodeGmailBase64Url(
      [
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        body
      ].join("\r\n")
    );


  const gmailToken =
    await getGmailAccessToken();


  const draftResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method:
          "POST",
        headers: {
          Authorization:
            `Bearer ${gmailToken}`,
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
            message: {
              raw
            }
          }),
        signal:
          timeoutSignal(
            15000
          )
      }
    );


  const draftData =
    await draftResponse.json();


  if (!draftResponse.ok) {
    throw new Error(
      draftData?.error?.message ||
      "Gmail-Entwurf konnte nicht gespeichert werden."
    );
  }


  lastCreatedGmailDraftId =
    draftData.id;


  return {
    to,
    subject,
    body,
    gmail_draft_id:
      draftData.id,
    created_in_gmail:
      true,
    sent:
      false
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


        case "get_email_message": {

          const email =
            await findGmailMessage({
              message_id:
                args.message_id ||
                "",
              sender_query:
                args.sender_query ||
                "",
              search_query:
                args.search_query ||
                "",
              scope:
                args.scope === "all"
                  ? "all"
                  : "inbox"
            });


          return res.json({
            ok:
              true,
            email,
            result: {
              found:
                true,
              from:
                email.from,
              subject:
                email.subject,
              body:
                email.body,
              instruction:
                "Die vollständige Mail ist im HUD geöffnet. Wenn Mattl ausdrücklich 'lies sie vor' sagt, darfst du den Inhalt natürlich vorlesen."
            }
          });
        }


        case "create_email_reply_draft": {

          if (
            !args.message_id
          ) {
            throw new Error(
              "Keine aktuelle Mail ausgewählt."
            );
          }


          const draft =
            await createGmailReplyDraft(
              args.message_id,
              args.instruction
            );


          return res.json({
            ok:
              true,
            draft,
            gmail_draft_id:
              draft.gmail_draft_id,
            result: {
              created:
                true,
              saved_in_gmail:
                true,
              to:
                draft.to,
              subject:
                draft.subject,
              instruction:
                "Der Antwortentwurf ist in Gmail gespeichert und im HUD sichtbar. Noch NICHT gesendet. Frage Mattl kurz, ob er ihn senden möchte."
            }
          });
        }


        case "send_email_draft": {

          const sent =
            await sendGmailDraft(
              args.draft_id ||
                lastCreatedGmailDraftId,
              args.confirmation_text
            );


          return res.json({
            ok:
              true,
            sent,
            result: {
              sent:
                true,
              instruction:
                "Die E-Mail wurde gesendet. Bestätige das Mattl kurz."
            }
          });
        }


        case "move_email_to_bearbeitet": {

          if (!args.message_id) {
            throw new Error(
              "Keine aktuelle Mail ausgewählt."
            );
          }


          const moved =
            await moveGmailMessageToBearbeitet(
              args.message_id
            );


          return res.json({
            ok:
              true,
            moved,
            result: {
              moved:
                true,
              label:
                "Bearbeitet",
              instruction:
                "Die ausgewählte Mail wurde nach Bearbeitet verschoben. Bestätige das Mattl kurz."
            }
          });
        }


        case "get_daily_briefing": {

          const briefing =
            await getJarvisDailyBriefing();


          return res.json({
            ok:
              true,
            briefing,
            result: {
              ...briefing,
              instruction:
                "Gib Mattl jetzt ein ausführliches, gut gegliedertes deutsches Business-Briefing. Beginne direkt mit dem Überblick. Nenne ungelesene Mails, Shopify heute, Shopify gestern/Vortag und Wetter. Offene Bestellungen nicht erwähnen. Formuliere Zahlen natürlich auf Deutsch, z. B. bei 1: 'eine ungelesene Mail' und 'eine Bestellung', niemals 'eins ungelesene Mail'. Hebe wichtige Kunden-/Angebotsmails hervor. Schließe mit 2 bis 4 konkreten Prioritäten für heute."
            }
          });
        }


        case "get_whatsapp_conversations":

          data = {
            conversations:
              await getSuperchatConversations(
                20
              )
          };

          break;


        case "get_whatsapp_conversation": {

          const conversation =
            await getSuperchatConversation(
              args.conversation_id
            );

          return res.json({
            ok:
              true,
            conversation,
            result: {
              found:
                true,
              name:
                conversation.name,
              preview:
                conversation.preview,
              instruction:
                "Der ausgewählte WhatsApp-Chat ist geladen. Beantworte Mattls Frage anhand dieser Daten und erfinde nichts."
            }
          });
        }


        case "create_whatsapp_reply_draft": {

          const draft =
            await createSuperchatReplyDraft(
              args.conversation_id,
              args.instruction
            );

          return res.json({
            ok:
              true,
            whatsapp_draft:
              draft,
            result: {
              created:
                true,
              sent:
                false,
              contact_name:
                draft.contact_name,
              text:
                draft.text,
              instruction:
                "WhatsApp-Entwurf ist fertig, aber noch NICHT gesendet. Frage Mattl kurz, ob er ihn senden möchte."
            }
          });
        }


        case "send_whatsapp_draft": {

          const sent =
            await sendSuperchatDraft(
              args.confirmation_text
            );

          return res.json({
            ok:
              true,
            whatsapp_sent:
              sent,
            result:
              sent
          });
        }


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
              args.instruction,
              args.to
            );


          return res.json({

            ok:
              true,

            draft,

            gmail_draft_id:
              draft.gmail_draft_id,

            result: {

              created:
                true,

              saved_in_gmail:
                true,

              to:
                draft.to,

              subject:
                draft.subject,

              instruction:
                "Der vollständige Entwurf wird im HUD angezeigt und ist als echter Gmail-Entwurf gespeichert. Noch NICHT gesendet. Frage Mattl kurz, ob er ihn senden möchte."
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
);/* =========================================================
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

let proactiveBaselineInitialized =
  false;


app.get(
  "/api/gmail-message/:id",
  async (
    req,
    res
  ) => {

    try {

      const email =
        await getGmailMessageById(
          req.params.id
        );


      return res.json({
        ok:
          true,
        email
      });

    } catch (error) {

      return res
        .status(500)
        .json({
          ok:
            false,
          error:
            error.message ||
            "E-Mail konnte nicht geöffnet werden."
        });
    }
  }
);


app.get(
  "/api/gmail-inbox",
  async (
    req,
    res
  ) => {

    try {

      if (
        !isGmailConfigured()
      ) {
        return res
          .status(503)
          .json({
            ok: false,
            error:
              "Gmail ist nicht konfiguriert."
          });
      }


      const emails =
        await getLatestInboxEmails();


      return res.json({
        ok: true,
        emails:
          emails.slice(0, 5)
      });

    } catch (error) {

      console.warn(
        "[GMAIL INBOX API ERROR]",
        error
      );


      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message ||
            "Posteingang konnte nicht geladen werden."
        });
    }
  }
);


app.post(
  "/api/jarvis-checkin",

  async (
    req,
    res
  ) => {

    try {


      /* Beim ersten Hintergrund-Check nur aktuellen Stand merken.
         Keine bestehenden Mails/Bestellungen beim Start vorlesen. */
      if (
        !proactiveBaselineInitialized
      ) {

        try {

          if (
            isGmailConfigured()
          ) {

            const baselineEmails =
              await getUnreadEmails();


            for (
              const email of
              baselineEmails
            ) {
              notifiedEmailIds.add(
                email.id
              );
            }
          }


          const baselineOpenOrders =
            await getShopifyOpenOrders();


          lastOpenOrdersNotice = {
            count:
              baselineOpenOrders.count || 0,
            at:
              Date.now()
          };

        } catch (error) {

          console.warn(
            "[PROACTIVE BASELINE ERROR]",
            error
          );
        }


        proactiveBaselineInitialized =
          true;


        return res.json({
          ok:
            true,
          hasNotice:
            false
        });
      }


      /* Gmail */

      if (
        isGmailConfigured()
      ) {

        try {

          const autoMovedAdvertising =
            await autoMoveObviousAdvertising();


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
                `${
                  fresh.length === 1
                    ? "Mattl, du hast eine neue ungelesene Mail."
                    : `Mattl, du hast ${fresh.length} neue ungelesene Mails.`
                }${
                  offerCount === 1
                    ? " Eine davon sieht nach einer Angebots- oder Preisanfrage aus."
                    : offerCount > 1
                      ? ` ${offerCount} davon sehen nach Angebots- oder Preisanfragen aus.`
                      : ""
                }${
                  autoMovedAdvertising.length === 1
                    ? " Zusätzlich habe ich eine eindeutige Werbemail nach Bearbeitet verschoben."
                    : autoMovedAdvertising.length > 1
                      ? ` Zusätzlich habe ich ${autoMovedAdvertising.length} eindeutige Werbemails nach Bearbeitet verschoben.`
                      : ""
                }`
            });
          }


          if (
            autoMovedAdvertising.length
          ) {

            return res.json({
              ok:
                true,
              hasNotice:
                true,
              text:
                autoMovedAdvertising.length === 1
                  ? "Mattl, ich habe eine eindeutige Werbemail automatisch nach Bearbeitet verschoben."
                  : `Mattl, ich habe ${autoMovedAdvertising.length} eindeutige Werbemails automatisch nach Bearbeitet verschoben.`
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


      /* Offene Shopify-Bestellungen werden bewusst nicht proaktiv vorgelesen. */


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

      realtime_output:
        "text",

      vad:
        "semantic_vad",

      vad_eagerness:
        "low",

      noise_reduction:
        process.env
          .OPENAI_NOISE_REDUCTION ||
        "far_field",

      realtime_model:
        process.env
          .OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1",

      voice_engine:
        "ElevenLabs",

      elevenlabs:
        Boolean(
          process.env
            .ELEVENLABS_API_KEY
        ),

      elevenlabs_voice_id:
        process.env
          .ELEVENLABS_VOICE_ID ||
        "Vje4UYe2YPbNqyQwJGra",

      elevenlabs_model:
        process.env
          .ELEVENLABS_MODEL ||
        "eleven_flash_v2_5",

      elevenlabs_websocket_auth:
        "single_use_token",

      elevenlabs_inactivity_timeout:
        180,

      web_model:
        process.env
          .OPENAI_WEB_MODEL ||
        "gpt-5.6",

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

   NICHT LÖSCHEN.
   RENDER BRAUCHT DIESEN BLOCK.
   ========================================================= */


/* =========================================================
   SUPERCHAT SAFE DIAGNOSTIC
   Zeigt nur Feldnamen / IDs / Typen, keine API Keys,
   keine Nachrichtentexte und keine personenbezogenen Inhalte.
   ========================================================= */

function safeShape(value, depth = 0) {

  if (depth > 3) {
    return typeof value;
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      first:
        value.length
          ? safeShape(value[0], depth + 1)
          : null
    };
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const out = {};

    for (
      const key of
      Object.keys(value)
        .slice(0, 30)
    ) {
      const item =
        value[key];

      if (
        item === null ||
        item === undefined
      ) {
        out[key] = item;
      }
      else if (
        typeof item === "string"
      ) {
        out[key] = {
          type: "string",
          length: item.length
        };
      }
      else if (
        typeof item === "number" ||
        typeof item === "boolean"
      ) {
        out[key] = {
          type: typeof item
        };
      }
      else {
        out[key] =
          safeShape(
            item,
            depth + 1
          );
      }
    }

    return out;
  }

  return {
    type: typeof value
  };
}


app.get(
  "/api/superchat-diagnostic",
  async (
    req,
    res
  ) => {

    try {

      const [
        conversationsRaw,
        contactsRaw
      ] =
        await Promise.all([
          superchatRequest(
            "/conversations?limit=5"
          ),
          superchatRequest(
            "/contacts?limit=5"
          )
            .catch(
              error => ({
                diagnostic_error:
                  error.message
              })
            )
        ]);

      return res.json({
        ok: true,
        configured:
          isSuperchatConfigured(),
        conversations_shape:
          safeShape(
            conversationsRaw
          ),
        contacts_shape:
          safeShape(
            contactsRaw
          )
      });

    } catch (
      error
    ) {

      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.message ||
            "Diagnose fehlgeschlagen."
        });
    }
  }
);


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
      "Realtime Output: TEXT"
    );


    console.log(
      "Voice Engine: ElevenLabs"
    );


    console.log(
      `ElevenLabs Voice ID: ${
        process.env
          .ELEVENLABS_VOICE_ID ||
        "Vje4UYe2YPbNqyQwJGra"
      }`
    );


    console.log(
      `ElevenLabs Modell: ${
        process.env
          .ELEVENLABS_MODEL ||
        "eleven_flash_v2_5"
      }`
    );


    console.log(
      `ElevenLabs: ${
        process.env
          .ELEVENLABS_API_KEY
          ? "verbunden"
          : "nicht verbunden"
      }`
    );


    console.log(
      "ElevenLabs WebSocket Auth: single_use_token"
    );


    console.log(
      "ElevenLabs Inactivity Timeout: 180 Sekunden"
    );


    console.log(
      "VAD: semantic_vad / low"
    );


    console.log(
      `Noise Reduction: ${
        process.env
          .OPENAI_NOISE_REDUCTION ||
        "far_field"
      }`
    );


    console.log(
      `Web Modell: ${
        process.env
          .OPENAI_WEB_MODEL ||
        "gpt-5.6"
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
