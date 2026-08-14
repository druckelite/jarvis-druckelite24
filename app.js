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

  switch (event.name) {
    case "get_shopify_summary":
      endpoint = "/api/shopify-summary";
      break;

    case "get_important_emails":
      endpoint = "/api/important-emails";
      break;

    case "get_calendar_today":
      endpoint = "/api/calendar-today";
      break;

    case "get_weather":
      endpoint = "/api/weather";
      break;

    case "remember_fact":
      endpoint = "/api/memory/remember";
      break;

    case "recall_memory":
      endpoint = "/api/memory/recall";
      break;
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

      const text = await response.text();

      try {
        result = JSON.parse(text);
      } catch {
        result = {
          ok: response.ok,
          message: text
        };
      }

      if (!response.ok) {
        result.http_status = response.status;
      }

    } catch (error) {
      console.error("Tool request error:", error);

      result = {
        error:
          "Die Live-Daten konnten nicht geladen werden."
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

  safeSend({
    type: "response.create"
  });
}

function interruptAssistant() {
  if (!assistantSpeaking) return;

  safeSend({
    type: "response.cancel"
  });

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
      const state = pc?.connectionState;

      console.log(
        "Peer connection:",
        state
      );

      if (
        state === "failed" ||
        state === "disconnected"
      ) {
        log(
          "Voice-Verbindung wurde unterbrochen."
        );
      }
    };

    pc.ontrack = event => {
      if (
        event.streams &&
        event.streams[0]
      ) {
        if (
          remoteAudio.srcObject !==
          event.streams[0]
        ) {
          remoteAudio.srcObject =
            event.streams[0];
        }
      } else {
        remoteAudio.srcObject =
          new MediaStream([
            event.track
          ]);
      }

      remoteAudio
        .play()
        .catch(() => {});
    };

    dc =
      pc.createDataChannel(
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

    dc.onerror = error => {
      console.error(
        "DataChannel error:",
        error
      );

      log(
        "Fehler in der Voice-Verbindung."
      );
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

        if (
          event.type ===
          "output_audio_buffer.started"
        ) {
          assistantSpeaking = true;
          log("JARVIS spricht.");
        }

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

        if (
          event.type ===
          "response.function_call_arguments.done"
        ) {
          await runTool(event);
        }

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

        if (
          event.type === "error"
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
            log(
              event.error?.message ||
                "JARVIS-Fehler."
            );
          }
        }
      };

    localStream =
      await navigator
        .mediaDevices
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
      await fetch(
        "/session",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/sdp"
          },
          body: offer.sdp
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
      pc.onconnectionstatechange =
        null;

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

window.addEventListener(
  "pagehide",
  () => {
    stopJarvis();
  }
);
