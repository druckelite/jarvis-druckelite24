/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V9.0.1 · OPENAI REALTIME / WEBRTC
   FIX: SDP HANDSHAKE

   Browser Mikrofon
        ↓
   RTCPeerConnection
        ↓
   offer.sdp
        ↓
   /api/realtime-session
        ↓
   OpenAI Realtime
        ↓
   WebRTC Audio zurück
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
let stopping = false;

let peerConnection = null;
let dataChannel = null;
let micStream = null;

let realtimeConnected = false;
let assistantSpeaking = false;
let greetingInProgress = false;


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
   UI
   ========================================================= */

function setStatus(text) {
  if (!statusEl) return;

  statusEl.textContent = text;
  statusEl.classList.toggle(
    "online",
    text === "Online"
  );
}

function setLog(text) {
  if (!logEl) return;
  logEl.textContent = text;
}

function setButtonActive(value) {
  if (!button) return;

  button.classList.toggle(
    "active",
    Boolean(value)
  );
}

function setJarvisState(state) {
  document.body.dataset.jarvisState = state;
}


/* =========================================================
   BERLIN TIME
   ========================================================= */

function getBerlinHour() {
  try {
    const formatter =
      new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "numeric",
        hourCycle: "h23"
      });

    const parts =
      formatter.formatToParts(
        new Date()
      );

    const hourPart =
      parts.find(
        part => part.type === "hour"
      );

    const hour =
      Number(hourPart?.value);

    if (!Number.isNaN(hour)) {
      return hour;
    }

  } catch (error) {
    console.warn(
      "Berlin-Zeit Fehler:",
      error
    );
  }

  return new Date().getHours();
}


/* =========================================================
   GREETING
   ========================================================= */

function pickRandom(items) {
  return items[
    Math.floor(
      Math.random() * items.length
    )
  ];
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

  panel.style.display = "flex";
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
        await navigator.clipboard.writeText(
          fullText
        );

        const original =
          draftCopyBtn.textContent;

        draftCopyBtn.textContent =
          "Kopiert!";

        setTimeout(() => {
          draftCopyBtn.textContent =
            original;
        }, 1500);

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
   INTRO
   ========================================================= */

function stopIntro() {
  if (introFadeTimer) {
    clearInterval(
      introFadeTimer
    );

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

  introAudio =
    new Audio("/Intro.mp3?v=901");

  introAudio.preload = "auto";
  introAudio.volume =
    INTRO_START_VOLUME;

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
      { once: true }
    );

    introAudio.addEventListener(
      "error",
      done,
      { once: true }
    );

    if (
      introAudio.readyState >= 1
    ) {
      play();
    }

    introAudio.load();
  });
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

    introFadeTimer = null;
  }

  const original =
    introAudio.volume;

  const start =
    performance.now();

  introFadeTimer =
    setInterval(() => {

      if (!introAudio) {
        clearInterval(
          introFadeTimer
        );

        introFadeTimer = null;
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
        (3 - 2 * progress);

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

        introFadeTimer = null;

        fadeIntroOut();
      }

    }, 40);
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
    setInterval(() => {

      if (!introAudio) {
        clearInterval(
          introFadeTimer
        );

        introFadeTimer = null;
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
      "Mikrofon wird von diesem Browser nicht unterstützt."
    );
  }

  micStream =
    await navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });

  /*
   * Mikro während Intro erst deaktiviert.
   */
  setMicrophoneEnabled(false);

  return micStream;
}


function setMicrophoneEnabled(enabled) {
  if (!micStream) return;

  for (
    const track of
    micStream.getAudioTracks()
  ) {
    track.enabled =
      Boolean(enabled);
  }
}


function stopMicrophone() {
  if (!micStream) return;

  try {
    for (
      const track of
      micStream.getTracks()
    ) {
      track.stop();
    }
  } catch {}

  micStream = null;
}


/* =========================================================
   REALTIME EVENT SENDER
   ========================================================= */

function sendRealtimeEvent(event) {
  if (
    !dataChannel ||
    dataChannel.readyState !== "open"
  ) {
    console.warn(
      "DataChannel nicht offen:",
      event?.type
    );

    return false;
  }

  try {
    dataChannel.send(
      JSON.stringify(event)
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
   SPEAK TEXT
   ========================================================= */

function speakExactText(text) {
  const clean =
    String(text || "").trim();

  if (!clean) {
    return false;
  }

  return sendRealtimeEvent({
    type: "response.create",

    response: {
      output_modalities: [
        "audio"
      ],

      instructions:
        `Sprich jetzt genau diese kurze Begrüßung auf Deutsch aus. ` +
        `Füge nichts hinzu und stelle keine Rückfrage: ${clean}`
    }
  });
}


function speakProactiveNotice(text) {
  const clean =
    String(text || "").trim();

  if (!clean) {
    return false;
  }

  return sendRealtimeEvent({
    type: "response.create",

    response: {
      output_modalities: [
        "audio"
      ],

      instructions:
        `Melde dich jetzt selbstständig kurz bei Mattl. ` +
        `Sprich folgenden Hinweis natürlich auf Deutsch aus. ` +
        `Keine technische Erklärung und keine zusätzliche Frage: ${clean}`
    }
  });
}


/* =========================================================
   REALTIME EVENTS
   ========================================================= */

function handleRealtimeEvent(event) {
  if (!event?.type) return;

  console.log(
    "[REALTIME]",
    event.type
  );

  switch (event.type) {

    case "session.created":
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
      if (
        !active ||
        greetingInProgress
      ) {
        return;
      }

      setJarvisState(
        "hearing"
      );

      setLog(
        "Ich höre zu …"
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

      break;


    case "response.created":
      assistantSpeaking = true;

      setJarvisState(
        "thinking"
      );

      setLog(
        "JARVIS denkt …"
      );

      break;


    case "response.output_audio.delta":
      assistantSpeaking = true;

      setJarvisState(
        "speaking"
      );

      setLog(
        "JARVIS spricht."
      );

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

        setMicrophoneEnabled(
          true
        );

        setJarvisState(
          "listening"
        );

        setLog(
          "JARVIS hört zu."
        );

        console.log(
          "Begrüßung beendet. Mikrofon aktiv."
        );

        break;
      }

      if (active) {
        setJarvisState(
          "listening"
        );

        setLog(
          "JARVIS hört zu."
        );
      }

      break;


    case "error":
      console.error(
        "Realtime Fehler:",
        event
      );

      setLog(
        event.error?.message ||
        "Realtime Fehler."
      );

      break;


    default:
      break;
  }
}


/* =========================================================
   WEBRTC CONNECT
   ========================================================= */

async function connectRealtime() {
  if (!micStream) {
    throw new Error(
      "Mikrofon wurde nicht gestartet."
    );
  }

  if (
    typeof RTCPeerConnection ===
    "undefined"
  ) {
    throw new Error(
      "WebRTC wird von diesem Browser nicht unterstützt."
    );
  }


  /* =======================================================
     PEER CONNECTION
     ======================================================= */

  peerConnection =
    new RTCPeerConnection();


  /* =======================================================
     REMOTE AUDIO
     ======================================================= */

  peerConnection.ontrack =
    event => {

      if (!remoteAudio) {
        console.error(
          "#remoteAudio fehlt in index.html."
        );

        return;
      }

      const stream =
        event.streams?.[0] ||
        new MediaStream([
          event.track
        ]);

      remoteAudio.srcObject =
        stream;

      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      remoteAudio.muted = false;
      remoteAudio.volume = 1;

      remoteAudio.onplaying = () => {
        if (!active) return;

        assistantSpeaking = true;

        setJarvisState(
          "speaking"
        );

        setLog(
          "JARVIS spricht."
        );
      };

      remoteAudio
        .play()
        .catch(error => {
          console.warn(
            "Audio autoplay:",
            error
          );
        });
    };


  /* =======================================================
     CONNECTION STATE
     ======================================================= */

  peerConnection
    .onconnectionstatechange =
    () => {

      const state =
        peerConnection
          ?.connectionState;

      console.log(
        "[WEBRTC] connectionState:",
        state
      );

      if (
        state === "failed" ||
        state === "disconnected"
      ) {
        if (
          active &&
          !stopping
        ) {
          setStatus(
            "Verbindung verloren"
          );

          setJarvisState(
            "offline"
          );

          setLog(
            "Realtime-Verbindung unterbrochen."
          );
        }
      }
    };


  peerConnection
    .oniceconnectionstatechange =
    () => {

      console.log(
        "[WEBRTC] ICE:",
        peerConnection
          ?.iceConnectionState
      );
    };


  /* =======================================================
     ADD MICROPHONE TRACK

     WICHTIG:
     Track muss VOR createOffer hinzugefügt werden.
     ======================================================= */

  const audioTracks =
    micStream.getAudioTracks();

  if (!audioTracks.length) {
    throw new Error(
      "Keine Mikrofon-Audiospur vorhanden."
    );
  }

  peerConnection.addTrack(
    audioTracks[0],
    micStream
  );


  /* =======================================================
     DATA CHANNEL
     ======================================================= */

  dataChannel =
    peerConnection
      .createDataChannel(
        "oai-events"
      );


  dataChannel.addEventListener(
    "message",
    event => {

      const data =
        safeJsonParse(
          event.data
        );

      if (!data) {
        console.warn(
          "Ungültiges Realtime Event."
        );

        return;
      }

      handleRealtimeEvent(
        data
      );
    }
  );


  const channelReady =
    new Promise(
      (resolve, reject) => {

        const timeout =
          setTimeout(
            () => {
              reject(
                new Error(
                  "Realtime DataChannel wurde nicht geöffnet."
                )
              );
            },
            15000
          );


        dataChannel
          .addEventListener(
            "open",
            () => {

              clearTimeout(
                timeout
              );

              realtimeConnected =
                true;

              console.log(
                "[WEBRTC] DataChannel offen."
              );

              resolve();

            },
            { once: true }
          );


        dataChannel
          .addEventListener(
            "error",
            () => {

              clearTimeout(
                timeout
              );

              reject(
                new Error(
                  "Realtime DataChannel Fehler."
                )
              );

            },
            { once: true }
          );
      }
    );


  /* =======================================================
     CREATE SDP OFFER
     OFFICIAL FLOW
     ======================================================= */

  const offer =
    await peerConnection
      .createOffer();


  if (
    !offer ||
    !offer.sdp
  ) {
    throw new Error(
      "Browser hat kein SDP-Angebot erzeugt."
    );
  }


  await peerConnection
    .setLocalDescription(
      offer
    );


  /*
   * DEBUG:
   * Bei einem korrekten SDP muss Länge > 0
   * und Anfang "v=0" sein.
   */
  console.log(
    "[WEBRTC] Offer SDP Länge:",
    offer.sdp.length
  );

  console.log(
    "[WEBRTC] Offer SDP Anfang:",
    JSON.stringify(
      offer.sdp.slice(
        0,
        100
      )
    )
  );


  if (
    !offer.sdp.startsWith(
      "v=0"
    )
  ) {
    throw new Error(
      "Ungültiges Browser-SDP: beginnt nicht mit v=0."
    );
  }


  if (
    !offer.sdp.includes(
      "m=audio"
    )
  ) {
    throw new Error(
      "Ungültiges Browser-SDP: keine Audiospur."
    );
  }


  /* =======================================================
     SEND EXACT offer.sdp
     ======================================================= */

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
          offer.sdp
      }
    );


  const answerSdp =
    await response.text();


  if (!response.ok) {
    console.error(
      "[WEBRTC] Server Fehler:",
      answerSdp
    );

    throw new Error(
      answerSdp ||
      `Realtime HTTP ${response.status}`
    );
  }


  console.log(
    "[WEBRTC] Answer SDP Länge:",
    answerSdp.length
  );

  console.log(
    "[WEBRTC] Answer SDP Anfang:",
    JSON.stringify(
      answerSdp.slice(
        0,
        100
      )
    )
  );


  if (
    !answerSdp.startsWith(
      "v=0"
    )
  ) {
    throw new Error(
      "Server hat kein gültiges SDP-Answer geliefert."
    );
  }


  /* =======================================================
     SET REMOTE DESCRIPTION
     ======================================================= */

  await peerConnection
    .setRemoteDescription({
      type: "answer",
      sdp: answerSdp
    });


  await channelReady;

  console.log(
    "[WEBRTC] Verbindung vollständig aufgebaut."
  );

  return true;
}


/* =========================================================
   DISCONNECT
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

async function runBackgroundCheck(
  endpointUrl
) {
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
      await fetch(
        endpointUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({})
        }
      );

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
    setTimeout(
      () => {
        checkProactiveNotice();
      },
      PROACTIVE_FIRST_CHECK_DELAY_MS
    );

  proactiveCheckTimer =
    setInterval(
      () => {
        checkProactiveNotice();
      },
      PROACTIVE_CHECK_INTERVAL_MS
    );

  reminderCheckTimer =
    setInterval(
      () => {
        checkDueReminders();
      },
      REMINDER_CHECK_INTERVAL_MS
    );
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
  if (
    active ||
    starting ||
    stopping
  ) {
    return;
  }

  starting = true;

  if (button) {
    button.disabled = true;
  }

  setJarvisState(
    "connecting"
  );

  setStatus(
    "Verbinde …"
  );

  setButtonActive(
    true
  );

  setLog(
    "JARVIS startet …"
  );

  try {

    /* Mikro */

    await createMicrophoneStream();


    /* Intro */

    await startIntro();


    /* Realtime */

    setLog(
      "Realtime-Verbindung wird aufgebaut …"
    );

    await connectRealtime();


    active = true;

    setStatus(
      "Online"
    );


    await sleep(
      INTRO_VOICE_DELAY_MS
    );

    if (!active) {
      return;
    }


    duckIntro();


    /* Begrüßung */

    greetingInProgress =
      true;

    setJarvisState(
      "speaking"
    );

    setLog(
      "JARVIS meldet sich."
    );


    const greeting =
      getGreeting();

    console.log(
      "Begrüßung:",
      greeting
    );


    const sent =
      speakExactText(
        greeting
      );


    if (!sent) {
      throw new Error(
        "Begrüßung konnte nicht gesendet werden."
      );
    }


    startProactiveChecks();

  } catch (error) {
    console.error(
      "JARVIS Startfehler:",
      error
    );

    active = false;
    greetingInProgress = false;
    assistantSpeaking = false;

    stopProactiveChecks();
    disconnectRealtime();
    stopMicrophone();
    stopIntro();

    setJarvisState(
      "offline"
    );

    setStatus(
      "Offline"
    );

    setButtonActive(
      false
    );

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
   STOP
   ========================================================= */

async function stopJarvis() {
  if (stopping) {
    return;
  }

  stopping = true;

  active = false;
  starting = false;
  assistantSpeaking = false;
  greetingInProgress = false;

  stopProactiveChecks();

  setMicrophoneEnabled(
    false
  );

  disconnectRealtime();

  stopMicrophone();

  stopIntro();

  setButtonActive(
    false
  );

  setJarvisState(
    "offline"
  );

  setStatus(
    "Offline"
  );

  setLog(
    "Bereit."
  );

  if (button) {
    button.disabled = false;
  }

  stopping = false;
}


/* =========================================================
   INITIAL STATE
   ========================================================= */

setJarvisState(
  "offline"
);

setStatus(
  "Offline"
);

setLog(
  "Bereit."
);

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

      if (
        starting ||
        stopping
      ) {
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
    "#toggle-Button fehlt."
  );
}


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "pagehide",
  () => {
    stopJarvis();
  }
);
