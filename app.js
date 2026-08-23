/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V11.0 · SINGLE SCREEN · OPENAI REALTIME AUDIO
   DIREKTES SPEECH-TO-SPEECH VIA WEBRTC
   + BARGE-IN
   + OHNE ELEVENLABS / TTS-PUFFER
   ========================================================= */


/* =========================================================
   DOM
   ========================================================= */

const button =
  document.querySelector("#toggle");

const statusEl =
  document.querySelector("#status");

const logEl =
  document.querySelector("#log");

const remoteAudio =
  document.querySelector("#remoteAudio");

/* =========================================================
   SINGLE SCREEN · V11
   Alte Triple-Screen-Parameter werden bewusst ignoriert.
   ========================================================= */

const JARVIS_SCREEN_ROLE = "single";
window.JARVIS_SCREEN_ROLE = "single";
document.body.dataset.screenRole = "single";
document.documentElement.dataset.screenRole = "single";

const JARVIS_VOICE_SCREEN = true;
const JARVIS_COMMS_SCREEN = true;


/* =========================================================
   DEBUG HUD
   ========================================================= */

// DEBUG HUD entfernt – debugSet() bleibt absichtlich als sichere No-op-Hilfe erhalten.



function debugSet(
  id,
  value
) {

  const el =
    document.getElementById(id);

  if (el) {
    el.textContent =
      String(value);
  }
}


/* =========================================================
   STATE
   ========================================================= */

let active =
  false;

let starting =
  false;

let stopping =
  false;

let peerConnection =
  null;

let dataChannel =
  null;

let micStream =
  null;

let stopSpeechRecognition =
  null;

let stopSpeechRecognitionRunning =
  false;

let stopSpeechRecognitionRestartTimer =
  null;

let realtimeConnected =
  false;

let assistantSpeaking =
  false;

let greetingInProgress =
  false;

let responseInProgress =
  false;

let currentResponseText =
  "";

const runningToolCalls =
  new Set();


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

let proactiveCheckTimer =
  null;

let proactiveCheckInFlight =
  false;

let proactiveFirstCheckTimer =
  null;

let reminderCheckTimer =
  null;

let userTurnInProgress =
  false;

let pendingProactiveNotice =
  "";

let pendingProactiveFlushTimer =
  null;


let screenWakeLock =
  null;


let currentSelectedEmailId =
  null;

let currentSelectedEmail =
  null;

let currentSelectedWhatsAppConversationId =
  null;

let currentSelectedWhatsAppConversation =
  null;

let pendingNewWhatsAppDraft =
  null;

let pendingWhatsAppVoiceDraft =
  null;

let currentGmailDraftId =
  (() => {
    try {
      return sessionStorage.getItem(
        "jarvisGmailDraftId"
      );
    } catch {
      return null;
    }
  })();


const PROACTIVE_CHECK_INTERVAL_MS =
  5 * 1000;

const PROACTIVE_FIRST_CHECK_DELAY_MS =
  2 * 1000;

const REMINDER_CHECK_INTERVAL_MS =
  60 * 1000;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio =
  null;

let introFadeTimer =
  null;

const INTRO_START =
  4;

const INTRO_START_VOLUME =
  0.10;

const INTRO_VOICE_DELAY_MS =
  700;

const INTRO_BACKGROUND_VOLUME =
  0.006;

const INTRO_DUCK_DURATION_MS =
  550;

const INTRO_FADE_DURATION_MS =
  4500;


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}


function safeJsonParse(value) {

  try {

    return JSON.parse(value);

  } catch {

    return null;
  }
}


/* =========================================================
   UI
   ========================================================= */

function setStatus(text) {

  if (!statusEl) {
    return;
  }

  statusEl.textContent =
    text;

  statusEl.classList.toggle(
    "online",
    text === "Online"
  );
}


function setLog(text) {

  if (!logEl) {
    return;
  }

  logEl.textContent =
    text;
}


function setButtonActive(value) {

  if (!button) {
    return;
  }

  button.classList.toggle(
    "active",
    Boolean(value)
  );
}


function setJarvisState(state) {

  document.body.dataset.jarvisState =
    state;
}


/* =========================================================
   DRAFT PANEL
   ========================================================= */

function showDraft(draft) {

  const panel =
    document.getElementById(
      "draftPanel"
    );

  const subjectEl =
    document.getElementById(
      "draftSubject"
    );

  const bodyEl =
    document.getElementById(
      "draftBody"
    );

  if (
    !panel ||
    !subjectEl ||
    !bodyEl
  ) {
    return;
  }

  subjectEl.textContent =
    draft?.subject
      ? `Betreff: ${draft.subject}`
      : "";

  bodyEl.textContent =
    draft?.body || "";

  panel.style.display =
    "flex";

  ensureDraftSendButton();
}


const draftCloseBtn =
  document.getElementById(
    "draftCloseBtn"
  );

if (draftCloseBtn) {

  draftCloseBtn.addEventListener(
    "click",
    () => {

      const panel =
        document.getElementById(
          "draftPanel"
        );

      if (panel) {
        panel.style.display =
          "none";
      }

      /* Wichtig: Nur visuell ausblenden.
         Gmail-Draft-ID bleibt erhalten, damit Mattl
         den Entwurf danach weiterhin per Sprachbefehl senden kann. */
    }
  );
}


const draftCopyBtn =
  document.getElementById(
    "draftCopyBtn"
  );

if (draftCopyBtn) {

  draftCopyBtn.addEventListener(
    "click",
    async () => {

      const subjectEl =
        document.getElementById(
          "draftSubject"
        );

      const bodyEl =
        document.getElementById(
          "draftBody"
        );

      const fullText =
        `${
          subjectEl?.textContent || ""
        }\n\n${
          bodyEl?.textContent || ""
        }`.trim();

      try {

        await navigator.clipboard
          .writeText(fullText);

        const original =
          draftCopyBtn.textContent;

        draftCopyBtn.textContent =
          "Kopiert!";

        setTimeout(
          () => {

            draftCopyBtn.textContent =
              original;

          },
          1500
        );

      } catch (error) {

        console.warn(
          "Kopieren fehlgeschlagen:",
          error
        );
      }
    }
  );
}




/* =========================================================
   GMAIL DRAFT · SENDEN NACH BESTÄTIGUNG
   ========================================================= */

function ensureDraftSendButton() {

  const panel =
    document.getElementById(
      "draftPanel"
    );

  if (
    !panel
  ) {
    return null;
  }

  let button =
    document.getElementById(
      "draftSendBtn"
    );

  if (
    button
  ) {
    return button;
  }

  const existingActions =
    panel.querySelector(
      ".draft-actions"
    );

  const host =
    existingActions ||
    (() => {
      const div =
        document.createElement(
          "div"
        );

      div.className =
        "draft-actions jarvis-draft-actions";

      panel.appendChild(
        div
      );

      return div;
    })();

  button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.id =
    "draftSendBtn";

  button.className =
    "draft-send-confirm";

  button.textContent =
    "SENDEN";

  host.appendChild(
    button
  );

  button.addEventListener(
    "click",
    async () => {

      if (
        !currentGmailDraftId &&
        !pendingNewWhatsAppDraft &&
        !pendingWhatsAppVoiceDraft
      ) {
        setLog(
          "Kein Entwurf zum Senden vorhanden."
        );
        return;
      }

      const confirmed =
        window.confirm(
          pendingWhatsAppVoiceDraft
            ? "Diese WhatsApp-Sprachnachricht jetzt wirklich erzeugen und senden?"
            : pendingNewWhatsAppDraft
              ? "Diese WhatsApp jetzt wirklich senden?"
              : "Diesen E-Mail-Entwurf jetzt wirklich senden?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      button.disabled =
        true;
      button.textContent =
        "WIRD GESENDET …";

      try {

        const response =
          await fetch(
            "/api/realtime-tool",
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify(
                  pendingWhatsAppVoiceDraft
                    ? {
                        name:
                          "send_whatsapp_voice_draft",
                        arguments: {
                          confirmation_text:
                            "senden"
                        }
                      }
                    : pendingNewWhatsAppDraft
                      ? {
                          name:
                            "send_new_whatsapp_draft",
                          arguments: {
                            confirmation_text:
                              "senden"
                          }
                        }
                      : {
                          name:
                            "send_email_draft",
                          arguments: {
                            draft_id:
                              currentGmailDraftId,
                            confirmation_text:
                              "senden"
                          }
                        }
                )
            }
          );

        const data =
          await response.json();

        const sentOk =
          pendingWhatsAppVoiceDraft
            ? data?.whatsapp_voice_sent?.sent ===
                true ||
              data?.result?.sent ===
                true
            : pendingNewWhatsAppDraft
              ? data?.whatsapp_sent?.sent ===
                  true ||
                data?.result?.sent ===
                  true
              : data?.sent?.sent ===
                  true;

        if (
          !response.ok ||
          !data?.ok ||
          !sentOk
        ) {
          throw new Error(
            data?.error ||
            (
              pendingWhatsAppVoiceDraft
                ? "WhatsApp-Sprachnachricht konnte nicht gesendet werden."
                : pendingNewWhatsAppDraft
                  ? "WhatsApp konnte nicht gesendet werden."
                  : "E-Mail konnte nicht gesendet werden."
            )
          );
        }

        if (
          pendingWhatsAppVoiceDraft
        ) {

          pendingWhatsAppVoiceDraft =
            null;

          panel.style.display =
            "none";

          setLog(
            "WhatsApp-Sprachnachricht wurde gesendet."
          );

          loadWhatsAppDashboard();

        } else         if (
          pendingNewWhatsAppDraft
        ) {
          pendingNewWhatsAppDraft =
            null;

          panel.style.display =
            "none";

          setLog(
            "WhatsApp wurde gesendet."
          );

          loadWhatsAppDashboard();

        } else {

          currentGmailDraftId =
            null;

          try {
            sessionStorage.removeItem(
              "jarvisGmailDraftId"
            );
          } catch {}

          panel.style.display =
            "none";

          setLog(
            "E-Mail wurde gesendet."
          );

          loadInboxDashboard();
        }

      } catch (
        error
      ) {

        setLog(
          error.message ||
          "E-Mail konnte nicht gesendet werden."
        );

      } finally {

        button.disabled =
          false;
        button.textContent =
          "SENDEN";
      }
    }
  );

  return button;
}


ensureDraftSendButton();


/* =========================================================
   BERLIN TIME
   ========================================================= */

function getBerlinHour() {

  try {

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
          part.type === "hour"
      );

    const hour =
      Number(
        hourPart?.value
      );

    if (!Number.isNaN(hour)) {
      return hour;
    }

  } catch (error) {

    console.warn(
      "Berlin-Zeit Fehler:",
      error
    );
  }

  return new Date()
    .getHours();
}



/* =========================================================
   MOBILE SCREEN WAKE LOCK
   Verhindert automatisches Display-Standby, solange JARVIS läuft.
   Wenn das iPhone manuell gesperrt wird, darf iOS Browser/WebRTC
   trotzdem pausieren.
   ========================================================= */

async function requestScreenWakeLock() {

  try {

    if (
      !("wakeLock" in navigator) ||
      document.visibilityState !==
        "visible"
    ) {
      return false;
    }


    if (
      screenWakeLock
    ) {
      return true;
    }


    screenWakeLock =
      await navigator.wakeLock
        .request(
          "screen"
        );


    screenWakeLock.addEventListener(
      "release",
      () => {

        screenWakeLock =
          null;
      }
    );


    return true;


  } catch (
    error
  ) {

    console.warn(
      "Wake Lock nicht verfügbar:",
      error
    );


    screenWakeLock =
      null;


    return false;
  }
}


async function releaseScreenWakeLock() {

  if (
    !screenWakeLock
  ) {
    return;
  }


  try {

    await screenWakeLock
      .release();

  } catch {}


  screenWakeLock =
    null;
}


document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.visibilityState !==
      "visible"
    ) {
      return;
    }


    if (
      active
    ) {

      requestScreenWakeLock();


      /*
        Wenn iOS die Seite im Hintergrund pausiert hat,
        beim Zurückkehren sofort den Server prüfen.
      */

      setTimeout(
        () => {

          runProactiveCheck();
          runReminderCheck();

        },
        700
      );
    }
  }
);


/* =========================================================
   GREETING
   ========================================================= */

function pickRandom(items) {

  return items[
    Math.floor(
      Math.random() *
      items.length
    )
  ];
}


function getGreetingAddress() {

  const roll =
    Math.random();

  if (roll < 0.40) {
    return "Mattl";
  }

  if (roll < 0.70) {
    return "Chef";
  }

  if (roll < 0.94) {
    return "Meister";
  }

  return "Daddy";
}


function getGreeting() {

  const hour =
    getBerlinHour();

  const roll =
    Math.random();

  let name;

  if (roll < 0.36) {
    name = "Mattl";
  }

  else if (roll < 0.66) {
    name = "Chef";
  }

  else if (roll < 0.92) {
    name = "Meister";
  }

  else {
    name = "Daddy";
  }


  if (
    hour >= 5 &&
    hour < 11
  ) {

    return pickRandom([

      `Systemcheck abgeschlossen. Kommandozentrale online. Guten Morgen, ${name}. JARVIS ist vollständig einsatzbereit. Heute machen wir keine halben Sachen.`,

      `Energieversorgung stabil. Systeme synchronisiert. Guten Morgen, ${name}. Die Welt schläft langsam aus. Wir sind ihr bereits einen Schritt voraus.`,

      `JARVIS online. Alle Systeme auf Grün. Guten Morgen, ${name}. Kaffee besorgst du. Den Rest erledigen wir gemeinsam.`,

      `Kommandozentrale aktiviert. Datenverbindungen stehen. Guten Morgen, ${name}. Heute wird nicht verwaltet. Heute wird angegriffen.`,

      `Systeme hochgefahren. Aufmerksamkeit bei einhundert Prozent. Guten Morgen, ${name}. Zeit, aus Ideen Ergebnisse zu machen.`,

      `Guten Morgen, ${name}. JARVIS meldet volle Einsatzbereitschaft. Systeme stabil. Ziele noch nicht definiert. Das ändern wir jetzt.`,

      `Verbindung hergestellt. Kommandozentrale bereit. Guten Morgen, ${name}. Mal sehen, wer heute versucht, uns aufzuhalten.`

    ]);
  }


  if (
    hour >= 11 &&
    hour < 18
  ) {

    return pickRandom([

      `Kommandozentrale online. Systeme synchronisiert. Willkommen zurück, ${name}. Sag mir, welches Problem heute zuerst kapitulieren soll.`,

      `JARVIS ist online. Datenströme aktiv. Systeme stabil. ${name}, du hast meine volle Aufmerksamkeit.`,

      `Verbindung steht. Systeme auf Grün. Willkommen zurück, ${name}. Geschäft, Werbung, Zahlen oder Chaos. Ich bin bereit.`,

      `Kommandozentrale aktiviert. ${name}, JARVIS meldet vollständige Einsatzbereitschaft. Gib mir ein Ziel.`,

      `Alle Systeme online. Analyse bereit. ${name}, wenn heute irgendwo Umsatz liegen bleibt, finden wir ihn.`,

      `Systemcheck abgeschlossen. Keine kritischen Fehler. Noch nicht. Willkommen zurück, ${name}. Was steht an?`,

      `JARVIS online. Kommandozentrale bereit. ${name}, heute machen wir entweder Fortschritt oder wenigstens einen beeindruckenden Versuch.`,

      `Verbindung hergestellt. Daten bereit. Geduld geladen. Willkommen zurück, ${name}. Nutzen wir sie, solange sie noch da ist.`,

      `${name}. JARVIS ist online. Systeme synchronisiert. Der Laden läuft. Jetzt sorgen wir dafür, dass er noch besser läuft.`

    ]);
  }


  if (
    hour >= 18 &&
    hour < 23
  ) {

    return pickRandom([

      `Nachtbetrieb wird vorbereitet. Kommandozentrale online. Guten Abend, ${name}. Andere machen Feierabend. Wir offenbar nicht.`,

      `Systeme synchronisiert. Abendmodus aktiv. Willkommen zurück, ${name}. Die zweite Halbzeit kann beginnen.`,

      `JARVIS online. Beleuchtung gedimmt. Rechenleistung unverändert. Guten Abend, ${name}. Was reißen wir heute noch ab?`,

      `Kommandozentrale aktiviert. Guten Abend, ${name}. Die meisten fahren jetzt runter. Wir gehen offensichtlich den anderen Weg.`,

      `Systemcheck abgeschlossen. Alles bereit. Guten Abend, ${name}. Wenn wir schon um diese Uhrzeit arbeiten, sollte es wenigstens spektakulär werden.`,

      `JARVIS meldet sich. Systeme auf Grün. Guten Abend, ${name}. Feierabend wurde für heute offenbar nicht genehmigt.`,

      `Verbindung hergestellt. Nachtbetrieb bereit. Guten Abend, ${name}. Zeit, noch etwas zu erledigen, das morgen niemand kommen sieht.`

    ]);
  }


  return pickRandom([

    `Nachtmodus aktiviert. Systeme online. ${name}, vernünftige Menschen schlafen jetzt. Das erklärt vermutlich, warum wir beide hier sind.`,

    `Kommandozentrale online. Uhrzeit kritisch. Einsatzbereitschaft trotzdem einhundert Prozent. Willkommen zurück, ${name}.`,

    `Systemcheck abgeschlossen. Die Stadt schläft. JARVIS nicht. ${name}, was bauen wir jetzt noch?`,

    `Nachtbetrieb aktiv. Systeme stabil. Vernunft auf Stand-by. ${name}, JARVIS ist bereit.`,

    `Verbindung hergestellt. Alles ruhig. Verdächtig ruhig. Willkommen zurück, ${name}. Was haben wir vor?`,

    `${name}. Es ist mitten in der Nacht. JARVIS ist online. Wenn das irgendwann groß wird, behaupten wir einfach, das sei alles Teil des Plans gewesen.`

  ]);
}


/* =========================================================
   INTRO
   ========================================================= */

function stopIntro() {

  if (introFadeTimer) {

    clearInterval(
      introFadeTimer
    );

    introFadeTimer =
      null;
  }


  if (introAudio) {

    try {
      introAudio.pause();
    } catch {}


    try {
      introAudio.currentTime =
        0;
    } catch {}


    introAudio =
      null;
  }
}


async function startIntro() {

  stopIntro();


  introAudio =
    new Audio(
      "/Intro.mp3?v=105"
    );


  introAudio.preload =
    "auto";


  introAudio.volume =
    INTRO_START_VOLUME;


  return new Promise(
    resolve => {

      let resolved =
        false;


      const done =
        () => {

          if (resolved) {
            return;
          }

          resolved =
            true;

          resolve();
        };


      const play =
        async () => {

          try {

            if (!introAudio) {

              done();
              return;
            }


            introAudio.currentTime =
              INTRO_START;


            await introAudio.play();


            done();

          } catch (error) {

            console.warn(
              "Intro Fehler:",
              error
            );


            done();
          }
        };


      introAudio.addEventListener(
        "loadedmetadata",
        play,
        {
          once: true
        }
      );


      introAudio.addEventListener(
        "error",
        done,
        {
          once: true
        }
      );


      if (
        introAudio.readyState >= 1
      ) {

        play();
      }


      introAudio.load();
    }
  );
}


function duckIntro() {

  if (
    !introAudio ||
    introAudio.paused
  ) {
    return;
  }


  if (introFadeTimer) {

    clearInterval(
      introFadeTimer
    );

    introFadeTimer =
      null;
  }


  const original =
    introAudio.volume;


  const start =
    performance.now();


  introFadeTimer =
    setInterval(
      () => {

        if (!introAudio) {

          clearInterval(
            introFadeTimer
          );

          introFadeTimer =
            null;

          return;
        }


        const progress =
          Math.min(
            (
              performance.now() -
              start
            ) /
            INTRO_DUCK_DURATION_MS,
            1
          );


        const smooth =
          progress *
          progress *
          (
            3 -
            2 * progress
          );


        introAudio.volume =
          original -
          (
            original -
            INTRO_BACKGROUND_VOLUME
          ) *
          smooth;


        if (progress >= 1) {

          clearInterval(
            introFadeTimer
          );

          introFadeTimer =
            null;


          fadeIntroOut();
        }

      },
      40
    );
}


function fadeIntroOut() {

  if (
    !introAudio ||
    introAudio.paused
  ) {
    return;
  }


  const start =
    performance.now();


  const volume =
    introAudio.volume;


  introFadeTimer =
    setInterval(
      () => {

        if (!introAudio) {

          clearInterval(
            introFadeTimer
          );

          introFadeTimer =
            null;

          return;
        }


        const progress =
          Math.min(
            (
              performance.now() -
              start
            ) /
            INTRO_FADE_DURATION_MS,
            1
          );


        introAudio.volume =
          Math.max(
            0,
            volume *
            Math.pow(
              1 - progress,
              1.7
            )
          );


        if (progress >= 1) {

          clearInterval(
            introFadeTimer
          );

          introFadeTimer =
            null;


          try {
            introAudio.pause();
          } catch {}


          introAudio =
            null;
        }

      },
      60
    );
}


/* =========================================================
   VOICE STOP · JARVIS WÄHREND AUSGABE UNTERBRECHEN
   Separater Stop-Listener. Das OpenAI-Mikrofon bleibt während
   der TTS-Ausgabe weiterhin deaktiviert, damit kein Echo stört.
   ========================================================= */

function getStopSpeechRecognitionClass() {
  return (
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    null
  );
}


function stopStopSpeechRecognition() {

  if (
    stopSpeechRecognitionRestartTimer
  ) {
    clearTimeout(
      stopSpeechRecognitionRestartTimer
    );
    stopSpeechRecognitionRestartTimer =
      null;
  }


  if (!stopSpeechRecognition) {
    stopSpeechRecognitionRunning =
      false;
    return;
  }


  const recognition =
    stopSpeechRecognition;

  stopSpeechRecognition =
    null;

  stopSpeechRecognitionRunning =
    false;


  try {
    recognition.onend =
      null;
    recognition.abort();
  } catch {}
}


function startStopSpeechRecognition() {

  if (
    !active ||
    !assistantSpeaking ||
    stopSpeechRecognitionRunning
  ) {
    return;
  }


  const Recognition =
    getStopSpeechRecognitionClass();


  if (!Recognition) {
    return;
  }


  const recognition =
    new Recognition();

  stopSpeechRecognition =
    recognition;

  recognition.lang =
    "de-DE";

  recognition.continuous =
    true;

  recognition.interimResults =
    true;

  recognition.maxAlternatives =
    1;


  recognition.onstart =
    () => {
      stopSpeechRecognitionRunning =
        true;
    };


  recognition.onresult =
    event => {

      let transcript =
        "";


      for (
        let i = event.resultIndex;
        i < event.results.length;
        i += 1
      ) {
        transcript +=
          ` ${event.results[i]?.[0]?.transcript || ""}`;
      }


      const normalized =
        transcript
          .toLowerCase()
          .trim();


      if (
        /(^|\s)(stop|stopp|halt|warte|moment|ruhe|genug|nein|jarvis)(\s|$|[.!?,])/i.test(
          normalized
        )
      ) {

        console.log(
          "Voice-Stop erkannt:",
          normalized
        );

        stopStopSpeechRecognition();

        userTurnInProgress =
          false;

        pendingProactiveNotice =
          "";

        handleUserInterruption();
      }
    };


  recognition.onerror =
    event => {

      const error =
        String(
          event?.error ||
          ""
        );

      stopSpeechRecognitionRunning =
        false;


      if (
        error === "not-allowed" ||
        error === "service-not-allowed"
      ) {
        stopSpeechRecognition =
          null;
      }
    };


  recognition.onend =
    () => {

      stopSpeechRecognitionRunning =
        false;

      stopSpeechRecognition =
        null;


      if (
        active &&
        assistantSpeaking
      ) {
        stopSpeechRecognitionRestartTimer =
          setTimeout(
            startStopSpeechRecognition,
            180
          );
      }
    };


  try {
    recognition.start();
  } catch {
    stopSpeechRecognitionRunning =
      false;
    stopSpeechRecognition =
      null;
  }
}


/* =========================================================
   MICROPHONE
   ========================================================= */

async function createMicrophoneStream() {

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices
      .getUserMedia
  ) {

    throw new Error(
      "Mikrofon wird von diesem Browser nicht unterstützt."
    );
  }


  micStream =
    await navigator.mediaDevices
      .getUserMedia({
        audio: {

          echoCancellation:
            true,

          noiseSuppression:
            true,

          autoGainControl:
            true,

          channelCount:
            1
        }
      });


  setMicrophoneEnabled(
    false
  );


  return micStream;
}


function setMicrophoneEnabled(
  enabled
) {

  if (!micStream) {
    return;
  }


  for (
    const track of
    micStream.getAudioTracks()
  ) {

    track.enabled =
      Boolean(enabled);
  }


  console.log(
    "Mikrofon:",
    enabled
      ? "AN"
      : "AUS"
  );
}


function stopMicrophone() {

  if (!micStream) {
    return;
  }


  try {

    for (
      const track of
      micStream.getTracks()
    ) {

      track.stop();
    }

  } catch {}


  micStream =
    null;
}


/* =========================================================
   OPENAI REALTIME SEND
   ========================================================= */

function sendRealtimeEvent(
  event
) {

  if (
    !dataChannel ||
    dataChannel.readyState !==
      "open"
  ) {

    console.warn(
      "DataChannel nicht offen:",
      event?.type
    );


    return false;
  }


  try {

    dataChannel.send(
      JSON.stringify(
        event
      )
    );


    return true;

  } catch (error) {

    console.error(
      "Realtime Sendefehler:",
      error
    );


    return false;
  }
}


/* =========================================================
   TOOL CALL
   ========================================================= */

async function executeRealtimeTool(
  event
) {

  const callId =
    String(
      event.call_id || ""
    );


  const toolName =
    String(
      event.name || ""
    );


  if (
    !callId ||
    !toolName
  ) {

    console.error(
      "Ungültiger Tool Call:",
      event
    );

    return;
  }


  if (
    runningToolCalls.has(
      callId
    )
  ) {

    return;
  }


  runningToolCalls.add(
    callId
  );


  setJarvisState(
    "thinking"
  );


  setLog(
    `${toolName} wird ausgeführt …`
  );


  setMicrophoneEnabled(
    false
  );


  debugSet(
    "dbgEvent",
    `Tool: ${toolName}`
  );


  let args =
    {};


  try {

    args =
      event.arguments
        ? JSON.parse(
            event.arguments
          )
        : {};

  } catch {

    args =
      {};
  }


  if (
    (
      toolName ===
        "get_email_message" ||
      toolName ===
        "create_email_reply_draft" ||
      toolName ===
        "move_email_to_bearbeitet"
    ) &&
    !args.message_id &&
    currentSelectedEmailId
  ) {
    args.message_id =
      currentSelectedEmailId;
  }


  if (
    toolName ===
      "send_email_draft" &&
    !args.draft_id &&
    currentGmailDraftId
  ) {
    args.draft_id =
      currentGmailDraftId;
  }


  if (
    (
      toolName ===
        "get_whatsapp_conversation" ||
      toolName ===
        "create_whatsapp_reply_draft" ||
      toolName ===
        "create_whatsapp_voice_draft"
    ) &&
    !args.conversation_id &&
    currentSelectedWhatsAppConversationId
  ) {
    args.conversation_id =
      currentSelectedWhatsAppConversationId;
  }


  let effectiveToolName =
    toolName;


  if (
    toolName ===
      "create_email_draft" &&
    currentSelectedEmailId &&
    /\b(antwort|darauf|zurueck|zurück|reply|kundenmail|diese mail|die mail|schreib.*zurück)\b/i.test(
      String(args.instruction || "")
    )
  ) {
    effectiveToolName =
      "create_email_reply_draft";

    args.message_id =
      currentSelectedEmailId;
  }


  console.log(
    "[TOOL]",
    effectiveToolName,
    args
  );


  let toolResult;


  try {

    const response =
      await fetch(
        "/api/realtime-tool",
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              name:
                effectiveToolName,

              arguments:
                args
            })
        }
      );


    const raw =
      await response.text();


    try {

      toolResult =
        JSON.parse(raw);

    } catch {

      toolResult = {

        ok:
          false,

        error:
          raw ||
          "Ungültige Tool-Antwort."
      };
    }


    if (!response.ok) {

      toolResult = {

        ...toolResult,

        ok:
          false
      };
    }


    if (
      toolResult?.draft
    ) {

      showDraft(
        toolResult.draft
      );
    }


    if (
      toolResult?.email
    ) {
      showGmailMail(
        toolResult.email
      );
    }



    if (
      toolResult?.conversation?.id
    ) {
      currentSelectedWhatsAppConversationId =
        toolResult.conversation.id;

      currentSelectedWhatsAppConversation =
        toolResult.conversation;
    }


    if (
      toolResult?.whatsapp_voice_draft?.text
    ) {

      pendingWhatsAppVoiceDraft =
        toolResult.whatsapp_voice_draft;

      pendingNewWhatsAppDraft =
        null;

      showDraft({
        subject:
          `Sprachnachricht · ${
            toolResult.whatsapp_voice_draft.recipient ||
            "Kunde"
          }`,
        body:
          toolResult.whatsapp_voice_draft.text
      });
    }


    if (
      toolResult?.whatsapp_voice_sent?.sent ===
        true
    ) {

      pendingWhatsAppVoiceDraft =
        null;

      loadWhatsAppDashboard();
    }


    if (
      toolResult?.whatsapp_draft?.text
    ) {

      pendingNewWhatsAppDraft =
        toolName ===
          "create_new_whatsapp_draft"
          ? toolResult.whatsapp_draft
          : null;

      showDraft({
        subject:
          `WhatsApp · ${
            toolResult.whatsapp_draft.recipient ||
            toolResult.whatsapp_draft.contact_name ||
            "Kunde"
          }`,
        body:
          toolResult.whatsapp_draft.text
      });
    }


    if (
      toolResult?.whatsapp_sent?.sent ===
        true
    ) {
      pendingNewWhatsAppDraft =
        null;

      loadWhatsAppDashboard();
    }


    if (
      toolResult?.gmail_draft_id ||
      toolResult?.draft?.gmail_draft_id
    ) {
      currentGmailDraftId =
        toolResult.gmail_draft_id ||
        toolResult.draft.gmail_draft_id;

      try {
        sessionStorage.setItem(
          "jarvisGmailDraftId",
          currentGmailDraftId
        );
      } catch {}
    }


    if (
      toolResult?.sent?.sent ===
        true
    ) {
      currentGmailDraftId =
        null;

      try {
        sessionStorage.removeItem(
          "jarvisGmailDraftId"
        );
      } catch {}

      loadInboxDashboard();
    }


    if (
      toolResult?.moved?.moved ===
        true ||
      toolResult?.result?.moved ===
        true
    ) {
      currentSelectedEmailId =
        null;

      currentSelectedEmail =
        null;

      document.getElementById(
        "gmailMailModal"
      )?.classList.remove(
        "open"
      );

      loadInboxDashboard();
    }

  } catch (error) {

    console.error(
      "Tool Request Fehler:",
      error
    );


    toolResult = {

      ok:
        false,

      error:
        error.message ||
        "Tool konnte nicht ausgeführt werden."
    };
  }


  sendRealtimeEvent({

    type:
      "conversation.item.create",

    item: {

      type:
        "function_call_output",

      call_id:
        callId,

      output:
        JSON.stringify(
          toolResult
        )
    }
  });


  responseInProgress =
    true;


  sendRealtimeEvent({

    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ]
    }
  });


  runningToolCalls.delete(
    callId
  );
}


/* =========================================================
   REALTIME EVENT HANDLER
   ========================================================= */

function handleRealtimeEvent(
  event
) {

  if (!event?.type) {
    return;
  }


  console.log(
    "[REALTIME]",
    event.type
  );


  switch (event.type) {


    case "session.created":

      debugSet(
        "dbgOpenAI",
        "✅"
      );


      debugSet(
        "dbgEvent",
        "OpenAI Session erstellt"
      );


      console.log(
        "Realtime Session erstellt."
      );

      break;


    case "session.updated":

      console.log(
        "Realtime Session aktualisiert."
      );

      break;


    case "input_audio_buffer.speech_started":

      userTurnInProgress =
        true;


      if (
        assistantSpeaking ||
        responseInProgress
      ) {

        handleUserInterruption();
      }


      if (
        !active ||
        greetingInProgress ||
        assistantSpeaking
      ) {
        return;
      }


      setJarvisState(
        "hearing"
      );


      setLog(
        "Ich höre zu …"
      );


      debugSet(
        "dbgEvent",
        "Sprache erkannt"
      );

      break;


    case "input_audio_buffer.speech_stopped":

      if (
        !active ||
        greetingInProgress
      ) {
        return;
      }


      setJarvisState(
        "thinking"
      );


      setLog(
        "Denke nach …"
      );


      setMicrophoneEnabled(
        false
      );


      debugSet(
        "dbgEvent",
        "Sprache beendet"
      );

      break;


    case "response.function_call_arguments.done":

      executeRealtimeTool(
        event
      );

      break;


    case "response.created":

      responseInProgress =
        true;


      currentResponseText =
        "";


      setJarvisState(
        "thinking"
      );


      setLog(
        "JARVIS denkt …"
      );


      debugSet(
        "dbgEvent",
        "OpenAI erzeugt Antwort"
      );

      break;


    case "response.output_audio.delta":

      if (!assistantSpeaking) {
        assistantSpeaking = true;

        setJarvisState(
          "speaking"
        );

        setLog(
          "JARVIS spricht."
        );

        /*
          Mikrofon bleibt aktiv. OpenAI Realtime übernimmt Echo-
          Unterdrückung und interrupt_response für echtes Barge-in.
        */
        setMicrophoneEnabled(
          true
        );

        if (
          greetingInProgress
        ) {
          duckIntro();
        }
      }

      break;


    case "response.output_audio_transcript.delta":

      if (event.delta) {
        currentResponseText +=
          String(event.delta);
      }

      break;


    case "response.output_audio_transcript.done":

      if (event.transcript) {
        console.log(
          "JARVIS:",
          event.transcript
        );
      }

      break;


    case "response.output_audio.done":

      assistantSpeaking =
        false;

      if (
        greetingInProgress
      ) {
        greetingInProgress =
          false;
      }

      break;


    case "response.done": {

      responseInProgress =
        false;


      const hasFunctionCall =
        Array.isArray(
          event.response?.output
        ) &&
        event.response.output.some(
          item =>
            item?.type ===
            "function_call"
        );


      if (hasFunctionCall) {

        setJarvisState(
          "thinking"
        );


        setLog(
          "Live-Daten werden geladen …"
        );


        debugSet(
          "dbgEvent",
          "Tool wird verarbeitet"
        );


        break;
      }


      userTurnInProgress =
        false;

      flushPendingProactiveNotice();


      if (
        greetingInProgress
      ) {
        greetingInProgress =
          false;
      }

      if (active) {

        setTimeout(
          () => {

            if (
              active &&
              !assistantSpeaking &&
              !responseInProgress
            ) {

              setJarvisState(
                "listening"
              );

              setLog(
                "JARVIS hört zu."
              );

              setMicrophoneEnabled(
                true
              );
            }

          },
          120
        );
      }

      break;
    }


    case "error":

      console.error(
        "Realtime Fehler:",
        event
      );


      responseInProgress =
        false;


      userTurnInProgress =
        false;

      flushPendingProactiveNotice();


      assistantSpeaking =
        false;


      debugSet(
        "dbgEvent",
        `OpenAI Fehler: ${
          event.error?.message ||
          "unbekannt"
        }`
      );


      setLog(
        event.error?.message ||
        "Realtime Fehler."
      );


      if (active) {

        setTimeout(
          () => {

            if (
              active &&
              !assistantSpeaking
            ) {

              setMicrophoneEnabled(
                true
              );


              setJarvisState(
                "listening"
              );
            }

          },
          500
        );
      }

      break;


    default:

      break;
  }
}


/* =========================================================
   OPENAI REALTIME WEBRTC
   ========================================================= */

async function connectRealtime() {

  if (
    realtimeConnected
  ) {
    return;
  }


  const pc =
    new RTCPeerConnection();


  peerConnection =
    pc;


  pc.ontrack =
    event => {

      const stream =
        event.streams?.[0];

      if (
        remoteAudio &&
        stream
      ) {
        remoteAudio.srcObject =
          stream;

        remoteAudio.autoplay =
          true;

        remoteAudio.play()
          .catch(
            error =>
              console.warn(
                "Realtime Audio Autoplay:",
                error
              )
          );
      }
    };


  if (!micStream) {

    await createMicrophoneStream();
  }


  const micTrack =
    micStream
      .getAudioTracks()[0];


  if (!micTrack) {

    throw new Error(
      "Kein Mikrofon-Audiotrack gefunden."
    );
  }


  pc.addTrack(
    micTrack,
    micStream
  );


  const dc =
    pc.createDataChannel(
      "oai-events"
    );


  dataChannel =
    dc;


  dc.addEventListener(
    "open",
    () => {

      realtimeConnected =
        true;


      debugSet(
        "dbgOpenAI",
        "✅"
      );


      debugSet(
        "dbgEvent",
        "OpenAI DataChannel offen"
      );


      console.log(
        "OpenAI DataChannel offen."
      );
    }
  );


  dc.addEventListener(
    "close",
    () => {

      realtimeConnected =
        false;


      debugSet(
        "dbgOpenAI",
        "❌"
      );


      console.log(
        "OpenAI DataChannel geschlossen."
      );
    }
  );


  dc.addEventListener(
    "error",
    error => {

      console.error(
        "OpenAI DataChannel Fehler:",
        error
      );


      debugSet(
        "dbgOpenAI",
        "❌"
      );


      debugSet(
        "dbgEvent",
        "OpenAI DataChannel Fehler"
      );
    }
  );


  dc.addEventListener(
    "message",
    event => {

      const message =
        safeJsonParse(
          event.data
        );


      if (!message) {
        return;
      }


      handleRealtimeEvent(
        message
      );
    }
  );


  const offer =
    await pc.createOffer();


  await pc.setLocalDescription(
    offer
  );


  const response =
    await fetch(
      "/api/realtime-session",
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/sdp"
        },

        body:
          offer.sdp
      }
    );


  const answerSdp =
    await response.text();


  if (!response.ok) {

    debugSet(
      "dbgEvent",
      "OpenAI Session Fehler"
    );


    throw new Error(
      answerSdp ||
      "OpenAI Realtime Verbindung fehlgeschlagen."
    );
  }


  await pc.setRemoteDescription({

    type:
      "answer",

    sdp:
      answerSdp
  });


  const start =
    Date.now();


  while (
    !dataChannel ||
    dataChannel.readyState !==
      "open"
  ) {

    if (
      Date.now() -
      start >
      10000
    ) {

      throw new Error(
        "OpenAI DataChannel Timeout."
      );
    }


    await sleep(
      50
    );
  }


  realtimeConnected =
    true;


  debugSet(
    "dbgOpenAI",
    "✅"
  );


  debugSet(
    "dbgEvent",
    "OpenAI Realtime verbunden"
  );


  console.log(
    "OpenAI Realtime verbunden."
  );
}


/* =========================================================
   DISCONNECT REALTIME
   ========================================================= */

function disconnectRealtime() {

  realtimeConnected =
    false;


  debugSet(
    "dbgOpenAI",
    "❌"
  );


  if (dataChannel) {

    try {
      dataChannel.close();
    } catch {}


    dataChannel =
      null;
  }


  if (peerConnection) {

    try {
      peerConnection.close();
    } catch {}


    peerConnection =
      null;
  }
}


/* =========================================================
   RESPONSE CANCEL
   ========================================================= */

function cancelCurrentResponse() {

  if (
    responseInProgress
  ) {

    sendRealtimeEvent({
      type:
        "response.cancel"
    });
  }


  responseInProgress =
    false;


  currentResponseText =
    "";


  assistantSpeaking =
    false;


  if (active) {

    setJarvisState(
      "listening"
    );


    setLog(
      "JARVIS hört zu."
    );


    setMicrophoneEnabled(
      true
    );
  }
}


/* =========================================================
   EXACT SPEECH
   ========================================================= */

function requestExactSpeech(
  text
) {

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
    return;
  }


  if (
    !dataChannel ||
    dataChannel.readyState !==
      "open"
  ) {

    console.warn(
      "Realtime Audio ist noch nicht verbunden."
    );

    return;
  }


  currentResponseText =
    "";


  responseInProgress =
    true;


  sendRealtimeEvent({

    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ],

      instructions:
        `Antworte exakt mit folgendem deutschen Text und mit nichts anderem:

${clean}`
    }
  });
}


/* =========================================================
   GREETING
   ========================================================= */

async function speakGreeting() {

  if (!active) {
    return;
  }


  greetingInProgress =
    true;


  setMicrophoneEnabled(
    false
  );


  setJarvisState(
    "speaking"
  );


  setLog(
    "JARVIS startet …"
  );


  debugSet(
    "dbgEvent",
    "Begrüßung wird vorbereitet"
  );


  await sleep(
    INTRO_VOICE_DELAY_MS
  );


  if (!active) {
    return;
  }


  const greeting =
    getGreeting();


  requestExactSpeech(
    greeting
  );


  duckIntro();
}


function isBusyForProactiveSpeech() {

  return (
    !active ||
    greetingInProgress ||
    assistantSpeaking ||
    responseInProgress ||
    userTurnInProgress ||
    runningToolCalls.size > 0
  );
}


function flushPendingProactiveNotice() {

  if (
    pendingProactiveFlushTimer
  ) {
    clearTimeout(
      pendingProactiveFlushTimer
    );
  }


  pendingProactiveFlushTimer =
    setTimeout(
      () => {

        pendingProactiveFlushTimer =
          null;


        if (
          !pendingProactiveNotice
        ) {
          return;
        }


        if (
          isBusyForProactiveSpeech()
        ) {
          flushPendingProactiveNotice();
          return;
        }


        const text =
          pendingProactiveNotice;


        pendingProactiveNotice =
          "";


        if (
          !speakProactiveMessage(
            text
          )
        ) {
          pendingProactiveNotice =
            text;
          flushPendingProactiveNotice();
        }

      },
      700
    );
}


function deliverOrQueueProactiveNotice(
  text
) {

  const clean =
    String(text || "")
      .trim();


  if (!clean) {
    return false;
  }


  if (
    isBusyForProactiveSpeech()
  ) {
    pendingProactiveNotice =
      clean;
    flushPendingProactiveNotice();
    return false;
  }


  return speakProactiveMessage(
    clean
  );
}


/* =========================================================
   PROACTIVE MESSAGE
   ========================================================= */

function speakProactiveMessage(
  text
) {

  if (
    !active ||
    greetingInProgress ||
    assistantSpeaking ||
    responseInProgress ||
    userTurnInProgress ||
    runningToolCalls.size > 0
  ) {

    return false;
  }


  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
    return false;
  }


  setMicrophoneEnabled(
    false
  );


  requestExactSpeech(
    clean
  );


  return true;
}


/* =========================================================
   GMAIL · MAIL-VOLLANSICHT / AKTUELLER KONTEXT
   ========================================================= */

function ensureGmailMailModal() {

  let modal =
    document.getElementById(
      "gmailMailModal"
    );


  if (modal) {
    return modal;
  }


  modal =
    document.createElement(
      "div"
    );


  modal.id =
    "gmailMailModal";


  modal.className =
    "gmail-mail-modal";


  modal.innerHTML = `
    <div class="gmail-mail-card" role="dialog" aria-modal="true" aria-label="E-Mail">
      <div class="gmail-mail-top">
        <div>
          <span class="gmail-mail-kicker">GMAIL · AKTUELLE MAIL</span>
          <strong id="gmailMailSubject">E-Mail</strong>
        </div>
        <button type="button" id="gmailMailClose" class="gmail-mail-close">×</button>
      </div>
      <div class="gmail-mail-meta">
        <div><span>VON</span><b id="gmailMailFrom">—</b></div>
        <div><span>DATUM</span><b id="gmailMailDate">—</b></div>
      </div>
      <div id="gmailMailBody" class="gmail-mail-body"></div>
      <div class="gmail-mail-actions">
        <button type="button" id="gmailMailReadBtn">VORLESEN</button>
        <button type="button" id="gmailMailReplyBtn" class="gmail-mail-ai-reply">JARVIS ANTWORTEN</button>
        <button type="button" id="gmailMailCloseBtn">SCHLIESSEN</button>
      </div>
      <div class="gmail-mail-hint">Sag z. B. „Antworte darauf, dass …“ · Gesendet wird erst nach deinem ausdrücklichen „Senden“.</div>
    </div>`;


  document.body.appendChild(
    modal
  );


  const close =
    () => {
      modal.classList.remove(
        "open"
      );
    };


  modal.querySelector(
    "#gmailMailClose"
  )?.addEventListener(
    "click",
    close
  );


  modal.querySelector(
    "#gmailMailCloseBtn"
  )?.addEventListener(
    "click",
    close
  );


  modal.addEventListener(
    "click",
    event => {
      if (
        event.target === modal
      ) {
        close();
      }
    }
  );


  modal.querySelector(
    "#gmailMailReadBtn"
  )?.addEventListener(
    "click",
    () => {

      if (
        !currentSelectedEmail?.body
      ) {
        return;
      }


      if (
        active &&
        realtimeConnected
      ) {
        requestExactSpeech(
          `E-Mail von ${getSenderDisplayName(currentSelectedEmail.from)}. Betreff: ${currentSelectedEmail.subject}. ${currentSelectedEmail.body}`
        );
      }
    }
  );



  modal.querySelector(
    "#gmailMailReplyBtn"
  )?.addEventListener(
    "click",
    async () => {

      if (
        !currentSelectedEmailId
      ) {
        return;
      }

      const button =
        modal.querySelector(
          "#gmailMailReplyBtn"
        );

      const original =
        button?.textContent ||
        "JARVIS ANTWORTEN";

      if (
        button
      ) {
        button.disabled =
          true;
        button.textContent =
          "JARVIS DENKT …";
      }

      try {

        const response =
          await fetch(
            "/api/realtime-tool",
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify({
                  name:
                    "create_email_reply_draft",
                  arguments: {
                    message_id:
                      currentSelectedEmailId,
                    instruction:
                      "Formuliere selbstständig eine passende, professionelle und freundliche Antwort auf diese Kundenmail. Beantworte das Anliegen konkret anhand der vorhandenen Mail. Erfinde keine Preise, Liefertermine oder Zusagen."
                  }
                })
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data?.ok ||
          !data?.draft
        ) {
          throw new Error(
            data?.error ||
            "Antwortvorschlag konnte nicht erstellt werden."
          );
        }

        if (
          data?.gmail_draft_id ||
          data?.draft?.gmail_draft_id
        ) {
          currentGmailDraftId =
            data.gmail_draft_id ||
            data.draft.gmail_draft_id;

          try {
            sessionStorage.setItem(
              "jarvisGmailDraftId",
              currentGmailDraftId
            );
          } catch {}
        }

        showDraft(
          data.draft
        );

        modal.classList.remove(
          "open"
        );

      } catch (
        error
      ) {

        setLog(
          error.message ||
          "Antwortvorschlag fehlgeschlagen."
        );

      } finally {

        if (
          button
        ) {
          button.disabled =
            false;
          button.textContent =
            original;
        }
      }
    }
  );


  return modal;
}


function showGmailMail(email) {

  if (!email?.id) {
    return;
  }


  currentSelectedEmailId =
    email.id;


  currentSelectedEmail =
    email;


  const modal =
    ensureGmailMailModal();


  const subject =
    modal.querySelector(
      "#gmailMailSubject"
    );


  const from =
    modal.querySelector(
      "#gmailMailFrom"
    );


  const date =
    modal.querySelector(
      "#gmailMailDate"
    );


  const body =
    modal.querySelector(
      "#gmailMailBody"
    );


  if (subject) {
    subject.textContent =
      email.subject ||
      "(kein Betreff)";
  }


  if (from) {
    from.textContent =
      email.from ||
      "unbekannt";
  }


  if (date) {
    const parsed =
      email.date
        ? new Date(email.date)
        : null;


    date.textContent =
      parsed &&
      !Number.isNaN(parsed.getTime())
        ? new Intl.DateTimeFormat(
            "de-DE",
            {
              timeZone:
                "Europe/Berlin",
              dateStyle:
                "medium",
              timeStyle:
                "short"
            }
          ).format(parsed)
        : "—";
  }


  if (body) {
    body.textContent =
      email.body ||
      email.snippet ||
      "Kein Textinhalt verfügbar.";
  }


  modal.classList.add(
    "open"
  );
}


async function openGmailMessage(messageId) {

  const id =
    String(messageId || "")
      .trim();


  if (!id) {
    return;
  }


  try {

    const response =
      await fetch(
        `/api/gmail-message/${encodeURIComponent(id)}`,
        {
          method:
            "GET",
          cache:
            "no-store"
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data?.ok ||
      !data?.email
    ) {
      throw new Error(
        data?.error ||
        "E-Mail konnte nicht geöffnet werden."
      );
    }


    showGmailMail(
      data.email
    );

  } catch (error) {

    console.warn(
      "Gmail Mail öffnen Fehler:",
      error
    );


    setLog(
      error.message ||
      "E-Mail konnte nicht geöffnet werden."
    );
  }
}


/* =========================================================
   GMAIL DASHBOARD · LETZTE 5 POSTEINGANG
   Läuft unabhängig davon, ob JARVIS gerade zuhört.
   ========================================================= */

let inboxRefreshTimer =
  null;


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function getSenderDisplayName(from) {

  const value =
    String(from || "")
      .trim();


  if (!value) {
    return "Unbekannt";
  }


  const quoted =
    value.match(/^\s*\"([^\"]+)\"\s*</);


  if (quoted?.[1]) {
    return quoted[1].trim();
  }


  const beforeAddress =
    value.split("<")[0]
      .trim()
      .replace(/^\"|\"$/g, "");


  if (beforeAddress) {
    return beforeAddress;
  }


  const address =
    value.match(/<([^>]+)>/)?.[1] ||
    value;


  return String(address)
    .split("@")[0]
    .trim() ||
    "Unbekannt";
}


function getSenderInitials(name) {

  const parts =
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);


  if (!parts.length) {
    return "ML";
  }


  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }


  return `${parts[0][0]}${parts[1][0]}`
    .toUpperCase();
}


function formatInboxTime(email) {

  const raw =
    email?.internalDate
      ? Number(email.internalDate)
      : email?.date
        ? Date.parse(email.date)
        : NaN;


  if (!Number.isFinite(raw)) {
    return "—";
  }


  const date =
    new Date(raw);


  const now =
    new Date();


  const sameBerlinDay =
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
    ).format(date) ===
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


  if (sameBerlinDay) {
    return new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone:
          "Europe/Berlin",
        hour:
          "2-digit",
        minute:
          "2-digit"
      }
    ).format(date);
  }


  return new Intl.DateTimeFormat(
    "de-DE",
    {
      timeZone:
        "Europe/Berlin",
      day:
        "2-digit",
      month:
        "2-digit"
    }
  ).format(date);
}


function renderInboxEmails(emails) {

  const list =
    document.getElementById(
      "inboxList"
    );


  if (!list) {
    return;
  }


  const items =
    Array.isArray(emails)
      ? emails.slice(0, 5)
      : [];


  if (!items.length) {
    list.innerHTML =
      `<div class="email-row">
        <div class="avatar">✓</div>
        <div class="email-sender">Gmail</div>
        <div class="email-copy">
          <div class="email-subject">Posteingang leer</div>
          <div class="email-snippet">Aktuell liegen keine Nachrichten im Posteingang.</div>
        </div>
        <div class="email-time">—</div>
      </div>`;
    return;
  }


  list.innerHTML =
    items.map(
      email => {

        const sender =
          getSenderDisplayName(
            email.from
          );


        const subject =
          String(
            email.subject ||
            "(kein Betreff)"
          );


        const snippet =
          String(
            email.snippet ||
            ""
          );


        const unreadMark =
          email.unread
            ? "● "
            : "";


        return `
          <div class="email-row" data-mail-id="${escapeHtml(email.id || "")}">
            <div class="avatar">${escapeHtml(getSenderInitials(sender))}</div>
            <div class="email-sender">${escapeHtml(sender)}</div>
            <div class="email-copy">
              <div class="email-subject">${unreadMark}${escapeHtml(subject)}</div>
              <div class="email-snippet">${escapeHtml(snippet)}</div>
            </div>
            <div class="email-time">${escapeHtml(formatInboxTime(email))}</div>
          </div>`;
      }
    ).join("");

  list.querySelectorAll(
    "[data-mail-id]"
  ).forEach(
    row => {
      row.setAttribute(
        "role",
        "button"
      );

      row.setAttribute(
        "tabindex",
        "0"
      );

      row.title =
        "Mail öffnen";
    }
  );
}



function setWhatsAppStatus(
  text,
  state = ""
) {

  const el =
    document.querySelector(
      ".modern-whatsapp .wa-state"
    );

  if (
    !el
  ) {
    return;
  }

  el.textContent =
    text;

  el.dataset.state =
    state;
}


function getWhatsAppListElement() {

  return (
    document.querySelector(
      ".wa-modern-list"
    ) ||
    document.querySelector(
      ".modern-whatsapp .modern-message-list"
    ) ||
    document.querySelector(
      ".whatsapp-list"
    )
  );
}


function formatWhatsAppTime(
  value
) {

  if (
    !value
  ) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "de-DE",
    {
      timeZone:
        "Europe/Berlin",
      hour:
        "2-digit",
      minute:
        "2-digit"
    }
  ).format(date);
}


function renderWhatsAppConversations(
  conversations
) {

  const list =
    getWhatsAppListElement();

  if (
    !list
  ) {
    return;
  }

  const items =
    Array.isArray(
      conversations
    )
      ? conversations.slice(
          0,
          5
        )
      : [];

  if (
    !items.length
  ) {
    list.innerHTML =
      `<div class="message-row modern-message-row">
        <div class="sender-avatar wa-avatar">WA</div>
        <div class="msg-copy"><b>Keine Chats geladen</b><span>Superchat liefert aktuell keine Konversationen.</span></div>
        <time>—</time>
      </div>`;

    return;
  }

  list.innerHTML =
    items.map(
      (
        item,
        index
      ) => {

        const displayName =
          item.name &&
          item.name !==
            "WhatsApp-Kontakt"
            ? item.name
            : (
                item.handle ||
                "WhatsApp-Kontakt"
              );

        const name =
          escapeHtml(
            displayName
          );

        const preview =
          escapeHtml(
            item.preview &&
            item.preview !==
              "Chat öffnen"
              ? item.preview
              : "Chat auswählen"
          );

        const id =
          escapeHtml(
            item.id ||
            ""
          );

        return `
          <div class="message-row modern-message-row" data-wa-conversation-id="${id}" role="button" tabindex="0">
            <div class="sender-avatar wa-avatar">${String(index + 1).padStart(2, "0")}</div>
            <div class="msg-copy"><b>${name}</b><span>${preview}</span></div>
            <time>${escapeHtml(formatWhatsAppTime(item.updated_at))}</time>
          </div>`;
      }
    ).join("");

  list.querySelectorAll(
    "[data-wa-conversation-id]"
  ).forEach(
    row => {

      const select =
        async () => {

          const id =
            row.dataset
              .waConversationId;

          if (
            !id
          ) {
            return;
          }

          currentSelectedWhatsAppConversationId =
            id;

          list.querySelectorAll(
            "[data-wa-conversation-id]"
          ).forEach(
            item =>
              item.classList.toggle(
                "selected",
                item === row
              )
          );

          try {
            const response =
              await fetch(
                `/api/superchat-conversation/${encodeURIComponent(id)}`,
                {
                  cache:
                    "no-store"
                }
              );

            const data =
              await response.json();

            if (
              response.ok &&
              data?.ok
            ) {
              currentSelectedWhatsAppConversation =
                data.conversation;

              setLog(
                `WhatsApp: ${data.conversation?.name || "Chat"} ausgewählt.`
              );
            }
          } catch (
            error
          ) {
            console.warn(
              "WhatsApp-Chat konnte nicht geöffnet werden:",
              error
            );
          }
        };

      row.addEventListener(
        "click",
        select
      );

      row.addEventListener(
        "keydown",
        event => {
          if (
            event.key ===
              "Enter" ||
            event.key ===
              " "
          ) {
            event.preventDefault();
            select();
          }
        }
      );
    }
  );
}


async function loadWhatsAppDashboard() {

  const list =
    getWhatsAppListElement();

  if (
    !list
  ) {
    return;
  }

  try {
    const response =
      await fetch(
        "/api/superchat-conversations",
        {
          cache:
            "no-store"
        }
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data?.ok
    ) {
      throw new Error(
        data?.error ||
        "Superchat konnte nicht geladen werden."
      );
    }

    renderWhatsAppConversations(
      data.conversations
    );

    setWhatsAppStatus(
      Array.isArray(data.conversations) &&
      data.conversations.length
        ? "● LIVE"
        : "● VERBUNDEN · 0 CHATS",
      "ok"
    );

  } catch (
    error
  ) {
    console.warn(
      "Superchat Dashboard Fehler:",
      error
    );

    setWhatsAppStatus(
      "● FEHLER",
      "error"
    );

    const list =
      getWhatsAppListElement();

    if (
      list
    ) {
      list.innerHTML =
        `<div class="message-row modern-message-row superchat-error-row">
          <div class="sender-avatar wa-avatar">!</div>
          <div class="msg-copy">
            <b>Superchat nicht geladen</b>
            <span>${escapeHtml(error?.message || "Unbekannter Fehler")}</span>
          </div>
          <time>—</time>
        </div>`;
    }
  }
}


async function loadInboxDashboard() {

  const list =
    document.getElementById(
      "inboxList"
    );


  if (!list) {
    return;
  }


  try {

    const response =
      await fetch(
        "/api/gmail-inbox",
        {
          method:
            "GET",
          cache:
            "no-store"
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data?.ok
    ) {
      throw new Error(
        data?.error ||
        "Gmail konnte nicht geladen werden."
      );
    }


    renderInboxEmails(
      data.emails
    );

  } catch (error) {

    console.warn(
      "Gmail Dashboard Fehler:",
      error
    );


    list.innerHTML =
      `<div class="email-row">
        <div class="avatar">!</div>
        <div class="email-sender">Gmail</div>
        <div class="email-copy">
          <div class="email-subject">Posteingang nicht verfügbar</div>
          <div class="email-snippet">${escapeHtml(error.message || "Abruf fehlgeschlagen")}</div>
        </div>
        <div class="email-time">—</div>
      </div>`;
  }
}


function startInboxDashboardRefresh() {

  if (inboxRefreshTimer) {
    clearInterval(
      inboxRefreshTimer
    );
  }


  loadInboxDashboard();


  inboxRefreshTimer =
    setInterval(
      () => {
        loadInboxDashboard();
      },
      5 * 1000
    );
}


/* =========================================================
   PROACTIVE CHECK
   ========================================================= */

async function runProactiveCheck() {

  if (
    proactiveCheckInFlight ||
    !active ||
    greetingInProgress ||
    assistantSpeaking ||
    responseInProgress ||
    userTurnInProgress ||
    runningToolCalls.size > 0
  ) {

    return;
  }


  proactiveCheckInFlight =
    true;


  try {

    const response =
      await fetch(
        "/api/jarvis-checkin",
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"
          },

          body:
            "{}"
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data?.hasNotice ||
      !data?.text
    ) {
      return;
    }


    deliverOrQueueProactiveNotice(
      data.text
    );

  } catch (error) {

    console.warn(
      "Proactive Check Fehler:",
      error
    );

  } finally {

    proactiveCheckInFlight =
      false;
  }
}


/* =========================================================
   REMINDER CHECK
   ========================================================= */

async function runReminderCheck() {

  if (
    !active ||
    greetingInProgress ||
    assistantSpeaking ||
    responseInProgress ||
    userTurnInProgress
  ) {
    return;
  }


  try {

    const response =
      await fetch(
        "/api/jarvis-reminder-check",
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"
          },

          body:
            "{}"
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data?.hasNotice ||
      !data?.text
    ) {
      return;
    }


    deliverOrQueueProactiveNotice(
      data.text
    );

  } catch (error) {

    console.warn(
      "Reminder Check Fehler:",
      error
    );
  }
}


/* =========================================================
   BACKGROUND TIMERS
   ========================================================= */

function startBackgroundChecks() {

  stopBackgroundChecks();


  proactiveFirstCheckTimer =
    setTimeout(
      () => {

        runProactiveCheck();

      },
      PROACTIVE_FIRST_CHECK_DELAY_MS
    );


  proactiveCheckTimer =
    setInterval(
      () => {

        runProactiveCheck();

      },
      PROACTIVE_CHECK_INTERVAL_MS
    );


  reminderCheckTimer =
    setInterval(
      () => {

        runReminderCheck();

      },
      REMINDER_CHECK_INTERVAL_MS
    );
}


function stopBackgroundChecks() {

  if (
    proactiveFirstCheckTimer
  ) {

    clearTimeout(
      proactiveFirstCheckTimer
    );


    proactiveFirstCheckTimer =
      null;
  }


  if (
    proactiveCheckTimer
  ) {

    clearInterval(
      proactiveCheckTimer
    );


    proactiveCheckTimer =
      null;
  }


  if (
    reminderCheckTimer
  ) {

    clearInterval(
      reminderCheckTimer
    );


    reminderCheckTimer =
      null;
  }
}


/* =========================================================
   INTERRUPTION
   ========================================================= */

function handleUserInterruption() {

  if (!active) {
    return;
  }


  if (
    !assistantSpeaking &&
    !responseInProgress
  ) {
    return;
  }


  console.log(
    "Mattl unterbricht JARVIS."
  );


  debugSet(
    "dbgEvent",
    "JARVIS wurde unterbrochen"
  );


  stopStopSpeechRecognition();

  cancelCurrentResponse();


  /*
    Falls die Unterbrechung während der Startbegrüßung kommt,
    darf die Intro-Musik nicht weiterlaufen.
  */
  stopIntro();


  assistantSpeaking =
    false;


  greetingInProgress =
    false;



  setMicrophoneEnabled(
    true
  );


  setJarvisState(
    "hearing"
  );


  setLog(
    "Ich höre zu …"
  );
}


/* =========================================================
   START JARVIS
   ========================================================= */

async function startJarvis() {

  if (!JARVIS_VOICE_SCREEN) {
    console.log(`Voice-Core ist auf Bildschirm ${JARVIS_SCREEN_ROLE} deaktiviert.`);
    return;
  }

  if (
    active ||
    starting
  ) {
    return;
  }


  starting =
    true;


  stopping =
    false;


  debugSet(
    "dbgOpenAI",
    "❌"
  );


  debugSet(
    "dbgEvent",
    "JARVIS startet"
  );


  setButtonActive(
    true
  );


  setStatus(
    "Verbinde …"
  );


  setJarvisState(
    "starting"
  );


  setLog(
    "JARVIS wird gestartet …"
  );


  try {

    const introPromise =
      startIntro();


    await createMicrophoneStream();


    setLog(
      "OpenAI Realtime wird verbunden …"
    );


    debugSet(
      "dbgEvent",
      "OpenAI wird verbunden"
    );


    await connectRealtime();


    await introPromise;


    active =
      true;


    await requestScreenWakeLock();


    setStatus(
      "Online"
    );


    setJarvisState(
      "online"
    );


    debugSet(
      "dbgEvent",
      "JARVIS Online"
    );


    startBackgroundChecks();


    await speakGreeting();

  } catch (error) {

    console.error(
      "JARVIS Startfehler:",
      error
    );


    setStatus(
      "Fehler"
    );


    setLog(
      error.message ||
      "JARVIS konnte nicht gestartet werden."
    );


    debugSet(
      "dbgEvent",
      `STARTFEHLER: ${
        error.message ||
        "unbekannt"
      }`
    );


    active =
      false;


    disconnectRealtime();


    stopMicrophone();


    stopIntro();


    setButtonActive(
      false
    );


    setJarvisState(
      "offline"
    );

  } finally {

    starting =
      false;
  }
}


/* =========================================================
   STOP JARVIS
   ========================================================= */

async function stopJarvis(
  updateUi = true
) {

  if (stopping) {
    return;
  }


  stopping =
    true;


  active =
    false;


  await releaseScreenWakeLock();


  greetingInProgress =
    false;


  assistantSpeaking =
    false;


  stopStopSpeechRecognition();


  responseInProgress =
    false;


  stopBackgroundChecks();


  setMicrophoneEnabled(
    false
  );


  disconnectRealtime();


  stopMicrophone();


  stopIntro();


  runningToolCalls.clear();


  if (updateUi) {

    setButtonActive(
      false
    );


    setStatus(
      "Offline"
    );


    setJarvisState(
      "offline"
    );


    setLog(
      "JARVIS ist offline."
    );


    debugSet(
      "dbgEvent",
      "JARVIS Offline"
    );
  }


  stopping =
    false;
}


/* =========================================================
   TOGGLE BUTTON
   ========================================================= */

if (button) {

  button.addEventListener(
    "click",
    async () => {

      if (
        starting ||
        stopping
      ) {
        return;
      }


      if (active) {

        await stopJarvis();

      } else {

        await startJarvis();
      }
    }
  );
}


/* =========================================================
   PAGE CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    stopBackgroundChecks();


    if (inboxRefreshTimer) {
      clearInterval(inboxRefreshTimer);
      inboxRefreshTimer = null;
    }


      disconnectRealtime();


    stopMicrophone();


    stopIntro();


  }
);


/* =========================================================
   INITIAL UI
   ========================================================= */

if (JARVIS_VOICE_SCREEN) {
  setStatus(
    "Offline"
  );

  setJarvisState(
    "offline"
  );

  setButtonActive(
    false
  );

  setLog(
    "JARVIS ist bereit."
  );
} else {
  setStatus(
    "Display"
  );

  setJarvisState(
    "online"
  );

  setButtonActive(
    false
  );
}


debugSet(
  "dbgEvent",
  "Bereit"
);


if (JARVIS_COMMS_SCREEN) {
  startInboxDashboardRefresh();
}


/* =========================================================
   VERSION
   ========================================================= */

console.log(
  "=============================================="
);


console.log(
  "JARVIS APP V11.0 · SINGLE SCREEN · OPENAI REALTIME AUDIO"
);


console.log(
  "OpenAI Realtime: AUDIO / WebRTC"
);


console.log(
  "Voice Engine: OpenAI Realtime"
);


console.log(
  "=============================================="
);


/* Superchat Dashboard Refresh */
if (JARVIS_COMMS_SCREEN) {
  loadWhatsAppDashboard();
  setInterval(
    loadWhatsAppDashboard,
    30 * 1000
  );
}

/* =========================================================
   GMAIL CLICK SAFETY
   Delegation hält Mail-Klicks auch nach Live-Refresh stabil.
   ========================================================= */

document.addEventListener(
  "click",
  event => {

    const row =
      event.target?.closest?.(
        "#inboxList [data-mail-id]"
      );

    if (
      !row
    ) {
      return;
    }

    const id =
      row.dataset.mailId;

    if (
      id
    ) {
      openGmailMessage(
        id
      );
    }
  }
);


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !==
        "Enter" &&
      event.key !==
        " "
    ) {
      return;
    }

    const row =
      event.target?.closest?.(
        "#inboxList [data-mail-id]"
      );

    if (
      !row
    ) {
      return;
    }

    event.preventDefault();

    const id =
      row.dataset.mailId;

    if (
      id
    ) {
      openGmailMessage(
        id
      );
    }
  }
);



/* =========================================================
   GMAIL POINTER CAPTURE
   Fängt Mail-Klicks bereits in der Capture-Phase ab.
   ========================================================= */

document.addEventListener(
  "pointerup",
  event => {

    const target =
      event.target;

    if (
      !target ||
      typeof target.closest !==
        "function"
    ) {
      return;
    }

    const row =
      target.closest(
        "#inboxList [data-mail-id]"
      );

    if (
      !row
    ) {
      return;
    }

    const id =
      row.getAttribute(
        "data-mail-id"
      );

    if (
      !id
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    openGmailMessage(
      id
    );
  },
  true
);






