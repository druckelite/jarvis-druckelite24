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

const INTRO_START = 4;
const INTRO_VOICE_DELAY_MS = 2500;

const INTRO_BACKGROUND_VOLUME = 0.16;
const INTRO_DUCK_DURATION_MS = 1500;
const INTRO_FADE_DURATION_MS = 15000;

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

function pickRandom(items) {
  return items[
    Math.floor(
      Math.random() * items.length
    )
  ];
}


/* =========================================================
   BERLIN TIME
   ========================================================= */

/*
 * hourCycle h23 sorgt dafür,
 * dass wir sauber 0-23 bekommen.
 *
 * Damit vermeiden wir falsche
 * Tageszeit-Zuordnungen.
 */

function getBerlinHour() {
  const formatter =
    new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone: "Europe/Berlin",
        hour: "numeric",
        hourCycle: "h23"
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

  if (
    Number.isNaN(hour)
  ) {
    /*
     * Sicherer Fallback.
     */
    return new Date().getHours();
  }

  return hour;
}


/* =========================================================
   CASUAL JARVIS GREETING
   ========================================================= */

function getGreeting() {
  const hour =
    getBerlinHour();

  console.log(
    "Berlin hour:",
    hour
  );


  /*
   * 05:00 - 10:59
   */
  if (
    hour >= 5 &&
    hour < 11
  ) {
    return pickRandom([
      "Morgen, Mattl. Bin da. Was steht an?",

      "Morgen, Mattl. Na dann schauen wir mal, was heute wieder brennt.",

      "Hey Mattl. Morgen. Ich bin bereit, falls du es auch bist.",

      "Morgen, Mattl. Kaffee wäre jetzt vermutlich keine schlechte Strategie."
    ]);
  }


  /*
   * 11:00 - 13:59
   */
  if (
    hour >= 11 &&
    hour < 14
  ) {
    return pickRandom([
      "Hey Mattl. Bin da. Was gibt's?",

      "Mattl, da bin ich. Was steht an?",

      "Hey Mattl. Was machen wir?",

      "Da bist du ja. Ich hatte schon Hoffnung auf einen ruhigen Vormittag.",

      "Hey Mattl. Läuft. Was brauchst du?"
    ]);
  }


  /*
   * 14:00 - 17:59
   */
  if (
    hour >= 14 &&
    hour < 18
  ) {
    return pickRandom([
      "Hey Mattl. Bin wieder im Dienst. Tragisch, ich weiß.",

      "Mattl, da bin ich. Was gibt's?",

      "Hey Mattl. Was steht noch an?",

      "Da bist du ja. Dann retten wir mal den Rest des Tages.",

      "Mattl. Ich höre. Überrasch mich."
    ]);
  }


  /*
   * 18:00 - 22:59
   */
  if (
    hour >= 18 &&
    hour < 23
  ) {
    return pickRandom([
      "Hey Mattl. Noch nicht genug für heute?",

      "Mattl, da bin ich. Was liegt noch an?",

      "Hey Mattl. Na gut, eine Runde geht noch.",

      "Da bist du ja. Feierabend war wohl nur eine Theorie.",

      "Mattl. Ich bin da. Was gibt's?"
    ]);
  }


  /*
   * 23:00 - 04:59
   */
  return pickRandom([
    "Mattl ... ernsthaft? Na gut. Ich bin da.",

    "Hey Mattl. Schlaf wird offenbar weiterhin überschätzt.",

    "Mattl, es ist spät. Natürlich arbeiten wir noch.",

    "Da bist du ja. Vernünftige Uhrzeiten werden auch völlig überbewertet.",

    "Mattl. Ich bin da. Aber morgen beschwerst du dich nicht über Müdigkeit."
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

  introAudio =
    new Audio(
      "/Intro.mp3?v=4"
    );

  introAudio.preload =
    "auto";

  introAudio.volume =
    1;

  return new Promise(
    resolve => {
      let finished = false;

      const done = () => {
        if (finished) {
          return;
        }

        finished = true;

        resolve();
      };


      const playIntroAudio =
        async () => {
          try {
            if (!introAudio) {
              done();
              return;
            }

            introAudio.currentTime =
              INTRO_START;

            await introAudio.play();

            setLog(
              "JARVIS startet …"
            );

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
        playIntroAudio,
        {
          once: true
        }
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
        {
          once: true
        }
      );


      if (
        introAudio.readyState >= 1
      ) {
        playIntroAudio();
      }


      introAudio.load();
    }
  );
}


/* =========================================================
   INTRO DUCKING
   ========================================================= */

function fadeIntroBehindVoice() {
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

  const initialVolume =
    introAudio.volume;

  const duckStart =
    performance.now();


  /*
   * Phase 1:
   * über 1,5 Sekunden weich
   * auf Hintergrundlautstärke.
   */

  introFadeTimer =
    setInterval(
      () => {
        if (!introAudio) {
          clearInterval(
            introFadeTimer
          );

          introFadeTimer = null;

          return;
        }

        const elapsed =
          performance.now() -
          duckStart;

        const progress =
          Math.min(
            elapsed /
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

        const newVolume =
          initialVolume -
          (
            initialVolume -
            INTRO_BACKGROUND_VOLUME
          ) *
          smooth;

        introAudio.volume =
          Math.max(
            0,
            Math.min(
              1,
              newVolume
            )
          );

        if (
          progress >= 1
        ) {
          clearInterval(
            introFadeTimer
          );

          introFadeTimer =
            null;

          startLongIntroFade();
        }
      },
      40
    );
}


/* =========================================================
   LONG INTRO FADE
   ========================================================= */

function startLongIntroFade() {
  if (
    !introAudio ||
    introAudio.paused
  ) {
    return;
  }

  const fadeStart =
    performance.now();

  const startVolume =
    INTRO_BACKGROUND_VOLUME;


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

        const elapsed =
          performance.now() -
          fadeStart;

        const progress =
          Math.min(
            elapsed /
            INTRO_FADE_DURATION_MS,
            1
          );

        const fadeCurve =
          Math.pow(
            1 - progress,
            1.7
          );

        introAudio.volume =
          Math.max(
            0,
            startVolume *
            fadeCurve
          );

        if (
          progress >= 1
        ) {
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
   SPEAK
   ========================================================= */

async function speak(
  text,
  options = {}
) {
  const sentence =
    String(
      text || ""
    ).trim();

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

  if (
    options.duckIntro
  ) {
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
              text:
                sentence
            })
        }
      );

    if (
      !response.ok
    ) {
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
        method:
          "POST",

        headers: {
          "Content-Type":
            audioBlob.type ||
            "audio/webm"
        },

        body:
          audioBlob
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

  if (
    !response.ok
  ) {
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
        method:
          "POST",

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

  if (
    !response.ok
  ) {
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
    text:
      message
  });

  history.push({
    role:
      "assistant",

    text:
      reply
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

  processing =
    true;

  try {
    const transcript =
      await transcribe(
        blob
      );

    if (!transcript) {
      processing =
        false;

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

    processing =
      false;

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

  analyser
    .getByteTimeDomainData(
      buffer
    );

  let sum = 0;

  for (
    let i = 0;
    i < buffer.length;
    i++
  ) {
    const value =
      (
        buffer[i] -
        128
      ) /
      128;

    sum +=
      value *
      value;
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
    speechDetected =
      true;

    setLog(
      "Ich höre zu …"
    );

    if (
      silenceTimer
    ) {
      clearTimeout(
        silenceTimer
      );

      silenceTimer =
        null;
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


/* =========================================================
   STOP LISTENING MONITOR
   ========================================================= */

function stopListeningMonitor() {
  if (
    monitorTimer
  ) {
    cancelAnimationFrame(
      monitorTimer
    );

    monitorTimer =
      null;
  }

  if (
    silenceTimer
  ) {
    clearTimeout(
      silenceTimer
    );

    silenceTimer =
      null;
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
        audioContext
          .createAnalyser();

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

    speechDetected =
      false;

    let mimeType =
      "";

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
            {
              mimeType
            }
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
          mediaRecorder
            ?.mimeType ||
          "audio/webm";

        const blob =
          new Blob(
            audioChunks,
            {
              type
            }
          );

        mediaRecorder =
          null;

        audioChunks =
          [];

        recording =
          false;

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

    recording =
      true;

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

  active =
    true;

  button.disabled =
    true;

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
     * Intro startet bei Sekunde 4.
     */
    await startIntro();

    /*
     * Erst kurz Sound wirken lassen.
     */
    await sleep(
      INTRO_VOICE_DELAY_MS
    );

    if (!active) {
      return;
    }

    /*
     * Lockerere Begrüßung.
     *
     * Gleichzeitig:
     * Sound weich leiser +
     * 15 Sekunden Fade.
     */
    await speak(
      getGreeting(),
      {
        startup: true,
        duckIntro: true
      }
    );

    /*
     * Danach automatisch zuhören.
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
    button.disabled =
      false;
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

  mediaRecorder =
    null;

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

  mediaStream =
    null;

  try {
    if (sourceNode) {
      sourceNode.disconnect();
    }
  } catch {}

  sourceNode =
    null;

  analyser =
    null;

  try {
    if (audioContext) {
      await audioContext.close();
    }
  } catch {}

  audioContext =
    null;

  try {
    remoteAudio.pause();

    remoteAudio.src =
      "";

    remoteAudio.srcObject =
      null;
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
