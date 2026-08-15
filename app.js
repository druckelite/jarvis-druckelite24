/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V6.1 · TRANSCRIPTION FALLBACK

   ---------------------------------------------------------
   ARCHITEKTUR
   ---------------------------------------------------------
   1. OpenAI Realtime hört NUR zu
   2. OpenAI Realtime transkribiert
   3. KEIN response.create
   4. /api/jarvis-chat erzeugt Textantwort
   5. ElevenLabs ist die EINZIGE Stimme
   6. Kein cedar
   7. Transcription-Deltas werden gesammelt
   8. Fallback, falls completed-Event zu spät kommt
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
   REALTIME CONNECTION
   ========================================================= */

let pc = null;

let dc = null;

let localStream = null;

let active = false;

let connecting = false;


/* =========================================================
   JARVIS STATE
   ========================================================= */

let assistantSpeaking = false;

let waitingForAssistant = false;

let chatInProgress = false;


/* =========================================================
   CONVERSATION
   ========================================================= */

let previousResponseId = null;


/* =========================================================
   TRANSCRIPTION
   ========================================================= */

/*
 * Bereits vollständig verarbeitete
 * Realtime-Items.
 */
const processedItemIds =
  new Set();


const MAX_PROCESSED_ITEMS =
  100;


/*
 * Partielle Transkripte.
 *
 * Key:
 * OpenAI item_id
 *
 * Value:
 * bisher empfangener Text
 */
const transcriptBuffers =
  new Map();


/*
 * Letztes Item, das Sprache
 * geliefert hat.
 */
let latestTranscriptItemId =
  null;


/*
 * Fallback-Timer.
 *
 * Falls completed nicht kommt,
 * verwenden wir nach einigen
 * Sekunden die bereits empfangenen
 * Delta-Texte.
 */
let transcriptFallbackTimer =
  null;


let transcriptRecoveryTimer =
  null;


/*
 * Dedupe ohne item_id.
 */
let lastTranscriptText =
  "";

let lastTranscriptTime =
  0;


/* =========================================================
   ELEVENLABS
   ========================================================= */

let elevenAudio = null;

let elevenObjectUrl = null;

let elevenPlaybackSettled = false;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio = null;

let introFadeTimer = null;


/* =========================================================
   NETWORK
   ========================================================= */

let chatController = null;

let ttsController = null;


/* =========================================================
   SETTINGS
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
  1800;


const INTRO_FADE_DURATION_MS =
  15000;


/*
 * Nach Ende der Jarvis-Stimme
 * kurze Echo-Sicherheitszeit.
 */
const LISTENING_RESUME_DELAY_MS =
  700;


/*
 * Nach speech_stopped warten wir
 * maximal so lange auf completed.
 *
 * Wenn schon Delta-Text vorhanden
 * ist, verwenden wir diesen.
 */
const TRANSCRIPT_FALLBACK_MS =
  3500;


/*
 * Absolute Obergrenze.
 *
 * JARVIS darf niemals dauerhaft
 * auf "Verarbeite Sprache …"
 * stehen bleiben.
 */
const TRANSCRIPT_RECOVERY_MS =
  8000;


/*
 * Netzwerk.
 */
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


function addProcessedItemId(
  itemId
) {

  if (!itemId) {
    return;
  }


  processedItemIds.add(
    itemId
  );


  if (
    processedItemIds.size >
    MAX_PROCESSED_ITEMS
  ) {

    const oldest =
      processedItemIds
        .values()
        .next()
        .value;


    processedItemIds.delete(
      oldest
    );
  }
}


/* =========================================================
   TRANSCRIPTION TIMERS
   ========================================================= */

function clearTranscriptTimers() {

  if (
    transcriptFallbackTimer
  ) {

    clearTimeout(
      transcriptFallbackTimer
    );


    transcriptFallbackTimer =
      null;
  }


  if (
    transcriptRecoveryTimer
  ) {

    clearTimeout(
      transcriptRecoveryTimer
    );


    transcriptRecoveryTimer =
      null;
  }
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


function muteMicrophone() {

  setMicrophoneEnabled(
    false
  );
}


function resumeListening() {

  if (!active) {
    return;
  }


  if (
    assistantSpeaking ||
    chatInProgress
  ) {

    return;
  }


  clearTranscriptTimers();


  waitingForAssistant =
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
      "Berlin-Zeit Fehler:",
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

  const audio =
    elevenAudio;


  elevenAudio =
    null;


  if (audio) {

    audio.onended =
      null;


    audio.onerror =
      null;


    try {

      audio.pause();

    } catch {}


    try {

      audio.removeAttribute(
        "src"
      );

    } catch {}
  }


  if (
    elevenObjectUrl
  ) {

    const oldUrl =
      elevenObjectUrl;


    elevenObjectUrl =
      null;


    try {

      URL.revokeObjectURL(
        oldUrl
      );

    } catch {}
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

    assistantSpeaking =
      false;


    chatInProgress =
      false;


    resumeListening();


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


  elevenPlaybackSettled =
    false;


  assistantSpeaking =
    false;


  waitingForAssistant =
    true;


  muteMicrophone();


  setJarvisState(
    "thinking"
  );


  setLog(
    "JARVIS bereitet die Stimme vor …"
  );


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


    if (!active) {

      return;
    }


    elevenObjectUrl =
      URL.createObjectURL(
        blob
      );


    const audio =
      new Audio(
        elevenObjectUrl
      );


    elevenAudio =
      audio;


    audio.preload =
      "auto";


    audio.volume =
      1;


    assistantSpeaking =
      true;


    setJarvisState(
      "speaking"
    );


    setLog(
      "JARVIS spricht."
    );


    audio.onended =
      () => {

        if (
          elevenPlaybackSettled
        ) {

          return;
        }


        elevenPlaybackSettled =
          true;


        assistantSpeaking =
          false;


        chatInProgress =
          false;


        stopElevenAudio();


        setTimeout(
          () => {

            if (active) {

              resumeListening();
            }

          },
          LISTENING_RESUME_DELAY_MS
        );
      };


    audio.onerror =
      event => {

        if (
          elevenPlaybackSettled
        ) {

          return;
        }


        elevenPlaybackSettled =
          true;


        console.error(
          "ElevenLabs Playback error:",
          event
        );


        assistantSpeaking =
          false;


        chatInProgress =
          false;


        stopElevenAudio();


        setLog(
          "Sprachausgabe fehlgeschlagen."
        );


        setTimeout(
          () => {

            if (active) {

              resumeListening();
            }

          },
          500
        );
      };


    await audio.play();


  } catch (error) {

    clearTimeout(
      timeout
    );


    if (
      elevenPlaybackSettled
    ) {

      return;
    }


    elevenPlaybackSettled =
      true;


    console.error(
      "ElevenLabs error:",
      error
    );


    assistantSpeaking =
      false;


    chatInProgress =
      false;


    stopElevenAudio();


    if (
      error.name ===
      "AbortError"
    ) {

      setLog(
        "Sprachausgabe abgebrochen."
      );

    } else {

      setLog(
        "ElevenLabs konnte nicht sprechen."
      );
    }


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


/* =========================================================
   START GREETING
   ========================================================= */

async function requestStartupGreeting() {

  const greeting =
    getGreeting();


  chatInProgress =
    true;


  await speakWithElevenLabs(
    greeting
  );
}


/* =========================================================
   CHAT REQUEST
   ========================================================= */

async function sendTranscriptToJarvis(
  transcript
) {

  const cleanTranscript =
    String(
      transcript ||
      ""
    ).trim();


  if (
    !cleanTranscript ||
    !active
  ) {

    chatInProgress =
      false;


    resumeListening();


    return;
  }


  if (
    chatInProgress
  ) {

    console.warn(
      "Chat ignoriert: JARVIS verarbeitet bereits einen Turn."
    );


    return;
  }


  clearTranscriptTimers();


  chatInProgress =
    true;


  waitingForAssistant =
    true;


  assistantSpeaking =
    false;


  muteMicrophone();


  setJarvisState(
    "thinking"
  );


  setLog(
    "Denke nach …"
  );


  console.log(
    "Mattl:",
    cleanTranscript
  );


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
                cleanTranscript,

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
        "Ungültige Serverantwort."
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


    console.log(
      "JARVIS:",
      answer
    );


    await speakWithElevenLabs(
      answer
    );


  } catch (error) {

    clearTimeout(
      timeout
    );


    console.error(
      "JARVIS Chat error:",
      error
    );


    chatInProgress =
      false;


    waitingForAssistant =
      false;


    assistantSpeaking =
      false;


    if (
      error.name ===
      "AbortError"
    ) {

      setLog(
        "Antwort hat zu lange gedauert."
      );

    } else {

      setLog(
        `JARVIS Fehler: ${error.message}`
      );
    }


    setTimeout(
      () => {

        if (active) {

          resumeListening();
        }

      },
      700
    );
  }
}


/* =========================================================
   TRANSCRIPT PROCESSOR
   ========================================================= */

async function processTranscript(
  transcript,
  itemId = ""
) {

  const cleanTranscript =
    String(
      transcript ||
      ""
    ).trim();


  if (
    !cleanTranscript
  ) {

    return false;
  }


  clearTranscriptTimers();


  /*
   * Item bereits beantwortet?
   */
  if (
    itemId &&
    processedItemIds.has(
      itemId
    )
  ) {

    return false;
  }


  if (
    itemId
  ) {

    addProcessedItemId(
      itemId
    );


    transcriptBuffers.delete(
      itemId
    );
  }


  /*
   * Fallback-Dedupe.
   */
  const now =
    Date.now();


  if (
    !itemId &&
    cleanTranscript ===
      lastTranscriptText &&
    now -
      lastTranscriptTime <
      3000
  ) {

    return false;
  }


  lastTranscriptText =
    cleanTranscript;


  lastTranscriptTime =
    now;


  setLog(
    `Verstanden: ${cleanTranscript}`
  );


  /*
   * Wichtig:
   *
   * Erst jetzt wird chatInProgress
   * freigegeben und anschließend
   * der Chat gestartet.
   */
  chatInProgress =
    false;


  waitingForAssistant =
    true;


  await sendTranscriptToJarvis(
    cleanTranscript
  );


  return true;
}


/* =========================================================
   COMPLETED TRANSCRIPT
   ========================================================= */

async function handleCompletedTranscript(
  event
) {

  const transcript =
    String(
      event.transcript ||
      ""
    ).trim();


  const itemId =
    String(
      event.item_id ||
      ""
    ).trim();


  /*
   * completed gewinnt immer
   * gegenüber dem Delta-Fallback.
   */
  if (
    itemId &&
    processedItemIds.has(
      itemId
    )
  ) {

    return;
  }


  if (
    transcript
  ) {

    await processTranscript(
      transcript,
      itemId
    );


    return;
  }


  /*
   * Falls completed leer sein sollte,
   * versuchen wir den Delta-Buffer.
   */
  if (
    itemId &&
    transcriptBuffers.has(
      itemId
    )
  ) {

    const buffered =
      transcriptBuffers.get(
        itemId
      );


    await processTranscript(
      buffered,
      itemId
    );
  }
}


/* =========================================================
   TRANSCRIPTION DELTA
   ========================================================= */

function handleTranscriptDelta(
  event
) {

  const itemId =
    String(
      event.item_id ||
      ""
    ).trim();


  const delta =
    String(
      event.delta ||
      ""
    );


  if (
    !delta
  ) {

    return;
  }


  if (
    itemId &&
    processedItemIds.has(
      itemId
    )
  ) {

    return;
  }


  if (
    itemId
  ) {

    latestTranscriptItemId =
      itemId;


    const current =
      transcriptBuffers.get(
        itemId
      ) ||
      "";


    transcriptBuffers.set(
      itemId,
      current +
      delta
    );


    return;
  }


  /*
   * Seltenes Fallback ohne item_id.
   */
  const fallbackId =
    "__latest__";


  const current =
    transcriptBuffers.get(
      fallbackId
    ) ||
    "";


  transcriptBuffers.set(
    fallbackId,
    current +
    delta
  );
}


/* =========================================================
   TRANSCRIPT FALLBACK
   ========================================================= */

async function useBufferedTranscriptFallback() {

  if (
    !active ||
    chatInProgress ||
    assistantSpeaking
  ) {

    return;
  }


  let itemId =
    latestTranscriptItemId;


  let text =
    "";


  /*
   * Erst das letzte bekannte
   * echte Item versuchen.
   */
  if (
    itemId
  ) {

    text =
      String(
        transcriptBuffers.get(
          itemId
        ) ||
        ""
      ).trim();
  }


  /*
   * Falls dieses leer ist,
   * neuesten nicht verarbeiteten
   * Buffer suchen.
   */
  if (!text) {

    const entries =
      Array.from(
        transcriptBuffers.entries()
      )
        .reverse();


    for (
      const [
        candidateId,
        candidateText
      ] of
      entries
    ) {

      if (
        candidateId !==
          "__latest__" &&
        processedItemIds.has(
          candidateId
        )
      ) {

        continue;
      }


      const clean =
        String(
          candidateText ||
          ""
        ).trim();


      if (
        clean
      ) {

        itemId =
          candidateId ===
            "__latest__"
            ? ""
            : candidateId;


        text =
          clean;


        break;
      }
    }
  }


  if (
    !text
  ) {

    console.warn(
      "Noch kein Transkript für Fallback vorhanden."
    );


    return;
  }


  console.warn(
    "Completed-Event verspätet – Delta-Transkript wird verwendet:",
    text
  );


  await processTranscript(
    text,
    itemId
  );
}


/* =========================================================
   SPEECH STOPPED
   ========================================================= */

function startTranscriptWaiting() {

  clearTranscriptTimers();


  waitingForAssistant =
    true;


  muteMicrophone();


  setJarvisState(
    "thinking"
  );


  setLog(
    "Verarbeite Sprache …"
  );


  /*
   * Nach 3,5 Sekunden:
   *
   * Wenn completed fehlt,
   * verwenden wir die bisher
   * empfangenen Transkript-Deltas.
   */
  transcriptFallbackTimer =
    setTimeout(
      async () => {

        transcriptFallbackTimer =
          null;


        await useBufferedTranscriptFallback();

      },
      TRANSCRIPT_FALLBACK_MS
    );


  /*
   * Nach 8 Sekunden darf JARVIS
   * definitiv nicht hängen bleiben.
   */
  transcriptRecoveryTimer =
    setTimeout(
      async () => {

        transcriptRecoveryTimer =
          null;


        if (
          chatInProgress ||
          assistantSpeaking
        ) {

          return;
        }


        /*
         * Noch ein letzter Versuch.
         */
        await useBufferedTranscriptFallback();


        /*
         * Falls auch kein Delta vorhanden:
         * sauber zurück zum Zuhören.
         */
        if (
          !chatInProgress &&
          !assistantSpeaking
        ) {

          console.warn(
            "Kein verwertbares Transkript erhalten."
          );


          waitingForAssistant =
            false;


          setLog(
            "Ich habe dich nicht verstanden. Versuch es nochmal."
          );


          setTimeout(
            () => {

              if (
                active &&
                !chatInProgress &&
                !assistantSpeaking
              ) {

                resumeListening();
              }

            },
            900
          );
        }

      },
      TRANSCRIPT_RECOVERY_MS
    );
}


/* =========================================================
   START JARVIS
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


  previousResponseId =
    null;


  processedItemIds.clear();


  transcriptBuffers.clear();


  latestTranscriptItemId =
    null;


  clearTranscriptTimers();


  lastTranscriptText =
    "";


  lastTranscriptTime =
    0;


  chatInProgress =
    false;


  assistantSpeaking =
    false;


  waitingForAssistant =
    false;


  if (
    button
  ) {

    button.disabled =
      true;
  }


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
     * =====================================================
     * INTRO
     * =====================================================
     */

    await startIntro();


    /*
     * =====================================================
     * WEBRTC
     * =====================================================
     */

    pc =
      new RTCPeerConnection();


    /*
     * OpenAI Audio wird niemals
     * abgespielt.
     */
    pc.ontrack =
      event => {

        console.warn(
          "OpenAI Remote-Audiotrack ignoriert."
        );


        try {

          event.track.enabled =
            false;

        } catch {}


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
      };


    if (
      remoteAudio
    ) {

      remoteAudio.muted =
        true;


      remoteAudio.volume =
        0;
    }


    pc.onconnectionstatechange =
      () => {

        const state =
          pc?.connectionState;


        console.log(
          "Peer:",
          state
        );


        if (
          state ===
          "failed"
        ) {

          setLog(
            "Voice-Verbindung fehlgeschlagen."
          );
        }
      };


    /*
     * =====================================================
     * DATA CHANNEL
     * =====================================================
     */

    dc =
      pc.createDataChannel(
        "oai-events"
      );


    dc.onopen =
      async () => {

        console.log(
          "Realtime Transkription verbunden."
        );


        active =
          true;


        connecting =
          false;


        if (
          button
        ) {

          button.disabled =
            false;
        }


        setStatus(
          "Online"
        );


        muteMicrophone();


        setLog(
          "JARVIS startet …"
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


        await requestStartupGreeting();
      };


    dc.onerror =
      error => {

        console.error(
          "DataChannel error:",
          error
        );


        setLog(
          "Transkriptionsverbindung gestört."
        );
      };


    dc.onclose =
      () => {

        console.log(
          "Realtime DataChannel geschlossen."
        );


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
           USER SPRICHT
           ================================================= */

        if (
          event.type ===
          "input_audio_buffer.speech_started"
        ) {

          if (
            assistantSpeaking ||
            chatInProgress ||
            waitingForAssistant
          ) {

            return;
          }


          /*
           * Neuer Turn:
           * alten Delta-Buffer nicht
           * versehentlich übernehmen.
           */
          latestTranscriptItemId =
            null;


          setJarvisState(
            "hearing"
          );


          setLog(
            "Ich höre zu …"
          );
        }


        /* =================================================
           USER IST FERTIG
           ================================================= */

        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {

          /*
           * Falls speech_stopped eine
           * item_id enthält, merken.
           */
          if (
            event.item_id
          ) {

            latestTranscriptItemId =
              String(
                event.item_id
              );
          }


          /*
           * KEINE KI-Antwort starten.
           *
           * Nur auf Transkription warten.
           */
          startTranscriptWaiting();
        }


        /* =================================================
           TRANSCRIPTION DELTA
           ================================================= */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.delta"
        ) {

          handleTranscriptDelta(
            event
          );
        }


        /* =================================================
           TRANSCRIPTION COMPLETED
           ================================================= */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.completed"
        ) {

          await handleCompletedTranscript(
            event
          );
        }


        /* =================================================
           TRANSCRIPTION FAILED
           ================================================= */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.failed"
        ) {

          console.error(
            "Transcription failed:",
            event
          );


          /*
           * Vielleicht haben wir trotz
           * failed bereits Deltas.
           */
          await useBufferedTranscriptFallback();


          if (
            !chatInProgress &&
            !assistantSpeaking
          ) {

            clearTranscriptTimers();


            waitingForAssistant =
              false;


            setLog(
              "Ich habe dich nicht verstanden."
            );


            setTimeout(
              () => {

                if (
                  active
                ) {

                  resumeListening();
                }

              },
              700
            );
          }
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


          /*
           * Nicht sofort abbrechen.
           *
           * Falls schon Delta-Text da ist,
           * versuchen wir diesen.
           */
          await useBufferedTranscriptFallback();


          if (
            !assistantSpeaking &&
            !chatInProgress
          ) {

            setLog(
              event.error?.message ||
              "Transkriptionsfehler."
            );


            setTimeout(
              () => {

                if (
                  active &&
                  !chatInProgress &&
                  !assistantSpeaking
                ) {

                  resumeListening();
                }

              },
              700
            );
          }
        }
      };


    /*
     * =====================================================
     * MICROPHONE
     * =====================================================
     */

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
              false,

            channelCount:
              1
          }
        });


    muteMicrophone();


    for (
      const track of
      localStream.getAudioTracks()
    ) {

      pc.addTrack(
        track,
        localStream
      );
    }


    /*
     * =====================================================
     * WEBRTC OFFER
     * =====================================================
     */

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


    if (
      !response.ok
    ) {

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
      "JARVIS Start error:",
      error
    );


    await stopJarvis();


    setLog(
      `Start fehlgeschlagen: ${error.message}`
    );


  } finally {

    connecting =
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


  connecting =
    false;


  assistantSpeaking =
    false;


  waitingForAssistant =
    false;


  chatInProgress =
    false;


  previousResponseId =
    null;


  processedItemIds.clear();


  transcriptBuffers.clear();


  latestTranscriptItemId =
    null;


  clearTranscriptTimers();


  lastTranscriptText =
    "";


  lastTranscriptTime =
    0;


  /*
   * Chat abbrechen.
   */
  if (
    chatController
  ) {

    try {

      chatController.abort();

    } catch {}


    chatController =
      null;
  }


  /*
   * ElevenLabs Request abbrechen.
   */
  if (
    ttsController
  ) {

    try {

      ttsController.abort();

    } catch {}


    ttsController =
      null;
  }


  elevenPlaybackSettled =
    true;


  stopElevenAudio();


  stopIntro();


  muteMicrophone();


  /*
   * DataChannel.
   */
  try {

    if (
      dc &&
      dc.readyState !==
        "closed"
    ) {

      dc.close();
    }

  } catch {}


  /*
   * Peer.
   */
  try {

    if (
      pc
    ) {

      pc.close();
    }

  } catch {}


  /*
   * Mikrofon.
   */
  try {

    if (
      localStream
    ) {

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


  dc =
    null;


  pc =
    null;


  /*
   * Remote Audio definitiv aus.
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
   BUTTON
   ========================================================= */

setJarvisState(
  "offline"
);


if (
  button
) {

  button.addEventListener(
    "click",

    async () => {

      if (
        connecting
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
   CLEANUP
   ========================================================= */

window.addEventListener(
  "pagehide",

  () => {

    stopJarvis();
  }
);
