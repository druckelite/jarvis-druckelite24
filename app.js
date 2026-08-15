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
let responseInProgress = false;
let greetingInProgress = false;

const handledToolCalls = new Set();


/* =========================================================
   UI
   ========================================================= */

function setStatus(text) {
  statusEl.textContent = text;

  if (text === "Online") {
    statusEl.classList.add("online");
  } else {
    statusEl.classList.remove("online");
  }
}

function setLog(text) {
  logEl.textContent = text;
}


/* =========================================================
   REALTIME SEND
   ========================================================= */

function safeSend(payload) {
  if (!dc || dc.readyState !== "open") {
    return false;
  }

  try {
    dc.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error("DataChannel send error:", error);
    return false;
  }
}


/* =========================================================
   MICROPHONE
   ========================================================= */

function setMicrophoneEnabled(enabled) {
  if (!localStream) return;

  for (const track of localStream.getAudioTracks()) {
    track.enabled = enabled;
  }
}


/* =========================================================
   CANCEL RESPONSE
   ========================================================= */

function cancelCurrentResponse() {
  if (!assistantSpeaking && !responseInProgress) {
    return;
  }

  safeSend({
    type: "response.cancel"
  });

  safeSend({
    type: "output_audio_buffer.clear"
  });

  assistantSpeaking = false;
  responseInProgress = false;
}


/* =========================================================
   QUERY CLASSIFICATION
   ========================================================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function isShopifyLiveQuery(text) {
  const t = normalize(text);

  return (
    /\bumsatz\b/.test(t) ||
    /\bbestellungen?\b/.test(t) ||
    /\bverkäufe?\b/.test(t) ||
    /\bverkauf\b/.test(t) ||
    /\bbestellwert\b/.test(t) ||
    /\bshopify\b.*\b(heute|gestern|umsatz|bestellung|verkauf)\b/.test(t) ||
    /\b(wie läuft|wie lief)\b.*\b(shop|shopify)\b/.test(t)
  );
}


function isEmailQuery(text) {
  const t = normalize(text);

  return (
    /\b(e-?mail|mails|postfach)\b/.test(t) &&
    /\b(wichtig|heute|neu|neue|zeigen|zeige|prüf|prüfe|lesen|lies|habe|gibt)\b/.test(t)
  );
}


function isCalendarQuery(text) {
  const t = normalize(text);

  return (
    /\bkalender\b/.test(t) ||
    /\btermine?\b/.test(t) ||
    /\bwas steht heute an\b/.test(t) ||
    /\bwas habe ich heute vor\b/.test(t)
  );
}


function isWeatherQuery(text) {
  const t = normalize(text);

  return (
    /\bwetter\b/.test(t) ||
    /\btemperatur\b/.test(t) ||
    /\bregen\b/.test(t) ||
    /\bregnet\b/.test(t) ||
    /\bgrad\b/.test(t)
  );
}


/* =========================================================
   FORCE TOOL
   ========================================================= */

function requestToolResponse(toolName, transcript) {
  console.log(
    "JARVIS routing:",
    transcript,
    "=>",
    toolName
  );

  setLog(`Live-Daten: ${toolName}`);

  safeSend({
    type: "response.create",

    response: {
      output_modalities: ["audio"],

      tool_choice: {
        type: "function",
        name: toolName
      },

      instructions:
        `Der Benutzer hat auf Deutsch gesagt: "${transcript}"

Du MUSST jetzt ausschließlich das vorgegebene Tool verwenden.
Noch keine inhaltliche Antwort geben.
Keine Daten erfinden.`
    }
  });
}


/* =========================================================
   GENERAL RESPONSE
   ========================================================= */

function requestGeneralResponse(transcript) {
  safeSend({
    type: "response.create",

    response: {
      output_modalities: ["audio"],

      tool_choice: "none",

      instructions:
        `Antworte auf die letzte Äußerung des Benutzers.

Der erkannte deutsche Satz lautet ungefähr:
"${transcript}"

Antworte ausschließlich auf Deutsch.
Antworte präzise und eher kurz.
Wenn du den Satz nicht sicher verstanden hast, frage kurz auf Deutsch nach.
Keine themenfremden Vorschläge.
Nach deiner Antwort schweigen.`
    }
  });
}


/* =========================================================
   ROUTE USER SPEECH
   ========================================================= */

function routeTranscript(transcript) {
  const text = normalize(transcript);

  if (!text) {
    return;
  }

  console.log(
    "Transcription:",
    transcript
  );

  /*
   * Falls bereits eine Antwort läuft:
   * erst sauber stoppen.
   */
  if (
    responseInProgress ||
    assistantSpeaking
  ) {
    cancelCurrentResponse();
  }


  /*
   * SHOPIFY LIVE
   */
  if (isShopifyLiveQuery(text)) {
    requestToolResponse(
      "get_shopify_summary",
      transcript
    );
    return;
  }


  /*
   * GMAIL LIVE
   */
  if (isEmailQuery(text)) {
    requestToolResponse(
      "get_important_emails",
      transcript
    );
    return;
  }


  /*
   * CALENDAR LIVE
   */
  if (isCalendarQuery(text)) {
    requestToolResponse(
      "get_calendar_today",
      transcript
    );
    return;
  }


  /*
   * WEATHER LIVE
   */
  if (isWeatherQuery(text)) {
    requestToolResponse(
      "get_weather",
      transcript
    );
    return;
  }


  /*
   * GENERAL QUESTION
   */
  requestGeneralResponse(
    transcript
  );
}


/* =========================================================
   RUN TOOL
   ========================================================= */

async function runTool(event) {
  if (!event.call_id) {
    return;
  }

  if (
    handledToolCalls.has(event.call_id)
  ) {
    return;
  }

  handledToolCalls.add(
    event.call_id
  );


  let payload = {};

  try {
    payload = event.arguments
      ? JSON.parse(event.arguments)
      : {};
  } catch {
    payload = {};
  }


  let endpoint = null;


  switch (event.name) {
    case "get_shopify_summary":
      endpoint =
        "/api/shopify-summary";
      break;

    case "get_important_emails":
      endpoint =
        "/api/important-emails";
      break;

    case "get_calendar_today":
      endpoint =
        "/api/calendar-today";
      break;

    case "get_weather":
      endpoint =
        "/api/weather";
      break;
  }


  if (!endpoint) {
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
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
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
        ok: response.ok,
        message: raw
      };
    }


    if (!response.ok) {
      result.http_status =
        response.status;
    }

  } catch (error) {
    console.error(
      "Tool request error:",
      error
    );

    result = {
      error:
        "Die Live-Daten konnten nicht geladen werden."
    };
  }


  /*
   * Tool-Ergebnis zurück an OpenAI.
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
   * Jetzt aus dem Tool-Ergebnis
   * genau EINE deutsche Antwort.
   */
  safeSend({
    type: "response.create",

    response: {
      output_modalities: ["audio"],

      tool_choice: "none",

      instructions:
        `Beantworte jetzt die Frage des Benutzers ausschließlich anhand des gerade gelieferten Tool-Ergebnisses.

Regeln:
- ausschließlich Deutsch
- keine erfundenen Zahlen
- kurz und konkret
- wenn configured=false ist, sage klar, dass diese Verbindung noch nicht eingerichtet ist
- keine Reisen, Hotels oder themenfremden Vorschläge
- nach der Antwort schweigen`
    }
  });
}


/* =========================================================
   STARTUP GREETING
   ========================================================= */

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone:
          "Europe/Berlin",

        hour:
          "2-digit",

        hour12:
          false
      }
    ).format(
      new Date()
    )
  );


  if (
    hour >= 5 &&
    hour < 11
  ) {
    return "Guten Morgen.";
  }


  if (
    hour >= 11 &&
    hour < 18
  ) {
    return "Guten Tag.";
  }


  return "Guten Abend.";
}


function requestGreeting() {
  greetingInProgress = true;

  setMicrophoneEnabled(false);

  safeSend({
    type: "response.create",

    response: {
      output_modalities: [
        "audio"
      ],

      max_output_tokens: 12,

      tool_choice: "none",

      instructions:
        `Sprich exakt nur diesen Satz:
"${getGreeting()}"

Kein weiteres Wort.
Danach schweigen.`
    }
  });
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


  connecting = true;

  button.disabled = true;

  handledToolCalls.clear();


  setStatus(
    "Verbinde …"
  );

  setLog(
    "Voice-System wird gestartet."
  );


  try {

    pc =
      new RTCPeerConnection();


    pc.ontrack =
      event => {

        if (
          event.streams?.[0]
        ) {
          remoteAudio.srcObject =
            event.streams[0];

        } else {
          remoteAudio.srcObject =
            new MediaStream(
              [event.track]
            );
        }


        remoteAudio
          .play()
          .catch(() => {});
      };


    dc =
      pc.createDataChannel(
        "oai-events"
      );


    dc.onopen =
      () => {

        active = true;
        connecting = false;

        button.disabled = false;

        button.classList.add(
          "active"
        );

        setStatus(
          "Online"
        );


        /*
         * WICHTIG:
         * Server-VAD erkennt weiterhin Sprache,
         * erzeugt aber NICHT automatisch Antworten.
         * Die Routing-Logik unten entscheidet.
         */
        safeSend({
          type:
            "session.update",

          session: {
            audio: {
              input: {
                turn_detection: {
                  type:
                    "server_vad",

                  threshold:
                    0.80,

                  prefix_padding_ms:
                    300,

                  silence_duration_ms:
                    850,

                  create_response:
                    false,

                  interrupt_response:
                    true
                }
              }
            }
          }
        });


        requestGreeting();
      };


    dc.onerror =
      error => {

        console.error(
          "DataChannel error:",
          error
        );

        setLog(
          "Fehler in der Voice-Verbindung."
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
          "Realtime event:",
          event.type
        );


        /*
         * Nutzer beginnt zu sprechen.
         */
        if (
          event.type ===
          "input_audio_buffer.speech_started"
        ) {

          if (
            assistantSpeaking ||
            responseInProgress
          ) {
            cancelCurrentResponse();
          }


          setLog(
            "Ich höre zu …"
          );
        }


        /*
         * Nutzer hört auf.
         */
        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {
          setLog(
            "Verstehe …"
          );
        }


        /*
         * WICHTIG:
         * Fertige deutsche Transkription.
         * HIER wird geroutet.
         */
        if (
          event.type ===
          "conversation.item.input_audio_transcription.completed"
        ) {

          const transcript =
            String(
              event.transcript || ""
            ).trim();


          setLog(
            `Verstanden: ${transcript}`
          );


          routeTranscript(
            transcript
          );
        }


        if (
          event.type ===
          "response.created"
        ) {
          responseInProgress =
            true;
        }


        if (
          event.type ===
          "output_audio_buffer.started"
        ) {
          assistantSpeaking =
            true;

          responseInProgress =
            true;

          setLog(
            "JARVIS spricht."
          );
        }


        if (
          event.type ===
          "output_audio_buffer.stopped"
        ) {

          assistantSpeaking =
            false;


          if (
            greetingInProgress
          ) {

            greetingInProgress =
              false;

            setMicrophoneEnabled(
              true
            );

            setLog(
              "JARVIS hört zu."
            );

            return;
          }


          if (active) {
            setLog(
              "JARVIS hört zu."
            );
          }
        }


        /*
         * Function call vollständig.
         */
        if (
          event.type ===
          "response.function_call_arguments.done"
        ) {
          await runTool(
            event
          );
        }


        if (
          event.type ===
          "response.done"
        ) {

          responseInProgress =
            false;


          const status =
            event.response?.status;


          if (
            status === "failed"
          ) {

            console.error(
              "Response failed:",
              event.response
            );


            setLog(
              "JARVIS konnte die Antwort nicht erzeugen."
            );
          }
        }


        if (
          event.type ===
          "error"
        ) {

          console.error(
            "Realtime error:",
            event
          );


          const code =
            event.error?.code || "";


          if (
            code !==
            "response_cancel_not_active"
          ) {

            setLog(
              event.error?.message ||
              "JARVIS-Fehler."
            );
          }
        }
      };


    /*
     * MICROPHONE
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
              true,

            channelCount:
              1
          }
        });


    /*
     * Erst nach Begrüßung aktivieren.
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


    /*
     * WEBRTC
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
          method: "POST",

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


    const answerSdp =
      await response.text();


    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerSdp
    });


  } catch (error) {

    console.error(
      "JARVIS start error:",
      error
    );


    stopJarvis();


    setLog(
      `Start fehlgeschlagen: ${error.message}`
    );

  } finally {

    connecting = false;
    button.disabled = false;
  }
}


/* =========================================================
   STOP
   ========================================================= */

function stopJarvis() {

  try {
    cancelCurrentResponse();
  } catch {}


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


  try {
    remoteAudio.pause();
    remoteAudio.srcObject =
      null;
  } catch {}


  pc = null;
  dc = null;
  localStream = null;

  active = false;
  connecting = false;
  assistantSpeaking = false;
  responseInProgress = false;
  greetingInProgress = false;

  handledToolCalls.clear();

  button.disabled = false;

  button.classList.remove(
    "active"
  );

  setStatus(
    "Offline"
  );

  setLog(
    "Bereit."
  );
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
      stopJarvis();
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
