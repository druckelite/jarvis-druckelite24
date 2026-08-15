/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V5.8
   ---------------------------------------------------------
   - NUR ElevenLabs spricht
   - OpenAI Realtime liefert ausschließlich Text
   - Normale Antworten: ElevenLabs
   - Shopify/Wetter/Tools: ebenfalls ElevenLabs
   - Keine cedar-Ausgabe mehr im Browser
   - Response-Lock verhindert parallele response.create Calls
   - Tool-Folgeantwort wartet auf Ende der laufenden Response
   - Deutsch wird bei jeder Antwort erneut erzwungen
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


/* =========================================================
   JARVIS STATE
   ========================================================= */

let assistantSpeaking = false;

let waitingForAssistant = false;


/* =========================================================
   RESPONSE CONTROL

   WICHTIG:
   Es darf IMMER nur genau eine OpenAI-Response laufen.
   ========================================================= */

let responseInProgress = false;

let activeResponsePurpose = null;

let activeResponseId = null;

let currentTextResponse = "";

let currentResponseUsedTool = false;


/* =========================================================
   TOOL FOLLOW-UP
   ========================================================= */

let toolFollowupPending = false;


/* =========================================================
   ELEVENLABS AUDIO
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
   WATCHDOG
   ========================================================= */

let responseWatchdog = null;


/* =========================================================
   TOOL CALL CACHE
   ========================================================= */

const handledToolCalls =
  new Set();

const MAX_HANDLED_TOOL_CALLS =
  50;


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

const LISTENING_RESUME_DELAY_MS =
  700;

const ELEVEN_TIMEOUT_MS =
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
  ms = 20000
) {

  clearResponseWatchdog();


  responseWatchdog =
    setTimeout(
      () => {

        console.warn(
          "JARVIS Response-Watchdog."
        );


        /*
         * Lock lösen, falls OpenAI
         * aus irgendeinem Grund
         * keine response.done sendet.
         */
        responseInProgress =
          false;

        activeResponsePurpose =
          null;

        activeResponseId =
          null;


        if (
          active &&
          !assistantSpeaking
        ) {

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


function muteForAssistant() {

  waitingForAssistant =
    true;


  setMicrophoneEnabled(
    false
  );
}


function resumeListening() {

  clearResponseWatchdog();


  if (!active) {
    return;
  }


  /*
   * Niemals Mikro öffnen,
   * solange noch eine Response
   * oder Audioausgabe läuft.
   */
  if (
    responseInProgress ||
    assistantSpeaking
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
     * Handler zuerst entfernen.
     * Verhindert künstliches
     * error-Event beim Cleanup.
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

    setTimeout(
      () => {

        if (active) {

          resumeListening();
        }

      },
      300
    );


    return;
  }


  /*
   * Nie zwei Audios gleichzeitig.
   */
  stopElevenAudio();


  muteForAssistant();


  setJarvisState(
    "thinking"
  );


  setLog(
    "JARVIS antwortet …"
  );


  elevenPlaybackSettled =
    false;


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {

        controller.abort();

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
          "ElevenLabs Audiofehler:",
          event
        );


        assistantSpeaking =
          false;


        stopElevenAudio();


        setLog(
          "Sprachausgabe konnte nicht gestartet werden."
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
      "ElevenLabs Fehler:",
      error
    );


    assistantSpeaking =
      false;


    stopElevenAudio();


    setLog(
      "ElevenLabs konnte die Antwort nicht sprechen."
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


/* =========================================================
   START GREETING
   ========================================================= */

async function requestStartupGreeting() {

  const greeting =
    getGreeting();


  await speakWithElevenLabs(
    greeting
  );
}


/* =========================================================
   OPENAI RESPONSE CREATOR
   ========================================================= */

/*
 * EINZIGE Funktion im gesamten
 * app.js, die response.create
 * für Textantworten senden darf.
 *
 * Dadurch gibt es keine
 * parallelen Responses mehr.
 */
function createTextResponse(
  purpose
) {

  if (!active) {

    return false;
  }


  if (
    !dc ||
    dc.readyState !== "open"
  ) {

    return false;
  }


  /*
   * DIE WICHTIGE SPERRE.
   */
  if (
    responseInProgress
  ) {

    console.warn(
      "response.create blockiert: Es läuft bereits eine Response."
    );

    return false;
  }


  /*
   * Lock VOR dem Senden setzen.
   *
   * Nicht erst bei response.created.
   * Sonst besteht ein Race Condition.
   */
  responseInProgress =
    true;


  activeResponsePurpose =
    purpose;


  activeResponseId =
    null;


  currentTextResponse =
    "";


  currentResponseUsedTool =
    false;


  muteForAssistant();


  setJarvisState(
    "thinking"
  );


  setLog(
    "Denke nach …"
  );


  /*
   * Bei JEDER Response
   * Deutsch nochmals explizit erzwingen.
   */
  let instructions =
    `Antworte ausschließlich auf Deutsch.

Du bist JARVIS, Mattls persönlicher Assistent.

Regeln:
- natürliches deutsches Hochdeutsch
- kurze bis mittellange Antwort
- keine spanische Sprache
- kein unnötiges Englisch
- keine Markdown-Tabelle
- antworte so, wie der Text anschließend gesprochen werden soll
- wenn aktuelle Daten benötigt werden, benutze das passende Tool
- erfinde keine Live-Daten`;


  if (
    purpose ===
    "tool_followup"
  ) {

    instructions =
      `Beantworte Mattls letzte Frage ausschließlich anhand des gerade gelieferten Tool-Ergebnisses.

Antworte ausschließlich auf Deutsch.

Regeln:
- kurz und konkret
- nenne relevante Zahlen klar
- keine erfundenen Daten
- keine spanische Sprache
- keine Markdown-Tabelle
- keine themenfremden Vorschläge
- formuliere natürlich für Sprachausgabe`;
  }


  const sent =
    safeSend({
      type:
        "response.create",

      response: {

        output_modalities: [
          "text"
        ],

        metadata: {

          response_purpose:
            purpose
        },

        max_output_tokens:
          350,

        instructions
      }
    });


  if (!sent) {

    responseInProgress =
      false;


    activeResponsePurpose =
      null;


    return false;
  }


  armResponseWatchdog(
    20000
  );


  return true;
}


/* =========================================================
   NORMAL USER RESPONSE
   ========================================================= */

function requestNormalTextResponse() {

  /*
   * Zweites speech_stopped Event
   * darf niemals zweite Response
   * starten.
   */
  if (
    responseInProgress ||
    assistantSpeaking
  ) {

    console.log(
      "Normale Response übersprungen: JARVIS ist noch beschäftigt."
    );

    return;
  }


  createTextResponse(
    "normal"
  );
}


/* =========================================================
   TOOL HANDLING
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


  currentResponseUsedTool =
    true;


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

    console.error(
      "Unbekanntes Tool:",
      event.name
    );


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
   * Tool-Ergebnis in die
   * OpenAI-Konversation schreiben.
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
   * Noch KEIN response.create!
   *
   * Die erste Response kann zu
   * diesem Zeitpunkt laut OpenAI
   * noch aktiv sein.
   *
   * Genau das verursachte vorher:
   *
   * "Conversation already has
   * an active response in progress"
   */
  toolFollowupPending =
    true;


  /*
   * Falls response.done bereits
   * angekommen ist, können wir
   * direkt weitermachen.
   */
  if (
    !responseInProgress
  ) {

    toolFollowupPending =
      false;


    createTextResponse(
      "tool_followup"
    );
  }
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


  responseInProgress =
    false;


  activeResponsePurpose =
    null;


  activeResponseId =
    null;


  currentTextResponse =
    "";


  currentResponseUsedTool =
    false;


  toolFollowupPending =
    false;


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
     * Intro.
     */
    await startIntro();


    /*
     * WebRTC.
     */
    pc =
      new RTCPeerConnection();


    /*
     * WICHTIG:
     *
     * OpenAI-Audio wird NICHT
     * abgespielt.
     *
     * Selbst falls irgendwo
     * versehentlich ein Audiostream
     * auftaucht, bleibt er stumm.
     */
    pc.ontrack =
      event => {

        console.log(
          "Remote OpenAI Audio-Track ignoriert."
        );


        try {

          event.track.enabled =
            false;

        } catch {}
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
     * DataChannel.
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
         * Session sicherheitshalber
         * nochmals explizit auf
         * Text-Modus stellen.
         */
        safeSend({
          type:
            "session.update",

          session: {

            output_modalities: [
              "text"
            ],

            turn_detection: {

              type:
                "semantic_vad",

              eagerness:
                "low",

              create_response:
                false,

              interrupt_response:
                false
            }
          }
        });


        setMicrophoneEnabled(
          false
        );


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
         * Begrüßung:
         * ausschließlich ElevenLabs.
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
           SESSION
           ================================================= */

        if (
          event.type ===
          "session.updated"
        ) {

          console.log(
            "Realtime läuft im TEXT-Modus."
          );
        }


        /* =================================================
           USER SPEECH START
           ================================================= */

        if (
          event.type ===
          "input_audio_buffer.speech_started"
        ) {

          /*
           * Während Antwort läuft:
           * Event ignorieren.
           */
          if (
            responseInProgress ||
            assistantSpeaking ||
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
           USER SPEECH STOP
           ================================================= */

        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {

          /*
           * DIE ZWEITE WICHTIGE SPERRE.
           *
           * Mehrere speech_stopped
           * Events dürfen niemals
           * mehrere response.create
           * auslösen.
           */
          if (
            responseInProgress ||
            assistantSpeaking
          ) {

            console.log(
              "speech_stopped ignoriert: Response läuft bereits."
            );


            return;
          }


          muteForAssistant();


          requestNormalTextResponse();
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
           RESPONSE CREATED
           ================================================= */

        if (
          event.type ===
          "response.created"
        ) {

          activeResponseId =
            event.response?.id ||
            null;


          /*
           * Falls Server-Metadaten
           * vorhanden sind, übernehmen.
           */
          const metadataPurpose =
            event.response
              ?.metadata
              ?.response_purpose;


          if (metadataPurpose) {

            activeResponsePurpose =
              metadataPurpose;
          }


          /*
           * Lock bleibt TRUE.
           */
          responseInProgress =
            true;
        }


        /* =================================================
           TEXT DELTA
           ================================================= */

        if (
          event.type ===
          "response.output_text.delta"
        ) {

          const delta =
            String(
              event.delta ||
              ""
            );


          if (delta) {

            currentTextResponse +=
              delta;
          }
        }


        /* =================================================
           TEXT DONE
           ================================================= */

        if (
          event.type ===
          "response.output_text.done"
        ) {

          const finalText =
            String(
              event.text ||
              ""
            ).trim();


          if (finalText) {

            currentTextResponse =
              finalText;
          }
        }


        /* =================================================
           TOOL CALL
           ================================================= */

        if (
          event.type ===
          "response.function_call_arguments.done"
        ) {

          currentResponseUsedTool =
            true;


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

          clearResponseWatchdog();


          const finishedPurpose =
            event.response
              ?.metadata
              ?.response_purpose ||
            activeResponsePurpose;


          const status =
            event.response?.status;


          /*
           * JETZT darf der Response-Lock
           * gelöst werden.
           */
          responseInProgress =
            false;


          activeResponseId =
            null;


          activeResponsePurpose =
            null;


          /*
           * Fehler.
           */
          if (
            status ===
            "failed"
          ) {

            console.error(
              "OpenAI Response fehlgeschlagen:",
              event.response
            );


            currentTextResponse =
              "";


            currentResponseUsedTool =
              false;


            toolFollowupPending =
              false;


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


            return;
          }


          /*
           * =================================================
           * TOOL RESPONSE BEENDET
           * =================================================
           *
           * Erste Modellresponse hat
           * ein Tool aufgerufen.
           *
           * Nicht sprechen.
           * Erst Tool-Folgeantwort starten.
           */
          if (
            currentResponseUsedTool ||
            toolFollowupPending
          ) {

            currentTextResponse =
              "";


            currentResponseUsedTool =
              false;


            if (
              toolFollowupPending
            ) {

              toolFollowupPending =
                false;


              /*
               * Jetzt ist garantiert
               * keine Response mehr aktiv.
               */
              setTimeout(
                () => {

                  if (
                    active &&
                    !responseInProgress
                  ) {

                    createTextResponse(
                      "tool_followup"
                    );
                  }

                },
                50
              );
            }


            return;
          }


          /*
           * =================================================
           * NORMALE ODER TOOL-FOLGEANTWORT
           * =================================================
           */

          const text =
            String(
              currentTextResponse ||
              ""
            ).trim();


          currentTextResponse =
            "";


          if (text) {

            console.log(
              "JARVIS Text:",
              text
            );


            /*
             * EINZIGE STIMME:
             * ElevenLabs.
             */
            await speakWithElevenLabs(
              text
            );


          } else {

            console.warn(
              "OpenAI lieferte keinen Antworttext."
            );


            setTimeout(
              () => {

                if (active) {

                  resumeListening();
                }

              },
              400
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


          /*
           * Nur reagieren, wenn keine
           * richtige Response läuft.
           */
          if (
            !responseInProgress &&
            !assistantSpeaking
          ) {

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


          const message =
            String(
              event.error?.message ||
              "JARVIS-Fehler."
            );


          setLog(
            message
          );


          /*
           * Falls OpenAI meldet,
           * dass bereits eine Response
           * läuft, NICHT gleich Mikro
           * öffnen.
           *
           * Die laufende Response darf
           * sauber bis response.done
           * fertig werden.
           */
          if (
            message
              .toLowerCase()
              .includes(
                "active response"
              )
          ) {

            console.warn(
              "Parallele Response wurde blockiert."
            );


            return;
          }


          if (
            !responseInProgress &&
            !assistantSpeaking
          ) {

            setTimeout(
              () => {

                if (active) {

                  resumeListening();
                }

              },
              600
            );
          }
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
              false,

            channelCount:
              1
          }
        });


    /*
     * Beim Start aus.
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
   STOP
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


  responseInProgress =
    false;


  activeResponsePurpose =
    null;


  activeResponseId =
    null;


  currentTextResponse =
    "";


  currentResponseUsedTool =
    false;


  toolFollowupPending =
    false;


  elevenPlaybackSettled =
    true;


  clearResponseWatchdog();


  stopElevenAudio();


  stopIntro();


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
    "#toggle-Button nicht gefunden."
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
