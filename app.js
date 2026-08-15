/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V5.4
   - ElevenLabs für Startbegrüßung
   - OpenAI Realtime weiterhin für normale Antworten
   - Intro leise + sanftes Ausblenden
   - JARVIS-Ausgabe verstärkt
   - Mikro bleibt während JARVIS spricht aus
   - Semantic VAD läuft serverseitig
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
   CONNECTION
   ========================================================= */

let pc = null;

let dc = null;

let localStream = null;


let active = false;

let connecting = false;


let assistantSpeaking = false;

let waitingForAssistant = false;

let startupGreeting = false;


/* =========================================================
   OPENAI AUDIO OUTPUT
   ========================================================= */

let outputAudioContext = null;

let outputSource = null;

let outputGain = null;

let outputCompressor = null;

let lastRemoteStream = null;


/* =========================================================
   ELEVENLABS AUDIO
   ========================================================= */

let elevenGreetingAudio = null;

let elevenGreetingObjectUrl = null;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio = null;

let introFadeTimer = null;


/* =========================================================
   WATCHDOG
   ========================================================= */

let responseWatchdog = null;


/* =========================================================
   TOOLS
   ========================================================= */

const handledToolCalls =
  new Set();

const MAX_HANDLED_TOOL_CALLS =
  50;


/* =========================================================
   SETTINGS
   ========================================================= */

/*
 * OpenAI-JARVIS-Ausgabe.
 *
 * Normale Antworten laufen vorerst
 * weiterhin über cedar.
 */
const JARVIS_OUTPUT_GAIN =
  2.75;


/*
 * Intro beginnt ab Sekunde 4.
 */
const INTRO_START =
  4;


/*
 * Intro bereits beim Start
 * deutlich leiser.
 */
const INTRO_START_VOLUME =
  0.28;


/*
 * Kurze Zeit Intro alleine,
 * bevor JARVIS begrüßt.
 */
const INTRO_VOICE_DELAY_MS =
  2000;


/*
 * Sobald JARVIS spricht,
 * bleibt Intro nur noch sehr
 * leise im Hintergrund.
 */
const INTRO_BACKGROUND_VOLUME =
  0.025;


/*
 * Sanftes Ducking.
 */
const INTRO_DUCK_DURATION_MS =
  1800;


/*
 * Intro danach noch 15 Sekunden
 * sanft auslaufen lassen.
 */
const INTRO_FADE_DURATION_MS =
  15000;


/*
 * Nach einer OpenAI-Antwort:
 * kleine Echo-Pause.
 */
const LISTENING_RESUME_DELAY_MS =
  700;


/*
 * ElevenLabs darf maximal so
 * lange auf die Begrüßung warten.
 */
const ELEVEN_GREETING_TIMEOUT_MS =
  20000;


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


/*
 * Steuert das bestehende HUD.
 *
 * offline
 * connecting
 * listening
 * hearing
 * thinking
 * speaking
 */
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


function safeSend(payload) {

  if (
    !dc ||
    dc.readyState !== "open"
  ) {

    console.warn(
      "Realtime DataChannel ist nicht offen."
    );

    return false;
  }


  try {

    dc.send(
      JSON.stringify(
        payload
      )
    );


    return true;


  } catch (error) {

    console.error(
      "DataChannel send error:",
      error
    );


    return false;
  }
}


/* =========================================================
   RESPONSE WATCHDOG
   ========================================================= */

function armResponseWatchdog(
  ms = 12000
) {

  clearResponseWatchdog();


  responseWatchdog =
    setTimeout(
      () => {

        console.warn(
          "Watchdog: keine Audio-Antwort erhalten."
        );


        if (active) {

          resumeListening();
        }

      },
      ms
    );
}


function clearResponseWatchdog() {

  if (!responseWatchdog) {
    return;
  }


  clearTimeout(
    responseWatchdog
  );


  responseWatchdog =
    null;
}


/* =========================================================
   MICROPHONE
   ========================================================= */

function setMicrophoneEnabled(
  enabled
) {

  if (!localStream) {
    return;
  }


  const tracks =
    localStream.getAudioTracks();


  for (
    const track of
    tracks
  ) {

    track.enabled =
      enabled;
  }


  console.log(
    "Microphone:",
    enabled
      ? "ENABLED"
      : "MUTED"
  );
}


/*
 * Während JARVIS nachdenkt
 * oder spricht:
 * Mikro komplett aus.
 */
function muteForAssistant() {

  waitingForAssistant =
    true;


  setJarvisState(
    "thinking"
  );


  setMicrophoneEnabled(
    false
  );
}


/*
 * Erst nach kompletter Antwort
 * wieder zuhören.
 */
function resumeListening() {

  clearResponseWatchdog();


  if (!active) {
    return;
  }


  waitingForAssistant =
    false;


  assistantSpeaking =
    false;


  startupGreeting =
    false;


  setJarvisState(
    "listening"
  );


  setMicrophoneEnabled(
    true
  );


  setLog(
    "JARVIS hört zu."
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
      "Berlin-Zeit konnte nicht bestimmt werden:",
      error
    );
  }


  return new Date()
    .getHours();
}


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


  /*
   * MORGEN
   */
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


  /*
   * MITTAG
   */
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


  /*
   * NACHMITTAG
   */
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


  /*
   * ABEND
   */
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


  /*
   * NACHT
   */
  return pickRandom([
    "Mattl ... ernsthaft? Na gut. Ich bin da.",
    "Hey Mattl. Schlaf wird offenbar weiterhin überschätzt.",
    "Mattl, es ist spät. Natürlich arbeiten wir noch."
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


    introAudio =
      null;
  }
}


/*
 * Intro startet bereits
 * deutlich leiser.
 */
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
        introAudio.readyState >= 1
      ) {

        play();
      }


      introAudio.load();
    }
  );
}


/* =========================================================
   INTRO DUCKING
   ========================================================= */

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


        /*
         * Smoothstep.
         */
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


        if (
          progress >= 1
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
   INTRO LONG FADE
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
   OPENAI JARVIS AUDIO
   ========================================================= */

function setJarvisGain(
  value
) {

  if (
    !outputGain ||
    !outputAudioContext
  ) {

    return;
  }


  const now =
    outputAudioContext
      .currentTime;


  outputGain.gain
    .cancelScheduledValues(
      now
    );


  outputGain.gain
    .setTargetAtTime(
      value,
      now,
      0.05
    );
}


async function connectRemoteAudio(
  stream
) {

  if (
    stream ===
    lastRemoteStream
  ) {

    return;
  }


  lastRemoteStream =
    stream;


  remoteAudio.srcObject =
    stream;


  remoteAudio.volume =
    1;


  try {

    await remoteAudio.play();


  } catch (error) {

    console.warn(
      "remoteAudio.play:",
      error
    );
  }


  try {

    if (!outputAudioContext) {

      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;


      outputAudioContext =
        new AudioContextClass();
    }


    if (
      outputAudioContext.state ===
      "suspended"
    ) {

      await outputAudioContext.resume();
    }


    if (!outputSource) {

      outputSource =
        outputAudioContext
          .createMediaElementSource(
            remoteAudio
          );


      outputGain =
        outputAudioContext
          .createGain();


      outputCompressor =
        outputAudioContext
          .createDynamicsCompressor();


      /*
       * Etwas mehr Lautstärke,
       * aber Peaks abfangen.
       */
      outputCompressor
        .threshold.value =
        -10;


      outputCompressor
        .knee.value =
        12;


      outputCompressor
        .ratio.value =
        8;


      outputCompressor
        .attack.value =
        0.003;


      outputCompressor
        .release.value =
        0.16;


      outputSource.connect(
        outputGain
      );


      outputGain.connect(
        outputCompressor
      );


      outputCompressor.connect(
        outputAudioContext.destination
      );
    }


    setJarvisGain(
      JARVIS_OUTPUT_GAIN
    );


  } catch (error) {

    console.warn(
      "Audio gain unavailable:",
      error
    );
  }
}


/* =========================================================
   ELEVENLABS CLEANUP
   ========================================================= */

function stopElevenGreeting() {

  if (elevenGreetingAudio) {

    try {

      elevenGreetingAudio.pause();

    } catch {}


    elevenGreetingAudio.src =
      "";


    elevenGreetingAudio =
      null;
  }


  if (elevenGreetingObjectUrl) {

    try {

      URL.revokeObjectURL(
        elevenGreetingObjectUrl
      );

    } catch {}


    elevenGreetingObjectUrl =
      null;
  }
}


/* =========================================================
   OPENAI FALLBACK GREETING
   ========================================================= */

/*
 * Falls ElevenLabs aus irgendeinem Grund
 * nicht erreichbar ist, soll JARVIS nicht
 * komplett hängen bleiben.
 *
 * Dann nutzt nur die Startbegrüßung
 * automatisch cedar als Fallback.
 */
function requestOpenAIFallbackGreeting(
  greeting
) {

  console.warn(
    "ElevenLabs nicht verfügbar – OpenAI-Fallback wird verwendet."
  );


  startupGreeting =
    true;


  muteForAssistant();


  safeSend({
    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ],

      tool_choice:
        "none",

      max_output_tokens:
        250,

      instructions:
        `Sprich ausschließlich diesen Satz auf Deutsch:

"${greeting}"

Kein weiterer Satz.
Sprich ihn vollständig zu Ende.
Danach schweigen.`
    }
  });


  armResponseWatchdog(
    15000
  );
}


/* =========================================================
   ELEVENLABS STARTUP GREETING
   ========================================================= */

/*
 * NUR DIE STARTBEGRÜSSUNG
 * läuft jetzt über ElevenLabs.
 *
 * Normale Antworten bleiben
 * vorerst OpenAI Realtime.
 */
async function requestStartupGreeting() {

  startupGreeting =
    true;


  /*
   * Während Laden + Begrüßung
   * Mikro garantiert aus.
   */
  muteForAssistant();


  setLog(
    "JARVIS startet …"
  );


  const greeting =
    getGreeting();


  /*
   * Sicherheits-Timer.
   */
  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {

        controller.abort();

      },
      ELEVEN_GREETING_TIMEOUT_MS
    );


  try {

    stopElevenGreeting();


    /*
     * Der Browser schickt NUR Text
     * an unseren eigenen Server.
     *
     * API-Key und Voice-ID bleiben
     * sicher bei Render.
     */
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
                greeting
            }),

          signal:
            controller.signal
        }
      );


    clearTimeout(
      timeout
    );


    if (!response.ok) {

      const errorText =
        await response.text();


      throw new Error(
        `ElevenLabs HTTP ${response.status}: ${errorText}`
      );
    }


    /*
     * MP3-Audio vom Server laden.
     */
    const blob =
      await response.blob();


    if (
      !blob ||
      blob.size === 0
    ) {

      throw new Error(
        "ElevenLabs hat kein Audio geliefert."
      );
    }


    elevenGreetingObjectUrl =
      URL.createObjectURL(
        blob
      );


    elevenGreetingAudio =
      new Audio(
        elevenGreetingObjectUrl
      );


    elevenGreetingAudio.preload =
      "auto";


    /*
     * ElevenLabs-Stimme auf
     * voller Element-Lautstärke.
     *
     * Die eigentliche Lautstärke
     * der erzeugten Stimme bleibt
     * damit unangetastet.
     */
    elevenGreetingAudio.volume =
      1;


    /*
     * Jetzt spricht JARVIS.
     */
    assistantSpeaking =
      true;


    waitingForAssistant =
      true;


    setJarvisState(
      "speaking"
    );


    setMicrophoneEnabled(
      false
    );


    setLog(
      "JARVIS spricht."
    );


    elevenGreetingAudio.onended =
      () => {

        console.log(
          "ElevenLabs Begrüßung beendet."
        );


        assistantSpeaking =
          false;


        startupGreeting =
          false;


        stopElevenGreeting();


        /*
         * Kurze Echo-Pause,
         * dann Mikro öffnen.
         */
        setTimeout(
          () => {

            if (active) {

              resumeListening();
            }

          },
          LISTENING_RESUME_DELAY_MS
        );
      };


    elevenGreetingAudio.onerror =
      error => {

        console.error(
          "ElevenLabs Audio playback error:",
          error
        );


        stopElevenGreeting();


        assistantSpeaking =
          false;


        /*
         * Wenn MP3 zwar geladen,
         * aber nicht abgespielt werden
         * konnte, cedar als Fallback.
         */
        requestOpenAIFallbackGreeting(
          greeting
        );
      };


    await elevenGreetingAudio.play();


  } catch (error) {

    clearTimeout(
      timeout
    );


    console.error(
      "ElevenLabs greeting error:",
      error
    );


    stopElevenGreeting();


    assistantSpeaking =
      false;


    /*
     * Wichtig:
     * JARVIS bleibt benutzbar,
     * auch wenn ElevenLabs mal
     * ausfällt.
     */
    requestOpenAIFallbackGreeting(
      greeting
    );
  }
}


/* =========================================================
   TOOLS
   ========================================================= */

async function runTool(event) {

  if (
    !event.call_id ||
    handledToolCalls.has(
      event.call_id
    )
  ) {

    return;
  }


  handledToolCalls.add(
    event.call_id
  );


  /*
   * Set begrenzen.
   */
  if (
    handledToolCalls.size >
    MAX_HANDLED_TOOL_CALLS
  ) {

    const oldest =
      handledToolCalls
        .values()
        .next()
        .value;


    handledToolCalls.delete(
      oldest
    );
  }


  /*
   * Während Live-Daten
   * geladen werden:
   * Mikro aus.
   */
  muteForAssistant();


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


  let endpoint =
    null;


  switch (
    event.name
  ) {

    case "get_shopify_summary":

      endpoint =
        "/api/shopify-summary";

      break;


    case "get_weather":

      endpoint =
        "/api/weather";

      break;


    case "get_important_emails":

      endpoint =
        "/api/important-emails";

      break;


    case "get_calendar_today":

      endpoint =
        "/api/calendar-today";

      break;
  }


  if (!endpoint) {

    resumeListening();

    return;
  }


  setLog(
    "Live-Daten werden geprüft …"
  );


  let result;


  try {

    const response =
      await fetch(
        endpoint,
        {
          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              args
            )
        }
      );


    const raw =
      await response.text();


    try {

      result =
        JSON.parse(
          raw
        );


    } catch {

      result = {

        error:
          raw
      };
    }


    if (!response.ok) {

      result.http_status =
        response.status;
    }


  } catch (error) {

    console.error(
      "Tool fetch error:",
      error
    );


    result = {

      error:
        "Die Live-Daten konnten nicht geladen werden."
    };
  }


  /*
   * Echtes Tool-Ergebnis
   * zurück an OpenAI.
   */
  safeSend({
    type:
      "conversation.item.create",

    item: {

      type:
        "function_call_output",

      call_id:
        event.call_id,

      output:
        JSON.stringify(
          result
        )
    }
  });


  /*
   * Normale Tool-Antwort
   * weiterhin über cedar.
   *
   * ElevenLabs stellen wir erst
   * um, wenn die Begrüßung
   * zuverlässig funktioniert.
   */
  safeSend({
    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ],

      instructions:
        `Beantworte die letzte Frage ausschließlich anhand des gerade gelieferten Tool-Ergebnisses.

Sprich ausschließlich Deutsch.

Regeln:
- kurz und konkret
- nenne die relevanten Zahlen klar
- keine erfundenen Werte
- keine Reisen
- kein Essen
- keine Workouts
- keine themenfremden Vorschläge
- nach der Antwort schweigen`
    }
  });


  armResponseWatchdog();
}


/* =========================================================
   START REALTIME
   ========================================================= */

async function startJarvis() {

  if (
    active ||
    connecting
  ) {

    return;
  }


  connecting =
    true;


  if (button) {

    button.disabled =
      true;
  }


  handledToolCalls.clear();


  setStatus(
    "Verbinde …"
  );


  setJarvisState(
    "connecting"
  );


  setButtonActive(
    true
  );


  setLog(
    "JARVIS startet …"
  );


  try {

    /*
     * AudioContext früh nach dem
     * Benutzer-Klick aktivieren.
     *
     * Hilft gegen Browser-
     * Autoplay-Beschränkungen.
     */
    try {

      if (!outputAudioContext) {

        const AudioContextClass =
          window.AudioContext ||
          window.webkitAudioContext;


        if (AudioContextClass) {

          outputAudioContext =
            new AudioContextClass();
        }
      }


      if (
        outputAudioContext &&
        outputAudioContext.state ===
          "suspended"
      ) {

        await outputAudioContext.resume();
      }


    } catch (error) {

      console.warn(
        "AudioContext start:",
        error
      );
    }


    /*
     * Intro.
     */
    await startIntro();


    /*
     * WebRTC.
     */
    pc =
      new RTCPeerConnection();


    /*
     * OpenAI Remote Audio.
     *
     * Wird weiterhin für
     * normale Antworten gebraucht.
     */
    pc.ontrack =
      async event => {

        const stream =
          event.streams?.[0] ||
          new MediaStream(
            [
              event.track
            ]
          );


        await connectRemoteAudio(
          stream
        );
      };


    pc.onconnectionstatechange =
      () => {

        const state =
          pc?.connectionState;


        console.log(
          "Peer:",
          state
        );


        if (
          state === "failed"
        ) {

          setLog(
            "Voice-Verbindung fehlgeschlagen."
          );
        }
      };


    /*
     * Realtime DataChannel.
     */
    dc =
      pc.createDataChannel(
        "oai-events"
      );


    dc.onopen =
      async () => {

        active =
          true;


        connecting =
          false;


        if (button) {

          button.disabled =
            false;
        }


        setStatus(
          "Online"
        );


        /*
         * Während Intro und Begrüßung
         * bleibt Mikro aus.
         */
        setMicrophoneEnabled(
          false
        );


        setLog(
          "JARVIS startet …"
        );


        /*
         * Intro kurz alleine laufen.
         */
        await sleep(
          INTRO_VOICE_DELAY_MS
        );


        if (!active) {

          return;
        }


        /*
         * Musik sanft runter.
         */
        duckIntro();


        /*
         * NEU:
         *
         * Startbegrüßung läuft
         * über ElevenLabs.
         */
        await requestStartupGreeting();
      };


    dc.onerror =
      error => {

        console.error(
          "Data channel:",
          error
        );


        setLog(
          "Voice-Verbindung gestört."
        );
      };


    dc.onclose =
      () => {

        if (
          active ||
          connecting
        ) {

          stopJarvis();
        }
      };


    dc.onmessage =
      async message => {

        let event;


        try {

          event =
            JSON.parse(
              message.data
            );


        } catch {

          return;
        }


        console.log(
          "Realtime:",
          event.type
        );


        /* =================================================
           USER SPEECH START
           ================================================= */

        if (
          event.type ===
          "input_audio_buffer.speech_started"
        ) {

          /*
           * Während ElevenLabs-
           * Begrüßung oder OpenAI-
           * Ausgabe darf hier
           * nichts passieren.
           */
          if (
            !assistantSpeaking &&
            !waitingForAssistant
          ) {

            setJarvisState(
              "hearing"
            );


            setLog(
              "Ich höre zu …"
            );
          }
        }


        /* =================================================
           USER SPEECH STOP
           ================================================= */

        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {

          /*
           * Semantic VAD hat den
           * Turn beendet.
           */
          muteForAssistant();


          setLog(
            "Denke nach …"
          );
        }


        /* =================================================
           TRANSCRIPTION
           ================================================= */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.completed"
        ) {

          const transcript =
            String(
              event.transcript ||
              ""
            ).trim();


          if (transcript) {

            console.log(
              "Mattl:",
              transcript
            );


            setLog(
              `Verstanden: ${transcript}`
            );
          }
        }


        /* =================================================
           OPENAI AUDIO START
           ================================================= */

        if (
          event.type ===
          "output_audio_buffer.started"
        ) {

          assistantSpeaking =
            true;


          setJarvisState(
            "speaking"
          );


          clearResponseWatchdog();


          /*
           * Mikro garantiert aus.
           */
          setMicrophoneEnabled(
            false
          );


          /*
           * OpenAI cedar
           * verstärken.
           */
          setJarvisGain(
            JARVIS_OUTPUT_GAIN
          );


          setLog(
            "JARVIS spricht."
          );
        }


        /* =================================================
           OPENAI AUDIO STOP
           ================================================= */

        if (
          event.type ===
          "output_audio_buffer.stopped"
        ) {

          assistantSpeaking =
            false;


          startupGreeting =
            false;


          /*
           * Kleine Echo-Pause.
           */
          setTimeout(
            () => {

              if (active) {

                resumeListening();
              }

            },
            LISTENING_RESUME_DELAY_MS
          );
        }


        /* =================================================
           TOOL CALL
           ================================================= */

        if (
          event.type ===
          "response.function_call_arguments.done"
        ) {

          await runTool(
            event
          );
        }


        /* =================================================
           RESPONSE DONE
           ================================================= */

        if (
          event.type ===
          "response.done"
        ) {

          if (
            event.response?.status ===
            "failed"
          ) {

            console.error(
              "Response failed:",
              event.response
            );


            setLog(
              "JARVIS konnte nicht antworten."
            );


            setTimeout(
              () => {

                if (active) {

                  resumeListening();
                }

              },
              500
            );
          }
        }


        /* =================================================
           TRANSCRIPTION ERROR
           ================================================= */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.failed"
        ) {

          console.error(
            "Transcription failed:",
            event
          );


          setLog(
            "Ich habe dich nicht verstanden."
          );


          setTimeout(
            () => {

              if (
                active &&
                !assistantSpeaking
              ) {

                resumeListening();
              }

            },
            500
          );
        }


        /* =================================================
           REALTIME ERROR
           ================================================= */

        if (
          event.type ===
          "error"
        ) {

          console.error(
            "Realtime error:",
            event
          );


          setLog(
            event.error?.message ||
            "JARVIS-Fehler."
          );


          setTimeout(
            () => {

              if (
                active &&
                !assistantSpeaking
              ) {

                resumeListening();
              }

            },
            500
          );
        }
      };


    /* =====================================================
       MICROPHONE
       ===================================================== */

    localStream =
      await navigator
        .mediaDevices
        .getUserMedia({
          audio: {

            /*
             * Echo von JARVIS
             * reduzieren.
             */
            echoCancellation:
              true,


            /*
             * Browser-Rauschfilter.
             */
            noiseSuppression:
              true,


            /*
             * AUS:
             * Leise Nebengeräusche
             * sollen nicht künstlich
             * verstärkt werden.
             */
            autoGainControl:
              false,


            channelCount:
              1
          }
        });


    /*
     * Start zunächst stumm.
     */
    setMicrophoneEnabled(
      false
    );


    for (
      const track of
      localStream.getAudioTracks()
    ) {

      pc.addTrack(
        track,
        localStream
      );
    }


    /* =====================================================
       WEBRTC OFFER
       ===================================================== */

    const offer =
      await pc.createOffer();


    await pc.setLocalDescription(
      offer
    );


    const response =
      await fetch(
        "/session",
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


    if (!response.ok) {

      throw new Error(
        await response.text()
      );
    }


    const answer =
      await response.text();


    await pc.setRemoteDescription({
      type:
        "answer",

      sdp:
        answer
    });


  } catch (error) {

    console.error(
      "Start error:",
      error
    );


    await stopJarvis();


    setLog(
      `Start fehlgeschlagen: ${error.message}`
    );


  } finally {

    connecting =
      false;


    if (button) {

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


  connecting =
    false;


  assistantSpeaking =
    false;


  waitingForAssistant =
    false;


  startupGreeting =
    false;


  clearResponseWatchdog();


  /*
   * ElevenLabs-Audio stoppen.
   */
  stopElevenGreeting();


  /*
   * Intro stoppen.
   */
  stopIntro();


  /*
   * Mikro aus.
   */
  setMicrophoneEnabled(
    false
  );


  try {

    if (
      dc &&
      dc.readyState ===
        "open"
    ) {

      dc.close();
    }

  } catch {}


  try {

    if (pc) {

      pc.close();
    }

  } catch {}


  try {

    if (localStream) {

      for (
        const track of
        localStream.getTracks()
      ) {

        track.stop();
      }
    }

  } catch {}


  localStream =
    null;


  pc =
    null;


  dc =
    null;


  handledToolCalls.clear();


  lastRemoteStream =
    null;


  try {

    remoteAudio.pause();


    remoteAudio.srcObject =
      null;


  } catch {}


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

    button.disabled =
      false;
  }
}


/* =========================================================
   BUTTON
   ========================================================= */

setJarvisState(
  "offline"
);


if (button) {

  button.addEventListener(
    "click",

    async () => {

      if (connecting) {

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
    "#toggle-Button nicht im DOM gefunden."
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
