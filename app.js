const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

let recording = false;
let processing = false;

let history = [];

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

function setButtonActive(active) {
  if (!button) return;

  if (active) {
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

  if (!sentence) return;

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
      const error = await response.text();

      console.error(
        "Speech API error:",
        error
      );

      setLog(
        "Sprachausgabe fehlgeschlagen."
      );

      return;
    }

    const blob = await response.blob();

    const url =
      URL.createObjectURL(blob);

    remoteAudio.srcObject = null;
    remoteAudio.src = url;

    await remoteAudio.play();

    await new Promise(resolve => {
      remoteAudio.onended = resolve;
    });

    URL.revokeObjectURL(url);

    setLog(
      "Bereit."
    );

  } catch (error) {
    console.error(
      "Speak error:",
      error
    );

    setLog(
      "Sprachausgabe fehlgeschlagen."
    );
  }
}

async function transcribe(audioBlob) {
  setLog(
    "Verstehe …"
  );

  try {
    const response = await fetch(
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

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Transcription error:",
        data
      );

      throw new Error(
        data.error ||
        "Spracherkennung fehlgeschlagen."
      );
    }

    return String(
      data.text || ""
    ).trim();

  } catch (error) {
    console.error(
      "Transcription request error:",
      error
    );

    throw error;
  }
}

async function askJarvis(message) {
  setLog(
    "Denke nach …"
  );

  try {
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

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Ask API error:",
        data
      );

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
        "Leere Antwort von JARVIS."
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

  } catch (error) {
    console.error(
      "Ask request error:",
      error
    );

    throw error;
  }
}

async function processRecording(blob) {
  if (processing) return;

  processing = true;

  try {
    const transcript =
      await transcribe(blob);

    if (!transcript) {
      setLog(
        "Ich habe nichts verstanden."
      );

      processing = false;
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

  } finally {
    processing = false;
    setStatus("Online");
    setButtonActive(false);
  }
}

async function startRecording() {
  if (
    recording ||
    processing
  ) {
    return;
  }

  try {
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

    audioChunks = [];

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
        const blob =
          new Blob(
            audioChunks,
            {
              type:
                mediaRecorder.mimeType ||
                "audio/webm"
            }
          );

        if (mediaStream) {
          for (
            const track of
            mediaStream.getTracks()
          ) {
            track.stop();
          }
        }

        mediaStream = null;
        mediaRecorder = null;
        audioChunks = [];

        await processRecording(
          blob
        );
      };

    mediaRecorder.start();

    recording = true;

    setStatus(
      "Online"
    );

    setButtonActive(
      true
    );

    setLog(
      "Ich höre zu …"
    );

  } catch (error) {
    console.error(
      "Microphone error:",
      error
    );

    setStatus(
      "Offline"
    );

    setButtonActive(
      false
    );

    setLog(
      "Mikrofon konnte nicht gestartet werden."
    );
  }
}

function stopRecording() {
  if (
    !recording ||
    !mediaRecorder
  ) {
    return;
  }

  recording = false;

  setButtonActive(
    false
  );

  setLog(
    "Verarbeite …"
  );

  try {
    mediaRecorder.stop();
  } catch (error) {
    console.error(
      "Recorder stop error:",
      error
    );
  }
}

button.addEventListener(
  "click",
  async () => {
    if (processing) {
      return;
    }

    if (recording) {
      stopRecording();
      return;
    }

    await startRecording();
  }
);

window.addEventListener(
  "pagehide",
  () => {
    try {
      if (
        mediaRecorder &&
        mediaRecorder.state !==
          "inactive"
      ) {
        mediaRecorder.stop();
      }
    } catch {}

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
  }
);

window.addEventListener(
  "load",
  async () => {
    setStatus(
      "Online"
    );

    setLog(
      "Bereit."
    );

    try {
      await speak(
        getGreeting()
      );
    } catch {}
  }
);
