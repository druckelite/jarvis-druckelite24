// web/src/voice/wakeword.ts
// Wake word detection and iOS tap-to-talk support.
//
// Architecture:
//   - WebRTC session stays CONNECTED but microphone track is MUTED
//   - Wake word detection toggles track.enabled = true (no reconnect = zero extra latency)
//   - On iOS Safari: Web Speech API unreliable; tap-to-talk is the PRIMARY path
//   - On desktop: wake word is the primary; tap-to-talk is the secondary

import { setMicEnabled, isMicEnabled } from "./session.js";

// Interfaces for Web Speech API (not always in DOM lib)
interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: { transcript: string; confidence: number };
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { length: number; [index: number]: SpeechRecognitionResult };
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

const WAKE_WORD = "hey jarvis";

let recognition: ISpeechRecognition | null = null;
let wakeWordActive = false;

export function startWakeWordDetection() {
  const SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognitionImpl) {
    // iOS or browser without Web Speech API -- tap-to-talk is the active path.
    console.info("[WakeWord] Web Speech API not available; tap-to-talk active.");
    return;
  }

  recognition = new SpeechRecognitionImpl();
  recognition.lang = "de-DE";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.toLowerCase().trim();
      if (transcript.includes(WAKE_WORD) || transcript.includes("jarvis")) {
        activateVoice();
        break;
      }
    }
  };

  recognition.onerror = (e: Event) => {
    console.warn("[WakeWord] Recognition error:", e);
  };

  recognition.onend = () => {
    if (wakeWordActive) {
      try { recognition?.start(); } catch { /* ignore */ }
    }
  };

  wakeWordActive = true;
  try { recognition.start(); } catch { /* ignore */ }
}

export function stopWakeWordDetection() {
  wakeWordActive = false;
  try { recognition?.stop(); } catch { /* ignore */ }
  recognition = null;
}

function activateVoice() {
  if (!isMicEnabled()) {
    setMicEnabled(true);
    updateTapButton(true);
    console.info("[WakeWord] Activated");
  }
}

// ---------------------------------------------------------------------------
// Tap-to-talk
// ---------------------------------------------------------------------------
let tapBtn: HTMLButtonElement | null = null;

export function initTapToTalk(buttonEl: HTMLButtonElement) {
  tapBtn = buttonEl;

  // Click toggles mic on/off.
  tapBtn.addEventListener("click", () => {
    const enabled = !isMicEnabled();
    setMicEnabled(enabled);
    updateTapButton(enabled);
  });

  // Touch: activate on touchstart (satisfies iOS user gesture requirement).
  tapBtn.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      e.preventDefault();
      setMicEnabled(true);
      updateTapButton(true);
    },
    { passive: false }
  );
}

function updateTapButton(active: boolean) {
  if (!tapBtn) return;
  tapBtn.setAttribute("aria-pressed", String(active));
  tapBtn.dataset["active"] = String(active);
  tapBtn.textContent = active ? "?? AKTIV" : "?? SPRECHEN";
}

