/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V9.0 · OPENAI REALTIME / WEBRTC
   15.08.2026

   NEUE ARCHITEKTUR

   Browser-Mikrofon
        ↓
      WebRTC
        ↓
   OpenAI gpt-realtime-2.1
        ↓
   direkte Sprachausgabe
        ↓
   Browser-Lautsprecher

   ENTFALLEN FÜR NORMALE GESPRÄCHE:
   - MediaRecorder
   - manuelle Silence Detection
   - /api/transcribe
   - /api/jarvis-chat
   - ElevenLabs TTS
   - Audio-Blobs
   - Satz-Splitting
   - Audio-Decoding

   BLEIBT:
   - Intro
   - HUD
   - Begrüßungen
   - proaktive Business-Checks
   - Erinnerungs-Checks
   - E-Mail-Entwurfsanzeige
   - Shopify/Gmail/Business-Logik auf dem Server

   WICHTIG:
   Diese V9.0 ist zunächst die Realtime-Sprachbasis.
   Realtime Function Calling für Shopify/Gmail/Notizen usw.
   kommt im nächsten Schritt.
   ========================================================= */


/* =========================================================
   DOM
   ========================================================= */

const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");


/* =========================================================
   STATE
   ========================================================= */

let active = false;
let starting = false;
let assistantSpeaking = false;

let peerConnection = null;
let dataChannel = null;
let micStream = null;

let realtimeConnected = false;
let greetingInProgress = false;
let stopping = false;


/* =========================================================
   PROACTIVE CHECKS
   ========================================================= */

let proactiveCheckTimer = null;
let proactiveFirstCheckTimer = null;
let reminderCheckTimer = null;

const PROACTIVE_CHECK_INTERVAL_MS = 20 * 60 * 1000;
const PROACTIVE_FIRST_CHECK_DELAY_MS = 2 * 60 * 1000;
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio = null;
let introFadeTimer = null;

const INTRO_START = 4;
const INTRO_START_VOLUME = 0.28;
const INTRO_VOICE_DELAY_MS = 1800;
const INTRO_BACKGROUND_VOLUME = 0.025;
const INTRO_DUCK_DURATION_MS = 400;
const INTRO_FADE_DURATION_MS = 7000;


/* =========================================================
   REALTIME SETTINGS
   ========================================================= */

/*
 * Kleine Pause nach dem Öffnen des DataChannels.
 * Keine eigentliche Sprachlatenz - nur damit die Session
 * sicher bereit ist, bevor wir die Begrüßung schicken.
 */
const REALTIME_READY_DELAY_MS = 100;


/* =========================================================
   UI
   ========================================================= */

function setStatus(text) {
  if (!statusEl) return;

  statusEl.textContent = text;
  statusEl.classList.toggle("online", text === "Online");
}

function setLog(text) {
  if (!logEl) return;
  logEl.textContent = text;
}

function setButtonActive(value) {
  if (!button) return;
  button.classList.toggle("active", Boolean(value));
}

function setJarvisState(state) {
  document.body.dataset.jarvisState = state;
}


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}


/* =========================================================
   BERLIN TIME
   ========================================================= */

function getBerlinHour() {
  try {
    const formatter = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hourCycle: "h23"
    });

    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find(part => part.type === "hour");
    const hour = Number(hourPart?.value);

    if (!Number.isNaN(hour)) {
      return hour;
    }
  } catch (error) {
    console.warn("Berlin-Zeit Fehler:", error);
  }

  return new Date().getHours();
}


/* =========================================================
   GREETING
   ========================================================= */

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getGreeting() {
  const hour = getBerlinHour();

  if (hour >= 5 && hour < 11) {
    return pickRandom([
      "Morgen, Mattl. Bin da. Was steht an?",
      "Morgen, Mattl. Mal sehen, was heute wieder brennt.",
      "Hey Mattl. Morgen. Was machen wir?"
    ]);
  }

  if (hour >= 11 && hour < 14) {
    return pickRandom([
      "Hey Mattl. Bin da. Was gibt's?",
      "Mattl, da bin ich. Was steht an?",
      "Hey Mattl. Was machen wir?",
      "Da bist du ja. Ich hatte schon Hoffnung auf einen ruhigen Vormittag."
    ]);
  }

  if (hour >= 14 && hour < 18) {
    return pickRandom([
      "Hey Mattl. Was steht noch an?",
      "Mattl, da bin ich. Was gibt's?",
      "Da bist du ja. Dann retten wir mal den Rest des Tages."
    ]);
  }

  if (hour >= 18 && hour < 23) {
    return pickRandom([
      "Hey Mattl. Noch nicht genug für heute?",
      "Mattl, da bin ich. Was liegt noch an?",
      "Feierabend war wohl nur eine Theorie."
    ]);
  }

  return pickRandom([
    "Mattl ... ernsthaft? Na gut. Ich bin da.",
    "Hey Mattl. Schlaf wird offenbar weiterhin überschätzt.",
    "Mattl, es ist spät. Natürlich arbeiten wir noch."
  ]);
}


/* =========================================================
   DRAFT PANEL
   ========================================================= */

function showDraft(draft) {
  const panel = document.getElementById("draftPanel");
  const subjectEl = document.getElementById("draftSubject");
  const bodyEl = document.getElementById("draftBody");

  if (!panel || !subjectEl || !bodyEl) return;

  subjectEl.textContent = draft?.subject
    ? `Betreff: ${draft.subject}`
    : "";

  bodyEl.textContent = draft?.body || "";

  panel.style.display = "flex";
}

const draftCopyBtn = document.getElementById("draftCopyBtn");

if (draftCopyBtn) {
  draftCopyBtn.addEventListener("click", async () => {
    const subjectEl = document.getElementById("draftSubject");
    const bodyEl = document.getElementById("draftBody");

    const fullText =
      `${subjectEl?.textContent || ""}\n\n${bodyEl?.textContent || ""}`.trim();

    try {
      await navigator.clipboard.writeText(fullText);

      const original = draftCopyBtn.textContent;

      draftCopyBtn.textContent = "Kopiert!";

      setTimeout(() => {
        draftCopyBtn.textContent = original;
      }, 1500);

    } catch (error) {
      console.warn("Kopieren fehlgeschlagen:", error);
    }
  });
}


/* =========================================================
   INTRO
   ========================================================= */

function stopIntro() {
  if (introFadeTimer) {
    clearInterval(introFadeTimer);
    introFadeTimer = null;
  }

  if (introAudio) {
    try {
      introAudio.pause();
    } catch {}

    try {
      introAudio.currentTime = 0;
    } catch {}

    introAudio = null;
  }
}

async function startIntro() {
  stopIntro();

  introAudio = new Audio("/Intro.mp3?v=9");
  introAudio.preload = "auto";
  introAudio.volume = INTRO_START_VOLUME;

  return new Promise(resolve => {
    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const play = async () => {
      try {
        if (!introAudio) {
          done();
          return;
        }

        introAudio.currentTime = INTRO_START;

        await introAudio.play();

        done();

      } catch (error) {
        console.warn("Intro konnte nicht abgespielt werden:", error);
        done();
      }
    };

    introAudio.addEventListener(
      "loadedmetadata",
      play,
      { once: true }
    );

    introAudio.addEventListener(
      "error",
      done,
      { once: true }
    );

    if (introAudio.readyState >= 1) {
      play();
    }

    introAudio.load();
  });
}

function duckIntro() {
  if (!introAudio || introAudio.paused) return;

  if (introFadeTimer) {
    clearInterval(introFadeTimer);
    introFadeTimer = null;
  }

  const originalVolume = introAudio.volume;
  const startedAt = performance.now();

  introFadeTimer = setInterval(() => {
    if (!introAudio) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;
      return;
    }

    const progress = Math.min(
      (performance.now() - startedAt) /
        INTRO_DUCK_DURATION_MS,
      1
    );

    const smooth =
      progress *
      progress *
      (3 - 2 * progress);

    introAudio.volume =
      originalVolume -
      (
        originalVolume -
        INTRO_BACKGROUND_VOLUME
      ) *
      smooth;

    if (progress >= 1) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;

      fadeIntroOut();
    }

  }, 40);
}

function fadeIntroOut() {
  if (!introAudio || introAudio.paused) return;

  const startedAt = performance.now();
  const startingVolume = introAudio.volume;

  introFadeTimer = setInterval(() => {
    if (!introAudio) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;
      return;
    }

    const progress = Math.min(
      (performance.now() - startedAt) /
        INTRO_FADE_DURATION_MS,
      1
    );

    introAudio.volume = Math.max(
      0,
      startingVolume *
        Math.pow(1 - progress, 1.7)
    );

    if (progress >= 1) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;

      try {
        introAudio.pause();
      } catch {}

      introAudio = null;
    }

  }, 60);
}


/* =========================================================
   MICROPHONE
   ========================================================= */

async function createMicrophoneStream() {
  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(
      "Mikrofonzugriff wird von diesem Browser nicht unterstützt."
    );
  }

  micStream =
    await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });

  /*
   * Während Startmusik + Begrüßung hört JARVIS
   * zunächst noch nicht zu.
   */
  setMicrophoneEnabled(false);

  return micStream;
}

function setMicrophoneEnabled(enabled) {
  if (!micStream) return;

  for (const track of micStream.getAudioTracks()) {
    track.enabled = Boolean(enabled);
  }
}

function stopMicrophone() {
  if (!micStream) return;

  try {
    for (const track of micStream.getTracks()) {
      track.stop();
    }
  } catch {}

  micStream = null;
}


/* =========================================================
   REALTIME DATA CHANNEL
   ========================================================= */

function sendRealtimeEvent(event) {
  if (
    !dataChannel ||
    dataChannel.readyState !== "open"
  ) {
    console.warn(
      "Realtime Event konnte nicht gesendet werden:",
      event?.type
    );

    return false;
  }

  try {
    dataChannel.send(JSON.stringify(event));
    return true;

  } catch (error) {
    console.error(
      "Realtime Event Sendefehler:",
      error
    );

    return false;
  }
}


/* =========================================================
   REALTIME RESPONSE HELPERS
   ========================================================= */

function speakExactText(text) {
  const cleanText =
    String(text || "").trim();

  if (!cleanText) return false;

  return sendRealtimeEvent({
    type: "response.create",

    response: {
      conversation: "none",

      output_modalities: ["audio"],

      instructions:
        `Sprich jetzt exakt den folgenden deutschen Satz. ` +
        `Füge nichts hinzu und stelle keine Rückfrage:\n\n` +
        cleanText
    }
  });
}

function speakProactiveNotice(text) {
  const cleanText =
    String(text || "").trim();

  if (!cleanText) return false;

  return sendRealtimeEvent({
    type: "response.create",

    response: {
      conversation: "none",

      output_modalities: ["audio"],

      instructions:
        `Du meldest dich gerade selbstständig bei Mattl. ` +
        `Sprich den folgenden Hinweis natürlich, kurz und direkt aus. ` +
        `Keine technische Erklärung, keine zusätzliche Rückfrage.\n\n` +
        cleanText
    }
  });
}


/* =========================================================
   REALTIME EVENTS
   ========================================================= */

function handleRealtimeEvent(event) {
  if (!event?.type) return;

  console.log("[REALTIME]", event.type);

  switch (event.type) {

    /* --------------------------
       SESSION
       -------------------------- */

    case "session.created":
      console.log(
        "Realtime Session erstellt:",
        event.session?.id || ""
      );
      break;

    case "session.updated":
      console.log("Realtime Session aktualisiert.");
      break;


    /* --------------------------
       MATTLS SPRACHE
       -------------------------- */

    case "input_audio_buffer.speech_started":

      if (!active || greetingInProgress) return;

      assistantSpeaking = false;

      setJarvisState("hearing");
      setLog("Ich höre zu …");

      break;


    case "input_audio_buffer.speech_stopped":

      if (!active || greetingInProgress) return;

      setJarvisState("thinking");
      setLog("Denke nach …");

      break;


    /* --------------------------
       JARVIS RESPONSE
       -------------------------- */

    case "response.created":

      assistantSpeaking = true;

      setJarvisState("thinking");
      setLog("JARVIS denkt …");

      break;


    case "response.output_audio.delta":

      assistantSpeaking = true;

      setJarvisState("speaking");
      setLog("JARVIS spricht.");

      break;


    case "response.output_audio_transcript.delta":

      /*
       * Optional zum Debuggen.
       * Nicht ins HUD schreiben, damit es nicht flackert.
       */
      if (event.delta) {
        console.debug(
          "[JARVIS AUDIO TEXT]",
          event.delta
        );
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


    case "response.done":

      assistantSpeaking = false;

      if (greetingInProgress) {
        greetingInProgress = false;

        setMicrophoneEnabled(true);

        setJarvisState("listening");
        setLog("JARVIS hört zu.");

        console.log(
          "[JARVIS] Begrüßung fertig. Mikrofon aktiv."
        );

        return;
      }

      if (active) {
        setJarvisState("listening");
        setLog("JARVIS hört zu.");
      }

      break;


    /* --------------------------
       FEHLER
       -------------------------- */

    case "error":

      console.error(
        "OpenAI Realtime Fehler:",
        event
      );

      setLog(
        event.error?.message
          ? `Realtime Fehler: ${event.error.message}`
          : "Realtime Fehler."
      );

      break;


    default:
      break;
  }
}


/* =========================================================
   REALTIME CONNECTION
   ========================================================= */

async function connectRealtime() {
  if (!micStream) {
    throw new Error(
      "Mikrofon wurde noch nicht gestartet."
    );
  }

  if (
    typeof RTCPeerConnection === "undefined"
  ) {
    throw new Error(
      "WebRTC wird von diesem Browser nicht unterstützt."
    );
  }


  /* --------------------------
     PEER CONNECTION
     -------------------------- */

  peerConnection =
    new RTCPeerConnection();


  /* --------------------------
     REMOTE AUDIO
     -------------------------- */

  peerConnection.ontrack = event => {
    if (!remoteAudio) {
      console.error(
        "#remoteAudio wurde nicht gefunden."
      );

      return;
    }

    const stream =
      event.streams?.[0] ||
      new MediaStream([event.track]);

    remoteAudio.srcObject = stream;

    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.muted = false;
    remoteAudio.volume = 1;

    remoteAudio.play().catch(error => {
      console.warn(
        "Remote Audio autoplay:",
        error
      );
    });
  };


  /* --------------------------
     CONNECTION STATE
     -------------------------- */

  peerConnection.onconnectionstatechange = () => {
    const state =
      peerConnection?.connectionState;

    console.log(
      "WebRTC connectionState:",
      state
    );

    if (
      state === "failed" ||
      state === "disconnected"
    ) {
      if (!stopping && active) {
        setStatus("Verbindung verloren");
        setJarvisState("offline");
        setLog("Realtime-Verbindung unterbrochen.");
      }
    }
  };


  peerConnection.oniceconnectionstatechange = () => {
    console.log(
      "ICE:",
      peerConnection?.iceConnectionState
    );
  };


  /* --------------------------
     MICROPHONE TRACK
     -------------------------- */

  for (
    const track of micStream.getTracks()
  ) {
    peerConnection.addTrack(
      track,
      micStream
    );
  }


  /* --------------------------
     DATA CHANNEL
     -------------------------- */

  dataChannel =
    peerConnection.createDataChannel(
      "oai-events"
    );

  dataChannel.addEventListener(
    "message",
    messageEvent => {
      const event =
        safeJsonParse(messageEvent.data);

      if (!event) {
        console.warn(
          "Ungültiges Realtime Event:",
          messageEvent.data
        );

        return;
      }

      handleRealtimeEvent(event);
    }
  );


  const channelOpenPromise =
    new Promise((resolve, reject) => {

      const timeout =
        setTimeout(() => {
          reject(
            new Error(
              "Realtime DataChannel wurde nicht geöffnet."
            )
          );
        }, 15000);


      dataChannel.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);

          realtimeConnected = true;

          console.log(
            "Realtime DataChannel offen."
          );

          resolve();
        },
        { once: true }
      );


      dataChannel.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);

          reject(
            new Error(
              "Realtime DataChannel Fehler."
            )
          );
        },
        { once: true }
      );
    });


  /* --------------------------
     SDP OFFER
     -------------------------- */

  const offer =
    await peerConnection.createOffer();

  await peerConnection.setLocalDescription(
    offer
  );


  /* --------------------------
     SERVER → OPENAI
     -------------------------- */

  const response =
    await fetch(
      "/api/realtime-session",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/sdp"
        },

        body:
          peerConnection.localDescription
            ?.sdp ||
          offer.sdp
      }
    );


  const answerSdp =
    await response.text();


  if (!response.ok) {
    console.error(
      "Realtime Session Serverantwort:",
      answerSdp
    );

    throw new Error(
      answerSdp ||
      `Realtime HTTP ${response.status}`
    );
  }


  /* --------------------------
     SDP ANSWER
     -------------------------- */

  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: answerSdp
  });


  /* --------------------------
     WAIT FOR CHANNEL
     -------------------------- */

  await channelOpenPromise;

  await sleep(
    REALTIME_READY_DELAY_MS
  );

  return true;
}


/* =========================================================
   REALTIME CLEANUP
   ========================================================= */

function disconnectRealtime() {
  realtimeConnected = false;

  if (dataChannel) {
    try {
      dataChannel.close();
    } catch {}

    dataChannel = null;
  }

  if (peerConnection) {
    try {
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.close();
    } catch {}

    peerConnection = null;
  }

  if (remoteAudio) {
    try {
      remoteAudio.pause();
    } catch {}

    try {
      remoteAudio.srcObject = null;
    } catch {}

    remoteAudio.muted = false;
    remoteAudio.volume = 1;
  }
}


/* =========================================================
   PROACTIVE BUSINESS CHECKS
   ========================================================= */

async function runBackgroundCheck(endpointUrl) {
  if (
    !active ||
    !realtimeConnected ||
    greetingInProgress ||
    assistantSpeaking
  ) {
    return;
  }

  try {

    const response =
      await fetch(endpointUrl, {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        /*
         * previous_response_id wird bei Realtime
         * nicht mehr benötigt.
         */
        body: JSON.stringify({})
      });


    if (!response.ok) {
      return;
    }


    const data =
      await response.json();


    if (
      !data ||
      !data.ok ||
      !data.hasNotice ||
      !data.text
    ) {
      return;
    }


    console.log(
      "JARVIS proaktiv:",
      data.text
    );


    speakProactiveNotice(
      data.text
    );

  } catch (error) {
    console.warn(
      "Hintergrund-Check fehlgeschlagen:",
      error
    );
  }
}


async function checkProactiveNotice() {
  await runBackgroundCheck(
    "/api/jarvis-checkin"
  );
}


async function checkDueReminders() {
  await runBackgroundCheck(
    "/api/jarvis-reminder-check"
  );
}


function startProactiveChecks() {
  stopProactiveChecks();


  proactiveFirstCheckTimer =
    setTimeout(() => {
      checkProactiveNotice();
    }, PROACTIVE_FIRST_CHECK_DELAY_MS);


  proactiveCheckTimer =
    setInterval(() => {
      checkProactiveNotice();
    }, PROACTIVE_CHECK_INTERVAL_MS);


  reminderCheckTimer =
    setInterval(() => {
      checkDueReminders();
    }, REMINDER_CHECK_INTERVAL_MS);
}


function stopProactiveChecks() {
  if (proactiveFirstCheckTimer) {
    clearTimeout(
      proactiveFirstCheckTimer
    );

    proactiveFirstCheckTimer = null;
  }


  if (proactiveCheckTimer) {
    clearInterval(
      proactiveCheckTimer
    );

    proactiveCheckTimer = null;
  }


  if (reminderCheckTimer) {
    clearInterval(
      reminderCheckTimer
    );

    reminderCheckTimer = null;
  }
}


/* =========================================================
   START JARVIS
   ========================================================= */

async function startJarvis() {
  if (active || starting) return;

  starting = true;
  stopping = false;

  if (button) {
    button.disabled = true;
  }


  setJarvisState("connecting");

  setStatus("Verbinde …");

  setButtonActive(true);

  setLog("JARVIS startet …");


  try {

    /* --------------------------
       MICROPHONE
       -------------------------- */

    await createMicrophoneStream();


    /* --------------------------
       INTRO
       -------------------------- */

    await startIntro();


    /* --------------------------
       REALTIME CONNECT
       -------------------------- */

    setLog(
      "Realtime-Verbindung wird aufgebaut …"
    );

    await connectRealtime();


    active = true;

    setStatus("Online");


    /* --------------------------
       INTRO TIMING
       -------------------------- */

    await sleep(
      INTRO_VOICE_DELAY_MS
    );


    if (!active) return;


    duckIntro();


    /* --------------------------
       GREETING
       -------------------------- */

    greetingInProgress = true;

    setJarvisState("speaking");
    setLog("JARVIS meldet sich.");


    const greeting =
      getGreeting();


    console.log(
      "JARVIS Begrüßung:",
      greeting
    );


    const sent =
      speakExactText(greeting);


    if (!sent) {
      throw new Error(
        "Begrüßung konnte nicht gestartet werden."
      );
    }


    /*
     * Das Mikro wird erst durch response.done
     * in handleRealtimeEvent aktiviert.
     */


    /* --------------------------
       PROACTIVE CHECKS
       -------------------------- */

    startProactiveChecks();


  } catch (error) {

    console.error(
      "JARVIS Start error:",
      error
    );


    active = false;
    greetingInProgress = false;


    stopProactiveChecks();
    disconnectRealtime();
    stopMicrophone();
    stopIntro();


    setJarvisState("offline");
    setStatus("Offline");
    setButtonActive(false);

    setLog(
      `Start fehlgeschlagen: ${
        error.message ||
        "Unbekannter Fehler"
      }`
    );

  } finally {

    starting = false;

    if (button) {
      button.disabled = false;
    }
  }
}


/* =========================================================
   STOP JARVIS
   ========================================================= */

async function stopJarvis() {
  if (stopping) return;

  stopping = true;

  active = false;
  starting = false;
  greetingInProgress = false;
  assistantSpeaking = false;


  stopProactiveChecks();

  setMicrophoneEnabled(false);

  disconnectRealtime();

  stopMicrophone();

  stopIntro();


  setButtonActive(false);

  setJarvisState("offline");

  setStatus("Offline");

  setLog("Bereit.");


  if (button) {
    button.disabled = false;
  }


  stopping = false;
}


/* =========================================================
   INITIAL STATE
   ========================================================= */

setJarvisState("offline");

setStatus("Offline");

setLog("Bereit.");

if (remoteAudio) {
  remoteAudio.autoplay = true;
  remoteAudio.playsInline = true;
  remoteAudio.muted = false;
  remoteAudio.volume = 1;
}


/* =========================================================
   BUTTON
   ========================================================= */

if (button) {

  button.addEventListener(
    "click",
    async () => {

      if (starting || stopping) {
        return;
      }


      if (active) {
        await stopJarvis();
        return;
      }


      await startJarvis();
    }
  );

} else {

  console.error(
    "#toggle-Button wurde nicht gefunden."
  );
}


/* =========================================================
   PAGE CLEANUP
   ========================================================= */

window.addEventListener(
  "pagehide",
  () => {
    stopJarvis();
  }
);
