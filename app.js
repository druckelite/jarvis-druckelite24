/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V6.0 · CLEAN VOICE PIPELINE

   ARCHITEKTUR
   ---------------------------------------------------------
   1. OpenAI Realtime hört NUR zu
   2. OpenAI Realtime transkribiert NUR
   3. KEIN response.create im Browser
   4. /api/jarvis-chat erzeugt die Textantwort
   5. ElevenLabs ist die EINZIGE Stimme
   6. Kein cedar
   7. Keine parallelen OpenAI-Responses
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

/*
 * Responses API Gesprächskontext.
 *
 * Der Server liefert nach jeder
 * Antwort eine response_id.
 */
let previousResponseId = null;


/* =========================================================
   TRANSCRIPTION CONTROL
   ========================================================= */

/*
 * Verhindert, dass dasselbe
 * Realtime-Transkript zweimal
 * verarbeitet wird.
 */
const processedItemIds =
  new Set();

const MAX_PROCESSED_ITEMS =
  100;


/*
 * Falls aus irgendeinem Grund
 * keine item_id kommt.
 */
let lastTranscriptText = "";

let lastTranscriptTime = 0;


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
   NETWORK CONTROLLERS
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
 * Netzwerk-Timeouts.
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


  /*
   * Niemals wieder zuhören,
   * solange noch etwas läuft.
   */
  if (
    assistantSpeaking ||
    chatInProgress
  ) {

    return;
  }


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
   INTRO DUCK
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
   ELEVENLABS CLEANUP
   ========================================================= */

function stopElevenAudio() {

  const audio =
    elevenAudio;


  elevenAudio =
    null;


  if (audio) {

    /*
     * Erst Handler entfernen.
     *
     * Dadurch erzeugt Cleanup
     * keine falschen Fehler-Events.
     */
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


  if (!cleanText) {

    assistantSpeaking =
      false;


    chatInProgress =
      false;


    resumeListening();


    return;
  }


  /*
   * Garantiert:
   * niemals zwei ElevenLabs-Audios.
   */
  stopElevenAudio();


  if (ttsController) {

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


    if (!response.ok) {

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
      blob.size === 0
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


  /*
   * Während Begrüßung:
   * Mikro garantiert aus.
   */
  chatInProgress =
    true;


  await speakWithElevenLabs(
    greeting
  );
}


/* =========================================================
   JARVIS CHAT
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


  /*
   * EIN Request gleichzeitig.
   */
  if (
    chatInProgress
  ) {

    console.warn(
      "Chat ignoriert: JARVIS verarbeitet bereits einen Turn."
    );


    return;
  }


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


  if (chatController) {

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


    if (!response.ok) {

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


    if (!answer) {

      throw new Error(
        "JARVIS hat keinen Antworttext geliefert."
      );
    }


    /*
     * Gesprächskontext speichern.
     */
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


    /*
     * WICHTIG:
     *
     * Der Text geht jetzt ausschließlich
     * an ElevenLabs.
     *
     * Keine Realtime Response.
     * Kein cedar.
     */
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
   TRANSCRIPT HANDLING
   ========================================================= */

async function handleCompletedTranscript(
  event
) {

  const transcript =
    String(
      event.transcript ||
      ""
    ).trim();


  if (!transcript) {

    chatInProgress =
      false;


    waitingForAssistant =
      false;


    resumeListening();


    return;
  }


  /*
   * =====================================================
   * DUPLIKATE ÜBER ITEM-ID VERHINDERN
   * =====================================================
   */

  const itemId =
    String(
      event.item_id ||
      ""
    ).trim();


  if (
    itemId &&
    processedItemIds.has(
      itemId
    )
  ) {

    console.log(
      "Doppeltes Transkript ignoriert:",
      itemId
    );


    return;
  }


  if (itemId) {

    addProcessedItemId(
      itemId
    );
  }


  /*
   * Fallback-Dedupe,
   * falls keine item_id vorhanden ist.
   */
  const now =
    Date.now();


  if (
    !itemId &&
    transcript ===
      lastTranscriptText &&
    now -
      lastTranscriptTime <
      2500
  ) {

    console.log(
      "Doppeltes Transkript ignoriert."
    );


    return;
  }


  lastTranscriptText =
    transcript;


  lastTranscriptTime =
    now;


  setLog(
    `Verstanden: ${transcript}`
  );


  /*
   * Jetzt beginnt erst der Chat.
   *
   * Wichtig:
   * speech_stopped selbst erzeugt
   * KEINE Antwort mehr.
   */
  chatInProgress =
    false;


  await sendTranscriptToJarvis(
    transcript
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


  if (button) {

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
     * =====================================================
     * EXTREM WICHTIG:
     *
     * Es gibt KEINE OpenAI-Audioausgabe mehr.
     *
     * Falls die Realtime-Verbindung trotzdem
     * irgendeinen Track bereitstellt,
     * wird er sofort deaktiviert.
     * =====================================================
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


        if (remoteAudio) {

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


    if (remoteAudio) {

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
          state === "failed"
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
     *
     * Nur um Serverevents zu empfangen.
     *
     * Wir senden KEIN response.create.
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


        if (button) {

          button.disabled =
            false;
        }


        setStatus(
          "Online"
        );


        /*
         * Während Intro und Begrüßung
         * hört JARVIS NICHT zu.
         */
        muteMicrophone();


        setLog(
          "JARVIS startet …"
        );


        await sleep(
          INTRO_VOICE_DELAY_MS
        );


        if (!active) {

          return;
        }


        duckIntro();


        /*
         * Begrüßung ist direkt
         * ElevenLabs.
         */
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
           USER STARTET ZU REDEN
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
           * =================================================
           * ENTSCHEIDENDE ÄNDERUNG
           * =================================================
           *
           * Hier wird KEINE Antwort gestartet.
           *
           * Wir warten ausschließlich auf:
           *
           * conversation.item.
           * input_audio_transcription.completed
           * =================================================
           */

          waitingForAssistant =
            true;


          muteMicrophone();


          setJarvisState(
            "thinking"
          );


          setLog(
            "Verarbeite Sprache …"
          );
        }


        /* =================================================
           FERTIGES DEUTSCHES TRANSKRIPT
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
           TRANSKRIPTION FEHLGESCHLAGEN
           ================================================= */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.failed"
        ) {

          console.error(
            "Transcription failed:",
            event
          );


          chatInProgress =
            false;


          waitingForAssistant =
            false;


          setLog(
            "Ich habe dich nicht verstanden."
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
           * Es gibt in V6 KEINE
           * Response-Fehlerbehandlung mehr,
           * weil Realtime keine Responses
           * erzeugen darf.
           */
          setLog(
            event.error?.message ||
            "Transkriptionsfehler."
          );


          if (
            !assistantSpeaking &&
            !chatInProgress
          ) {

            waitingForAssistant =
              false;


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

            /*
             * Hintergrundgeräusche
             * nicht automatisch hochziehen.
             */
            autoGainControl:
              false,

            channelCount:
              1
          }
        });


    /*
     * Start immer stumm.
     */
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


  chatInProgress =
    false;


  previousResponseId =
    null;


  processedItemIds.clear();


  lastTranscriptText =
    "";


  lastTranscriptTime =
    0;


  /*
   * Netzwerk abbrechen.
   */
  if (chatController) {

    try {

      chatController.abort();

    } catch {}


    chatController =
      null;
  }


  if (ttsController) {

    try {

      ttsController.abort();

    } catch {}


    ttsController =
      null;
  }


  /*
   * Audio stoppen.
   */
  elevenPlaybackSettled =
    true;


  stopElevenAudio();


  stopIntro();


  /*
   * Mikro aus.
   */
  muteMicrophone();


  /*
   * DataChannel schließen.
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
   * Peer schließen.
   */
  try {

    if (pc) {

      pc.close();
    }

  } catch {}


  /*
   * Mikrofon-Tracks stoppen.
   */
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


  dc =
    null;


  pc =
    null;


  /*
   * OpenAI Remote Audio
   * endgültig stumm halten.
   */
  if (remoteAudio) {

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
