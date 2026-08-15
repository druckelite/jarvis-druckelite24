const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

let audioContext = null;
let analyser = null;
let sourceNode = null;

let active = false;
let recording = false;
let processing = false;
let speaking = false;

let silenceTimer = null;
let monitorTimer = null;

let history = [];

/* =========================================================
   SETTINGS
   ========================================================= */

const SILENCE_MS = 1100;
const SPEECH_THRESHOLD = 0.035;
const MIN_RECORDING_MS = 500;

/*
 * INTRO
 *
 * Datei beginnt technisch bei Sekunde 4.
 * Nach 2,5 Sekunden beginnt JARVIS zu sprechen.
 * Dann läuft das Intro noch 7 Sekunden leise weiter.
 */
const INTRO_START = 4;
const INTRO_VOICE_DELAY_MS = 2500;
const INTRO_BACKGROUND_VOLUME = 0.18;
const INTRO_FADE_DURATION_MS = 7000;

let recordingStartedAt = 0;
let speechDetected = false;

let introAudio = null;
let introFadeTimer = null;

/* =========================================================
   UI
   ========================================================= */

function setStatus(text) {
  if (!statusEl) return;

  statusEl.textContent = text;

  if (text === "Online") {
    statusEl.classList.add("online");
  } else {
    statusEl.classList.remove("online");
  }
}

function setLog(text) {
  if (!logEl) return;
  logEl.textContent = text;
}

function setButtonActive(value) {
  if (!button) return;

  if (value) {
    button.classList.add("active");
  } else {
    button.classList.remove("active");
  }
}

/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/* =========================================================
   GREETING
   ========================================================= */

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        hour12: false
      }
    ).format(new Date())
  );

  if (hour >= 5 && hour < 11) {
    return "Guten Morgen, Mattl.";
  }

  if (hour >= 11 && hour < 18) {
    return "Guten Tag, Mattl.";
  }

  return "Guten Abend, Mattl.";
}

/* =========================================================
   INTRO AUDIO
   ========================================================= */

function stopIntro() {
  if (introFadeTimer) {
    clearInterval(introFadeTimer);
    introFadeTimer = null;
  }

  if (introAudio) {
    try {
      introAudio.pause();
      introAudio.currentTime = 0;
    } catch {}

    introAudio = null;
  }
}

async function startIntro() {
  stopIntro();

  introAudio = new Audio("/Intro.mp3?v=2");

  introAudio.preload = "auto";
  introAudio.volume = 1;

  return new Promise(resolve => {
    let resolved = false;

    const done = () => {
      if (resolved) return;

      resolved = true;
      resolve();
    };

    const playFromStartPosition = async () => {
      try {
        introAudio.currentTime = INTRO_START;

        await introAudio.play();

        setLog("JARVIS startet …");

        done();

      } catch (error) {
        console.error(
          "Intro play error:",
          error
        );

        done();
      }
    };

    introAudio.addEventListener(
      "loadedmetadata",
      playFromStartPosition,
      { once: true }
    );

    introAudio.addEventListener(
      "error",
      error => {
        console.error(
          "Intro load error:",
          error
        );

        done();
      },
      { once: true }
    );

    /*
     * Falls die Datei bereits im Browser-Cache liegt
     * und die Metadaten schon verfügbar sind.
     */
    if (introAudio.readyState >= 1) {
      playFromStartPosition();
    }

    introAudio.load();
  });
}

/* =========================================================
   INTRO DUCKING + 7 SECOND FADE
   ========================================================= */

function fadeIntroBehindVoice() {
  if (
    !introAudio ||
    introAudio.paused
  ) {
    return;
  }

  /*
   * Sobald JARVIS spricht:
   * Musik sofort deutlich leiser.
   */
  introAudio.volume =
    INTRO_BACKGROUND_VOLUME;

  if (introFadeTimer) {
    clearInterval(introFadeTimer);
  }

  const startTime = performance.now();

  const startVolume =
    INTRO_BACKGROUND_VOLUME;

  introFadeTimer =
    setInterval(() => {
      if (!introAudio) {
        clearInterval(
          introFadeTimer
        );

        introFadeTimer = null;

        return;
      }

      const elapsed =
        performance.now() -
        startTime;

      const progress =
        Math.min(
          elapsed /
            INTRO_FADE_DURATION_MS,
          1
        );

      /*
       * Sanft von 18 % auf 0.
       */
      introAudio.volume =
        Math.max(
          0,
          startVolume *
            (1 - progress)
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

    }, 80);
}

/* =========================================================
   SPEAK
   ========================================================= */

async function speak(
  text,
  options = {}
) {
  const sentence =
    String(text || "").trim();

  if (
    !sentence ||
    !active
  ) {
    return;
  }

  speaking = true;
  processing = false;

  stopListeningMonitor();

  setLog(
    "JARVIS spricht …"
  );

  /*
   * Beim Start darf das Intro unter
   * JARVIS weiterlaufen.
   */
  if (options.duckIntro) {
    fadeIntroBehindVoice();
  }

  try {
    const response =
      await fetch(
        "/api/speak",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              text: sentence
            })
        }
      );

    if (!response.ok) {
      const raw =
        await response.text();

      console.error(
        "Speech API error:",
        raw
      );

      throw new Error(
        "Sprachausgabe fehlgeschlagen."
      );
    }

    const blob =
      await response.blob();

    const url =
      URL.createObjectURL(
        blob
      );

    remoteAudio.srcObject =
      null;

    remoteAudio.src =
      url;

    await remoteAudio.play();

    await new Promise(
      resolve => {
        remoteAudio.onended =
          resolve;
      }
    );

    URL.revokeObjectURL(
      url
    );

  } catch (error) {
    console.error(
      "Speak error:",
      error
    );

    setLog(
      error.message ||
      "Sprachausgabe fehlgeschlagen."
    );

  } finally {
    speaking = false;

    /*
     * Beim normalen Gespräch:
     * sofort wieder zuhören.
     *
     * Beim Start übernimmt startJarvis()
     * den Übergang.
     */
    if (
      active &&
      !options.startup
    ) {
      await startContinuousListening();
    }
  }
}

/* =========================================================
   TRANSCRIPTION
   ========================================================= */

async function transcribe(
  audioBlob
) {
  setLog(
    "Verstehe …"
  );

  const response =
    await fetch(
      "/api/transcribe",
      {
        method: "POST",

        headers: {
          "Content-Type":
            audioBlob.type ||
            "audio/webm"
        },

        body: audioBlob
      }
    );

  const raw =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(raw);

  } catch {
    throw new Error(
      "Spracherkennung hat eine ungültige Antwort geliefert."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Spracherkennung fehlgeschlagen."
    );
  }

  return String(
    data.text || ""
  ).trim();
}

/* =========================================================
   ASK JARVIS
   ========================================================= */

async function askJarvis(
  message
) {
  setLog(
    "Denke nach …"
  );

  const response =
    await fetch(
      "/api/ask",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            message,
            history
          })
      }
    );

  const raw =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(raw);

  } catch {
    throw new Error(
      "JARVIS hat eine ungültige Serverantwort erhalten."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "JARVIS konnte die Anfrage nicht bearbeiten."
    );
  }

  const reply =
    String(
      data.reply || ""
    ).trim();

  if (!reply) {
    throw new Error(
      "JARVIS hat keine Antwort geliefert."
    );
  }

  history.push({
    role: "user",
    text: message
  });

  history.push({
    role: "assistant",
    text: reply
  });

  if (
    history.length > 12
  ) {
    history =
      history.slice(-12);
  }

  return reply;
}

/* =========================================================
   PROCESS RECORDING
   ========================================================= */

async function processRecording(
  blob
) {
  if (
    processing ||
    !active
  ) {
    return;
  }

  processing = true;

  try {
    const transcript =
      await transcribe(blob);

    if (!transcript) {
      processing = false;

      setLog(
        "JARVIS hört zu."
      );

      await startContinuousListening();

      return;
    }

    setLog(
      `Verstanden: ${transcript}`
    );

    const reply =
      await askJarvis(
        transcript
      );

    await speak(
      reply
    );

  } catch (error) {
    console.error(
      "Processing error:",
      error
    );

    setLog(
      error.message ||
      "Verarbeitung fehlgeschlagen."
    );

    processing = false;

    if (active) {
      setTimeout(
        () => {
          startContinuousListening();
        },
        700
      );
    }
  }
}

/* =========================================================
   AUDIO LEVEL
   ========================================================= */

function getAudioLevel() {
  if (!analyser) {
    return 0;
  }

  const buffer =
    new Uint8Array(
      analyser.fftSize
    );

  analyser.getByteTimeDomainData(
    buffer
  );

  let sum = 0;

  for (
    let i = 0;
    i < buffer.length;
    i++
  ) {
    const value =
      (buffer[i] - 128) /
      128;

    sum +=
      value * value;
  }

  return Math.sqrt(
    sum /
    buffer.length
  );
}

/* =========================================================
   SILENCE DETECTION
   ========================================================= */

function monitorSilence() {
  if (
    !active ||
    !recording ||
    processing ||
    speaking
  ) {
    return;
  }

  const level =
    getAudioLevel();

  if (
    level >
    SPEECH_THRESHOLD
  ) {
    speechDetected = true;

    setLog(
      "Ich höre zu …"
    );

    if (silenceTimer) {
      clearTimeout(
        silenceTimer
      );

      silenceTimer = null;
    }

  } else if (
    speechDetected &&
    !silenceTimer
  ) {
    silenceTimer =
      setTimeout(
        () => {
          stopRecordingAutomatically();
        },
        SILENCE_MS
      );
  }

  monitorTimer =
    requestAnimationFrame(
      monitorSilence
    );
}

function stopListeningMonitor() {
  if (monitorTimer) {
    cancelAnimationFrame(
      monitorTimer
    );

    monitorTimer = null;
  }

  if (silenceTimer) {
    clearTimeout(
      silenceTimer
    );

    silenceTimer = null;
  }
}

/* =========================================================
   CONTINUOUS LISTENING
   ========================================================= */

async function startContinuousListening() {
  if (
    !active ||
    recording ||
    processing ||
    speaking
  ) {
    return;
  }

  try {
    if (!mediaStream) {
      mediaStream =
        await navigator
          .mediaDevices
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
    }

    if (!audioContext) {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      audioContext =
        new AudioContextClass();

      if (
        audioContext.state ===
        "suspended"
      ) {
        await audioContext.resume();
      }

      analyser =
        audioContext.createAnalyser();

      analyser.fftSize =
        1024;

      sourceNode =
        audioContext
          .createMediaStreamSource(
            mediaStream
          );

      sourceNode.connect(
        analyser
      );
    }

    audioChunks = [];
    speechDetected = false;

    let mimeType = "";

    if (
      MediaRecorder
        .isTypeSupported(
          "audio/webm;codecs=opus"
        )
    ) {
      mimeType =
        "audio/webm;codecs=opus";

    } else if (
      MediaRecorder
        .isTypeSupported(
          "audio/webm"
        )
    ) {
      mimeType =
        "audio/webm";
    }

    mediaRecorder =
      mimeType
        ? new MediaRecorder(
            mediaStream,
            { mimeType }
          )
        : new MediaRecorder(
            mediaStream
          );

    mediaRecorder.ondataavailable =
      event => {
        if (
          event.data &&
          event.data.size > 0
        ) {
          audioChunks.push(
            event.data
          );
        }
      };

    mediaRecorder.onstop =
      async () => {
        const type =
          mediaRecorder?.mimeType ||
          "audio/webm";

        const blob =
          new Blob(
            audioChunks,
            { type }
          );

        mediaRecorder =
          null;

        audioChunks = [];

        recording = false;

        stopListeningMonitor();

        if (
          !active ||
          blob.size === 0
        ) {
          return;
        }

        await processRecording(
          blob
        );
      };

    recordingStartedAt =
      Date.now();

    mediaRecorder.start();

    recording = true;

    setStatus(
      "Online"
    );

    setButtonActive(
      true
    );

    setLog(
      "JARVIS hört zu."
    );

    monitorSilence();

  } catch (error) {
    console.error(
      "Continuous listening error:",
      error
    );

    setLog(
      "Mikrofon konnte nicht gestartet werden."
    );

    await stopJarvis();
  }
}

/* =========================================================
   AUTO STOP
   ========================================================= */

function stopRecordingAutomatically() {
  if (
    !recording ||
    !mediaRecorder ||
    mediaRecorder.state ===
      "inactive"
  ) {
    return;
  }

  const duration =
    Date.now() -
    recordingStartedAt;

  if (
    duration <
    MIN_RECORDING_MS
  ) {
    return;
  }

  stopListeningMonitor();

  setLog(
    "Verarbeite …"
  );

  try {
    mediaRecorder.stop();

  } catch (error) {
    console.error(
      "Automatic recorder stop error:",
      error
    );
  }
}

/* =========================================================
   START JARVIS
   ========================================================= */

async function startJarvis() {
  if (
    active ||
    processing
  ) {
    return;
  }

  active = true;

  button.disabled = true;

  setStatus(
    "Online"
  );

  setButtonActive(
    true
  );

  setLog(
    "JARVIS startet …"
  );

  try {
    /*
     * 1. INTRO startet bei Sekunde 4.
     */
    await startIntro();

    /*
     * 2. Intro darf kurz alleine wirken.
     */
    await sleep(
      INTRO_VOICE_DELAY_MS
    );

    if (!active) {
      return;
    }

    /*
     * 3. JARVIS beginnt zu sprechen.
     *
     * Gleichzeitig:
     * - Intro auf 18 %
     * - über 7 Sekunden auf 0
     */
    await speak(
      getGreeting(),
      {
        startup: true,
        duckIntro: true
      }
    );

    /*
     * 4. Jetzt frei zuhören.
     */
    if (active) {
      await startContinuousListening();
    }

  } catch (error) {
    console.error(
      "JARVIS start error:",
      error
    );

    if (active) {
      await startContinuousListening();
    }

  } finally {
    button.disabled = false;
  }
}

/* =========================================================
   STOP JARVIS
   ========================================================= */

async function stopJarvis() {
  active = false;
  recording = false;
  processing = false;
  speaking = false;

  stopListeningMonitor();
  stopIntro();

  try {
    if (
      mediaRecorder &&
      mediaRecorder.state !==
        "inactive"
    ) {
      mediaRecorder.stop();
    }
  } catch {}

  mediaRecorder = null;

  try {
    if (mediaStream) {
      for (
        const track of
        mediaStream.getTracks()
      ) {
        track.stop();
      }
    }
  } catch {}

  mediaStream = null;

  try {
    if (sourceNode) {
      sourceNode.disconnect();
    }
  } catch {}

  sourceNode = null;
  analyser = null;

  try {
    if (audioContext) {
      await audioContext.close();
    }
  } catch {}

  audioContext = null;

  try {
    remoteAudio.pause();
    remoteAudio.src = "";
    remoteAudio.srcObject = null;
  } catch {}

  setButtonActive(
    false
  );

  setStatus(
    "Offline"
  );

  setLog(
    "Bereit."
  );
}

/* =========================================================
   BUTTON
   ========================================================= */

button.addEventListener(
  "click",
  async () => {
    if (active) {
      await stopJarvis();
      return;
    }

    await startJarvis();
  }
);

/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "pagehide",
  () => {
    stopJarvis();
  }
);
