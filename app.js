/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V9.4 · REALTIME + BUSINESS TOOLS + STABLE AUDIO
   ========================================================= */

const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

let active = false;
let starting = false;
let stopping = false;

let peerConnection = null;
let dataChannel = null;
let micStream = null;

let realtimeConnected = false;
let assistantSpeaking = false;
let responseInProgress = false;
let greetingInProgress = false;

const runningToolCalls = new Set();


/* =========================================================
   AUDIO OUTPUT · GLEICHMÄSSIG + LAUT
   ========================================================= */

let playbackAudioContext = null;
let playbackSourceNode = null;
let playbackPreGain = null;
let playbackCompressor = null;
let playbackLimiter = null;
let playbackGain = null;

let lastPlaybackStreamId = null;

const PLAYBACK_PRE_GAIN = 1.45;
const PLAYBACK_OUTPUT_GAIN = 1.18;


async function ensurePlaybackAudioContext() {

  if (!playbackAudioContext) {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    playbackAudioContext =
      new AudioContextClass({
        latencyHint:
          "interactive"
      });
  }


  if (
    playbackAudioContext.state ===
    "suspended"
  ) {

    try {

      await playbackAudioContext
        .resume();

    } catch (error) {

      console.warn(
        "AudioContext resume:",
        error
      );
    }
  }


  return playbackAudioContext;
}


function disconnectProcessedPlayback() {

  try {
    playbackSourceNode
      ?.disconnect();
  } catch {}


  try {
    playbackPreGain
      ?.disconnect();
  } catch {}


  try {
    playbackCompressor
      ?.disconnect();
  } catch {}


  try {
    playbackLimiter
      ?.disconnect();
  } catch {}


  try {
    playbackGain
      ?.disconnect();
  } catch {}


  playbackSourceNode = null;
  playbackPreGain = null;
  playbackCompressor = null;
  playbackLimiter = null;
  playbackGain = null;

  lastPlaybackStreamId = null;
}


async function connectProcessedPlayback(
  stream
) {

  const context =
    await ensurePlaybackAudioContext();


  if (!context) {
    return false;
  }


  const streamId =
    stream?.id ||
    null;


  /*
   * Verhindert doppelte Audio-Ausgabe.
   */

  if (
    streamId &&
    streamId ===
      lastPlaybackStreamId &&
    playbackSourceNode
  ) {

    return true;
  }


  disconnectProcessedPlayback();


  lastPlaybackStreamId =
    streamId;


  playbackSourceNode =
    context
      .createMediaStreamSource(
        stream
      );


  /*
   * Vorverstärkung:
   * leise Stimme wird angehoben.
   */

  playbackPreGain =
    context.createGain();


  playbackPreGain
    .gain.value =
    PLAYBACK_PRE_GAIN;


  /*
   * Hauptkompressor:
   * sorgt für gleichmäßigere Stimme.
   */

  playbackCompressor =
    context
      .createDynamicsCompressor();


  playbackCompressor
    .threshold.value =
    -32;


  playbackCompressor
    .knee.value =
    14;


  playbackCompressor
    .ratio.value =
    8;


  playbackCompressor
    .attack.value =
    0.003;


  playbackCompressor
    .release.value =
    0.20;


  /*
   * Limiter:
   * verhindert plötzlich sehr laute Stellen.
   */

  playbackLimiter =
    context
      .createDynamicsCompressor();


  playbackLimiter
    .threshold.value =
    -7;


  playbackLimiter
    .knee.value =
    2;


  playbackLimiter
    .ratio.value =
    20;


  playbackLimiter
    .attack.value =
    0.001;


  playbackLimiter
    .release.value =
    0.10;


  /*
   * Ausgangslautstärke
   */

  playbackGain =
    context.createGain();


  playbackGain
    .gain.value =
    PLAYBACK_OUTPUT_GAIN;


  /*
   * AUDIO CHAIN
   */

  playbackSourceNode
    .connect(
      playbackPreGain
    )
    .connect(
      playbackCompressor
    )
    .connect(
      playbackLimiter
    )
    .connect(
      playbackGain
    )
    .connect(
      context.destination
    );


  return true;
}


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

let proactiveCheckTimer = null;

let proactiveFirstCheckTimer =
  null;

let reminderCheckTimer =
  null;


const PROACTIVE_CHECK_INTERVAL_MS =
  20 *
  60 *
  1000;


const PROACTIVE_FIRST_CHECK_DELAY_MS =
  2 *
  60 *
  1000;


const REMINDER_CHECK_INTERVAL_MS =
  60 *
  1000;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio = null;

let introFadeTimer =
  null;


const INTRO_START =
  4;


const INTRO_START_VOLUME =
  0.26;


const INTRO_VOICE_DELAY_MS =
  900;


const INTRO_BACKGROUND_VOLUME =
  0.018;


const INTRO_DUCK_DURATION_MS =
  650;


const INTRO_FADE_DURATION_MS =
  15000;


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

      introAudio
        .pause();

    } catch {}


    try {

      introAudio
        .currentTime =
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
      "/Intro.mp3?v=94"
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

          if (
            resolved
          ) {
            return;
          }


          resolved =
            true;


          resolve();
        };


      const play =
        async () => {

          try {

            if (
              !introAudio
            ) {

              done();

              return;
            }


            introAudio
              .currentTime =
              INTRO_START;


            await introAudio
              .play();


            done();


          } catch (
            error
          ) {

            console.warn(
              "Intro Fehler:",
              error
            );


            done();
          }
        };


      introAudio
        .addEventListener(
          "loadedmetadata",
          play,
          {
            once:
              true
          }
        );


      introAudio
        .addEventListener(
          "error",
          done,
          {
            once:
              true
          }
        );


      if (
        introAudio
          .readyState >=
        1
      ) {

        play();
      }


      introAudio
        .load();
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

        if (
          !introAudio
        ) {

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

        if (
          !introAudio
        ) {

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

            introAudio
              .pause();

          } catch {}


          introAudio =
            null;
        }

      },
      60
    );
}


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(
  ms
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function safeJsonParse(
  value
) {

  try {

    return JSON.parse(
      value
    );

  } catch {

    return null;
  }
}


/* =========================================================
   UI
   ========================================================= */

function setStatus(
  text
) {

  if (
    !statusEl
  ) {
    return;
  }


  statusEl.textContent =
    text;


  statusEl.classList
    .toggle(

      "online",

      text ===
        "Online"
    );
}


function setLog(
  text
) {

  if (
    !logEl
  ) {
    return;
  }


  logEl.textContent =
    text;
}


function setButtonActive(
  value
) {

  if (
    !button
  ) {
    return;
  }


  button.classList
    .toggle(

      "active",

      Boolean(
        value
      )
    );
}


function setJarvisState(
  state
) {

  document.body
    .dataset
    .jarvisState =
    state;
}


/* =========================================================
   DRAFT PANEL
   ========================================================= */

function showDraft(
  draft
) {

  const panel =
    document
      .getElementById(
        "draftPanel"
      );


  const subjectEl =
    document
      .getElementById(
        "draftSubject"
      );


  const bodyEl =
    document
      .getElementById(
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
    draft?.body ||
    "";


  panel.style.display =
    "flex";
}


const draftCopyBtn =
  document
    .getElementById(
      "draftCopyBtn"
    );


if (
  draftCopyBtn
) {

  draftCopyBtn
    .addEventListener(
      "click",

      async () => {

        const subjectEl =
          document
            .getElementById(
              "draftSubject"
            );


        const bodyEl =
          document
            .getElementById(
              "draftBody"
            );


        const fullText =

          `${subjectEl?.textContent || ""}

${bodyEl?.textContent || ""}`

            .trim();


        try {

          await navigator
            .clipboard
            .writeText(
              fullText
            );


          const original =
            draftCopyBtn
              .textContent;


          draftCopyBtn
            .textContent =
            "Kopiert!";


          setTimeout(
            () => {

              draftCopyBtn
                .textContent =
                original;

            },
            1500
          );


        } catch (
          error
        ) {

          console.warn(
            "Kopieren fehlgeschlagen:",
            error
          );
        }
      }
    );
}


/* =========================================================
   BERLIN TIME
   ========================================================= */

function getBerlinHour() {

  try {

    const formatter =
      new Intl
        .DateTimeFormat(
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
      formatter
        .formatToParts(
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


  } catch (
    error
  ) {

    console.warn(
      "Berlin-Zeit Fehler:",
      error
    );
  }


  return new Date()
    .getHours();
}


/* =========================================================
   GREETING
   ========================================================= */

function pickRandom(
  items
) {

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
    hour < 8
  ) {

    return pickRandom([
      "Morgen, Mattl. Ich bin da. Wir starten ruhig, der Tag wird noch lang genug.",
      "Morgen, Mattl. Ich bin wach. Das sollte für uns beide erstmal reichen.",
      "Guten Morgen, Mattl. Schauen wir mal, was heute auf uns wartet.",
      "Morgen, Mattl. Kaffee wäre vermutlich keine schlechte Idee. Ich bin jedenfalls bereit."
    ]);
  }


  if (
    hour >= 8 &&
    hour < 11
  ) {

    return pickRandom([
      "Morgen, Mattl. Ich bin da. Was steht an?",
      "Morgen, Mattl. Dann schauen wir mal, was heute wieder brennt.",
      "Guten Morgen, Mattl. Was nehmen wir uns zuerst vor?",
      "Mattl, guten Morgen. Ich bin bereit. Der ruhige Teil des Tages dürfte damit vorbei sein."
    ]);
  }


  if (
    hour >= 11 &&
    hour < 14
  ) {

    return pickRandom([
      "Hey Mattl. Da bin ich. Was machen wir?",
      "Mattl, ich bin da. Was steht an?",
      "Hey Mattl. Was gibt's?",
      "Da bist du ja, Mattl. Ich hatte kurz Hoffnung auf einen entspannten Vormittag."
    ]);
  }


  if (
    hour >= 14 &&
    hour < 18
  ) {

    return pickRandom([
      "Hey Mattl. Was steht heute noch an?",
      "Mattl, da bin ich. Dann retten wir mal den Rest des Tages.",
      "Hey Mattl. Was nehmen wir uns als Nächstes vor?",
      "Mattl, ich bin bereit. Langweilig wird's vermutlich wieder nicht."
    ]);
  }


  if (
    hour >= 18 &&
    hour < 21
  ) {

    return pickRandom([
      "Abend, Mattl. Was liegt noch an?",
      "Mattl, ich bin da. Feierabend hat offenbar noch etwas Zeit.",
      "Hey Mattl. Noch eine Runde? Was machen wir?",
      "Abend, Mattl. Schauen wir mal, was wir heute noch erledigt bekommen."
    ]);
  }


  if (
    hour >= 21 &&
    hour < 24
  ) {

    return pickRandom([
      "Abend, Mattl. Feierabend scheint heute wieder eher ein theoretisches Konzept zu sein.",
      "Mattl, ich bin da. Andere nennen das jetzt vermutlich Feierabend.",
      "Hey Mattl. Noch nicht genug für heute? Na gut, was liegt an?",
      "Mattl, da bin ich. Wir ignorieren die Uhr einfach gemeinsam."
    ]);
  }


  return pickRandom([
    "Mattl ... ernsthaft? Na gut. Ich bin da.",
    "Mattl, Schlaf wird offenbar weiterhin überschätzt. Was machen wir?",
    "Na gut, Mattl. Dann tun wir so, als wäre das eine normale Arbeitszeit.",
    "Mattl, es ist spät. Natürlich arbeiten wir noch. Was sonst."
  ]);
}


/* =========================================================
   MICROPHONE
   ========================================================= */

async function createMicrophoneStream() {

  if (
    !navigator
      .mediaDevices ||

    !navigator
      .mediaDevices
      .getUserMedia
  ) {

    throw new Error(
      "Mikrofon wird von diesem Browser nicht unterstützt."
    );
  }


  micStream =

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
   * Beim Start bleibt Mikro aus,
   * bis Begrüßung fertig ist.
   */

  setMicrophoneEnabled(
    false
  );


  return micStream;
}


function setMicrophoneEnabled(
  enabled
) {

  if (
    !micStream
  ) {
    return;
  }


  for (
    const track of
    micStream
      .getAudioTracks()
  ) {

    track.enabled =
      Boolean(
        enabled
      );
  }
}


function stopMicrophone() {

  if (
    !micStream
  ) {
    return;
  }


  try {

    for (
      const track of
      micStream
        .getTracks()
    ) {

      track.stop();
    }

  } catch {}


  micStream =
    null;
}


/* =========================================================
   REALTIME SEND
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


  } catch (
    error
  ) {

    console.error(
      "Realtime Sendefehler:",
      error
    );


    return false;
  }
}


/* =========================================================
   SPEECH HELPERS
   ========================================================= */

function speakExactText(
  text
) {

  const clean =
    String(
      text ||
      ""
    )
      .trim();


  if (
    !clean
  ) {

    return false;
  }


  responseInProgress =
    true;


  return sendRealtimeEvent({

    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ],

      instructions:

        `Sprich ausschließlich diese Begrüßung. ` +

        `Nutze neutrales deutsches Hochdeutsch wie ein deutscher Muttersprachler. ` +

        `Keine englische oder fremdsprachige Satzmelodie. ` +

        `Beginne bereits beim ersten Wort mit normaler voller Sprechlautstärke ` +

        `und halte die Lautstärke bis zum letzten Wort möglichst konstant. ` +

        `Sprich ruhig, tief, natürlich und flüssig. ` +

        `Füge nichts hinzu: ${clean}`
    }
  });
}


function speakProactiveNotice(
  text
) {

  const clean =
    String(
      text ||
      ""
    )
      .trim();


  if (
    !clean
  ) {

    return false;
  }


  /*
   * Nie eine neue Ansage starten,
   * solange JARVIS noch antwortet.
   */

  if (
    responseInProgress ||
    assistantSpeaking
  ) {

    return false;
  }


  responseInProgress =
    true;


  return sendRealtimeEvent({

    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ],

      instructions:

        `Melde dich selbstständig kurz bei Mattl. ` +

        `Sprich neutrales deutsches Hochdeutsch wie ein deutscher Muttersprachler. ` +

        `Keine fremde Satzmelodie. ` +

        `Beginne beim ersten Wort mit normaler voller Lautstärke und halte sie konstant. ` +

        `Sprich tief, ruhig und flüssig. ` +

        `Keine technische Erklärung und keine zusätzliche Frage: ${clean}`
    }
  });
}


/* =========================================================
   TOOL CALL
   ========================================================= */

async function executeRealtimeTool(
  event
) {

  const callId =
    String(
      event.call_id ||
      ""
    );


  const toolName =
    String(
      event.name ||
      ""
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


  /*
   * verhindert Tool-Doppelaufruf
   */

  if (
    runningToolCalls
      .has(
        callId
      )
  ) {

    return;
  }


  runningToolCalls
    .add(
      callId
    );


  setJarvisState(
    "thinking"
  );


  setLog(
    `${toolName} wird ausgeführt …`
  );


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


  console.log(
    "[TOOL]",
    toolName,
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
                toolName,

              arguments:
                args
            })
        }
      );


    const raw =
      await response.text();


    try {

      toolResult =
        JSON.parse(
          raw
        );


    } catch {

      toolResult = {

        ok:
          false,

        error:

          raw ||

          "Ungültige Tool-Antwort."
      };
    }


    if (
      !response.ok
    ) {

      toolResult = {

        ...toolResult,

        ok:
          false
      };
    }


    /*
     * Mail-Entwurf anzeigen
     */

    if (
      toolResult
        ?.draft
    ) {

      showDraft(
        toolResult.draft
      );
    }


  } catch (
    error
  ) {

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


  /*
   * Tool-Ergebnis zurück
   */

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


  /*
   * Genau EINE Antwort
   * auf Tool-Ergebnis erzeugen.
   */

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


  runningToolCalls
    .delete(
      callId
    );
}


/* =========================================================
   REALTIME EVENTS
   ========================================================= */

function handleRealtimeEvent(
  event
) {

  if (
    !event?.type
  ) {
    return;
  }


  console.log(
    "[REALTIME]",
    event.type
  );


  switch (
    event.type
  ) {


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


    /* =====================================================
       USER STARTS SPEAKING
       ===================================================== */

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


    /* =====================================================
       USER STOPS SPEAKING
       ===================================================== */

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


    /* =====================================================
       TOOL CALL
       ===================================================== */

    case "response.function_call_arguments.done":


      executeRealtimeTool(
        event
      );


      break;


    /* =====================================================
       RESPONSE START
       ===================================================== */

    case "response.created":


      responseInProgress =
        true;


      setJarvisState(
        "thinking"
      );


      setLog(
        "JARVIS denkt …"
      );


      break;


    /* =====================================================
       AUDIO START
       ===================================================== */

    case "output_audio_buffer.started":

    case "response.output_audio.delta":


      assistantSpeaking =
        true;


      responseInProgress =
        true;


      setJarvisState(
        "speaking"
      );


      setLog(
        "JARVIS spricht."
      );


      break;


    /* =====================================================
       AUDIO STOP
       ===================================================== */

    case "output_audio_buffer.stopped":

    case "output_audio_buffer.cleared":


      assistantSpeaking =
        false;


      break;


    /* =====================================================
       TRANSCRIPT
       ===================================================== */

    case "response.output_audio_transcript.done":


      if (
        event.transcript
      ) {

        console.log(
          "JARVIS:",
          event.transcript
        );
      }


      break;


    /* =====================================================
       RESPONSE DONE
       ===================================================== */

    case "response.done": {


      assistantSpeaking =
        false;


      responseInProgress =
        false;


      /*
       * War Response ein Tool Call?
       */

      const hasFunctionCall =

        Array.isArray(
          event.response
            ?.output
        ) &&

        event.response
          .output
          .some(

            item =>
              item?.type ===
              "function_call"
          );


      if (
        hasFunctionCall
      ) {

        setJarvisState(
          "thinking"
        );


        setLog(
          "Live-Daten werden geladen …"
        );


        break;
      }


      /*
       * Begrüßung beendet
       */

      if (
        greetingInProgress
      ) {

        greetingInProgress =
          false;


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
          "Begrüßung fertig. Mikrofon aktiv."
        );


        break;
      }


      /*
       * normale Antwort beendet
       */

      if (
        active &&

        runningToolCalls
          .size ===
          0
      ) {

        setJarvisState(
          "listening"
        );


        setLog(
          "JARVIS hört zu."
        );
      }


      break;
    }


    /* =====================================================
       ERROR
       ===================================================== */

    case "error":


      console.error(
        "Realtime Fehler:",
        event
      );


      assistantSpeaking =
        false;


      responseInProgress =
        false;


      setLog(

        event.error
          ?.message ||

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

  if (
    !micStream
  ) {

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


  peerConnection =
    new RTCPeerConnection();


  /* =======================================================
     REMOTE AUDIO
     ======================================================= */

  peerConnection
    .ontrack =
    event => {


      if (
        !remoteAudio
      ) {

        console.error(
          "#remoteAudio fehlt in index.html."
        );


        return;
      }


      const stream =

        event.streams
          ?.[0] ||

        new MediaStream([
          event.track
        ]);


      remoteAudio.srcObject =
        stream;


      remoteAudio.autoplay =
        true;


      remoteAudio.playsInline =
        true;


      connectProcessedPlayback(
        stream
      )

        .then(
          processed => {


            if (
              processed
            ) {

              /*
               * HTML AUDIO AUS.
               * Sonst Stimme doppelt.
               */

              remoteAudio.muted =
                true;


              remoteAudio.volume =
                0;


              console.log(
                "Realtime Audio: Compressor + Limiter aktiv."
              );


              return;
            }


            /*
             * Fallback
             */

            remoteAudio.muted =
              false;


            remoteAudio.volume =
              1;


            remoteAudio
              .play()

              .catch(
                error => {

                  console.warn(
                    "Remote Audio autoplay:",
                    error
                  );
                }
              );
          }
        )

        .catch(
          error => {


            console.warn(
              "Audio-Processing Fehler:",
              error
            );


            remoteAudio.muted =
              false;


            remoteAudio.volume =
              1;


            remoteAudio
              .play()
              .catch(
                () => {}
              );
          }
        );
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
        "[WEBRTC]",
        state
      );


      if (

        (
          state ===
            "failed" ||

          state ===
            "disconnected"
        ) &&

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
    };


  /* =======================================================
     MICROPHONE TRACK
     ======================================================= */

  const audioTracks =
    micStream
      .getAudioTracks();


  if (
    !audioTracks.length
  ) {

    throw new Error(
      "Keine Mikrofon-Audiospur."
    );
  }


  peerConnection
    .addTrack(

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


  dataChannel
    .addEventListener(

      "message",

      event => {

        const data =
          safeJsonParse(
            event.data
          );


        if (
          !data
        ) {

          return;
        }


        handleRealtimeEvent(
          data
        );
      }
    );


  const channelReady =

    new Promise(

      (
        resolve,
        reject
      ) => {


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
                "Realtime DataChannel offen."
              );


              resolve();
            },

            {
              once:
                true
            }
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

            {
              once:
                true
            }
          );
      }
    );


  /* =======================================================
     CREATE SDP OFFER
     ======================================================= */

  const offer =

    await peerConnection
      .createOffer();


  if (
    !offer?.sdp ||

    !offer.sdp
      .startsWith(
        "v=0"
      )
  ) {

    throw new Error(
      "Browser hat kein gültiges SDP erzeugt."
    );
  }


  await peerConnection
    .setLocalDescription(
      offer
    );


  console.log(
    "[WEBRTC] SDP Länge:",
    offer.sdp.length
  );


  /* =======================================================
     SERVER SESSION
     ======================================================= */

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


  if (
    !response.ok
  ) {

    throw new Error(

      answerSdp ||

      `Realtime HTTP ${response.status}`
    );
  }


  if (
    !answerSdp
      .startsWith(
        "v=0"
      )
  ) {

    throw new Error(
      "Ungültiges SDP-Answer."
    );
  }


  await peerConnection
    .setRemoteDescription({

      type:
        "answer",

      sdp:
        answerSdp
    });


  await channelReady;


  console.log(
    "Realtime vollständig verbunden."
  );
}


/* =========================================================
   DISCONNECT
   ========================================================= */

function disconnectRealtime() {

  realtimeConnected =
    false;


  assistantSpeaking =
    false;


  responseInProgress =
    false;


  runningToolCalls
    .clear();


  if (
    dataChannel
  ) {

    try {

      dataChannel
        .close();

    } catch {}


    dataChannel =
      null;
  }


  if (
    peerConnection
  ) {

    try {

      peerConnection
        .close();

    } catch {}


    peerConnection =
      null;
  }


  disconnectProcessedPlayback();


  if (
    remoteAudio
  ) {

    try {

      remoteAudio
        .pause();

    } catch {}


    try {

      remoteAudio
        .srcObject =
        null;

    } catch {}


    remoteAudio.muted =
      false;


    remoteAudio.volume =
      1;
  }
}


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

async function runBackgroundCheck(
  endpointUrl
) {

  /*
   * Niemals proaktiv dazwischenreden.
   */

  if (
    !active ||

    !realtimeConnected ||

    greetingInProgress ||

    assistantSpeaking ||

    responseInProgress ||

    runningToolCalls.size
  ) {

    return;
  }


  try {

    const response =

      await fetch(
        endpointUrl,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({})
        }
      );


    if (
      !response.ok
    ) {

      return;
    }


    const data =
      await response.json();


    if (
      !data?.ok ||

      !data.hasNotice ||

      !data.text
    ) {

      return;
    }


    speakProactiveNotice(
      data.text
    );


  } catch (
    error
  ) {

    console.warn(
      "Background Check:",
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

      checkProactiveNotice,

      PROACTIVE_FIRST_CHECK_DELAY_MS
    );


  proactiveCheckTimer =

    setInterval(

      checkProactiveNotice,

      PROACTIVE_CHECK_INTERVAL_MS
    );


  reminderCheckTimer =

    setInterval(

      checkDueReminders,

      REMINDER_CHECK_INTERVAL_MS
    );
}


function stopProactiveChecks() {

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
   START
   ========================================================= */

async function startJarvis() {

  if (
    active ||
    starting ||
    stopping
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


    /*
     * Browser-AudioContext direkt
     * durch Benutzer-Klick aktivieren.
     */

    await ensurePlaybackAudioContext();


    /*
     * Mikro
     */

    await createMicrophoneStream();


    /*
     * Intro
     */

    await startIntro();


    setLog(
      "Realtime-Verbindung wird aufgebaut …"
    );


    /*
     * Realtime
     */

    await connectRealtime();


    active =
      true;


    setStatus(
      "Online"
    );


    /*
     * Nur kurze Intro-Verzögerung.
     */

    await sleep(
      INTRO_VOICE_DELAY_MS
    );


    if (
      !active
    ) {

      return;
    }


    /*
     * Intro absenken.
     */

    duckIntro();


    /*
     * Begrüßung
     */

    greetingInProgress =
      true;


    setJarvisState(
      "speaking"
    );


    setLog(
      "JARVIS meldet sich."
    );


    const sent =

      speakExactText(
        getGreeting()
      );


    if (
      !sent
    ) {

      throw new Error(
        "Begrüßung konnte nicht gestartet werden."
      );
    }


    /*
     * Hintergrundprüfungen
     */

    startProactiveChecks();


  } catch (
    error
  ) {

    console.error(
      "JARVIS Startfehler:",
      error
    );


    active =
      false;


    greetingInProgress =
      false;


    responseInProgress =
      false;


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
      `Start fehlgeschlagen: ${error.message}`
    );


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
   STOP
   ========================================================= */

async function stopJarvis() {

  if (
    stopping
  ) {

    return;
  }


  stopping =
    true;


  active =
    false;


  starting =
    false;


  assistantSpeaking =
    false;


  responseInProgress =
    false;


  greetingInProgress =
    false;


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


  if (
    button
  ) {

    button.disabled =
      false;
  }


  stopping =
    false;
}


/* =========================================================
   INITIAL
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


if (
  remoteAudio
) {

  remoteAudio.autoplay =
    true;


  remoteAudio.playsInline =
    true;


  /*
   * Normale Ausgabe läuft
   * über Web Audio.
   */

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

  button
    .addEventListener(

      "click",

      async () => {


        if (
          starting ||
          stopping
        ) {

          return;
        }


        if (
          active
        ) {

          await stopJarvis();


        } else {

          await startJarvis();
        }
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

window
  .addEventListener(

    "pagehide",

    () => {

      stopJarvis();
    }
  );
