/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V7.2 · MICROPHONE FIX

   =========================================================
   ARCHITEKTUR
   =========================================================

   Browser-Mikrofon
        ↓
   MediaRecorder
        ↓
   automatische Raumpegel-Kalibrierung
        ↓
   Spracherkennung / Stille-Erkennung
        ↓
   /api/transcribe
        ↓
   OpenAI Transcription
        ↓
   /api/jarvis-chat
        ↓
   OpenAI Responses API
        ↓
   /api/elevenlabs-tts
        ↓
   ElevenLabs · einzige Stimme

   ---------------------------------------------------------
   KEIN OPENAI REALTIME
   KEIN CEDAR
   KEIN WEBRTC
   KEIN response.create
   =========================================================
*/


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
   STATE
   ========================================================= */

let active =
  false;


let starting =
  false;


let assistantSpeaking =
  false;


let processing =
  false;


/* =========================================================
   MICROPHONE
   ========================================================= */

let micStream =
  null;


let mediaRecorder =
  null;


let audioChunks =
  [];


/* =========================================================
   AUDIO ANALYSIS
   ========================================================= */

let audioContext =
  null;


let analyser =
  null;


let sourceNode =
  null;


let silenceCheckTimer =
  null;


let recordingStartedAt =
  0;


let lastVoiceAt =
  0;


/*
 * Sprachbestätigung
 */
let voiceDetected =
  false;


let voiceCandidateStartedAt =
  0;


/*
 * Aufnahme verwerfen,
 * wenn keine echte Stimme erkannt wurde.
 */
let discardCurrentRecording =
  false;


/*
 * Geglätteter Mikrofonpegel.
 */
let smoothedAudioLevel =
  0;


/*
 * Gemessener Raumpegel.
 */
let ambientNoiseLevel =
  0.008;


/*
 * Tatsächliche Sprachschwelle.
 */
let dynamicVoiceThreshold =
  0.018;


/* =========================================================
   CONVERSATION
   ========================================================= */

let previousResponseId =
  null;


/* =========================================================
   ELEVENLABS
   ========================================================= */

let elevenAudio =
  null;


let elevenObjectUrl =
  null;


let ttsController =
  null;


/* =========================================================
   NETWORK
   ========================================================= */

let transcriptionController =
  null;


let chatController =
  null;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio =
  null;


let introFadeTimer =
  null;


/* =========================================================
   SETTINGS · INTRO
   ========================================================= */

const INTRO_START =
  4;


const INTRO_START_VOLUME =
  0.28;


const INTRO_VOICE_DELAY_MS =
  2000;


const INTRO_BACKGROUND_VOLUME =
  0.025;


const INTRO_DUCK_DURATION_MS =
  1500;


const INTRO_FADE_DURATION_MS =
  7000;


/* =========================================================
   SETTINGS · VOICE DETECTION
   ========================================================= */

/*
 * Aufnahme muss mindestens
 * so lange laufen.
 */
const MIN_RECORDING_MS =
  550;


/*
 * Wenn nach bestätigter Sprache
 * so lange Ruhe herrscht,
 * ist Mattl fertig.
 */
const SILENCE_DURATION_MS =
  850;


/*
 * Untergrenze der Sprachschwelle.
 *
 * Deutlich niedriger als vorher.
 */
const MIN_VOICE_THRESHOLD =
  0.018;


/*
 * Obergrenze.
 *
 * Verhindert, dass eine schlechte
 * Kalibrierung JARVIS taub macht.
 */
const MAX_VOICE_THRESHOLD =
  0.05;


/*
 * Raumpegel * Faktor =
 * dynamische Sprachschwelle.
 */
const NOISE_MULTIPLIER =
  1.8;


/*
 * Stimme muss nur kurz stabil
 * über der Schwelle liegen.
 */
const VOICE_CONFIRM_MS =
  120;


/*
 * So lange wartet JARVIS,
 * bis überhaupt gesprochen wird.
 *
 * Danach beginnt er einfach neu.
 */
const WAIT_FOR_VOICE_MS =
  15000;


/*
 * Maximale Aufnahme eines Turns.
 */
const MAX_RECORDING_MS =
  20000;


/*
 * Raumpegelmessung.
 *
 * Währenddessen bitte möglichst
 * nicht sprechen.
 */
const NOISE_CALIBRATION_MS =
  650;


/*
 * Nach Ende der JARVIS-Stimme
 * gegen Lautsprecher-Echo warten.
 */
const LISTENING_RESUME_DELAY_MS =
  1100;


/* =========================================================
   NETWORK TIMEOUTS
   ========================================================= */

const TRANSCRIPTION_TIMEOUT_MS =
  30000;


const CHAT_TIMEOUT_MS =
  45000;


const ELEVEN_TIMEOUT_MS =
  25000;


/* =========================================================
   UI
   ========================================================= */

function setStatus(text) {

  if (!statusEl) {
    return;
  }


  statusEl.textContent =
    text;


  if (
    text === "Online"
  ) {

    statusEl.classList.add(
      "online"
    );

  } else {

    statusEl.classList.remove(
      "online"
    );
  }
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


  if (value) {

    button.classList.add(
      "active"
    );

  } else {

    button.classList.remove(
      "active"
    );
  }
}


function setJarvisState(state) {

  document.body.dataset.jarvisState =
    state;
}


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {

  return new Promise(
    resolve => {

      setTimeout(
        resolve,
        ms
      );
    }
  );
}


function clamp(
  value,
  min,
  max
) {

  return Math.min(
    max,
    Math.max(
      min,
      value
    )
  );
}


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
          part.type ===
          "hour"
      );


    const hour =
      Number(
        hourPart?.value
      );


    if (
      !Number.isNaN(
        hour
      )
    ) {

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
   RANDOM
   ========================================================= */

function pickRandom(items) {

  return items[
    Math.floor(
      Math.random() *
      items.length
    )
  ];
}


/* =========================================================
   GREETING
   ========================================================= */

function getGreeting() {

  const hour =
    getBerlinHour();


  if (
    hour >= 5 &&
    hour < 11
  ) {

    return pickRandom([
      "Morgen, Mattl. Bin da. Was steht an?",
      "Morgen, Mattl. Mal sehen, was heute wieder brennt.",
      "Hey Mattl. Morgen. Was machen wir?"
    ]);
  }


  if (
    hour >= 11 &&
    hour < 14
  ) {

    return pickRandom([
      "Hey Mattl. Bin da. Was gibt's?",
      "Mattl, da bin ich. Was steht an?",
      "Hey Mattl. Was machen wir?",
      "Da bist du ja. Ich hatte schon Hoffnung auf einen ruhigen Vormittag."
    ]);
  }


  if (
    hour >= 14 &&
    hour < 18
  ) {

    return pickRandom([
      "Hey Mattl. Was steht noch an?",
      "Mattl, da bin ich. Was gibt's?",
      "Da bist du ja. Dann retten wir mal den Rest des Tages."
    ]);
  }


  if (
    hour >= 18 &&
    hour < 23
  ) {

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
   INTRO CLEANUP
   ========================================================= */

function stopIntro() {

  if (
    introFadeTimer
  ) {

    clearInterval(
      introFadeTimer
    );


    introFadeTimer =
      null;
  }


  if (
    introAudio
  ) {

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


/* =========================================================
   INTRO START
   ========================================================= */

async function startIntro() {

  stopIntro();


  introAudio =
    new Audio(
      "/Intro.mp3?v=8"
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

            console.error(
              "Intro error:",
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
        introAudio.readyState >=
        1
      ) {

        play();
      }


      introAudio.load();
    }
  );
}


/* =========================================================
   INTRO DUCK
   ========================================================= */

function duckIntro() {

  if (
    !introAudio ||
    introAudio.paused
  ) {

    return;
  }


  if (
    introFadeTimer
  ) {

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
            2 *
            progress
          );


        introAudio.volume =
          original -
          (
            original -
            INTRO_BACKGROUND_VOLUME
          ) *
          smooth;


        if (
          progress >=
          1
        ) {

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


/* =========================================================
   INTRO FADE
   ========================================================= */

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
              1 -
              progress,
              1.7
            )
          );


        if (
          progress >=
          1
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
   ELEVENLABS CLEANUP
   ========================================================= */

function stopElevenAudio() {

  if (
    elevenAudio
  ) {

    elevenAudio.onended =
      null;


    elevenAudio.onerror =
      null;


    try {

      elevenAudio.pause();

    } catch {}


    try {

      elevenAudio.removeAttribute(
        "src"
      );

    } catch {}


    elevenAudio =
      null;
  }


  if (
    elevenObjectUrl
  ) {

    try {

      URL.revokeObjectURL(
        elevenObjectUrl
      );

    } catch {}


    elevenObjectUrl =
      null;
  }
}


/* =========================================================
   SILENCE MONITOR CLEANUP
   ========================================================= */

function stopSilenceMonitor() {

  if (
    silenceCheckTimer
  ) {

    clearInterval(
      silenceCheckTimer
    );


    silenceCheckTimer =
      null;
  }
}


/* =========================================================
   AUDIO ANALYSIS CLEANUP
   ========================================================= */

function stopAudioAnalysis() {

  stopSilenceMonitor();


  if (
    sourceNode
  ) {

    try {

      sourceNode.disconnect();

    } catch {}


    sourceNode =
      null;
  }


  analyser =
    null;


  if (
    audioContext
  ) {

    try {

      audioContext.close();

    } catch {}


    audioContext =
      null;
  }
}


/* =========================================================
   MICROPHONE CLEANUP
   ========================================================= */

function stopMicrophoneTracks() {

  if (
    micStream
  ) {

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
}


/* =========================================================
   RAW AUDIO LEVEL
   ========================================================= */

function getRawAudioLevel() {

  if (
    !analyser
  ) {

    return 0;
  }


  const data =
    new Uint8Array(
      analyser.fftSize
    );


  analyser.getByteTimeDomainData(
    data
  );


  let sum =
    0;


  for (
    let i = 0;
    i < data.length;
    i++
  ) {

    const normalized =
      (
        data[i] -
        128
      ) /
      128;


    sum +=
      normalized *
      normalized;
  }


  return Math.sqrt(
    sum /
    data.length
  );
}


/* =========================================================
   SMOOTHED AUDIO LEVEL
   ========================================================= */

function getAudioLevel() {

  const raw =
    getRawAudioLevel();


  smoothedAudioLevel =
    smoothedAudioLevel *
    0.65 +
    raw *
    0.35;


  return smoothedAudioLevel;
}


/* =========================================================
   START AUDIO ANALYSIS
   ========================================================= */

async function startAudioAnalysis() {

  if (
    !micStream
  ) {

    return;
  }


  stopAudioAnalysis();


  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;


  if (
    !AudioContextClass
  ) {

    throw new Error(
      "AudioContext wird von diesem Browser nicht unterstützt."
    );
  }


  audioContext =
    new AudioContextClass();


  if (
    audioContext.state ===
    "suspended"
  ) {

    try {

      await audioContext.resume();

    } catch {}
  }


  analyser =
    audioContext
      .createAnalyser();


  analyser.fftSize =
    1024;


  analyser.smoothingTimeConstant =
    0.2;


  sourceNode =
    audioContext
      .createMediaStreamSource(
        micStream
      );


  sourceNode.connect(
    analyser
  );


  smoothedAudioLevel =
    0;
}


/* =========================================================
   AMBIENT NOISE CALIBRATION
   ========================================================= */

async function calibrateAmbientNoise() {

  if (
    !active ||
    !analyser
  ) {

    return;
  }


  /*
   * GANZ WICHTIG:
   *
   * Intro und JARVIS-Audio müssen
   * vollständig still sein.
   */
  stopIntro();


  stopElevenAudio();


  await sleep(
    250
  );


  setJarvisState(
    "listening"
  );


  setLog(
    "Mikrofon wird angepasst …"
  );


  const samples =
    [];


  const started =
    Date.now();


  while (
    active &&
    Date.now() -
      started <
      NOISE_CALIBRATION_MS
  ) {

    samples.push(
      getRawAudioLevel()
    );


    await sleep(
      40
    );
  }


  if (
    !samples.length
  ) {

    dynamicVoiceThreshold =
      MIN_VOICE_THRESHOLD;


    return;
  }


  samples.sort(
    (
      a,
      b
    ) =>
      a -
      b
  );


  /*
   * 60%-Perzentil:
   *
   * kurzfristige Peaks wie Tastatur
   * oder Stuhlgeräusch werden kaum
   * berücksichtigt.
   */
  const usefulIndex =
    Math.floor(
      samples.length *
      0.60
    );


  ambientNoiseLevel =
    samples[
      Math.min(
        usefulIndex,
        samples.length -
        1
      )
    ];


  dynamicVoiceThreshold =
    clamp(
      ambientNoiseLevel *
      NOISE_MULTIPLIER,

      MIN_VOICE_THRESHOLD,

      MAX_VOICE_THRESHOLD
    );


  console.log(
    "Ambient:",
    ambientNoiseLevel.toFixed(
      4
    )
  );


  console.log(
    "Voice threshold:",
    dynamicVoiceThreshold.toFixed(
      4
    )
  );


  setLog(
    "JARVIS hört zu."
  );
}


/* =========================================================
   MIME TYPE
   ========================================================= */

function getSupportedMimeType() {

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];


  for (
    const type of
    candidates
  ) {

    if (
      MediaRecorder.isTypeSupported(
        type
      )
    ) {

      return type;
    }
  }


  return "";
}


/* =========================================================
   START RECORDING TURN
   ========================================================= */

async function startRecordingTurn() {

  if (
    !active ||
    processing ||
    assistantSpeaking
  ) {

    return;
  }


  if (
    !micStream
  ) {

    return;
  }


  if (
    mediaRecorder &&
    mediaRecorder.state !==
      "inactive"
  ) {

    return;
  }


  audioChunks =
    [];


  voiceDetected =
    false;


  voiceCandidateStartedAt =
    0;


  discardCurrentRecording =
    false;


  lastVoiceAt =
    0;


  smoothedAudioLevel =
    0;


  const mimeType =
    getSupportedMimeType();


  try {

    mediaRecorder =
      mimeType

        ? new MediaRecorder(
            micStream,
            {
              mimeType
            }
          )

        : new MediaRecorder(
            micStream
          );


  } catch (error) {

    console.error(
      "MediaRecorder error:",
      error
    );


    setLog(
      "Audioaufnahme konnte nicht gestartet werden."
    );


    return;
  }


  mediaRecorder.ondataavailable =
    event => {

      if (
        event.data &&
        event.data.size >
          0
      ) {

        audioChunks.push(
          event.data
        );
      }
    };


  mediaRecorder.onstop =
    async () => {

      stopSilenceMonitor();


      const duration =
        Date.now() -
        recordingStartedAt;


      const recorderType =
        mediaRecorder?.mimeType ||
        "audio/webm";


      if (
        !active
      ) {

        return;
      }


      /*
       * Keine echte Stimme:
       * nichts an OpenAI senden.
       */
      if (
        discardCurrentRecording ||
        !voiceDetected
      ) {

        audioChunks =
          [];


        setJarvisState(
          "listening"
        );


        setLog(
          "JARVIS hört zu."
        );


        setTimeout(
          () => {

            if (
              active &&
              !processing &&
              !assistantSpeaking
            ) {

              startRecordingTurn();
            }

          },
          200
        );


        return;
      }


      if (
        duration <
        MIN_RECORDING_MS
      ) {

        audioChunks =
          [];


        setTimeout(
          () => {

            if (
              active &&
              !processing &&
              !assistantSpeaking
            ) {

              startRecordingTurn();
            }

          },
          200
        );


        return;
      }


      const blob =
        new Blob(
          audioChunks,
          {
            type:
              recorderType
          }
        );


      audioChunks =
        [];


      if (
        blob.size <
        1000
      ) {

        setTimeout(
          () => {

            if (
              active &&
              !processing &&
              !assistantSpeaking
            ) {

              startRecordingTurn();
            }

          },
          200
        );


        return;
      }


      await processRecordedAudio(
        blob
      );
    };


  recordingStartedAt =
    Date.now();


  setJarvisState(
    "listening"
  );


  setLog(
    "JARVIS hört zu."
  );


  mediaRecorder.start(
    200
  );


  startSilenceMonitor();
}


/* =========================================================
   VOICE + SILENCE MONITOR
   ========================================================= */

function startSilenceMonitor() {

  stopSilenceMonitor();


  silenceCheckTimer =
    setInterval(
      () => {

        if (
          !mediaRecorder ||
          mediaRecorder.state !==
            "recording"
        ) {

          return;
        }


        const now =
          Date.now();


        const level =
          getAudioLevel();


        const recordingDuration =
          now -
          recordingStartedAt;


        /*
         * =================================================
         * NOCH KEINE STIMME BESTÄTIGT
         * =================================================
         */

        if (
          !voiceDetected
        ) {

          if (
            level >
            dynamicVoiceThreshold
          ) {

            if (
              !voiceCandidateStartedAt
            ) {

              voiceCandidateStartedAt =
                now;
            }


            if (
              now -
                voiceCandidateStartedAt >=
              VOICE_CONFIRM_MS
            ) {

              voiceDetected =
                true;


              lastVoiceAt =
                now;


              setJarvisState(
                "hearing"
              );


              setLog(
                "Ich höre zu …"
              );


              console.log(
                "Voice detected.",
                "Level:",
                level.toFixed(
                  4
                ),
                "Threshold:",
                dynamicVoiceThreshold.toFixed(
                  4
                )
              );
            }


          } else {

            voiceCandidateStartedAt =
              0;
          }


          /*
           * Nach langer Ruhe einfach
           * neuen Aufnahmezyklus starten.
           */
          if (
            recordingDuration >
            WAIT_FOR_VOICE_MS
          ) {

            discardCurrentRecording =
              true;


            try {

              mediaRecorder.stop();

            } catch {}


            return;
          }


          return;
        }


        /*
         * =================================================
         * STIMME LÄUFT
         * =================================================
         */


        /*
         * Sobald Sprache bestätigt wurde,
         * nehmen wir leisere Silben mit.
         */
        const continuationThreshold =
          Math.max(
            MIN_VOICE_THRESHOLD *
              0.65,

            dynamicVoiceThreshold *
              0.58
          );


        if (
          level >
          continuationThreshold
        ) {

          lastVoiceAt =
            now;


          setJarvisState(
            "hearing"
          );


          setLog(
            "Ich höre zu …"
          );
        }


        const silenceDuration =
          now -
          lastVoiceAt;


        /*
         * Satz beendet.
         */
        if (
          recordingDuration >
            MIN_RECORDING_MS &&
          silenceDuration >
            SILENCE_DURATION_MS
        ) {

          console.log(
            "Sentence finished."
          );


          setJarvisState(
            "thinking"
          );


          setLog(
            "Verarbeite Sprache …"
          );


          try {

            mediaRecorder.stop();

          } catch {}


          return;
        }


        /*
         * Sicherheitslimit.
         */
        if (
          recordingDuration >
          MAX_RECORDING_MS
        ) {

          console.warn(
            "Recording limit reached."
          );


          try {

            mediaRecorder.stop();

          } catch {}
        }

      },
      60
    );
}


/* =========================================================
   TRANSCRIPTION
   ========================================================= */

async function transcribeAudio(
  blob
) {

  if (
    transcriptionController
  ) {

    try {

      transcriptionController.abort();

    } catch {}
  }


  transcriptionController =
    new AbortController();


  const timeout =
    setTimeout(
      () => {

        try {

          transcriptionController?.abort();

        } catch {}

      },
      TRANSCRIPTION_TIMEOUT_MS
    );


  try {

    const response =
      await fetch(
        "/api/transcribe",
        {
          method:
            "POST",

          headers: {

            "Content-Type":
              blob.type ||
              "audio/webm"
          },

          body:
            blob,

          signal:
            transcriptionController.signal
        }
      );


    clearTimeout(
      timeout
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

      throw new Error(
        raw ||
        "Ungültige Transkriptionsantwort."
      );
    }


    if (
      !response.ok
    ) {

      throw new Error(
        data.error ||
        `HTTP ${response.status}`
      );
    }


    const text =
      String(
        data.text ||
        ""
      ).trim();


    if (
      !text
    ) {

      throw new Error(
        "Keine verständliche Sprache erkannt."
      );
    }


    return text;


  } catch (error) {

    clearTimeout(
      timeout
    );


    throw error;
  }
}


/* =========================================================
   JARVIS CHAT
   ========================================================= */

async function askJarvis(
  transcript
) {

  if (
    chatController
  ) {

    try {

      chatController.abort();

    } catch {}
  }


  chatController =
    new AbortController();


  const timeout =
    setTimeout(
      () => {

        try {

          chatController?.abort();

        } catch {}

      },
      CHAT_TIMEOUT_MS
    );


  try {

    const response =
      await fetch(
        "/api/jarvis-chat",
        {
          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              message:
                transcript,

              previous_response_id:
                previousResponseId
            }),

          signal:
            chatController.signal
        }
      );


    clearTimeout(
      timeout
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

      throw new Error(
        raw ||
        "Ungültige JARVIS-Antwort."
      );
    }


    if (
      !response.ok
    ) {

      throw new Error(
        data.error ||
        `HTTP ${response.status}`
      );
    }


    const answer =
      String(
        data.text ||
        ""
      ).trim();


    if (
      !answer
    ) {

      throw new Error(
        "JARVIS hat keinen Antworttext geliefert."
      );
    }


    if (
      data.response_id
    ) {

      previousResponseId =
        data.response_id;
    }


    return answer;


  } catch (error) {

    clearTimeout(
      timeout
    );


    throw error;
  }
}


/* =========================================================
   ELEVENLABS SPEAK
   ========================================================= */

async function speakWithElevenLabs(
  text
) {

  const cleanText =
    String(
      text ||
      ""
    ).trim();


  if (
    !cleanText
  ) {

    return;
  }


  stopElevenAudio();


  if (
    ttsController
  ) {

    try {

      ttsController.abort();

    } catch {}
  }


  ttsController =
    new AbortController();


  const timeout =
    setTimeout(
      () => {

        try {

          ttsController?.abort();

        } catch {}

      },
      ELEVEN_TIMEOUT_MS
    );


  try {

    setJarvisState(
      "thinking"
    );


    setLog(
      "JARVIS bereitet die Stimme vor …"
    );


    const response =
      await fetch(
        "/api/elevenlabs-tts",
        {
          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              text:
                cleanText
            }),

          signal:
            ttsController.signal
        }
      );


    clearTimeout(
      timeout
    );


    if (
      !response.ok
    ) {

      const errorText =
        await response.text();


      throw new Error(
        `ElevenLabs HTTP ${response.status}: ${errorText}`
      );
    }


    const blob =
      await response.blob();


    if (
      !blob ||
      blob.size ===
        0
    ) {

      throw new Error(
        "ElevenLabs hat kein Audio geliefert."
      );
    }


    if (
      !active
    ) {

      return;
    }


    elevenObjectUrl =
      URL.createObjectURL(
        blob
      );


    elevenAudio =
      new Audio(
        elevenObjectUrl
      );


    elevenAudio.preload =
      "auto";


    elevenAudio.volume =
      1;


    assistantSpeaking =
      true;


    setJarvisState(
      "speaking"
    );


    setLog(
      "JARVIS spricht."
    );


    await new Promise(
      (
        resolve,
        reject
      ) => {

        if (
          !elevenAudio
        ) {

          resolve();

          return;
        }


        elevenAudio.onended =
          () => {

            resolve();
          };


        elevenAudio.onerror =
          () => {

            reject(
              new Error(
                "ElevenLabs-Audio konnte nicht abgespielt werden."
              )
            );
          };


        elevenAudio
          .play()
          .catch(
            reject
          );
      }
    );


  } finally {

    clearTimeout(
      timeout
    );


    assistantSpeaking =
      false;


    stopElevenAudio();
  }
}


/* =========================================================
   PROCESS RECORDED AUDIO
   ========================================================= */

async function processRecordedAudio(
  blob
) {

  if (
    !active ||
    processing
  ) {

    return;
  }


  processing =
    true;


  try {

    setJarvisState(
      "thinking"
    );


    setLog(
      "Verarbeite Sprache …"
    );


    const transcript =
      await transcribeAudio(
        blob
      );


    if (
      !active
    ) {

      return;
    }


    console.log(
      "Mattl:",
      transcript
    );


    setLog(
      `Verstanden: ${transcript}`
    );


    await sleep(
      150
    );


    setLog(
      "Denke nach …"
    );


    const answer =
      await askJarvis(
        transcript
      );


    if (
      !active
    ) {

      return;
    }


    console.log(
      "JARVIS:",
      answer
    );


    await speakWithElevenLabs(
      answer
    );


  } catch (error) {

    console.error(
      "JARVIS turn error:",
      error
    );


    if (
      error.name ===
      "AbortError"
    ) {

      setLog(
        "Vorgang wurde abgebrochen."
      );

    } else {

      setLog(
        `JARVIS Fehler: ${error.message}`
      );
    }


    await sleep(
      1000
    );


  } finally {

    processing =
      false;


    assistantSpeaking =
      false;


    /*
     * WICHTIG:
     *
     * KEINE erneute Kalibrierung
     * nach jeder JARVIS-Antwort.
     *
     * Sonst könnte Lautsprecher-
     * Restschall wieder die
     * Schwelle verfälschen.
     */
    if (
      active
    ) {

      setTimeout(
        () => {

          if (
            active &&
            !processing &&
            !assistantSpeaking
          ) {

            startRecordingTurn();
          }

        },
        LISTENING_RESUME_DELAY_MS
      );
    }
  }
}


/* =========================================================
   START JARVIS
   ========================================================= */

async function startJarvis() {

  if (
    active ||
    starting
  ) {

    return;
  }


  starting =
    true;


  if (
    button
  ) {

    button.disabled =
      true;
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

    previousResponseId =
      null;


    processing =
      false;


    assistantSpeaking =
      false;


    ambientNoiseLevel =
      0.008;


    dynamicVoiceThreshold =
      MIN_VOICE_THRESHOLD;


    /*
     * Mikrofon.
     */
    micStream =
      await navigator
        .mediaDevices
        .getUserMedia({
          audio: {

            echoCancellation:
              true,

            noiseSuppression:
              true,

            /*
             * Aus lassen:
             * sonst werden leise
             * Hintergrundgeräusche
             * künstlich verstärkt.
             */
            autoGainControl:
              false,

            channelCount:
              1
          }
        });


    await startAudioAnalysis();


    /*
     * Intro.
     */
    await startIntro();


    active =
      true;


    setStatus(
      "Online"
    );


    await sleep(
      INTRO_VOICE_DELAY_MS
    );


    if (
      !active
    ) {

      return;
    }


    duckIntro();


    /*
     * Begrüßung.
     */
    processing =
      true;


    await speakWithElevenLabs(
      getGreeting()
    );


    processing =
      false;


    if (
      !active
    ) {

      return;
    }


    /*
     * =====================================================
     * WICHTIGSTER FIX
     * =====================================================
     *
     * Intro vollständig stoppen,
     * bevor der Raumpegel gemessen wird.
     */
    stopIntro();


    stopElevenAudio();


    await sleep(
      600
    );


    /*
     * EINMAL sauber kalibrieren.
     */
    await calibrateAmbientNoise();


    if (
      !active
    ) {

      return;
    }


    await sleep(
      250
    );


    startRecordingTurn();


  } catch (error) {

    console.error(
      "JARVIS Start error:",
      error
    );


    active =
      false;


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
      `Start fehlgeschlagen: ${error.message}`
    );


    stopMicrophoneTracks();


    stopAudioAnalysis();


  } finally {

    starting =
      false;


    if (
      button
    ) {

      button.disabled =
        false;
    }
  }
}


/* =========================================================
   STOP JARVIS
   ========================================================= */

async function stopJarvis() {

  active =
    false;


  starting =
    false;


  processing =
    false;


  assistantSpeaking =
    false;


  previousResponseId =
    null;


  voiceDetected =
    false;


  voiceCandidateStartedAt =
    0;


  discardCurrentRecording =
    false;


  stopSilenceMonitor();


  /*
   * Recorder.
   */
  if (
    mediaRecorder &&
    mediaRecorder.state !==
      "inactive"
  ) {

    try {

      mediaRecorder.onstop =
        null;


      mediaRecorder.stop();

    } catch {}
  }


  mediaRecorder =
    null;


  audioChunks =
    [];


  /*
   * Requests.
   */
  if (
    transcriptionController
  ) {

    try {

      transcriptionController.abort();

    } catch {}


    transcriptionController =
      null;
  }


  if (
    chatController
  ) {

    try {

      chatController.abort();

    } catch {}


    chatController =
      null;
  }


  if (
    ttsController
  ) {

    try {

      ttsController.abort();

    } catch {}


    ttsController =
      null;
  }


  /*
   * Audio.
   */
  stopElevenAudio();


  stopIntro();


  /*
   * Mikro.
   */
  stopAudioAnalysis();


  stopMicrophoneTracks();


  /*
   * Alte Remote-Audio-Ausgabe
   * bleibt definitiv stumm.
   */
  if (
    remoteAudio
  ) {

    try {

      remoteAudio.pause();


      remoteAudio.srcObject =
        null;


      remoteAudio.muted =
        true;


      remoteAudio.volume =
        0;

    } catch {}
  }


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


  if (
    button
  ) {

    button.disabled =
      false;
  }
}


/* =========================================================
   INITIAL STATE
   ========================================================= */

setJarvisState(
  "offline"
);


/* =========================================================
   REMOTE AUDIO SICHERHEIT
   ========================================================= */

if (
  remoteAudio
) {

  remoteAudio.muted =
    true;


  remoteAudio.volume =
    0;
}


/* =========================================================
   BUTTON
   ========================================================= */

if (
  button
) {

  button.addEventListener(
    "click",

    async () => {

      if (
        starting
      ) {

        return;
      }


      if (
        active
      ) {

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
