// web/src/voice/session.ts
// WebRTC voice session lifecycle for OpenAI Realtime API.
//
// State machine: idle -> listening -> thinking -> speaking -> idle
//                     \-> error, reconnecting
//
// Hard rules enforced here:
//   - Exactly ONE RTCPeerConnection at a time
//   - Exactly ONE active response at a time
//   - Barge-in: cancel in-flight response when user starts speaking
//   - Audio NEVER transits the backend — browser connects directly to OpenAI

export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "reconnecting";

type StateChangeCallback = (state: VoiceState, detail?: string) => void;

// ---------------------------------------------------------------------------
// Module-level state (single connection guard)
// ---------------------------------------------------------------------------
let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let micStream: MediaStream | null = null;
let audioEl: HTMLAudioElement | null = null;

let currentState: VoiceState = "idle";
let responseActive = false;
let currentResponseId: string | null = null;
const stateListeners: StateChangeCallback[] = [];

export function getState(): VoiceState {
  return currentState;
}

export function onStateChange(cb: StateChangeCallback): () => void {
  stateListeners.push(cb);
  return () => {
    const i = stateListeners.indexOf(cb);
    if (i !== -1) stateListeners.splice(i, 1);
  };
}

function setState(state: VoiceState, detail?: string) {
  currentState = state;
  stateListeners.forEach((cb) => cb(state, detail));
  document.body.dataset["jarvisState"] = state;
}

// ---------------------------------------------------------------------------
// Disconnect / teardown (must fully clean up before reconnecting)
// ---------------------------------------------------------------------------
export function disconnect() {
  if (dc) {
    try { dc.close(); } catch { /* ignore */ }
    dc = null;
  }
  if (pc) {
    pc.ontrack = null;
    pc.oniceconnectionstatechange = null;
    try { pc.close(); } catch { /* ignore */ }
    pc = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (audioEl) {
    audioEl.srcObject = null;
  }
  responseActive = false;
  currentResponseId = null;
  setState("idle");
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------
export async function connect(): Promise<void> {
  // Tear down any existing session first.
  if (pc !== null) {
    disconnect();
  }

  setState("reconnecting");

  // 1. Mint ephemeral token from our backend.
  let ephemeralSecret: string;
  let model: string;
  try {
    const resp = await fetch("/api/realtime/session", { method: "POST" });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? `Session endpoint returned ${resp.status}`);
    }
    const data = await resp.json();
    ephemeralSecret = data.client_secret?.value;
    model = data.model;
    if (!ephemeralSecret) throw new Error("No client_secret in session response");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setState("error", msg);
    throw err;
  }

  // 2. Get microphone.
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setState("error", "Mikrofon nicht verfügbar: " + msg);
    throw err;
  }

  // 3. Create peer connection.
  pc = new RTCPeerConnection();

  // Attach microphone track (initially enabled — wake word module controls this).
  for (const track of micStream.getTracks()) {
    pc.addTrack(track, micStream);
  }

  // 4. Create data channel for JSON events.
  dc = pc.createDataChannel("oai-events");
  dc.addEventListener("open", onDataChannelOpen);
  dc.addEventListener("message", onDataChannelMessage);
  dc.addEventListener("close", () => {
    if (currentState !== "idle") setState("error", "Datenkanal geschlossen");
  });

  // 5. Remote audio -> <audio> element.
  if (!audioEl) {
    audioEl = document.getElementById("remoteAudio") as HTMLAudioElement;
  }
  pc.addEventListener("track", (event) => {
    if (audioEl && event.streams[0]) {
      audioEl.srcObject = event.streams[0];
    }
  });

  // ICE failure handling.
  pc.addEventListener("iceconnectionstatechange", () => {
    if (
      pc?.iceConnectionState === "failed" ||
      pc?.iceConnectionState === "disconnected"
    ) {
      setState("error", "Verbindung unterbrochen");
    }
  });

  // 6. Create SDP offer.
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // 7. Send SDP offer directly to OpenAI (with ephemeral token).
  const sdpResp = await fetch(
    `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralSecret}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    }
  );

  if (!sdpResp.ok) {
    disconnect();
    setState("error", `OpenAI WebRTC ${sdpResp.status}`);
    throw new Error(`OpenAI SDP exchange failed: ${sdpResp.status}`);
  }

  const answerSdp = await sdpResp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  setState("listening");
}

// ---------------------------------------------------------------------------
// Data channel open — send session configuration
// ---------------------------------------------------------------------------
function onDataChannelOpen() {
  if (!dc) return;

  const vadSilenceMs = 600; // Could read from a meta tag injected by the server

  const sessionUpdate = {
    type: "session.update",
    session: {
      // German-locked instructions.
      instructions: [
        "Du bist JARVIS, der persönliche Geschäftsassistent von Druckelite24.",
        "Antworte IMMER auf Deutsch, egal in welcher Sprache du angesprochen wirst.",
        "Wechsle niemals die Sprache, auch wenn der Nutzer Englisch spricht.",
        "Halte deine Antworten kurz und gesprächsnatürlich.",
        "Lies Zahlen nicht als einzelne Ziffern vor.",
        "Wenn du Geschäftsdaten abrufst, fasse die wichtigsten Punkte zusammen.",
      ].join(" "),
      voice: "alloy", // OPENAI_VOICE default; set once, never changed
      input_audio_transcription: { model: "whisper-1", language: "de" },
      turn_detection: {
        type: "server_vad",
        silence_duration_ms: vadSilenceMs,
        create_response: true,
        interrupt_response: true, // Barge-in enabled
      },
      // Tools are registered by tools.ts after this.
    },
  };

  sendEvent(sessionUpdate);
}

// ---------------------------------------------------------------------------
// Data channel messages — state tracking
// ---------------------------------------------------------------------------
function onDataChannelMessage(event: MessageEvent) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(event.data as string) as Record<string, unknown>;
  } catch {
    return;
  }

  const type = msg["type"] as string;

  switch (type) {
    case "input_audio_buffer.speech_started":
      // User started speaking.
      if (responseActive && currentResponseId) {
        // Barge-in: cancel the current response.
        sendEvent({
          type: "response.cancel",
          response_id: currentResponseId,
        });
      }
      setState("listening");
      break;

    case "input_audio_buffer.speech_stopped":
      setState("thinking");
      break;

    case "response.created":
      responseActive = true;
      currentResponseId = (msg["response"] as Record<string, unknown>)?.["id"] as string ?? null;
      setState("thinking");
      break;

    case "response.audio.delta":
      // First audio chunk — transition to speaking.
      if (currentState !== "speaking") {
        setState("speaking");
      }
      break;

    case "response.done":
    case "response.cancelled":
      responseActive = false;
      currentResponseId = null;
      setState("listening");
      break;

    case "error":
      setState("error", (msg["error"] as Record<string, unknown>)?.["message"] as string ?? "Unbekannter Fehler");
      break;
  }
}

// ---------------------------------------------------------------------------
// Send a JSON event over the data channel
// ---------------------------------------------------------------------------
export function sendEvent(event: Record<string, unknown>) {
  if (dc && dc.readyState === "open") {
    dc.send(JSON.stringify(event));
  }
}

// ---------------------------------------------------------------------------
// Mute / unmute the microphone track (used by wake word module)
// ---------------------------------------------------------------------------
export function setMicEnabled(enabled: boolean) {
  if (micStream) {
    micStream.getTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }
}

export function isMicEnabled(): boolean {
  return micStream?.getTracks().some((t) => t.enabled) ?? false;
}
