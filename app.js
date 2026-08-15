const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

/* =========================================================
   CONNECTION
   ========================================================= */

let pc = null;
let dc = null;
let localStream = null;

let active = false;
let connecting = false;

let assistantSpeaking = false;
let requestInProgress = false;

/* =========================================================
   AUDIO OUTPUT
   ========================================================= */

let outputAudioContext = null;
let outputSource = null;
let outputGain = null;

/* =========================================================
   INTRO
   ========================================================= */

let introAudio = null;
let introFadeTimer = null;

/* =========================================================
   SETTINGS
   ========================================================= */

const JARVIS_OUTPUT_GAIN = 2.20;

const INTRO_START = 4;

const INTRO_VOICE_DELAY_MS = 2500;

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


function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function safeSend(payload) {
  if (
    !dc ||
    dc.readyState !== "open"
  ) {
    console.warn(
      "DataChannel nicht offen."
    );

    return false;
  }

  try {
    dc.send(
      JSON.stringify(payload)
    );

    return true;

  } catch (error) {
    console.error(
      "DataChannel send:",
      error
    );

    return false;
  }
}


function formatMoney(
  value,
  currency = "EUR"
) {
  try {
    return new Intl.NumberFormat(
      "de-DE",
      {
        style: "currency",
        currency
      }
    ).format(
      Number(value || 0)
    );

  } catch {
    return (
      `${Number(value || 0).toFixed(2)} ${currency}`
    );
  }
}


/* =========================================================
   MICROPHONE
   ========================================================= */

function setMicrophoneEnabled(enabled) {
  if (!localStream) {
    return;
  }

  for (
    const track of
    localStream.getAudioTracks()
  ) {
    track.enabled = enabled;
  }

  console.log(
    "Mikro:",
    enabled
      ? "AN"
      : "AUS"
  );
}


function resumeListening() {
  if (!active) {
    return;
  }

  requestInProgress = false;
  assistantSpeaking = false;

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

    const hour =
      Number(
        parts.find(
          p =>
            p.type === "hour"
        )?.value
      );

    if (!Number.isNaN(hour)) {
      return hour;
    }

  } catch {}

  return new Date().getHours();
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
      "/Intro.mp3?v=9"
    );

  introAudio.preload =
    "auto";

  introAudio.volume =
    1;

  return new Promise(resolve => {
    let resolved = false;

    const done = () => {
      if (resolved) {
        return;
      }

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
          "Intro:",
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


  const startVolume =
    introAudio.volume;


  const started =
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
              started
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
          startVolume -
          (
            startVolume -
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


function fadeIntroOut() {
  if (
    !introAudio ||
    introAudio.paused
  ) {
    return;
  }


  const started =
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
              started
            ) /
            INTRO_FADE_DURATION_MS,
            1
          );


        introAudio.volume =
          Math.max(
            0,

            INTRO_BACKGROUND_VOLUME *
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
   JARVIS AUDIO
   ========================================================= */

async function connectRemoteAudio(stream) {
  remoteAudio.srcObject =
    stream;

  remoteAudio.volume =
    1;


  try {
    await remoteAudio.play();
  } catch {}


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


      outputSource.connect(
        outputGain
      );


      outputGain.connect(
        outputAudioContext.destination
      );
    }


    if (outputGain) {
      outputGain.gain.value =
        JARVIS_OUTPUT_GAIN;
    }

  } catch (error) {
    console.warn(
      "Audio Gain:",
      error
    );
  }
}


/* =========================================================
   QUERY CLASSIFICATION
   ========================================================= */

function isShopifyQuery(text) {
  const t =
    normalize(text);

  return (
    t.includes("shopify") ||
    t.includes("bestellung") ||
    t.includes("bestellungen") ||
    t.includes("umsatz") ||
    t.includes("verkauf") ||
    t.includes("verkäufe") ||
    t.includes("bestellwert") ||
    t.includes("mein shop") ||
    t.includes("unser shop")
  );
}


function isWeatherQuery(text) {
  const t =
    normalize(text);

  return (
    t.includes("wetter") ||
    t.includes("temperatur") ||
    t.includes("regen") ||
    t.includes("regnet")
  );
}


function isEmailQuery(text) {
  const t =
    normalize(text);

  return (
    t.includes("mail") ||
    t.includes("email") ||
    t.includes("e mail") ||
    t.includes("postfach")
  );
}


function isCalendarQuery(text) {
  const t =
    normalize(text);

  return (
    t.includes("kalender") ||
    t.includes("termin") ||
    t.includes("termine")
  );
}


/* =========================================================
   EXACT SPEECH
   ========================================================= */

function speakExact(text) {
  const sentence =
    String(text || "")
      .trim();

  if (!sentence) {
    resumeListening();
    return;
  }


  requestInProgress =
    true;


  setMicrophoneEnabled(
    false
  );


  setLog(
    "JARVIS spricht."
  );


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
        180,

      instructions:
        `Sprich exakt den folgenden Text auf Deutsch.

Du darfst keine Zahl verändern.
Du darfst keine Information hinzufügen.
Du darfst keinen Produktnamen ergänzen.

TEXT:
${sentence}

Danach schweigen.`
    }
  });
}


/* =========================================================
   SHOPIFY
   ========================================================= */

async function handleShopify(
  transcript
) {
  const t =
    normalize(transcript);


  const period =
    t.includes(
      "gestern"
    )
      ? "yesterday"
      : "today";


  setLog(
    "Shopify wird geprüft …"
  );


  setMicrophoneEnabled(
    false
  );


  try {
    const response =
      await fetch(
        "/api/shopify-summary",

        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              period
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
        "Ungültige Shopify-Antwort."
      );
    }


    console.log(
      "ECHTE SHOPIFY DATEN:",
      data
    );


    if (
      !response.ok ||
      data.ok !== true
    ) {
      speakExact(
        "Ich kann die Shopify-Daten gerade nicht verifizieren."
      );

      return;
    }


    const dayText =
      period ===
        "yesterday"
        ? "Gestern"
        : "Heute";


    const orders =
      Number(
        data.orders || 0
      );


    const revenue =
      Number(
        data.revenue || 0
      );


    const average =
      Number(
        data.average_order_value ||
        0
      );


    const currency =
      data.currency ||
      "EUR";


    /*
     * WIE VIELE BESTELLUNGEN?
     */
    if (
      (
        t.includes("wie viele") ||
        t.includes("anzahl")
      ) &&
      t.includes(
        "bestell"
      )
    ) {
      speakExact(
        `${dayText} hast du ${orders} Shopify-Bestellungen.`
      );

      return;
    }


    /*
     * UMSATZ
     */
    if (
      t.includes("umsatz") ||
      t.includes("umgesetzt") ||
      t.includes("verkauf") ||
      t.includes("verkäufe")
    ) {
      speakExact(
        `${dayText} hast du ${formatMoney(
          revenue,
          currency
        )} Shopify-Umsatz mit ${orders} Bestellungen. Der durchschnittliche Bestellwert liegt bei ${formatMoney(
          average,
          currency
        )}.`
      );

      return;
    }


    /*
     * ALLGEMEINE SHOPIFY-FRAGE
     */
    speakExact(
      `${dayText} hast du ${orders} Shopify-Bestellungen mit ${formatMoney(
        revenue,
        currency
      )} Umsatz. Der durchschnittliche Bestellwert liegt bei ${formatMoney(
        average,
        currency
      )}.`
    );


  } catch (error) {
    console.error(
      "Shopify:",
      error
    );


    speakExact(
      "Ich kann die Shopify-Daten gerade nicht verifizieren."
    );
  }
}


/* =========================================================
   WEATHER
   ========================================================= */

function extractWeatherLocation(
  transcript
) {
  const original =
    String(
      transcript || ""
    );


  if (
    normalize(original)
      .includes(
        "ludwigshafen"
      )
  ) {
    return (
      "Ludwigshafen am Rhein"
    );
  }


  const match =
    original.match(
      /\bin\s+(.+?)(?:\s+(?:heute|morgen))?[?.!,]*$/i
    );


  if (
    match &&
    match[1]
  ) {
    return (
      match[1].trim()
    );
  }


  return null;
}


async function handleWeather(
  transcript
) {
  const t =
    normalize(transcript);


  const location =
    extractWeatherLocation(
      transcript
    );


  if (!location) {
    speakExact(
      "Für welchen Ort soll ich das Wetter prüfen?"
    );

    return;
  }


  const day =
    t.includes(
      "morgen"
    )
      ? "tomorrow"
      : "today";


  setLog(
    "Wetter wird geprüft …"
  );


  try {
    const response =
      await fetch(
        "/api/weather",

        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              location,
              day
            })
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      data.ok !== true
    ) {
      speakExact(
        "Ich konnte die Wetterdaten gerade nicht verifizieren."
      );

      return;
    }


    const dayText =
      day === "tomorrow"
        ? "Morgen"
        : "Heute";


    const place =
      data.location?.name ||
      location;


    const max =
      data.forecast
        ?.max_temperature;


    const min =
      data.forecast
        ?.min_temperature;


    const rain =
      data.forecast
        ?.precipitation_probability;


    speakExact(
      `${dayText} in ${place}: maximal ${max} Grad, minimal ${min} Grad. Die höchste Regenwahrscheinlichkeit liegt bei ${rain} Prozent.`
    );


  } catch (error) {
    console.error(
      "Weather:",
      error
    );


    speakExact(
      "Ich konnte die Wetterdaten gerade nicht verifizieren."
    );
  }
}


/* =========================================================
   EMAIL
   ========================================================= */

async function handleEmail() {
  setLog(
    "E-Mails werden geprüft …"
  );


  try {
    const response =
      await fetch(
        "/api/important-emails",

        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              limit: 5
            })
        }
      );


    const data =
      await response.json();


    speakExact(
      data.message ||
      "Gmail ist noch nicht verbunden."
    );


  } catch {
    speakExact(
      "Gmail ist noch nicht verbunden."
    );
  }
}


/* =========================================================
   CALENDAR
   ========================================================= */

async function handleCalendar() {
  setLog(
    "Kalender wird geprüft …"
  );


  try {
    const response =
      await fetch(
        "/api/calendar-today",

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


    const data =
      await response.json();


    speakExact(
      data.message ||
      "Google Kalender ist noch nicht verbunden."
    );


  } catch {
    speakExact(
      "Google Kalender ist noch nicht verbunden."
    );
  }
}


/* =========================================================
   NORMAL CONVERSATION
   ========================================================= */

function handleConversation(
  transcript
) {
  requestInProgress =
    true;


  setMicrophoneEnabled(
    false
  );


  setLog(
    "JARVIS denkt nach …"
  );


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
        300,

      instructions:
        `Der Benutzer hat gerade gesagt:

"${transcript}"

Antworte darauf natürlich auf Deutsch.

Du bist JARVIS.
Locker, intelligent, direkt und gelegentlich trocken humorvoll.

Beantworte seine eigentliche Aussage oder Frage.
Keine erfundenen Live-Daten.
Keine unnötige Anschlussfrage.
Danach schweigen.`
    }
  });
}


/* =========================================================
   ROUTER
   ========================================================= */

async function routeTranscript(
  transcript
) {
  const text =
    String(
      transcript || ""
    ).trim();


  if (!text) {
    resumeListening();

    return;
  }


  if (
    requestInProgress
  ) {
    return;
  }


  requestInProgress =
    true;


  console.log(
    "ROUTER:",
    text
  );


  if (
    isShopifyQuery(text)
  ) {
    await handleShopify(
      text
    );

    return;
  }


  if (
    isWeatherQuery(text)
  ) {
    await handleWeather(
      text
    );

    return;
  }


  if (
    isEmailQuery(text)
  ) {
    await handleEmail();

    return;
  }


  if (
    isCalendarQuery(text)
  ) {
    await handleCalendar();

    return;
  }


  handleConversation(
    text
  );
}


/* =========================================================
   STARTUP GREETING
   ========================================================= */

function requestGreeting() {
  requestInProgress =
    true;


  setMicrophoneEnabled(
    false
  );


  speakExact(
    getGreeting()
  );
}


/* =========================================================
   START
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


  button.disabled =
    true;


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
    await startIntro();


    pc =
      new RTCPeerConnection();


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


        button.disabled =
          false;


        setStatus(
          "Online"
        );


        /*
         * DAS IST DER WICHTIGE FIX.
         *
         * VAD bleibt aktiv.
         *
         * Aber OpenAI darf NICHT mehr
         * automatisch antworten.
         *
         * Unser Router entscheidet.
         */
        safeSend({
          type:
            "session.update",

          session: {
            tools: [],

            tool_choice:
              "none",

            audio: {
              input: {
                turn_detection: {
                  type:
                    "server_vad",

                  threshold:
                    0.98,

                  prefix_padding_ms:
                    180,

                  silence_duration_ms:
                    600,

                  create_response:
                    false,

                  interrupt_response:
                    false
                }
              }
            }
          }
        });


        setMicrophoneEnabled(
          false
        );


        await sleep(
          INTRO_VOICE_DELAY_MS
        );


        if (!active) {
          return;
        }


        duckIntro();


        requestGreeting();
      };


    dc.onerror =
      error => {
        console.error(
          "DataChannel:",
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


        /* -----------------------------------------
           USER STARTS SPEAKING
           ----------------------------------------- */

        if (
          event.type ===
          "input_audio_buffer.speech_started"
        ) {
          if (
            !assistantSpeaking &&
            !requestInProgress
          ) {
            setLog(
              "Ich höre zu …"
            );
          }
        }


        /* -----------------------------------------
           USER STOPS SPEAKING
           ----------------------------------------- */

        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {
          /*
           * Satz ist fertig.
           *
           * Mikro stumm, während wir
           * auf Transkription warten.
           */
          setMicrophoneEnabled(
            false
          );


          setLog(
            "Verstehe …"
          );
        }


        /* -----------------------------------------
           TRANSCRIPTION READY
           ----------------------------------------- */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.completed"
        ) {
          const transcript =
            String(
              event.transcript ||
              ""
            ).trim();


          console.log(
            "TRANSKRIPT:",
            transcript
          );


          if (!transcript) {
            resumeListening();

            return;
          }


          setLog(
            `Verstanden: ${transcript}`
          );


          requestInProgress =
            false;


          await routeTranscript(
            transcript
          );
        }


        /* -----------------------------------------
           OUTPUT START
           ----------------------------------------- */

        if (
          event.type ===
          "output_audio_buffer.started"
        ) {
          assistantSpeaking =
            true;


          setMicrophoneEnabled(
            false
          );


          if (outputGain) {
            outputGain.gain.value =
              JARVIS_OUTPUT_GAIN;
          }


          setLog(
            "JARVIS spricht."
          );
        }


        /* -----------------------------------------
           OUTPUT FINISHED
           ----------------------------------------- */

        if (
          event.type ===
          "output_audio_buffer.stopped"
        ) {
          assistantSpeaking =
            false;


          requestInProgress =
            false;


          /*
           * Kurze Echo-Pause.
           */
          setTimeout(
            () => {
              if (active) {
                resumeListening();
              }
            },
            400
          );
        }


        /* -----------------------------------------
           RESPONSE FAILED
           ----------------------------------------- */

        if (
          event.type ===
          "response.done" &&
          event.response?.status ===
            "failed"
        ) {
          console.error(
            "Response failed:",
            event.response
          );


          requestInProgress =
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
        }


        /* -----------------------------------------
           TRANSCRIPTION ERROR
           ----------------------------------------- */

        if (
          event.type ===
          "conversation.item.input_audio_transcription.failed"
        ) {
          console.error(
            "Transcription failed:",
            event
          );


          requestInProgress =
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


        /* -----------------------------------------
           ERROR
           ----------------------------------------- */

        if (
          event.type ===
          "error"
        ) {
          console.error(
            "Realtime error:",
            event
          );


          requestInProgress =
            false;


          setLog(
            event.error?.message ||
            "JARVIS-Fehler."
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
     * Start zunächst stumm,
     * damit Intro + Begrüßung
     * nicht aufgenommen werden.
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
       WEBRTC
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
      "Start:",
      error
    );


    await stopJarvis();


    setLog(
      `Start fehlgeschlagen: ${error.message}`
    );


  } finally {
    connecting =
      false;


    button.disabled =
      false;
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


  requestInProgress =
    false;


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


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "pagehide",

  () => {
    stopJarvis();
  }
);
