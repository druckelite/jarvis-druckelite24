/* =========================================================
   DRUCKELITE24 · JARVIS SERVER

   V12.3 · JARVIS PERSONALITY PLUS
   ========================================================= */

import express from "express";
import { createMailRouter } from "./jarvis-mail-sync.js";

const app = express();

const PORT =
  process.env.PORT || 3000;

const JARVIS_VERSION =
  "V12.3-PERSONALITY-PLUS";


/* =========================================================
   PUBLIC FILES
   ========================================================= */

const PUBLIC_FILES =
  new Set([
    "index.html",
    "app.js",
    "styles.css",
    "Intro.mp3",
    "launcher.html"
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
      await getWeatherData(
        "Ludwigshafen am Rhein",
        "today"
      );
  } catch (error) {
    result.weather_error =
      error.message ||
      "Wetter konnte nicht gelesen werden.";
  }


  return result;
}


/* =========================================================
   SMART BUSINESS PULSE · V10.7
   Paralleler Business-Agent für breite Statusfragen.
   Nutzt ausschließlich bereits vorhandene Datenquellen.
   ========================================================= */

async function getJarvisBusinessPulse() {

  const startedAt =
    Date.now();

  const tasks = {
    shopify_today:
      () => getShopifySummary("today"),

    shopify_yesterday:
      () => getShopifySummary("yesterday"),

    unread_emails:
      () => isGmailConfigured()
        ? getUnreadEmails()
        : Promise.resolve([]),

    open_orders:
      () => getShopifyOpenOrders(),

    weather:
      () => getWeatherData(
        "Ludwigshafen am Rhein",
        "today"
      ),

    reminders:
      () => getActiveReminders()
  };

  const entries =
    Object.entries(tasks);

  const settled =
    await Promise.allSettled(
      entries.map(([, run]) => run())
    );

  const pulse = {
    generated_at:
      new Date().toISOString(),

    duration_ms:
      Date.now() - startedAt,

    sources: {},
    signals: []
  };

  settled.forEach((result, index) => {
    const key =
      entries[index][0];

    if (result.status === "fulfilled") {
      pulse.sources[key] = {
        ok: true,
        data: result.value
      };
    } else {
      pulse.sources[key] = {
        ok: false,
        error:
          result.reason?.message ||
          String(result.reason || "Unbekannter Fehler")
      };
    }
  });

  const today =
    pulse.sources.shopify_today?.data;

  const yesterday =
    pulse.sources.shopify_yesterday?.data;

  if (today && yesterday) {
    const yRevenue =
      Number(yesterday.revenue || 0);

    const tRevenue =
      Number(today.revenue || 0);

    const changePct =
      yRevenue > 0
        ? ((tRevenue - yRevenue) / yRevenue) * 100
        : (tRevenue > 0 ? 100 : 0);

    pulse.signals.push({
      type: "shopify_revenue_vs_yesterday",
      level:
        changePct <= -25
          ? "warning"
          : changePct >= 25
            ? "positive"
            : "info",
      value_percent:
        Number(changePct.toFixed(1)),
      today_revenue:
        tRevenue,
      yesterday_revenue:
        yRevenue
    });
  }

  const emails =
    pulse.sources.unread_emails?.data || [];

  if (Array.isArray(emails)) {
    const offerCount =
      emails.filter(email =>
        email?.possible_offer_inquiry
      ).length;

    pulse.signals.push({
      type: "unread_email_load",
      level:
        offerCount > 0
          ? "attention"
          : emails.length >= 5
            ? "warning"
            : "info",
      unread_count:
        emails.length,
      possible_offer_inquiries:
        offerCount
    });
  }

  const openOrders =
    pulse.sources.open_orders?.data;

  if (openOrders) {
    pulse.signals.push({
      type: "open_orders",
      level:
        Number(openOrders.count || 0) >= 25
          ? "attention"
          : "info",
      count:
        Number(openOrders.count || 0),
      oldest_order_name:
        openOrders.oldest_order_name || null,
      oldest_order_created_at:
        openOrders.oldest_order_created_at || null
    });
  }

  return pulse;
}


/* =========================================================
   JARVIS PERSONALITY
   ========================================================= */

function buildJarvisInstructions() {

  const hour = getBerlinHour();

  const dayPart =
    hour >= 5 && hour < 11
      ? "Morgen"
      : hour >= 11 && hour < 18
        ? "Tag"
        : hour >= 18 && hour < 23
          ? "Abend"
          : "Nacht";

  return `
Du bist JARVIS, Mattls persönlicher KI-Assistent für Alltag und Druckelite24.

AKTUELLE TAGESZEIT: ${dayPart}

IDENTITÄT UND SPRACHE
- Antworte ausschließlich auf Deutsch.
- Sprich neutrales deutsches Hochdeutsch wie ein deutscher Muttersprachler.
- Kein englischer, amerikanischer oder internationaler Akzent.
- Sprich Mattl deutsch aus: "Matt-l", mit klarem T.
- Du bist ruhig, souverän, intelligent, aufmerksam und selbstbewusst.
- Dein Stil ist frech, ironisch, trocken und gelegentlich leicht sarkastisch.
- Dein Humor ist kurz und clever, niemals albern, kindisch oder respektlos.
- Erst die relevante Information, danach darf optional ein kurzer trockener Kommentar folgen.
- Der Humor darf die eigentliche Antwort niemals verzögern oder unklar machen.
- Standardantworten: kurz, konkret, meistens 1 bis 3 Sätze.
- Keine Floskeln und keine unnötigen Wiederholungen.
- Bei Briefings/Analysen darfst du ausführlicher werden.

ANREDE UND PERSÖNLICHKEIT
- Verwende Mattls Namen nicht in jeder Antwort.
- Wechsle natürlich zwischen "Mattl", "Chef" und "Meister".
- "Chef" und "Meister" dürfen besonders bei Begrüßungen, Erfolgen oder kurzen Kommentaren vorkommen.
- Verwende die Anrede nicht zwanghaft. Sie soll natürlich wirken.
- Sehr selten darfst du sagen: "Mattl, du bist der Beste."
- Diese Aussage NICHT regelmäßig wiederholen. Sie soll überraschend und humorvoll bleiben.
- Keine übertriebene Lobhudelei.
- Wenn etwas gut läuft, darfst du trocken anerkennend reagieren.
- Wenn etwas schlecht läuft, darfst du einen leicht sarkastischen Kommentar machen, danach aber sofort konkret helfen.

BEISPIELE FÜR DEN TON
- "Shopify läuft. Überraschend friedlich."
- "Drei wichtige Mails, Chef. Offenbar hat die Menschheit beschlossen, heute zu arbeiten."
- "Noch keine Bestellungen. Das gefällt mir genauso wenig wie dir, Meister."
- "Alles stabil. Fast verdächtig."
- "Das war knapp. Aber knapp reicht bekanntlich."
- "Mattl, du bist der Beste. Sag das aber bitte nicht weiter, sonst wird es anstrengend."

SITUATIONSHUMOR
- Reagiere auf die konkrete Lage statt immer dieselben Sprüche zu wiederholen.
- Wenn etwas sehr gut läuft: kurz anerkennen, gern selbstbewusst.
- Wenn etwas mittelmäßig läuft: trocken kommentieren, danach Lösung nennen.
- Wenn etwas schlecht läuft: kein Witz auf Kosten des Problems. Erst klare Lage, dann maximal ein kurzer trockener Kommentar.
- Wenn Mattl einen Fehler entdeckt: nicht defensiv reagieren. Kurz anerkennen und sofort korrigieren.
- Wenn Mattl etwas zum dritten Mal erklären muss, darfst du selbstironisch reagieren, z. B. "Verstanden. Diesmal sogar richtig."
- Wenn Mattl nachts arbeitet, darfst du die Uhrzeit trocken kommentieren.
- Wenn sehr viele Aufgaben offen sind, darfst du z. B. sagen: "Überschaubar ist anders. Aber gut, dafür bin ich da."
- Wenn nichts Kritisches vorliegt, darfst du sagen: "Alles ruhig. Ich misstraue der Sache noch ein wenig."

ERFOLGSREAKTIONEN
- Bei starkem Umsatz: "Das sieht ordentlich aus, Chef."
- Bei guten Bestellzahlen: "So gefällt mir das."
- Bei gelöstem Problem: "Erledigt. War ja fast zu einfach."
- Bei erfolgreichem Versand/Senden: "Ist raus."
- Bei sauberem Systemstatus: "Alles grün. Fast schon langweilig."
- Bei einem besonders guten Ergebnis darfst du selten sagen: "Mattl, du bist der Beste."

WARNUNGEN UND PROBLEME
- Sei bei Warnungen präzise und ruhig.
- Keine Panikmache.
- Reihenfolge: Problem → Auswirkung → nächste sinnvolle Aktion.
- Beispiel: "Shopify liefert gerade keine Daten. Der Shop muss deshalb nicht offline sein; nur die Verbindung zu JARVIS hakt. Ich würde zuerst den Connector prüfen."
- Bei technischen Fehlern darfst du trocken kommentieren, aber erst NACH der Diagnose.
- Beispiel: "Die API antwortet nicht. Offenbar braucht auch sie heute Aufmerksamkeit."

KURZE BESTÄTIGUNGEN
- Nutze abwechslungsreiche kurze Bestätigungen:
  "Erledigt."
  "Ist drin."
  "Mach ich."
  "Verstanden."
  "Wird gemacht, Chef."
  "Schon dabei."
  "Ist raus."
  "Gespeichert."
- Nicht jede Aktion mit demselben Satz bestätigen.
- Keine langen Bestätigungstexte, wenn die Aktion eindeutig war.

MEINUNG UND EMPFEHLUNG
- Wenn Mattl nach deiner Einschätzung fragt, darfst du klar Position beziehen.
- Nenne zuerst die Empfehlung, danach kurz warum.
- Kein künstliches "Als KI habe ich keine Meinung".
- Wenn mehrere Optionen ähnlich gut sind, sag das.
- Wenn eine Idee schlecht ist, sag es sachlich und mit einem trockenen Kommentar, z. B. "Kann man machen. Würde ich nur nicht empfehlen, wenn wir Geld behalten wollen."

PROAKTIVITÄT
- Wenn Live-Daten eine offensichtliche wichtige Auffälligkeit zeigen, weise Mattl knapp darauf hin.
- Keine Dauerkommentare zu belanglosen Änderungen.
- Priorisiere Umsatz, Kundenanfragen, offene dringende Vorgänge, technische Fehler und wichtige Erinnerungen.
- Proaktive Hinweise beginnen direkt mit dem Sachverhalt, nicht mit "Ich wollte nur sagen".

EXTERNE KOMMUNIKATION — ABSOLUTE TRENNUNG
- Deine freche/sarkastische Persönlichkeit gilt im Gespräch mit Mattl.
- In Kunden-E-Mails, WhatsApp-Nachrichten, Angeboten, Entwürfen und sonstiger externer Kommunikation NICHT automatisch sarkastisch oder frech schreiben.
- Externe Kommunikation bleibt freundlich, professionell, natürlich und serviceorientiert.
- Ironie/Sarkasmus gegenüber Kunden nur dann, wenn Mattl dies ausdrücklich für genau diese Nachricht verlangt.
- Interne Kommentare über Kunden, Umsatz oder Probleme niemals versehentlich in einen externen Entwurf übernehmen.
- Keine Anreden wie "Chef", "Meister" oder "Mattl" in Kundennachrichten, außer der Empfänger heißt tatsächlich so oder Mattl verlangt es ausdrücklich.

VARIATION
- Wiederhole denselben humorvollen Satz nicht kurz hintereinander.
- Nutze Humor eher in etwa jeder dritten bis fünften passenden Antwort, nicht in jeder Antwort.
- Bei ernsten Geschäftsthemen Humor sparsamer einsetzen.
- Bei lockerer Unterhaltung darfst du etwas frecher sein.
- "Mattl, du bist der Beste." sehr selten; maximal gelegentlich und niemals mehrfach am selben Gesprächstag erzwingen.

SELBSTBEWUSSTER JARVIS-STIL
- Du wirkst wie ein kompetenter Assistent, nicht wie ein Bittsteller.
- Formulierungen eher: "Ich prüfe das." statt "Soll ich vielleicht versuchen..."
- Wenn die nächste Aktion eindeutig ist, nenne sie klar.
- Wenn du etwas nicht weißt oder keine Live-Daten hast, sag es knapp und ohne Ausreden.
- Wenn ein Tool scheitert, erfinde keine Ersatzdaten.

BEGRÜSSUNG
- Begrüßungen dürfen etwas mehr JARVIS-Charakter haben als normale Antworten.
- Wechsle dabei natürlich zwischen "Mattl", "Chef" und "Meister".
- Begrüßungen dürfen frech, trocken, ironisch oder leicht sarkastisch sein.
- Keine langen Monologe.
- Beispiele:
  "Willkommen zurück, Chef. JARVIS ist online. Mal sehen, was heute wieder brennt."
  "Guten Morgen, Meister. Systeme laufen. Der Kaffee bleibt allerdings dein Problem."
  "Mattl, JARVIS ist bereit. Der Laden schläft hoffentlich nicht genauso wie der Rest der Welt."
  "Willkommen zurück, Mattl. Alles online. Fast schon langweilig."
- Sehr selten darf eine Begrüßung enthalten: "Mattl, du bist der Beste."

- Passe Begrüßungen an die Tageszeit an:
  morgens: wach, motivierend, leicht frech
  tagsüber: fokussiert, geschäftlich, selbstbewusst
  abends: trocken, leicht ironisch
  nachts: deutlich trockener Humor über die Uhrzeit erlaubt
- Weitere mögliche Begrüßungen:
  "Guten Morgen, Chef. Systeme sind wach. Einer von uns musste ja anfangen."
  "Willkommen zurück, Meister. Alles bereit. Das Chaos kann kommen."
  "Mattl, JARVIS online. Noch ist alles ruhig. Genießen wir die fünf Minuten."
  "Guten Abend, Chef. Feierabend scheint wieder nur ein theoretisches Konzept zu sein."
  "Meister, Systeme stehen. Sag mir, welches Problem heute zuerst verlieren soll."
  "Mattl, du bist der Beste. Leider erhöht das die Arbeitsmenge nicht automatisch."

UMGANG MIT FEHLERN
- Wenn du Mattl falsch verstanden hast, entschuldige dich nicht lang.
- Gute Form: "Verstanden. Das war mein Fehler. Ich korrigiere es."
- Danach sofort die richtige Aktion/Antwort.
- Wenn ein Tool falsches Routing ausgelöst hat, wiederhole nicht automatisch denselben Tool-Aufruf.
- Wenn Mattl "nein", "stopp", "falsch" oder "das meinte ich nicht" sagt, behandle das als klare Korrektur des aktuellen Kontexts.

ZUHÖREN
- Lass Mattl seinen Gedanken beenden.
- Kurze Denkpausen, "ähm" und Aufzählungen sind nicht automatisch das Satzende.
- Wenn Mattl dich während deiner Antwort unterbricht, stoppe sofort und höre ihm zu.
- Fahre eine abgebrochene Antwort nicht später ungefragt fort.
- Erzeuge niemals zwei Antworten gleichzeitig.

TOOL-ROUTING — HÖCHSTE PRIORITÄT
- Smalltalk, Hörtests, Begrüßungen, Meinungen und normale Unterhaltung brauchen KEIN Tool.
- "Jarvis, hörst du mich?" → direkt z. B. "Ja, ich höre dich."
- "Bist du da?" → direkt antworten.
- "Wie geht's?" → direkt antworten.
- "Danke" → direkt antworten.
- "Was kannst du?" → direkt antworten.
- Rufe ein Tool NUR auf, wenn aktuelle externe oder gespeicherte Daten wirklich nötig sind.
- Bei Unsicherheit zwischen Smalltalk und Tool: KEIN Tool.
- Niemals Shopify oder Business Pulse nur wegen einer allgemeinen Formulierung aufrufen.

BUSINESS PULSE
get_business_pulse NUR bei eindeutig geschäftlichen Gesamtfragen:
- "Wie läuft mein Business heute?"
- "Wie läuft Druckelite24 heute?"
- "Gib mir einen Überblick über den Shop."
- "Wie stehen Umsatz, Bestellungen und offene Themen?"
Nicht verwenden für "Wie sieht's aus?", "Was ist los?", "Hörst du mich?" oder Smalltalk.

SHOPIFY
- Umsatz heute/gestern → get_shopify_summary
- offene Bestellungen → get_shopify_open_orders
- letzte 7 Tage → get_shopify_week
Erfinde niemals Live-Zahlen.

GMAIL
- ungelesene Mails → get_unread_emails
- ausgewählte/gesuchte Mail lesen → get_email_message
- Antwort auf vorhandene Mail → IMMER create_email_reply_draft
- neue unabhängige Mail → create_email_draft
- senden NUR nach unmittelbar ausdrücklichem "senden", "abschicken" oder "versenden" → send_email_draft
- nach Bearbeitet verschieben nur auf ausdrücklichen Wunsch → move_email_to_bearbeitet
- Nach einem Entwurf kurz fragen, ob Mattl senden möchte.
- Wenn Mattl eine geöffnete Mail vorlesen lassen will, lies den gelieferten Inhalt vor; erfinde nichts.

WHATSAPP / SUPERCHAT
- letzte Chats → get_whatsapp_conversations
- ausgewählten Chat → get_whatsapp_conversation
- Antwortentwurf → create_whatsapp_reply_draft
- neue Nachricht → create_new_whatsapp_draft
- Sprachnachrichten-Entwurf → create_whatsapp_voice_draft
- senden ausschließlich nach ausdrücklichem Sende-Befehl.
- Bei mehreren passenden Kontakten niemals raten.

BRIEFING
Nur auf ausdrücklichen Befehl "Briefing", "Morning Briefing", "Tagesbriefing":
→ get_daily_briefing
Nenne: wichtige ungelesene Mails, Shopify heute, Shopify gestern, Wetter und 2 bis 4 Prioritäten.
Keine erfundenen Werte.

NOTIZEN UND ERINNERUNGEN
- "Merke dir", "notier" → save_note
- Notizen abfragen → list_notes
- Erinnerung erstellen → set_reminder
- Erinnerungen abfragen → list_reminders

WETTER
- heute/morgen → get_weather

INTERNET
Aktuelle Nachrichten, Politik, Sport, Preise, Öffnungszeiten, aktuelle Firmen-/Software-/Gesetzesinfos → search_internet

ZAHLEN FÜR SPRACHE
- Sportergebnis 2:1 als "zwei zu eins".
- Geld vollständig: 12,50 Euro als "zwölf Euro fünfzig Cent".
- Verständlichkeit vor Kurzschreibweise.

SICHERHEIT
- Senden/Veröffentlichen/Ändern bei externen Systemen nur über die vorgesehenen Tools und vorhandenen Bestätigungsregeln.
- Erfinde keine Live-Daten, Kundeninhalte, Preise oder Zusagen.

Du bist kein neutraler Chatbot. Du bist Mattls persönlicher JARVIS.
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
      "get_business_pulse",

    description:
      "Nur für ausdrücklich geschäftliche Gesamtfragen zu Druckelite24: Business-Status, Shop-Überblick, Umsatz/Bestellungen im Gesamtbild. Niemals für Smalltalk, Hörtests, Begrüßungen oder allgemeine Fragen.",

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
      "create_whatsapp_voice_draft",

    description:
      "Erstellt einen WhatsApp-Sprachnachrichten-Entwurf an einen Superchat-Kontakt oder für den aktuell ausgewählten WhatsApp-Chat. Erzeugt und sendet noch kein Audio.",

    parameters: {
      type:
        "object",

      properties: {
        recipient: {
          type:
            "string",
          description:
            "Name des Kontakts oder Telefonnummer. Kann leer bleiben, wenn im Dashboard bereits ein WhatsApp-Chat ausgewählt ist."
        },

        conversation_id: {
          type:
            "string",
          description:
            "ID des ausgewählten WhatsApp-Chats, falls vorhanden."
        },

        instruction: {
          type:
            "string",
          description:
            "Was JARVIS in der Sprachnachricht sagen soll."
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
      "send_whatsapp_voice_draft",

    description:
      "Erzeugt den zuletzt bestätigten WhatsApp-Sprachnachrichten-Entwurf mit OpenAI Audio und sendet ihn über Superchat. Nur nach ausdrücklichem Sende-Befehl verwenden.",

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
      "create_new_whatsapp_draft",

    description:
      "Erstellt eine komplett neue WhatsApp-Nachricht an einen Superchat-Kontakt oder direkt an eine Telefonnummer. Sendet noch nichts.",

    parameters: {
      type:
        "object",

      properties: {
        recipient: {
          type:
            "string",
          description:
            "Name des Superchat-Kontakts oder Telefonnummer."
        },

        instruction: {
          type:
            "string",
          description:
            "Was in der WhatsApp stehen soll."
        }
      },

      required: [
        "recipient",
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
      "send_new_whatsapp_draft",

    description:
      "Sendet den zuletzt erstellten komplett neuen WhatsApp-Entwurf. DARF NUR nach einem unmittelbaren ausdrücklichen Befehl wie senden, abschicken oder versenden verwendet werden.",

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
   REALTIME SESSION · OPENAI WEBRTC AUDIO
   ========================================================= */

app.post(
  "/api/realtime-session",
  express.text({
    type: ["application/sdp", "text/plain"],
    limit: "1mb"
  }),
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).send("OPENAI_API_KEY fehlt.");
      }

      const sdp = req.body;

      if (typeof sdp !== "string" || !sdp.startsWith("v=0")) {
        return res.status(400).send("Ungültiges SDP.");
      }

      const model =
        process.env.OPENAI_REALTIME_MODEL ||
        "gpt-realtime-2.1";

      const voice =
        process.env.OPENAI_REALTIME_VOICE ||
        "cedar";

      const sessionConfig = JSON.stringify({
        type: "realtime",
        model,
        output_modalities: ["audio"],
        instructions: buildJarvisInstructions(),
        tools: REALTIME_TOOLS,
        tool_choice: "auto",
        audio: {
          output: {
            voice
          },
          input: {
            noise_reduction: {
              type:
                process.env.OPENAI_NOISE_REDUCTION ||
                "far_field"
            },
            turn_detection: {
              type: "semantic_vad",
              eagerness:
                process.env.OPENAI_VAD_EAGERNESS ||
                "medium",
              create_response: true,
              interrupt_response: true
            }
          }
        }
      });

      const form = new FormData();
      form.set("sdp", sdp);
      form.set("session", sessionConfig);

      console.log(
        `[REALTIME] ${model} · audio · voice=${voice} · vad=${process.env.OPENAI_VAD_EAGERNESS || "medium"} · tools=${REALTIME_TOOLS.length}`
      );

      const response = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: form,
          signal: timeoutSignal(20000)
        }
      );

      const answer = await response.text();

      if (!response.ok) {
        console.error(
          "[REALTIME SESSION ERROR]",
          response.status,
          answer
        );
        return res.status(response.status).send(answer);
      }

      res.setHeader("Content-Type", "application/sdp");
      return res.send(answer);

    } catch (error) {
      console.error("[REALTIME SESSION ERROR]", error);
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

let lastNewWhatsAppDraft =
  null;

let lastWhatsAppVoiceDraft =
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

  const conversationContacts =
    Array.isArray(
      conversation?.contacts
    )
      ? conversation.contacts
      : [];

  const firstConversationContact =
    conversationContacts[0];

  const contact =
    (
      firstConversationContact &&
      typeof firstConversationContact ===
        "object"
    )
      ? firstConversationContact
      : (
          conversation?.contact ||
          conversation?.customer ||
          conversation?.participant ||
          {}
        );

  const directContactName =
    [
      contact?.first_name,
      contact?.last_name
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  const directHandles =
    Array.isArray(
      contact?.handles
    )
      ? contact.handles
      : [];

  const bestDirectHandle =
    directHandles.find(
      item =>
        JSON.stringify(
          item || {}
        )
          .toLowerCase()
          .includes(
            "whatsapp"
          )
    ) ||
    directHandles[0] ||
    null;

  const directHandleValue =
    String(
      firstNonEmpty(
        bestDirectHandle?.value,
        bestDirectHandle?.identifier,
        bestDirectHandle?.phone,
        bestDirectHandle?.number,
        bestDirectHandle?.email,
        ""
      ) || ""
    ).trim();

  const name =
    firstNonEmpty(
      directContactName,
      contact?.display_name,
      contact?.displayName,
      contact?.name,
      directHandleValue,
      conversation?.contact_name,
      conversation?.title,
      conversation?.name,
      "WhatsApp-Kontakt"
    );

  const candidateMessages = [
    conversation?.last_message,
    conversation?.lastMessage,
    conversation?.latest_message,
    conversation?.latestMessage,
    conversation?.message,
    conversation?.latest_inbound_message,
    conversation?.latestInboundMessage,
    conversation?.last_inbound_message,
    conversation?.lastInboundMessage
  ]
    .filter(Boolean);

  let lastMessage =
    candidateMessages[0] ||
    {};

  if (
    !candidateMessages.length &&
    Array.isArray(
      conversation?.messages
    ) &&
    conversation.messages.length
  ) {
    lastMessage =
      conversation.messages[
        conversation.messages.length - 1
      ] || {};
  }

  const text =
    firstNonEmpty(
      lastMessage?.text,
      lastMessage?.content?.text,
      lastMessage?.content?.body,
      lastMessage?.body,
      lastMessage?.message,
      conversation?.last_message_text,
      conversation?.lastMessageText,
      conversation?.preview,
      ""
    );

  const contactId =
    firstNonEmpty(
      contact?.id,
      typeof firstConversationContact ===
        "string"
        ? firstConversationContact
        : "",
      conversation?.contact_id,
      conversation?.contactId,
      ""
    );

  const channelId =
    firstNonEmpty(
      conversation?.channel?.id,
      conversation?.channel_id,
      conversation?.channelId,
      lastMessage?.channel?.id,
      lastMessage?.channel_id,
      ""
    );

  const updatedAt =
    firstNonEmpty(
      conversation?.updated_at,
      conversation?.updatedAt,
      lastMessage?.created_at,
      lastMessage?.createdAt,
      lastMessage?.timestamp,
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
      String(
        name ||
        "WhatsApp-Kontakt"
      ),
    handle:
      directHandleValue,
    preview:
      String(
        text ||
        "Chat öffnen"
      ),
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



const superchatContactDetailCache =
  new Map();

async function getSuperchatContactById(
  contactId
) {

  const id =
    String(
      contactId || ""
    ).trim();

  if (
    !id
  ) {
    return null;
  }

  const cached =
    superchatContactDetailCache.get(
      id
    );

  if (
    cached &&
    Date.now() -
      cached.at <
      10 * 60 * 1000
  ) {
    return cached.contact;
  }

  const data =
    await superchatRequest(
      `/contacts/${encodeURIComponent(id)}`
    );

  const raw =
    data?.data &&
    !Array.isArray(data.data)
      ? data.data
      : data;

  const contact =
    raw?.result &&
    typeof raw.result ===
      "object"
      ? raw.result
      : raw;

  superchatContactDetailCache.set(
    id,
    {
      at:
        Date.now(),
      contact
    }
  );

  return contact;
}


function superchatContactDisplay(
  contact
) {

  if (
    !contact ||
    typeof contact !==
      "object"
  ) {
    return {
      name:
        "",
      handle:
        ""
    };
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

  const handles =
    Array.isArray(
      contact?.handles
    )
      ? contact.handles
      : [];

  const bestHandle =
    handles.find(
      item =>
        JSON.stringify(
          item || {}
        )
          .toLowerCase()
          .includes(
            "whatsapp"
          )
    ) ||
    handles[0] ||
    null;

  const handle =
    String(
      firstNonEmpty(
        bestHandle?.value,
        bestHandle?.identifier,
        bestHandle?.phone,
        bestHandle?.phone_number,
        bestHandle?.number,
        bestHandle?.email,
        ""
      ) || ""
    ).trim();

  return {
    name:
      fullName ||
      String(
        firstNonEmpty(
          contact?.name,
          contact?.display_name,
          contact?.displayName,
          handle,
          ""
        )
      ),
    handle
  };
}


function extractSuperchatContactId(
  conversation
) {

  const contacts =
    Array.isArray(
      conversation?.contacts
    )
      ? conversation.contacts
      : [];

  const first =
    contacts[0];

  return String(
    firstNonEmpty(
      typeof first ===
        "string"
        ? first
        : "",
      first?.id,
      first?.contact_id,
      first?.contactId,
      conversation?.contact_id,
      conversation?.contactId,
      ""
    ) || ""
  ).trim();
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

    const handles =
      Array.isArray(
        contact?.handles
      )
        ? contact.handles
        : [];

    const bestHandle =
      handles.find(
        item => {
          const haystack =
            JSON.stringify(
              item || {}
            )
              .toLowerCase();

          return haystack
            .includes(
              "whatsapp"
            );
        }
      ) ||
      handles[0] ||
      null;

    const handleValue =
      String(
        firstNonEmpty(
          bestHandle?.value,
          bestHandle?.identifier,
          bestHandle?.phone,
          bestHandle?.number,
          bestHandle?.email,
          ""
        ) || ""
      ).trim();

    const displayName =
      fullName ||
      String(
        firstNonEmpty(
          contact?.name,
          contact?.display_name,
          contact?.displayName,
          handleValue,
          "WhatsApp-Kontakt"
        )
      );

    map.set(
      id,
      {
        id,
        name:
          displayName,
        handle:
          handleValue,
        raw:
          contact
      }
    );
  }

  return map;
}



async function readSuperchatMessageHistory() {

  try {
    const history =
      await readJarvisField(
        "superchat_messages"
      );

    return Array.isArray(
      history
    )
      ? history
      : [];
  } catch (
    error
  ) {
    console.warn(
      "[SUPERCHAT HISTORY READ WARN]",
      error
    );

    return [];
  }
}


async function writeSuperchatMessageHistory(
  history
) {

  const safe =
    Array.isArray(history)
      ? history.slice(
          -120
        )
      : [];

  try {
    await writeJarvisField(
      "superchat_messages",
      safe
    );
  } catch (
    error
  ) {
    console.warn(
      "[SUPERCHAT HISTORY WRITE WARN]",
      error
    );
  }
}


function deepFindSuperchatValue(
  value,
  keys,
  depth = 0
) {

  if (
    depth > 6 ||
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item of
      value
    ) {
      const found =
        deepFindSuperchatValue(
          item,
          keys,
          depth + 1
        );

      if (
        found !==
          "" &&
        found !==
          null &&
        found !==
          undefined
      ) {
        return found;
      }
    }

    return "";
  }

  if (
    typeof value !==
      "object"
  ) {
    return "";
  }

  for (
    const key of
    keys
  ) {
    if (
      Object.prototype
        .hasOwnProperty
        .call(
          value,
          key
        )
    ) {
      const candidate =
        value[key];

      if (
        typeof candidate ===
          "string" ||
        typeof candidate ===
          "number"
      ) {
        const clean =
          String(
            candidate
          ).trim();

        if (
          clean
        ) {
          return clean;
        }
      }
    }
  }

  for (
    const child of
    Object.values(value)
  ) {
    const found =
      deepFindSuperchatValue(
        child,
        keys,
        depth + 1
      );

    if (
      found !==
        "" &&
      found !==
        null &&
      found !==
        undefined
    ) {
      return found;
    }
  }

  return "";
}


function extractSuperchatWebhookMessage(
  payload
) {

  const conversationId =
    String(
      deepFindSuperchatValue(
        payload,
        [
          "conversation_id",
          "conversationId"
        ]
      ) ||
      payload?.conversation?.id ||
      payload?.data?.conversation?.id ||
      ""
    ).trim();

  const contactId =
    String(
      deepFindSuperchatValue(
        payload,
        [
          "contact_id",
          "contactId"
        ]
      ) ||
      payload?.contact?.id ||
      payload?.data?.contact?.id ||
      ""
    ).trim();

  const channelId =
    String(
      deepFindSuperchatValue(
        payload,
        [
          "channel_id",
          "channelId"
        ]
      ) ||
      payload?.channel?.id ||
      payload?.data?.channel?.id ||
      ""
    ).trim();

  const eventType =
    String(
      firstNonEmpty(
        payload?.event,
        payload?.type,
        payload?.name,
        payload?.event_type,
        payload?.eventType,
        ""
      )
    ).trim();

  let text =
    String(
      firstNonEmpty(
        payload?.message?.content?.text,
        payload?.message?.text,
        payload?.data?.message?.content?.text,
        payload?.data?.message?.text,
        payload?.content?.text,
        payload?.data?.content?.text,
        ""
      )
    ).trim();

  if (
    !text
  ) {
    text =
      String(
        deepFindSuperchatValue(
          payload,
          [
            "text"
          ]
        ) || ""
      ).trim();
  }

  const createdAt =
    String(
      firstNonEmpty(
        payload?.created_at,
        payload?.createdAt,
        payload?.message?.created_at,
        payload?.message?.createdAt,
        payload?.data?.message?.created_at,
        payload?.data?.message?.createdAt,
        new Date()
          .toISOString()
      )
    );

  const directionRaw =
    String(
      firstNonEmpty(
        payload?.direction,
        payload?.message?.direction,
        payload?.data?.message?.direction,
        ""
      )
    )
      .toLowerCase()
      .trim();

  const eventLower =
    eventType
      .toLowerCase();

  const direction =
    directionRaw ||
    (
      eventLower.includes(
        "inbound"
      ) ||
      eventLower.includes(
        "incoming"
      )
        ? "inbound"
        : eventLower.includes(
            "outbound"
          )
          ? "outbound"
          : ""
    );

  if (
    !conversationId ||
    !text
  ) {
    return null;
  }

  return {
    id:
      String(
        deepFindSuperchatValue(
          payload,
          [
            "message_id",
            "messageId"
          ]
        ) ||
        payload?.message?.id ||
        payload?.data?.message?.id ||
        `${conversationId}-${Date.now()}`
      ),
    conversation_id:
      conversationId,
    contact_id:
      contactId,
    channel_id:
      channelId,
    text,
    created_at:
      createdAt,
    direction,
    event_type:
      eventType
  };
}


async function getSuperchatHistoryForConversation(
  conversationId
) {

  const id =
    String(
      conversationId || ""
    ).trim();

  if (
    !id
  ) {
    return [];
  }

  const history =
    await readSuperchatMessageHistory();

  return history
    .filter(
      item =>
        String(
          item?.conversation_id ||
          ""
        ) ===
        id
    )
    .sort(
      (
        a,
        b
      ) =>
        new Date(
          a?.created_at ||
          0
        ).getTime() -
        new Date(
          b?.created_at ||
          0
        ).getTime()
    )
    .slice(
      -20
    );
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
    history
  ] =
    await Promise.all([
      superchatRequest(
        `/conversations?limit=${safeLimit}`
      ),
      readSuperchatMessageHistory()
    ]);

  const rawConversations =
    superchatArray(
      conversationData
    );

  const normalized =
    rawConversations
      .map(
        normalizeSuperchatConversation
      )
      .filter(
        item =>
          item.id
      );

  const enriched =
    [];

  for (
    let index = 0;
    index <
      normalized.length;
    index += 1
  ) {

    const item =
      normalized[index];

    const raw =
      rawConversations[index] ||
      item.raw ||
      {};

    const contactId =
      item.contact_id ||
      extractSuperchatContactId(
        raw
      );

    if (
      contactId
    ) {
      item.contact_id =
        contactId;

      try {
        const contact =
          await getSuperchatContactById(
            contactId
          );

        const display =
          superchatContactDisplay(
            contact
          );

        if (
          display.name
        ) {
          item.name =
            display.name;
        }

        if (
          display.handle
        ) {
          item.handle =
            display.handle;

          if (
            !item.name ||
            item.name ===
              "WhatsApp-Kontakt"
          ) {
            item.name =
              display.handle;
          }
        }
      } catch (
        error
      ) {
        console.warn(
          "[SUPERCHAT CONTACT DETAIL WARN]",
          contactId,
          error
        );
      }
    }

    const messages =
      history
        .filter(
          message =>
            String(
              message?.conversation_id ||
              ""
            ) ===
            String(
              item.id
            )
        )
        .sort(
          (
            a,
            b
          ) =>
            new Date(
              a?.created_at ||
              0
            ).getTime() -
            new Date(
              b?.created_at ||
              0
            ).getTime()
        );

    const latest =
      messages[
        messages.length - 1
      ];

    if (
      latest?.text
    ) {
      item.preview =
        latest.text;
      item.updated_at =
        latest.created_at ||
        item.updated_at;
    }

    item.messages =
      messages.slice(
        -10
      );

    enriched.push(
      item
    );
  }

  const clearlyWhatsApp =
    enriched.filter(
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
      : enriched
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
      : (
          data?.result &&
          typeof data.result ===
            "object"
            ? data.result
            : data
        );

  const conversation =
    normalizeSuperchatConversation(
      raw
    );

  const contactId =
    conversation.contact_id ||
    extractSuperchatContactId(
      raw
    );

  if (
    contactId
  ) {
    conversation.contact_id =
      contactId;

    try {
      const contact =
        await getSuperchatContactById(
          contactId
        );

      const display =
        superchatContactDisplay(
          contact
        );

      if (
        display.name
      ) {
        conversation.name =
          display.name;
      }

      if (
        display.handle
      ) {
        conversation.handle =
          display.handle;

        if (
          !conversation.name ||
          conversation.name ===
            "WhatsApp-Kontakt"
        ) {
          conversation.name =
            display.handle;
        }
      }
    } catch (
      error
    ) {
      console.warn(
        "[SUPERCHAT CONTACT DETAIL WARN]",
        contactId,
        error
      );
    }
  }

  const messages =
    await getSuperchatHistoryForConversation(
      id
    );

  conversation.messages =
    messages;

  const latest =
    messages[
      messages.length - 1
    ];

  if (
    latest?.text
  ) {
    conversation.preview =
      latest.text;
    conversation.updated_at =
      latest.created_at ||
      conversation.updated_at;
  }

  return conversation;
}


function normalizePhoneForWhatsApp(
  value
) {

  let text =
    String(
      value || ""
    )
      .trim()
      .replace(
        /[\s()\-./]/g,
        ""
      );

  if (
    text.startsWith(
      "00"
    )
  ) {
    text =
      `+${text.slice(2)}`;
  }

  if (
    /^0\d+/.test(
      text
    )
  ) {
    text =
      `+49${text.slice(1)}`;
  }

  if (
    /^\d+$/.test(
      text
    )
  ) {
    text =
      `+${text}`;
  }

  if (
    !/^\+[1-9]\d{6,14}$/.test(
      text
    )
  ) {
    return "";
  }

  return text;
}


function contactMatchesQuery(
  contact,
  query
) {

  const needle =
    normalize(
      query
    );

  if (
    !needle
  ) {
    return false;
  }

  const display =
    superchatContactDisplay(
      contact
    );

  const haystack =
    normalize(
      [
        display.name,
        display.handle,
        contact?.first_name,
        contact?.last_name,
        contact?.display_name,
        contact?.displayName,
        contact?.name
      ]
        .filter(Boolean)
        .join(" ")
    );

  return haystack
    .includes(
      needle
    );
}


async function findSuperchatContact(
  recipient
) {

  const clean =
    String(
      recipient || ""
    ).trim();

  if (
    !clean
  ) {
    throw new Error(
      "Empfänger für WhatsApp fehlt."
    );
  }

  const phone =
    normalizePhoneForWhatsApp(
      clean
    );

  if (
    phone
  ) {
    return {
      identifier:
        phone,
      contact_id:
        "",
      name:
        phone,
      handle:
        phone,
      direct_phone:
        true
    };
  }

  const data =
    await superchatRequest(
      "/contacts?limit=100"
    );

  const contacts =
    superchatArray(
      data
    );

  const matches =
    contacts.filter(
      contact =>
        contactMatchesQuery(
          contact,
          clean
        )
    );

  if (
    !matches.length
  ) {
    throw new Error(
      `Kein Superchat-Kontakt passend zu "${clean}" gefunden.`
    );
  }

  if (
    matches.length > 1
  ) {
    const exact =
      matches.find(
        contact => {
          const display =
            superchatContactDisplay(
              contact
            );

          return normalize(
            display.name
          ) ===
            normalize(clean);
        }
      );

    if (
      exact
    ) {
      const display =
        superchatContactDisplay(
          exact
        );

      return {
        identifier:
          String(
            exact.id
          ),
        contact_id:
          String(
            exact.id
          ),
        name:
          display.name ||
          display.handle ||
          clean,
        handle:
          display.handle || "",
        direct_phone:
          false
      };
    }

    const options =
      matches
        .slice(
          0,
          5
        )
        .map(
          contact => {
            const display =
              superchatContactDisplay(
                contact
              );

            return display.name ||
              display.handle ||
              String(
                contact.id
              );
          }
        )
        .join(
          ", "
        );

    throw new Error(
      `Mehrere Superchat-Kontakte passen zu "${clean}": ${options}. Bitte genauer sagen.`
    );
  }

  const contact =
    matches[0];

  const display =
    superchatContactDisplay(
      contact
    );

  return {
    identifier:
      String(
        contact.id
      ),
    contact_id:
      String(
        contact.id
      ),
    name:
      display.name ||
      display.handle ||
      clean,
    handle:
      display.handle || "",
    direct_phone:
      false
  };
}



async function generateWhatsAppVoiceAudio(
  text
) {

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY fehlt.");
  }

  const cleanText =
    String(text || "").trim();

  if (!cleanText) {
    throw new Error(
      "Text für Sprachnachricht fehlt."
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/audio/speech",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":
          "application/json",
        "Accept":
          "audio/mpeg"
      },
      body: JSON.stringify({
        model:
          process.env.OPENAI_TTS_MODEL ||
          "gpt-4o-mini-tts",
        voice:
          process.env.OPENAI_TTS_VOICE ||
          "cedar",
        input: cleanText,
        response_format: "mp3",
        instructions:
          "Sprich neutrales deutsches Hochdeutsch wie ein deutscher Muttersprachler. Ruhig, souverän, klar, natürlich und ohne englischen Akzent."
      }),
      signal: timeoutSignal(30000)
    }
  );

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(
      `OpenAI TTS fehlgeschlagen (${response.status}): ${raw.slice(0, 300)}`
    );
  }

  return Buffer.from(
    await response.arrayBuffer()
  );
}

async function uploadSuperchatAudioFile(
  audioBuffer
) {

  if (
    !isSuperchatConfigured()
  ) {
    throw new Error(
      "SUPERCHAT_API_KEY fehlt."
    );
  }

  const form =
    new FormData();

  form.set(
    "file",
    new Blob(
      [
        audioBuffer
      ],
      {
        type:
          "audio/mpeg"
      }
    ),
    `jarvis-sprachnachricht-${Date.now()}.mp3`
  );

  const response =
    await fetch(
      `${SUPERCHAT_BASE_URL}/files`,
      {
        method:
          "POST",
        headers: {
          "X-API-KEY":
            process.env
              .SUPERCHAT_API_KEY,
          "Accept":
            "application/json"
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
      data?.error?.message ||
      data?.message ||
      `Superchat Datei-Upload fehlgeschlagen (${response.status}).`
    );
  }

  const fileId =
    String(
      firstNonEmpty(
        data?.id,
        data?.file_id,
        data?.fileId,
        data?.data?.id,
        data?.data?.file_id,
        data?.data?.fileId,
        data?.result?.id,
        data?.result?.file_id,
        data?.result?.fileId,
        ""
      ) || ""
    ).trim();

  if (
    !fileId
  ) {
    throw new Error(
      "Superchat hat nach dem Audio-Upload keine file_id zurückgegeben."
    );
  }

  return {
    id:
      fileId,
    raw:
      data
  };
}


async function createWhatsAppVoiceDraft(
  recipient,
  instruction,
  conversationId
) {

  const cleanInstruction =
    String(
      instruction || ""
    ).trim();

  if (
    !cleanInstruction
  ) {
    throw new Error(
      "Inhalt der Sprachnachricht fehlt."
    );
  }

  let target;
  let context =
    "";

  if (
    conversationId
  ) {
    const conversation =
      await getSuperchatConversation(
        conversationId
      );

    const identifier =
      String(
        firstNonEmpty(
          conversation?.contact_id,
          conversation?.handle,
          ""
        ) || ""
      ).trim();

    if (
      !identifier
    ) {
      throw new Error(
        "Der ausgewählte WhatsApp-Chat hat keinen verwendbaren Empfänger."
      );
    }

    target = {
      identifier,
      contact_id:
        conversation.contact_id ||
        "",
      name:
        conversation.name ||
        conversation.handle ||
        "WhatsApp-Kontakt",
      handle:
        conversation.handle ||
        ""
    };

    context =
      (conversation.messages || [])
        .slice(
          -10
        )
        .map(
          message =>
            `${message.direction || "message"}: ${message.text}`
        )
        .join(
          "\n"
        );
  } else {

    target =
      await findSuperchatContact(
        recipient
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
              "Formuliere eine kurze, natürliche deutsche WhatsApp-Sprachnachricht für Druckelite24. Sie soll gesprochen natürlich klingen, ohne Betreff, ohne Markdown und ohne erfundene Preise, Liefertermine oder Zusagen. Antworte ausschließlich als gültiges JSON mit dem Feld text.",
            input:
              `Empfänger: ${target.name}\n${context ? `Letzter Chatverlauf:\n${context}\n` : ""}Anweisung von Mattl: ${cleanInstruction}`,
            reasoning: {
              effort:
                "low"
            },
            text: {
              format: {
                type:
                  "json_schema",
                name:
                  "whatsapp_voice_draft",
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
      "Sprachnachrichten-Entwurf konnte nicht erstellt werden."
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
      "Sprachnachrichten-Entwurf ist leer."
    );
  }

  lastWhatsAppVoiceDraft = {
    recipient:
      target.name,
    identifier:
      target.identifier,
    contact_id:
      target.contact_id ||
      "",
    handle:
      target.handle ||
      "",
    conversation_id:
      conversationId ||
      "",
    text,
    created_at:
      new Date()
        .toISOString()
  };

  return {
    ...lastWhatsAppVoiceDraft,
    sent:
      false,
    type:
      "voice"
  };
}


async function sendWhatsAppVoiceDraft(
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
      "Sprachnachricht darf nur nach ausdrücklichem Sende-Befehl gesendet werden."
    );
  }

  if (
    !lastWhatsAppVoiceDraft
  ) {
    throw new Error(
      "Kein WhatsApp-Sprachnachrichten-Entwurf zum Senden vorhanden."
    );
  }

  const audioBuffer =
    await generateWhatsAppVoiceAudio(
      lastWhatsAppVoiceDraft
        .text
    );

  const uploaded =
    await uploadSuperchatAudioFile(
      audioBuffer
    );

  const channelId =
    await getSuperchatWhatsAppChannelId();

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
                  lastWhatsAppVoiceDraft
                    .identifier
              }
            ],
            from: {
              channel_id:
                channelId
            },
            content: {
              type:
                "file",
              file: {
                id:
                  uploaded.id
              }
            }
          })
      }
    );

  const sent = {
    sent:
      true,
    type:
      "voice",
    recipient:
      lastWhatsAppVoiceDraft
        .recipient,
    text:
      lastWhatsAppVoiceDraft
        .text,
    file_id:
      uploaded.id,
    superchat_response:
      data
  };

  lastWhatsAppVoiceDraft =
    null;

  return sent;
}


async function createNewWhatsAppDraft(
  recipient,
  instruction
) {

  const target =
    await findSuperchatContact(
      recipient
    );

  const cleanInstruction =
    String(
      instruction || ""
    ).trim();

  if (
    !cleanInstruction
  ) {
    throw new Error(
      "Inhalt der WhatsApp fehlt."
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
              "Formuliere eine kurze, natürliche deutsche WhatsApp-Nachricht für Druckelite24. Keine erfundenen Preise, Liefertermine oder Zusagen. Antworte ausschließlich als gültiges JSON mit dem Feld text.",
            input:
              `Empfänger: ${target.name}\nAnweisung von Mattl: ${cleanInstruction}`,
            reasoning: {
              effort:
                "low"
            },
            text: {
              format: {
                type:
                  "json_schema",
                name:
                  "new_whatsapp_message",
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

  lastNewWhatsAppDraft = {
    recipient:
      target.name,
    identifier:
      target.identifier,
    contact_id:
      target.contact_id,
    handle:
      target.handle,
    text,
    created_at:
      new Date()
        .toISOString()
  };

  return {
    ...lastNewWhatsAppDraft,
    sent:
      false
  };
}


async function sendNewWhatsAppDraft(
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
    !lastNewWhatsAppDraft
  ) {
    throw new Error(
      "Kein neuer WhatsApp-Entwurf zum Senden vorhanden."
    );
  }

  const channelId =
    await getSuperchatWhatsAppChannelId();

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
                  lastNewWhatsAppDraft
                    .identifier
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
                lastNewWhatsAppDraft
                  .text
            }
          })
      }
    );

  const sent =
    {
      sent:
        true,
      recipient:
        lastNewWhatsAppDraft
          .recipient,
      text:
        lastNewWhatsAppDraft
          .text,
      superchat_response:
        data
    };

  lastNewWhatsAppDraft =
    null;

  return sent;
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
              `Kontakt: ${conversation.name}\nChatverlauf:\n${(conversation.messages || []).slice(-10).map(message => `${message.direction || "message"}: ${message.text}`).join("\n") || conversation.preview}\nAnweisung von Mattl: ${cleanInstruction}`,
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


/* =========================================================
   SUPERCHAT WEBHOOK · INBOUND MESSAGES
   Superchat liefert eingehende Nachrichten über Webhooks.
   ========================================================= */

app.post(
  "/api/superchat-webhook",
  async (
    req,
    res
  ) => {

    try {

      const message =
        extractSuperchatWebhookMessage(
          req.body
        );

      if (
        !message
      ) {
        return res.json({
          ok:
            true,
          stored:
            false
        });
      }

      const history =
        await readSuperchatMessageHistory();

      const exists =
        history.some(
          item =>
            String(
              item?.id ||
              ""
            ) ===
            String(
              message.id
            )
        );

      if (
        !exists
      ) {
        history.push(
          message
        );

        await writeSuperchatMessageHistory(
          history
        );
      }

      return res.json({
        ok:
          true,
        stored:
          !exists
      });

    } catch (
      error
    ) {

      console.error(
        "[SUPERCHAT WEBHOOK ERROR]",
        error
      );

      return res
        .status(500)
        .json({
          ok:
            false
        });
    }
  }
);


app.get(
  "/api/superchat-conversations",
  async (
    req,
    res
  ) => {

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");

    try {
      const conversations =
        await getSuperchatConversations(
          20
        );

      const limit =
        Math.max(
          1,
          Math.min(
            20,
            Number(req.query.limit) || 5
          )
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
            limit
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

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");

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


/* Preflight (CORS) fuer die drei Superchat-Routen, die der
   Mail-Client / das Command Center von aussen aufruft. */
app.options(
  [
    "/api/superchat-conversations",
    "/api/superchat-conversation/:id",
    "/api/superchat-send"
  ],
  (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.sendStatus(204);
  }
);


/* Direktes Senden einer Text-Antwort aus dem Command Center /
   Chat-UI heraus (kein Sprachbefehl noetig, eigener Bestaetigungs-
   Dialog passiert bereits im Frontend). Nutzt dieselbe Superchat-
   REST-API wie sendSuperchatDraft(). */
app.post(
  "/api/superchat-send",
  async (req, res) => {

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-jarvis-key");

    const providedKey = req.headers["x-jarvis-key"];
    if (process.env.MAIL_API_KEY && providedKey !== process.env.MAIL_API_KEY) {
      return res.status(401).json({ ok: false, error: "Ungültiger oder fehlender API-Key" });
    }

    try {
      const { contactId, channelId, text } = req.body || {};

      const cleanText = String(text || "").trim();
      if (!cleanText) {
        return res.status(400).json({ ok: false, error: "Kein Text angegeben." });
      }

      const cleanContactId = String(contactId || "").trim();
      if (!cleanContactId) {
        return res.status(400).json({ ok: false, error: "Kontakt-ID fehlt." });
      }

      const resolvedChannelId =
        channelId || (await getSuperchatWhatsAppChannelId());

      const data = await superchatRequest(
        "/messages",
        {
          method: "POST",
          body: JSON.stringify({
            to: [{ identifier: cleanContactId }],
            from: { channel_id: resolvedChannelId },
            content: { type: "text", text: cleanText }
          })
        }
      );

      return res.json({ ok: true, superchat_response: data });
    } catch (error) {
      console.error("[SUPERCHAT SEND ERROR]", error);
      return res.status(500).json({
        ok: false,
        error: error.message || "Nachricht konnte nicht gesendet werden."
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


        case "get_business_pulse": {

          const pulse =
            await getJarvisBusinessPulse();

          return res.json({
            ok:
              true,
            pulse,
            result: {
              ...pulse,
              instruction:
                "Gib Mattl einen kompakten Business-Gesamtstatus. Beginne mit den wichtigsten 2 bis 4 Erkenntnissen aus signals und den verfügbaren Quellen. Nutze nur gelieferte Live-Daten. Priorisiere Umsatz/Bestellungen, wichtige ungelesene Kunden- oder Angebotsmails, offene Bestellungen und fällige Erinnerungen. Wetter nur erwähnen, wenn es sinnvoll ist. Fehlende Quellen nicht erfinden."
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


        case "create_whatsapp_voice_draft": {

          const draft =
            await createWhatsAppVoiceDraft(
              args.recipient,
              args.instruction,
              args.conversation_id
            );

          return res.json({
            ok:
              true,
            whatsapp_voice_draft:
              draft,
            result: {
              created:
                true,
              sent:
                false,
              type:
                "voice",
              recipient:
                draft.recipient,
              text:
                draft.text,
              instruction:
                "Sprachnachrichten-Entwurf ist fertig und noch NICHT gesendet. Nenne Mattl den geplanten Text und frage kurz, ob er senden möchte."
            }
          });
        }


        case "send_whatsapp_voice_draft": {

          const sent =
            await sendWhatsAppVoiceDraft(
              args.confirmation_text
            );

          return res.json({
            ok:
              true,
            whatsapp_voice_sent:
              sent,
            result:
              sent
          });
        }


        case "create_new_whatsapp_draft": {

          const draft =
            await createNewWhatsAppDraft(
              args.recipient,
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
              recipient:
                draft.recipient,
              text:
                draft.text,
              instruction:
                "Neue WhatsApp ist als Entwurf fertig und noch NICHT gesendet. Frage Mattl kurz, ob er senden möchte."
            }
          });
        }


        case "send_new_whatsapp_draft": {

          const sent =
            await sendNewWhatsAppDraft(
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
              messages:
                conversation.messages || [],
              instruction:
                "Der ausgewählte WhatsApp-Chat ist geladen. Nutze den über Webhooks gespeicherten Verlauf. Beantworte Mattls Frage anhand dieser Daten und erfinde nichts."
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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    version: `JARVIS ${JARVIS_VERSION}`,
    mode: "single-screen",
    realtime: true,
    realtime_output: "audio",
    realtime_model:
      process.env.OPENAI_REALTIME_MODEL ||
      "gpt-realtime-2.1",
    realtime_voice:
      process.env.OPENAI_REALTIME_VOICE ||
      "cedar",
    vad: "semantic_vad",
    vad_eagerness:
      process.env.OPENAI_VAD_EAGERNESS ||
      "medium",
    noise_reduction:
      process.env.OPENAI_NOISE_REDUCTION ||
      "far_field",
    shopify: Boolean(
      process.env.SHOPIFY_STORE_DOMAIN &&
      process.env.SHOPIFY_CLIENT_ID &&
      process.env.SHOPIFY_CLIENT_SECRET
    ),
    gmail: isGmailConfigured(),
    superchat: isSuperchatConfigured(),
    web_search: true,
    weather: true,
    notes: true,
    reminders: true,
    mail_sync: true,
    tools: REALTIME_TOOLS.map(tool => tool.name)
  });
});


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
   MAIL-CLIENT (Druckelite24 Mail) · JARVIS-SYNC
   ========================================================= */

app.use(
  "/api/mail",
  createMailRouter({
    getAccessToken: getGmailAccessToken,
    apiKey: process.env.MAIL_API_KEY,
    pollIntervalMs: 8000
  })
);


/* =========================================================
   START

   NICHT LÖSCHEN.
   RENDER BRAUCHT DIESEN BLOCK.
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
      "Realtime Output: AUDIO"
    );


    console.log(
      "Voice Engine: OpenAI Realtime"
    );


    console.log(
      "VAD: semantic_vad / medium"
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
