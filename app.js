const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

let audioContext = null;
let analyser = null;
let sourceNode = null;

let active = false;
let recording = false;
let processing = false;
let speaking = false;

let silenceTimer = null;
let monitorTimer = null;

let history = [];

const SILENCE_MS = 1100;
const SPEECH_THRESHOLD = 0.035;
const MIN_RECORDING_MS = 500;

let recordingStartedAt = 0;
let speechDetected = false;

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

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat(
      "de-DE",
      {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        hour12: false
      }
    ).format(new Date())
  );

  if (hour >= 5 && hour < 11) {
    return "Guten Morgen, Mattl.";
  }

  if (hour >= 11 && hour < 18) {
    return "Guten Tag, Mattl.";
  }

  return "Guten Abend, Mattl.";
}

async function speak(text) {
  const sentence = String(text || "").trim();

  if (!sentence || !active) {
    return;
  }

  speaking = true;
  processing = false;

  stopListeningMonitor();

  setLog("JARVIS spricht …");

  try {
    const response = await fetch(
      "/api/speak",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: sentence
        })
      }
    );

    if (!response.ok) {
      const raw = await response.text();

      console.error(
        "Speech API error:",
        raw
      );

      throw new Error(
        "Sprachausgabe fehlgeschlagen."
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    remoteAudio.srcObject = null;
    remoteAudio.src = url;

    await remoteAudio.play();

    await new Promise(resolve => {
      remoteAudio.onended = resolve;
    });

    URL.revokeObjectURL(url);

  } catch (error) {
    console.error(
      "Speak error:",
      error
    );

    setLog(
      error.message ||
      "Sprachausgabe fehlgeschlagen."
    );

  } finally {
    speaking = false;

    if (active) {
      await startContinuousListening();
    }
  }
}

async function transcribe(audioBlob) {
  setLog("Verstehe …");

  const response =
    await fetch(
      "/api/transcribe",
      {
        method: "POST",
        headers: {
          "Content-Type":
            audioBlob.type ||
            "audio/webm"
        },
        body: audioBlob
      }
    );

  const raw =
    await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "Spracherkennung hat eine ungültige Antwort geliefert."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Spracherkennung fehlgeschlagen."
    );
  }

  return String(
    data.text || ""
  ).trim();
}

async function askJarvis(message) {
  setLog("Denke nach …");

  const response =
    await fetch(
      "/api/ask",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          message,
          history
        })
      }
    );

  const raw =
    await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "JARVIS hat eine ungültige Serverantwort erhalten."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "JARVIS konnte die Anfrage nicht bearbeiten."
    );
  }

  const reply =
    String(
      data.reply || ""
    ).trim();

  if (!reply) {
    throw new Error(
      "JARVIS hat keine Antwort geliefert."
    );
  }

  history.push({
    role: "user",
    text: message
  });

  history.push({
    role: "assistant",
    text: reply
  });

  if (history.length > 12) {
    history =
      history.slice(-12);
  }

  return reply;
}

async function processRecording(blob) {
  if (
    processing ||
    !active
  ) {
    return;
  }

  processing = true;

  try {
    const transcript =
      await transcribe(blob);

    if (!transcript) {
      setLog("JARVIS hört zu.");

      processing = false;

      await startContinuousListening();

      return;
    }

    setLog(
      `Verstanden: ${transcript}`
    );

    const reply =
      await askJarvis(
        transcript
      );

    await speak(
      reply
    );

  } catch (error) {
    console.error(
      "Processing error:",
      error
    );

    setLog(
      error.message ||
      "Verarbeitung fehlgeschlagen."
    );

    processing = false;

    if (active) {
      setTimeout(
        () => {
          startContinuousListening();
        },
        700
      );
    }
  }
}

function getAudioLevel() {
  if (!analyser) {
    return 0;
  }

  const buffer =
    new Uint8Array(
      analyser.fftSize
    );

  analyser.getByteTimeDomainData(
    buffer
  );

  let sum = 0;

  for (
    let i = 0;
    i < buffer.length;
    i++
  ) {
    const value =
      (buffer[i] - 128) /
      128;

    sum +=
      value * value;
  }

  return Math.sqrt(
    sum / buffer.length
  );
}

function monitorSilence() {
  if (
    !active ||
    !recording ||
    processing ||
    speaking
  ) {
    return;
  }

  const level =
    getAudioLevel();

  if (
    level >
    SPEECH_THRESHOLD
  ) {
    speechDetected = true;

    setLog(
      "Ich höre zu …"
    );

    if (silenceTimer) {
      clearTimeout(
        silenceTimer
      );

      silenceTimer = null;
    }

  } else if (
    speechDetected &&
    !silenceTimer
  ) {
    silenceTimer =
      setTimeout(
        () => {
          stopRecordingAutomatically();
        },
        SILENCE_MS
      );
  }

  monitorTimer =
    requestAnimationFrame(
      monitorSilence
    );
}

function stopListeningMonitor() {
  if (monitorTimer) {
    cancelAnimationFrame(
      monitorTimer
    );

    monitorTimer = null;
  }

  if (silenceTimer) {
    clearTimeout(
      silenceTimer
    );

    silenceTimer = null;
  }
}

async function startContinuousListening() {
  if (
    !active ||
    recording ||
    processing ||
    speaking
  ) {
    return;
  }

  try {
    if (!mediaStream) {
      mediaStream =
        await navigator
          .mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1
            }
          });
    }

    if (!audioContext) {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      audioContext =
        new AudioContextClass();

      if (
        audioContext.state ===
        "suspended"
      ) {
        await audioContext.resume();
      }

      analyser =
        audioContext.createAnalyser();

      analyser.fftSize = 1024;

      sourceNode =
        audioContext.createMediaStreamSource(
          mediaStream
        );

      sourceNode.connect(
        analyser
      );
    }

    audioChunks = [];
    speechDetected = false;

    let mimeType = "";

    if (
      MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus"
      )
    ) {
      mimeType =
        "audio/webm;codecs=opus";

    } else if (
      MediaRecorder.isTypeSupported(
        "audio/webm"
      )
    ) {
      mimeType =
        "audio/webm";
    }

    mediaRecorder =
      mimeType
        ? new MediaRecorder(
            mediaStream,
            { mimeType }
          )
        : new MediaRecorder(
            mediaStream
          );

    mediaRecorder.ondataavailable =
      event => {
        if (
          event.data &&
          event.data.size > 0
        ) {
          audioChunks.push(
            event.data
          );
        }
      };

    mediaRecorder.onstop =
      async () => {
        const type =
          mediaRecorder?.mimeType ||
          "audio/webm";

        const blob =
          new Blob(
            audioChunks,
            {
              type
            }
          );

        mediaRecorder = null;
        audioChunks = [];

        recording = false;

        stopListeningMonitor();

        if (
          !active ||
          blob.size === 0
        ) {
          return;
        }

        await processRecording(
          blob
        );
      };

    recordingStartedAt =
      Date.now();

    mediaRecorder.start();

    recording = true;

    setStatus("Online");
    setButtonActive(true);

    setLog(
      "JARVIS hört zu."
    );

    monitorSilence();

  } catch (error) {
    console.error(
      "Continuous listening error:",
      error
    );

    setLog(
      "Mikrofon konnte nicht gestartet werden."
    );

    await stopJarvis();
  }
}

function stopRecordingAutomatically() {
  if (
    !recording ||
    !mediaRecorder ||
    mediaRecorder.state ===
      "inactive"
  ) {
    return;
  }

  const duration =
    Date.now() -
    recordingStartedAt;

  if (
    duration <
    MIN_RECORDING_MS
  ) {
    return;
  }

  stopListeningMonitor();

  setLog(
    "Verarbeite …"
  );

  try {
    mediaRecorder.stop();
  } catch (error) {
    console.error(
      "Automatic recorder stop error:",
      error
    );
  }
}

async function startJarvis() {
  if (
    active ||
    processing
  ) {
    return;
  }

  active = true;

  button.disabled = true;

  setStatus(
    "Online"
  );

  setButtonActive(
    true
  );

  setLog(
    "JARVIS startet …"
  );

  try {
    await speak(
      getGreeting()
    );

  } catch (error) {
    console.error(error);

  } finally {
    button.disabled = false;
  }
}

async function stopJarvis() {
  active = false;
  recording = false;
  processing = false;
  speaking = false;

  stopListeningMonitor();

  try {
    if (
      mediaRecorder &&
      mediaRecorder.state !==
        "inactive"
    ) {
      mediaRecorder.stop();
    }
  } catch {}

  mediaRecorder = null;

  try {
    if (mediaStream) {
      for (
        const track of
        mediaStream.getTracks()
      ) {
        track.stop();
      }
    }
  } catch {}

  mediaStream = null;

  try {
    if (sourceNode) {
      sourceNode.disconnect();
    }
  } catch {}

  sourceNode = null;
  analyser = null;

  try {
    if (audioContext) {
      await audioContext.close();
    }
  } catch {}

  audioContext = null;

  try {
    remoteAudio.pause();
    remoteAudio.src = "";
    remoteAudio.srcObject = null;
  } catch {}

  setButtonActive(false);
  setStatus("Offline");
  setLog("Bereit.");
}

button.addEventListener(
  "click",
  async () => {
    if (active) {
      await stopJarvis();
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
