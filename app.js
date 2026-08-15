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

/*
 * Wird gesetzt, sobald ein Tool-Call kommt.
 *
 * Wir warten dann auf ZWEI Dinge:
 *
 * 1. echtes API-Ergebnis
 * 2. response.done der ursprünglichen Realtime-Response
 *
 * Erst wenn beides da ist, erzeugen wir die Datenantwort.
 */
let pendingTool = null;

let outputAudioContext = null;
let outputSource = null;
let outputGain = null;

let introAudio = null;
let introFadeTimer = null;

const handledToolCalls = new Set();

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

function formatNumber(value) {
  return new Intl.NumberFormat(
    "de-DE",
    {
      maximumFractionDigits: 0
    }
  ).format(
    Number(value || 0)
  );
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
    return `${Number(value || 0).toFixed(2)} ${currency}`;
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
    "Microphone:",
    enabled
      ? "ENABLED"
      : "MUTED"
  );
}

function muteMicrophone() {
  waitingForAssistant = true;

  setMicrophoneEnabled(
    false
  );
}

function resumeListening() {
  if (!active) {
    return;
  }

  waitingForAssistant = false;
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
      "/Intro.mp3?v=8"
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

function fadeIntroOut() {
  if (
    !introAudio ||
    introAudio.paused
  ) {
    return;
  }

  const started =
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
              started
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
   AUDIO OUTPUT
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
      "Audio gain:",
      error
    );
  }
}


/* =========================================================
   STARTUP GREETING
   ========================================================= */

function requestStartupGreeting() {
  muteMicrophone();

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
        70,

      instructions:
        `Sprich exakt diesen Satz:

"${getGreeting()}"

Sprich Deutsch.
Keine Ergänzung.
Danach schweigen.`
    }
  });
}


/* =========================================================
   DETERMINISTIC TOOL SPEECH
   ========================================================= */

/*
 * Ganz wichtig:
 *
 * Diese Sätze werden vom JAVASCRIPT
 * aus den echten Tool-Daten gebaut.
 *
 * Kein Modell entscheidet mehr über:
 * - Bestellzahl
 * - Umsatz
 * - Produktnamen
 *
 * Produktnamen gibt es hier überhaupt nicht.
 */

function buildToolSpeech(
  name,
  result,
  args
) {
  if (!result) {
    return (
      "Ich konnte die Daten gerade nicht verifizieren."
    );
  }

  /* -------------------------------------------------------
     SHOPIFY
     ------------------------------------------------------- */

  if (
    name ===
    "get_shopify_summary"
  ) {
    if (
      result.ok !== true
    ) {
      return (
        "Ich kann die Shopify-Daten gerade nicht verifizieren."
      );
    }

    const period =
      result.period ===
        "yesterday"
        ? "Gestern"
        : "Heute";

    const orders =
      Number(
        result.orders || 0
      );

    const revenue =
      Number(
        result.revenue || 0
      );

    const average =
      Number(
        result.average_order_value ||
        0
      );

    const currency =
      result.currency ||
      "EUR";

    /*
     * Nur echte Felder aus Shopify.
     */
    return (
      `${period} hast du ` +
      `${formatNumber(orders)} Shopify-Bestellungen ` +
      `mit ${formatMoney(
        revenue,
        currency
      )} Umsatz. ` +
      `Der durchschnittliche Bestellwert liegt bei ` +
      `${formatMoney(
        average,
        currency
      )}.`
    );
  }

  /* -------------------------------------------------------
     WEATHER
     ------------------------------------------------------- */

  if (
    name ===
    "get_weather"
  ) {
    if (
      result.ok !== true
    ) {
      return (
        "Ich konnte die Wetterdaten gerade nicht verifizieren."
      );
    }

    const day =
      result.day ===
        "tomorrow"
        ? "Morgen"
        : "Heute";

    const place =
      result.location?.name ||
      args?.location ||
      "dem gewünschten Ort";

    const max =
      result.forecast
        ?.max_temperature;

    const min =
      result.forecast
        ?.min_temperature;

    const rain =
      result.forecast
        ?.precipitation_probability;

    return (
      `${day} in ${place}: ` +
      `maximal ${max} Grad, ` +
      `minimal ${min} Grad. ` +
      `Die höchste Regenwahrscheinlichkeit liegt bei ` +
      `${rain} Prozent.`
    );
  }

  /* -------------------------------------------------------
     GMAIL
     ------------------------------------------------------- */

  if (
    name ===
    "get_important_emails"
  ) {
    return (
      result.message ||
      "Gmail ist noch nicht verbunden."
    );
  }

  /* -------------------------------------------------------
     CALENDAR
     ------------------------------------------------------- */

  if (
    name ===
    "get_calendar_today"
  ) {
    return (
      result.message ||
      "Google Kalender ist noch nicht verbunden."
    );
  }

  return (
    "Die angeforderten Daten konnten nicht verarbeitet werden."
  );
}


/* =========================================================
   EXACT TOOL RESPONSE
   ========================================================= */

function requestExactToolSpeech(
  text
) {
  const sentence =
    String(
      text || ""
    ).trim();

  if (!sentence) {
    resumeListening();

    return;
  }

  setLog(
    "JARVIS antwortet …"
  );

  muteMicrophone();

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
        150,

      instructions:
        `Sprich exakt den folgenden Text auf Deutsch.

Du darfst KEINE Zahl ändern.
Du darfst KEIN Produkt ergänzen.
Du darfst KEINE Information hinzufügen.

TEXT:
${sentence}

Danach schweigen.`
    }
  });
}


/* =========================================================
   TOOL SYNCHRONIZATION
   ========================================================= */

function maybeFinishTool() {
  if (!pendingTool) {
    return;
  }

  /*
   * Wir starten die Datenantwort erst,
   * wenn BEIDES erfüllt ist:
   *
   * - API ist fertig
   * - erste Realtime-Response ist done
   */
  if (
    !pendingTool.apiFinished ||
    !pendingTool.initialResponseDone ||
    pendingTool.followupStarted
  ) {
    return;
  }

  pendingTool.followupStarted =
    true;

  const speech =
    buildToolSpeech(
      pendingTool.name,
      pendingTool.result,
      pendingTool.args
    );

  console.log(
    "Exact tool speech:",
    speech
  );

  requestExactToolSpeech(
    speech
  );
}


/* =========================================================
   RUN TOOL
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

  muteMicrophone();

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

  /*
   * EIN Tool gleichzeitig.
   */
  pendingTool = {
    callId:
      event.call_id,

    name:
      event.name,

    args,

    result:
      null,

    apiFinished:
      false,

    initialResponseDone:
      false,

    followupStarted:
      false
  };

  setLog(
    event.name ===
      "get_shopify_summary"
      ? "Shopify wird geprüft …"
      : "Live-Daten werden geprüft …"
  );

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

    let result;

    try {
      result =
        JSON.parse(raw);
    } catch {
      result = {
        ok: false,
        error:
          "Ungültige Serverantwort."
      };
    }

    if (!response.ok) {
      result.ok =
        false;

      result.http_status =
        response.status;
    }

    pendingTool.result =
      result;

  } catch (error) {
    console.error(
      "Tool fetch:",
      error
    );

    pendingTool.result = {
      ok: false,

      error:
        "Live-Daten konnten nicht geladen werden."
    };
  }

  pendingTool.apiFinished =
    true;

  /*
   * Function output trotzdem in Conversation eintragen.
   * Damit der Gesprächskontext korrekt bleibt.
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
          pendingTool.result
        )
    }
  });

  /*
   * WICHTIG:
   *
   * HIER KEIN response.create.
   *
   * Erst response.done abwarten.
   */
  maybeFinishTool();
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

  pendingTool =
    null;

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
         * Intro und Begrüßung dürfen
         * nicht ins Mikro gelangen.
         */
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

        requestStartupGreeting();
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
          event.type,
          event
        );

        /* -----------------------------------------
           USER START
           ----------------------------------------- */

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

        /* -----------------------------------------
           USER STOP
           ----------------------------------------- */

        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {
          /*
           * Danach darf sich JARVIS beim
           * Antworten nicht selbst hören.
           */
          muteMicrophone();

          setLog(
            "Denke nach …"
          );
        }

        /* -----------------------------------------
           TRANSCRIPT
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

        /* -----------------------------------------
           TOOL CALL
           ----------------------------------------- */

        if (
          event.type ===
          "response.function_call_arguments.done"
        ) {
          await runTool(
            event
          );

          return;
        }

        /* -----------------------------------------
           RESPONSE DONE
           ----------------------------------------- */

        if (
          event.type ===
          "response.done"
        ) {
          console.log(
            "Response done status:",
            event.response?.status
          );

          /*
           * Wenn gerade ein Tool wartet,
           * ist DAS der entscheidende Moment:
           * die ursprüngliche Response ist fertig.
           */
          if (
            pendingTool &&
            !pendingTool
              .followupStarted
          ) {
            pendingTool
              .initialResponseDone =
              true;

            maybeFinishTool();

            return;
          }

          if (
            event.response?.status ===
            "failed"
          ) {
            setLog(
              "JARVIS konnte nicht antworten."
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

        /* -----------------------------------------
           AUDIO START
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
           AUDIO COMPLETE
           ----------------------------------------- */

        if (
          event.type ===
          "output_audio_buffer.stopped"
        ) {
          assistantSpeaking =
            false;

          /*
           * Falls das gerade die echte
           * TOOL-DATENANTWORT war:
           * Tool-Zustand jetzt löschen.
           */
          if (
            pendingTool &&
            pendingTool
              .followupStarted
          ) {
            pendingTool =
              null;
          }

          setTimeout(
            () => {
              if (active) {
                resumeListening();
              }
            },
            350
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

          setLog(
            event.error?.message ||
            "JARVIS-Fehler."
          );

          pendingTool =
            null;

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
       SDP
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

  waitingForAssistant =
    false;

  pendingTool =
    null;

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
