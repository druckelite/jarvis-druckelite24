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

const handledToolCalls = new Set();

function setStatus(text) {
  statusEl.textContent = text;
}

function log(text) {
  logEl.textContent = text;
}

function safeSend(payload) {
  if (!dc || dc.readyState !== "open") return;

  try {
    dc.send(JSON.stringify(payload));
  } catch (error) {
    console.error("DataChannel send error:", error);
  }
}

async function runTool(event) {
  if (!event.call_id) return;

  // Verhindert, dass derselbe Tool-Aufruf doppelt verarbeitet wird.
  if (handledToolCalls.has(event.call_id)) {
    return;
  }

  handledToolCalls.add(event.call_id);

  let endpoint = null;
  let payload = {};

  try {
    payload = event.arguments
      ? JSON.parse(event.arguments)
      : {};
  } catch {
    payload = {};
  }

  if (event.name === "get_shopify_summary") {
    endpoint = "/api/shopify-summary";
  }

  if (event.name === "get_important_emails") {
    endpoint = "/api/important-emails";
  }

  if (event.name === "get_calendar_today") {
    endpoint = "/api/calendar-today";
  }

  log(`Live-Daten: ${event.name}`);

  let result;

  if (!endpoint) {
    result = {
      error: `Unbekanntes Tool: ${event.name}`
    };
  } else {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      let data;

      try {
        data = await response.json();
      } catch {
        data = {
          error: await response.text()
        };
      }

      result = data;
    } catch (error) {
      console.error("Tool error:", error);

      result = {
        error: "Live-Daten konnten nicht geladen werden."
      };
    }
  }

  safeSend({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: event.call_id,
      output: JSON.stringify(result)
    }
  });

  // Genau EINE neue Antwort nach dem Tool-Ergebnis.
  safeSend({
    type: "response.create"
  });
}

function interruptAssistant() {
  if (!assistantSpeaking) return;

  // Laufende Modellantwort stoppen.
  safeSend({
    type: "response.cancel"
  });

  // Bereits gepuffertes WebRTC-Audio ebenfalls leeren.
  safeSend({
    type: "output_audio_buffer.clear"
  });

  assistantSpeaking = false;
}

async function startJarvis() {
  if (active || connecting) {
    return;
  }

  connecting = true;
  button.disabled = true;

  setStatus("Verbinde …");
  log("Mikrofon wird vorbereitet.");

  handledToolCalls.clear();

  try {
    pc = new RTCPeerConnection();

    pc.onconnectionstatechange = () => {
      console.log(
        "Peer connection:",
        pc?.connectionState
      );

      if (
        pc?.connectionState === "failed" ||
        pc?.connectionState === "disconnected"
      ) {
        log("Voice-Verbindung wurde unterbrochen.");
      }
    };

    pc.ontrack = (event) => {
      // Wichtig: nur EIN Remote-Audiostream.
      if (event.streams && event.streams[0]) {
        if (remoteAudio.srcObject !== event.streams[0]) {
          remoteAudio.srcObject = event.streams[0];
        }
      } else {
        const stream = new MediaStream([
          event.track
        ]);

        remoteAudio.srcObject = stream;
      }

      remoteAudio
        .play()
        .catch(() => {});
    };

    dc = pc.createDataChannel(
      "oai-events"
    );

    dc.onopen = () => {
      active = true;
      connecting = false;
      button.disabled = false;

      button.classList.add("active");

      setStatus("Online");
      log("JARVIS hört zu.");
    };

    dc.onclose = () => {
      if (active) {
        stopJarvis();
      }
    };

    dc.onerror = (error) => {
      console.error(
        "DataChannel error:",
        error
      );

      log(
        "Fehler in der Voice-Verbindung."
      );
    };

    dc.onmessage = async (message) => {
      let event;

      try {
        event =
          JSON.parse(message.data);
      } catch {
        return;
      }

      console.log(
        "Realtime event:",
        event.type
      );

      /*
       * Wenn du zu sprechen beginnst,
       * laufende JARVIS-Ausgabe abbrechen.
       */
      if (
        event.type ===
        "input_audio_buffer.speech_started"
      ) {
        interruptAssistant();
        log("Ich höre zu …");
      }

      if (
        event.type ===
        "input_audio_buffer.speech_stopped"
      ) {
        log("Denke nach …");
      }

      /*
       * JARVIS beginnt Audio auszugeben.
       */
      if (
        event.type ===
        "output_audio_buffer.started"
      ) {
        assistantSpeaking = true;
        log("JARVIS spricht.");
      }

      /*
       * Audio vollständig beendet.
       */
      if (
        event.type ===
          "output_audio_buffer.stopped" ||
        event.type ===
          "output_audio_buffer.cleared"
      ) {
        assistantSpeaking = false;

        if (active) {
          log("JARVIS hört zu.");
        }
      }

      /*
       * Tool-Aufruf.
       * Nur das DONE-Event verarbeiten.
       */
      if (
        event.type ===
        "response.function_call_arguments.done"
      ) {
        await runTool(event);
      }

      /*
       * Response beendet.
       */
      if (
        event.type ===
        "response.done"
      ) {
        const status =
          event.response?.status;

        if (
          status === "failed"
        ) {
          console.error(
            "Response failed:",
            event.response
          );

          log(
            "JARVIS konnte die Antwort nicht erzeugen."
          );
        }
      }

      /*
       * Serverfehler.
       */
      if (
        event.type === "error"
      ) {
        console.error(
          "Realtime error:",
          event
        );

        // Fehler durch absichtliches response.cancel
        // nicht unnötig groß anzeigen.
        const code =
          event.error?.code || "";

        if (
          code !==
          "response_cancel_not_active"
        ) {
          log(
            event.error?.message ||
              "JARVIS-Fehler."
          );
        }
      }
    };

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

    for (
      const track of
      localStream.getAudioTracks()
    ) {
      pc.addTrack(
        track,
        localStream
      );
    }

    const offer =
      await pc.createOffer();

    await pc.setLocalDescription(
      offer
    );

    const response =
      await fetch("/session", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/sdp"
        },
        body: offer.sdp
      });

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        errorText
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

    log(
      `Start fehlgeschlagen: ${error.message}`
    );
  } finally {
    connecting = false;
    button.disabled = false;
  }
}

function stopJarvis() {
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
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
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
    remoteAudio.srcObject = null;
  } catch {}

  pc = null;
  dc = null;
  localStream = null;

  active = false;
  connecting = false;
  assistantSpeaking = false;

  handledToolCalls.clear();

  button.disabled = false;
  button.classList.remove("active");

  setStatus("Offline");
  log("Verbindung beendet.");
}

button.addEventListener(
  "click",
  async () => {
    if (
      connecting
    ) {
      return;
    }

    if (active) {
      stopJarvis();
      return;
    }

    await startJarvis();
  }
);

/*
 * Wenn Safari die Seite verlässt,
 * Session sauber beenden.
 */
window.addEventListener(
  "pagehide",
  () => {
    stopJarvis();
  }
);
