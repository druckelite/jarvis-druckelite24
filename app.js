/* =========================================================
   ÄNDERUNGEN IN DIESER VERSION
   =========================================================
   1) Watchdog: Mikro bleibt nicht mehr für immer stumm,
      falls JARVIS mal keine Audio-Antwort schickt.
   2) Lautstärke wird jetzt sanft geregelt statt hart
      gesprungen -> kein Knacken mehr beim Sprechbeginn.
   3) Doppelte ontrack-Events verbinden den Stream nicht
      mehr unnötig neu.
   4) handledToolCalls wächst bei langen Sessions nicht
      mehr unbegrenzt.
   5) Absicherung, falls der #toggle-Button im HTML fehlt.
   ========================================================= */

const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

let pc = null;
let dc = null;
let localStream = null;

let active = false;
let connecting = false;

let assistantSpeaking = false;
let waitingForAssistant = false;
let startupGreeting = false;

let outputAudioContext = null;
let outputSource = null;
let outputGain = null;
let lastRemoteStream = null;

let introAudio = null;
let introFadeTimer = null;

// Sicherheitsnetz: falls JARVIS nach einer Anfrage
// aus irgendeinem Grund NICHT antwortet (z. B. Response
// ohne Audio, verlorenes Event), würde das Mikro sonst
// für immer stumm bleiben. Dieser Timer holt es zurück.
let responseWatchdog = null;

const handledToolCalls = new Set();
const MAX_HANDLED_TOOL_CALLS = 50;

/* =========================================================
   SETTINGS
   ========================================================= */

/*
 * JARVIS deutlich lauter.
 */
const JARVIS_OUTPUT_GAIN = 2.20;

/*
 * Intro
 */
const INTRO_START = 4;
const INTRO_VOICE_DELAY_MS = 2500;

/*
 * Intro wird beim Sprechen stark abgesenkt.
 */
const INTRO_BACKGROUND_VOLUME = 0.06;

const INTRO_DUCK_DURATION_MS = 1200;
const INTRO_FADE_DURATION_MS = 15000;


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

function safeSend(payload) {
  if (
    !dc ||
    dc.readyState !== "open"
  ) {
    return false;
  }

  try {
    dc.send(
      JSON.stringify(payload)
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

// Wird direkt nach jedem "response.create" gestartet.
// Kommt keine Audio-Antwort (output_audio_buffer.started),
// gibt der Watchdog das Mikro nach Ablauf der Zeit wieder frei.
function armResponseWatchdog(ms = 12000) {
  clearResponseWatchdog();

  responseWatchdog = setTimeout(() => {
    console.warn(
      "Watchdog: keine Audio-Antwort erhalten, Mikro wird freigegeben."
    );

    if (active) {
      resumeListening();
    }
  }, ms);
}

function clearResponseWatchdog() {
  if (responseWatchdog) {
    clearTimeout(responseWatchdog);
    responseWatchdog = null;
  }
}


/* =========================================================
   MICROPHONE CONTROL
   ========================================================= */

function setMicrophoneEnabled(enabled) {
  if (!localStream) {
    return;
  }

  const tracks =
    localStream.getAudioTracks();

  for (const track of tracks) {
    track.enabled = enabled;
  }

  console.log(
    "Microphone:",
    enabled
      ? "ENABLED"
      : "MUTED"
  );
}


function muteForAssistant() {
  waitingForAssistant = true;

  setMicrophoneEnabled(false);
}


function resumeListening() {
  clearResponseWatchdog();

  if (!active) {
    return;
  }

  waitingForAssistant = false;
  assistantSpeaking = false;

  setMicrophoneEnabled(true);

  setLog(
    "JARVIS hört zu."
  );
}


/* =========================================================
   BERLIN TIME
   ========================================================= */

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
        part.type === "hour"
    );

  const hour =
    Number(
      hourPart?.value
    );

  if (Number.isNaN(hour)) {
    return new Date().getHours();
  }

  return hour;
}


function pickRandom(items) {
  return items[
    Math.floor(
      Math.random() *
      items.length
    )
  ];
}


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

    introAudio = null;
  }
}


async function startIntro() {
  stopIntro();

  introAudio =
    new Audio(
      "/Intro.mp3?v=7"
    );

  introAudio.preload =
    "auto";

  introAudio.volume =
    1;

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
  });
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

    introFadeTimer = null;
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

          introFadeTimer = null;

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


        if (
          progress >= 1
        ) {
          clearInterval(
            introFadeTimer
          );

          introFadeTimer = null;


          try {
            introAudio.pause();
          } catch {}


          introAudio = null;
        }

      },
      60
    );
}


/* =========================================================
   JARVIS AUDIO OUTPUT
   ========================================================= */

function setJarvisGain(value) {
  if (!outputGain || !outputAudioContext) {
    return;
  }

  const now = outputAudioContext.currentTime;

  outputGain.gain.cancelScheduledValues(now);
  outputGain.gain.setTargetAtTime(value, now, 0.05);
}


async function connectRemoteAudio(stream) {
  /*
   * Gleicher Stream wie zuvor?
   * Dann nichts neu verbinden (verhindert
   * Aussetzer, falls ontrack mehrfach feuert).
   */
  if (stream === lastRemoteStream) {
    return;
  }

  lastRemoteStream = stream;

  remoteAudio.srcObject =
    stream;

  /*
   * HTML Audio selbst auf Maximum.
   */
  remoteAudio.volume = 1;


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


    /*
     * MediaElementSource nur einmal
     * für dieses Audio-Element erstellen.
     */

    if (!outputSource) {
      outputSource =
        outputAudioContext
          .createMediaElementSource(
            remoteAudio
          );


      outputGain =
        outputAudioContext
          .createGain();


      outputSource.connect(
        outputGain
      );


      outputGain.connect(
        outputAudioContext.destination
      );
    }


    /*
     * JARVIS deutlich verstärken.
     */

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
   STARTUP GREETING
   ========================================================= */

function requestStartupGreeting() {
  startupGreeting = true;

  /*
   * Mikro während der Begrüßung AUS.
   */

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
        60,

      instructions:
        `Sprich ausschließlich diesen Satz auf Deutsch:

"${getGreeting()}"

Kein weiterer Satz.
Danach schweigen.`
    }
  });

  armResponseWatchdog();
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

  if (
    handledToolCalls.size >
    MAX_HANDLED_TOOL_CALLS
  ) {
    const oldest =
      handledToolCalls
        .values()
        .next().value;

    handledToolCalls.delete(oldest);
  }


  /*
   * Während Live-Daten geladen werden
   * bleibt Mikro AUS.
   */

  muteForAssistant();


  let args = {};


  try {
    args =
      event.arguments
        ? JSON.parse(
            event.arguments
          )
        : {};

  } catch {
    args = {};
  }


  let endpoint =
    null;


  switch (event.name) {
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
        JSON.parse(raw);

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
   * Tool-Ergebnis zurück an Realtime.
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
   * JARVIS soll das Ergebnis aussprechen.
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


  connecting = true;

  button.disabled = true;

  handledToolCalls.clear();


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

    /*
     * Intro starten.
     */

    await startIntro();


    /*
     * WebRTC-Verbindung.
     */

    pc =
      new RTCPeerConnection();


    /*
     * JARVIS Audio kommt hier an.
     */

    pc.ontrack =
      async event => {
        const stream =
          event.streams?.[0] ||
          new MediaStream(
            [event.track]
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
     * Realtime Event Channel.
     */

    dc =
      pc.createDataChannel(
        "oai-events"
      );


    dc.onopen =
      async () => {

        active = true;

        connecting = false;

        button.disabled = false;


        setStatus(
          "Online"
        );


        /*
         * Mikro beim Start AUS.
         */

        setMicrophoneEnabled(
          false
        );


        setLog(
          "JARVIS startet …"
        );


        /*
         * Intro zunächst alleine.
         */

        await sleep(
          INTRO_VOICE_DELAY_MS
        );


        if (!active) {
          return;
        }


        /*
         * Intro stark absenken.
         */

        duckIntro();


        /*
         * Begrüßung starten.
         */

        requestStartupGreeting();
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

          if (
            !assistantSpeaking &&
            !waitingForAssistant
          ) {
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
           * Sofort Mikro AUS.
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
           JARVIS STARTS SPEAKING
           ================================================= */

        if (
          event.type ===
          "output_audio_buffer.started"
        ) {

          assistantSpeaking =
            true;


          /*
           * Audio ist tatsächlich da,
           * Watchdog wird nicht mehr gebraucht.
           */

          clearResponseWatchdog();


          /*
           * Mikro garantiert AUS.
           */

          setMicrophoneEnabled(
            false
          );


          /*
           * Sicherheit:
           * JARVIS-Lautstärke wieder
           * auf den gewünschten Gain setzen.
           */

          setJarvisGain(
            JARVIS_OUTPUT_GAIN
          );


          setLog(
            "JARVIS spricht."
          );
        }


        /* =================================================
           JARVIS STOPS SPEAKING
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
           * Kurze Pause, damit Lautsprecher-
           * Echo nicht direkt als neue Sprache
           * erkannt wird.
           */

          setTimeout(
            () => {

              if (active) {
                resumeListening();
              }

            },
            350
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
           ERROR
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


    /*
     * Mikro bleibt zunächst stumm.
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

    connecting = false;

    button.disabled = false;
  }
}


/* =========================================================
   STOP JARVIS
   ========================================================= */

async function stopJarvis() {

  active = false;

  connecting = false;

  assistantSpeaking = false;

  waitingForAssistant = false;

  startupGreeting = false;


  stopIntro();


  setMicrophoneEnabled(
    false
  );


  try {
    if (
      dc &&
      dc.readyState === "open"
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


  localStream = null;

  pc = null;

  dc = null;


  handledToolCalls.clear();


  try {
    remoteAudio.pause();

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


  button.disabled =
    false;
}


/* =========================================================
   BUTTON
   ========================================================= */

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
