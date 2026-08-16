/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V9.4 · AUDIO LEVELING + LONG INTRO FADE
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

let realtimeConnected =
  false;

let assistantSpeaking =
  false;

let greetingInProgress =
  false;

const runningToolCalls =
  new Set();


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

let proactiveCheckTimer =
  null;

let proactiveFirstCheckTimer =
  null;

let reminderCheckTimer =
  null;


const PROACTIVE_CHECK_INTERVAL_MS =
  20 * 60 * 1000;


const PROACTIVE_FIRST_CHECK_DELAY_MS =
  2 * 60 * 1000;


const REMINDER_CHECK_INTERVAL_MS =
  60 * 1000;


/* =========================================================
   INTRO SOUND
   ========================================================= */

let introAudio =
  null;

let introFadeTimer =
  null;


/*
 * Musik beginnt bei Sekunde 4.
 */
const INTRO_START =
  4;


/*
 * Anfangslautstärke der Musik.
 */
const INTRO_START_VOLUME =
  0.26;


/*
 * Nur kurze Wartezeit,
 * bevor JARVIS begrüßt.
 */
const INTRO_VOICE_DELAY_MS =
  900;


/*
 * Sobald JARVIS spricht,
 * Musik sehr leise im Hintergrund.
 */
const INTRO_BACKGROUND_VOLUME =
  0.018;


/*
 * Wie schnell die Musik
 * für die Stimme abgesenkt wird.
 */
const INTRO_DUCK_DURATION_MS =
  650;


/*
 * NACH Ende der Begrüßung:
 * Musik blendet über volle
 * 15 Sekunden langsam aus.
 */
const INTRO_POST_GREETING_FADE_MS =
  15000;


/* =========================================================
   REALTIME AUDIO LEVELING
   ========================================================= */

/*
 * Diese Audio-Kette sorgt dafür,
 * dass JARVIS nicht mit einem
 * sehr leisen ersten Wort beginnt
 * und danach plötzlich lauter wird.
 *
 * Signal:
 *
 * Realtime Audio
 *      ↓
 * Vorverstärkung
 *      ↓
 * Kompressor
 *      ↓
 * Limiter
 *      ↓
 * Lautsprecher
 */

let playbackAudioContext =
  null;

let playbackSourceNode =
  null;

let playbackPreGain =
  null;

let playbackCompressor =
  null;

let playbackLimiter =
  null;

let playbackOutputGain =
  null;


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {

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


function setLog(
  text
) {

  if (!logEl) {
    return;
  }


  logEl.textContent =
    text;
}


function setButtonActive(
  value
) {

  if (!button) {
    return;
  }


  button.classList.toggle(
    "active",
    Boolean(value)
  );
}


function setJarvisState(
  state
) {

  document.body.dataset.jarvisState =
    state;
}


/* =========================================================
   DRAFT PANEL
   ========================================================= */

function showDraft(
  draft
) {

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
        `${subjectEl?.textContent || ""}\n\n${bodyEl?.textContent || ""}`.trim();


      try {

        await navigator.clipboard
          .writeText(
            fullText
          );


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


  /*
   * FRÜHER MORGEN
   */

  if (
    hour >= 5 &&
    hour < 8
  ) {

    return pickRandom([

      "Guten Morgen, Mattl. Ich bin da. Schauen wir mal, was heute auf uns wartet.",

      "Morgen, Mattl. Ich bin bereit. Der Tag kann also anfangen.",

      "Guten Morgen, Mattl. Dann schauen wir mal, was heute wieder los ist.",

      "Morgen, Mattl. Ich bin wach. Das sollte fürs Erste reichen."

    ]);
  }


  /*
   * MORGEN
   */

  if (
    hour >= 8 &&
    hour < 11
  ) {

    return pickRandom([

      "Guten Morgen, Mattl. Was steht an?",

      "Morgen, Mattl. Dann schauen wir mal, was heute wieder brennt.",

      "Guten Morgen, Mattl. Was nehmen wir uns zuerst vor?",

      "Morgen, Mattl. Ich bin da. Ruhig wird es vermutlich ohnehin nicht."

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

      "Hey Mattl. Ich bin da. Was machen wir?",

      "Mattl, da bin ich. Was steht an?",

      "Hey Mattl. Was gibt es?",

      "Da bist du ja, Mattl. Ich hatte kurz Hoffnung auf einen ruhigen Vormittag."

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

      "Hey Mattl. Was steht heute noch an?",

      "Mattl, ich bin da. Dann retten wir mal den Rest des Tages.",

      "Hey Mattl. Was nehmen wir uns als Nächstes vor?",

      "Mattl, da bin ich. Langweilig wird es vermutlich wieder nicht."

    ]);
  }


  /*
   * ABEND
   */

  if (
    hour >= 18 &&
    hour < 21
  ) {

    return pickRandom([

      "Guten Abend, Mattl. Was liegt noch an?",

      "Mattl, ich bin da. Feierabend hat offenbar noch etwas Zeit.",

      "Abend, Mattl. Was machen wir noch?",

      "Guten Abend, Mattl. Schauen wir mal, was wir heute noch erledigt bekommen."

    ]);
  }


  /*
   * SPÄTER ABEND
   */

  if (
    hour >= 21 &&
    hour < 24
  ) {

    return pickRandom([

      "Abend, Mattl. Feierabend scheint heute wieder eher ein theoretisches Konzept zu sein.",

      "Mattl, ich bin da. Andere Menschen nennen das vermutlich Feierabend.",

      "Hey Mattl. Noch nicht genug für heute? Na gut, was liegt an?",

      "Mattl, da bin ich. Wir ignorieren die Uhr einfach gemeinsam."

    ]);
  }


  /*
   * NACHT
   */

  return pickRandom([

    "Mattl ... ernsthaft? Na gut. Ich bin da.",

    "Mattl, Schlaf wird offenbar weiterhin überschätzt. Was machen wir?",

    "Na gut, Mattl. Dann tun wir so, als wäre das eine normale Arbeitszeit.",

    "Mattl, es ist spät. Natürlich arbeiten wir noch. Was sonst."

  ]);
}


/* =========================================================
   AUDIO CONTEXT
   ========================================================= */

async function ensurePlaybackAudioContext() {

  if (
    !playbackAudioContext
  ) {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;


    if (
      !AudioContextClass
    ) {

      console.warn(
        "Web Audio API nicht verfügbar."
      );


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
        "AudioContext konnte nicht fortgesetzt werden:",
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
    playbackOutputGain
      ?.disconnect();
  } catch {}


  playbackSourceNode =
    null;

  playbackPreGain =
    null;

  playbackCompressor =
    null;

  playbackLimiter =
    null;

  playbackOutputGain =
    null;
}


/* =========================================================
   AUDIO LEVELING
   ========================================================= */

async function connectProcessedPlayback(
  stream
) {

  const context =
    await ensurePlaybackAudioContext();


  if (!context) {
    return false;
  }


  disconnectProcessedPlayback();


  playbackSourceNode =
    context.createMediaStreamSource(
      stream
    );


  /*
   * Vorverstärkung:
   * hebt auch das erste,
   * leisere Wort an.
   */

  playbackPreGain =
    context.createGain();


  playbackPreGain.gain.value =
    1.5;


  /*
   * Hauptkompressor:
   * fängt lautere Bereiche ab.
   */

  playbackCompressor =
    context.createDynamicsCompressor();


  playbackCompressor.threshold.value =
    -34;


  playbackCompressor.knee.value =
    12;


  playbackCompressor.ratio.value =
    8;


  playbackCompressor.attack.value =
    0.002;


  playbackCompressor.release.value =
    0.20;


  /*
   * Zweiter Kompressor
   * als weicher Limiter.
   */

  playbackLimiter =
    context.createDynamicsCompressor();


  playbackLimiter.threshold.value =
    -10;


  playbackLimiter.knee.value =
    3;


  playbackLimiter.ratio.value =
    18;


  playbackLimiter.attack.value =
    0.001;


  playbackLimiter.release.value =
    0.10;


  /*
   * Finale Lautstärke.
   */

  playbackOutputGain =
    context.createGain();


  playbackOutputGain.gain.value =
    1.08;


  /*
   * Audio-Kette verbinden.
   */

  playbackSourceNode
    .connect(
      playbackPreGain
    );


  playbackPreGain
    .connect(
      playbackCompressor
    );


  playbackCompressor
    .connect(
      playbackLimiter
    );


  playbackLimiter
    .connect(
      playbackOutputGain
    );


  playbackOutputGain
    .connect(
      context.destination
    );


  console.log(
    "JARVIS Audio-Leveling aktiv."
  );


  return true;
}


/* =========================================================
   INTRO CONTROL
   ========================================================= */

function clearIntroFadeTimer() {

  if (
    introFadeTimer
  ) {

    clearInterval(
      introFadeTimer
    );


    introFadeTimer =
      null;
  }
}


function stopIntro() {

  clearIntroFadeTimer();


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

            if (
              !introAudio
            ) {

              done();

              return;
            }


            introAudio.currentTime =
              INTRO_START;


            await introAudio
              .play();


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
   DUCK INTRO WHILE JARVIS SPEAKS
   ========================================================= */

function duckIntro() {

  if (
    !introAudio ||
    introAudio.paused
  ) {

    return;
  }


  clearIntroFadeTimer();


  const originalVolume =
    introAudio.volume;


  const startTime =
    performance.now();


  introFadeTimer =
    setInterval(
      () => {

        if (
          !introAudio
        ) {

          clearIntroFadeTimer();

          return;
        }


        const progress =
          Math.min(

            (
              performance.now() -
              startTime
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
          originalVolume -
          (
            originalVolume -
            INTRO_BACKGROUND_VOLUME
          ) *
          smooth;


        if (
          progress >= 1
        ) {

          clearIntroFadeTimer();


          /*
           * Wichtig:
           *
           * Musik bleibt jetzt
           * auf dieser sehr leisen
           * Lautstärke stehen.
           *
           * Sie wird NICHT sofort
           * ausgeblendet.
           */
        }

      },
      40
    );
}


/* =========================================================
   FADE INTRO AFTER GREETING
   ========================================================= */

function fadeIntroAfterGreeting() {

  if (
    !introAudio ||
    introAudio.paused
  ) {

    return;
  }


  clearIntroFadeTimer();


  const startVolume =
    Math.max(
      introAudio.volume,
      INTRO_BACKGROUND_VOLUME
    );


  const startTime =
    performance.now();


  introFadeTimer =
    setInterval(
      () => {

        if (
          !introAudio
        ) {

          clearIntroFadeTimer();

          return;
        }


        const elapsed =
          performance.now() -
          startTime;


        const progress =
          Math.min(

            elapsed /
            INTRO_POST_GREETING_FADE_MS,

            1
          );


        /*
         * Sehr weicher Fade.
         *
         * Anfang bleibt noch hörbar,
         * danach immer langsamer weg.
         */

        const curve =
          Math.pow(
            1 -
            progress,
            1.55
          );


        introAudio.volume =
          Math.max(
            0,
            startVolume *
            curve
          );


        if (
          progress >= 1
        ) {

          clearIntroFadeTimer();


          try {

            introAudio.pause();

          } catch {}


          introAudio =
            null;


          console.log(
            "Intro nach Begrüßung vollständig ausgeblendet."
          );
        }

      },
      50
    );
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

  if (
    !micStream
  ) {

    return;
  }


  for (
    const track of
    micStream.getAudioTracks()
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
      micStream.getTracks()
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


  } catch (error) {

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
      text || ""
    ).trim();


  if (!clean) {
    return false;
  }


  return sendRealtimeEvent({

    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ],

      instructions:
        `Sprich jetzt genau diese kurze Begrüßung aus. ` +
        `Sprich vom ersten Wort an mit stabiler Lautstärke. ` +
        `Sprich ruhig, natürlich und flüssig auf Deutsch. ` +
        `Füge nichts hinzu: ${clean}`
    }
  });
}


function speakProactiveNotice(
  text
) {

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
    return false;
  }


  return sendRealtimeEvent({

    type:
      "response.create",

    response: {

      output_modalities: [
        "audio"
      ],

      instructions:
        `Melde dich selbstständig kurz. ` +
        `Sprich vom ersten Wort an mit stabiler Lautstärke. ` +
        `Sprich folgenden Hinweis natürlich aus. ` +
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


    if (
      toolResult?.draft
    ) {

      showDraft(
        toolResult.draft
      );
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


    case "response.function_call_arguments.done":

      executeRealtimeTool(
        event
      );


      break;


    case "response.created":

      assistantSpeaking =
        true;


      setJarvisState(
        "thinking"
      );


      setLog(
        "JARVIS denkt …"
      );


      break;


    case "response.output_audio.delta":

      assistantSpeaking =
        true;


      setJarvisState(
        "speaking"
      );


      setLog(
        "JARVIS spricht."
      );


      break;


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


    case "response.done": {

      assistantSpeaking =
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
       * Begrüßung gerade beendet.
       */

      if (
        greetingInProgress
      ) {

        greetingInProgress =
          false;


        /*
         * Mikrofon sofort aktivieren.
         */

        setMicrophoneEnabled(
          true
        );


        /*
         * Musik beginnt JETZT
         * ihren 15-Sekunden-Fade.
         */

        fadeIntroAfterGreeting();


        setJarvisState(
          "listening"
        );


        setLog(
          "JARVIS hört zu."
        );


        console.log(
          "Begrüßung fertig. Mikrofon aktiv. Intro blendet 15 Sekunden aus."
        );


        break;
      }


      if (
        active &&
        runningToolCalls.size ===
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

  peerConnection.ontrack =
    async event => {

      if (
        !remoteAudio
      ) {

        throw new Error(
          "#remoteAudio fehlt in index.html."
        );
      }


      const stream =
        event.streams?.[0] ||
        new MediaStream([
          event.track
        ]);


      /*
       * Stream weiterhin am Element hinterlegen.
       */

      remoteAudio.srcObject =
        stream;


      remoteAudio.autoplay =
        true;


      remoteAudio.playsInline =
        true;


      /*
       * Erst versuchen wir
       * unsere eigene Audio-Kette.
       */

      const processed =
        await connectProcessedPlayback(
          stream
        );


      if (
        processed
      ) {

        /*
         * Wichtig:
         * HTML-Audio stumm,
         * sonst hören wir alles doppelt.
         */

        remoteAudio.muted =
          true;


        remoteAudio.volume =
          0;


        console.log(
          "Remote Audio läuft über JARVIS Audio-Leveling."
        );


      } else {

        /*
         * Fallback.
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
     MICROPHONE
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


        dataChannel.addEventListener(
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
            once: true
          }
        );


        dataChannel.addEventListener(
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
            once: true
          }
        );
      }
    );


  /* =======================================================
     SDP
     ======================================================= */

  const offer =
    await peerConnection
      .createOffer();


  if (
    !offer?.sdp ||
    !offer.sdp.startsWith(
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
    !answerSdp.startsWith(
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


  runningToolCalls.clear();


  if (
    dataChannel
  ) {

    try {

      dataChannel.close();

    } catch {}


    dataChannel =
      null;
  }


  if (
    peerConnection
  ) {

    try {

      peerConnection.close();

    } catch {}


    peerConnection =
      null;
  }


  disconnectProcessedPlayback();


  if (
    remoteAudio
  ) {

    try {

      remoteAudio.pause();

    } catch {}


    try {

      remoteAudio.srcObject =
        null;

    } catch {}


    remoteAudio.muted =
      true;


    remoteAudio.volume =
      0;
  }
}


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

async function runBackgroundCheck(
  endpointUrl
) {

  if (
    !active ||
    !realtimeConnected ||
    greetingInProgress ||
    assistantSpeaking ||
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


  } catch (error) {

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
     * AudioContext direkt beim
     * Benutzer-Klick aktivieren.
     */

    await ensurePlaybackAudioContext();


    await createMicrophoneStream();


    await startIntro();


    setLog(
      "Realtime-Verbindung wird aufgebaut …"
    );


    await connectRealtime();


    active =
      true;


    setStatus(
      "Online"
    );


    /*
     * Kürzer als vorher:
     * JARVIS soll schneller sprechen.
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
     * Musik leise hinter Stimme.
     */

    duckIntro();


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


    startProactiveChecks();


  } catch (error) {

    console.error(
      "JARVIS Startfehler:",
      error
    );


    active =
      false;


    greetingInProgress =
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
   * Standardmäßig stumm,
   * weil die Wiedergabe über
   * Web Audio läuft.
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

  button.addEventListener(
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
