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
let requestInProgress = false;

let transcriptBuffer = "";
let transcriptTimer = null;

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

/* =========================================================
   HELPERS
   ========================================================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function money(value, currency = "EUR") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

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

function setMicrophoneEnabled(enabled) {
  if (!localStream) return;

  for (const track of localStream.getAudioTracks()) {
    track.enabled = enabled;
  }
}

/* =========================================================
   RESPONSE CONTROL
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
   CLASSIFICATION
   ========================================================= */

function isShopifyQuery(text) {
  const t = normalize(text);

  return (
    /\bshopify\b/.test(t) ||
    /\bumsatz\b/.test(t) ||
    /\bbestellungen?\b/.test(t) ||
    /\bverkäufe?\b/.test(t) ||
    /\bverkauf\b/.test(t) ||
    /\bbestellwert\b/.test(t)
  );
}

function isEmailQuery(text) {
  const t = normalize(text);

  return (
    /\bmails?\b/.test(t) ||
    /\be mail\b/.test(t) ||
    /\bpostfach\b/.test(t)
  );
}

function isCalendarQuery(text) {
  const t = normalize(text);

  return (
    /\bkalender\b/.test(t) ||
    /\btermine?\b/.test(t) ||
    /\bwas steht heute an\b/.test(t)
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
   SPEAK
   ========================================================= */

function speakExact(text) {
  const sentence = String(text || "").trim();

  if (!sentence) return;

  safeSend({
    type: "response.create",

    response: {
      output_modalities: ["audio"],

      tool_choice: "none",

      max_output_tokens: 180,

      instructions:
        `Sprich ausschließlich auf Deutsch.

Sprich genau diesen Inhalt:

"${sentence}"

Kein zusätzlicher Kommentar.
Keine Rückfrage.
Danach schweigen.`
    }
  });
}

/* =========================================================
   SHOPIFY
   ========================================================= */

async function handleShopify(transcript) {
  const t = normalize(transcript);

  const period =
    /\bgestern\b/.test(t)
      ? "yesterday"
      : "today";

  setLog("Shopify wird abgefragt …");

  try {
    const response = await fetch(
      "/api/shopify-summary",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          period
        })
      }
    );

    const raw = await response.text();

    console.log(
      "SHOPIFY RESPONSE:",
      response.status,
      raw
    );

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: raw
      };
    }

    if (data.configured === false) {
      speakExact(
        data.message ||
        data.error ||
        "Mattl, Shopify ist noch nicht vollständig verbunden."
      );
      return;
    }

    if (!response.ok || data.error) {
      speakExact(
        "Mattl, Shopify ist erreichbar, aber die Datenabfrage ist fehlgeschlagen. Ich nenne deshalb keine erfundenen Zahlen."
      );
      return;
    }

    const orders = Number(
      data.orders || 0
    );

    const revenue = Number(
      data.revenue || 0
    );

    const average = Number(
      data.average_order_value || 0
    );

    const currency =
      data.currency || "EUR";

    const dayText =
      period === "yesterday"
        ? "Gestern"
        : "Heute";

    if (
      /\bwie viele\b/.test(t) &&
      /\bbestellungen?\b/.test(t)
    ) {
      speakExact(
        `${dayText} hast du ${orders} Shopify-Bestellungen.`
      );
      return;
    }

    if (
      /\bumsatz\b/.test(t) ||
      /\bverkauf\b/.test(t) ||
      /\bverkäufe\b/.test(t)
    ) {
      speakExact(
        `${dayText} hast du ${money(
          revenue,
          currency
        )} Shopify-Umsatz mit ${orders} Bestellungen. Der durchschnittliche Bestellwert beträgt ${money(
          average,
          currency
        )}.`
      );
      return;
    }

    speakExact(
      `${dayText} hast du ${orders} Shopify-Bestellungen mit ${money(
        revenue,
        currency
      )} Umsatz.`
    );

  } catch (error) {
    console.error(
      "Shopify Fetch Error:",
      error
    );

    speakExact(
      "Mattl, die Shopify-Verbindung ist gerade fehlgeschlagen."
    );
  }
}

/* =========================================================
   EMAIL
   ========================================================= */

async function handleEmails() {
  setLog("E-Mails werden geprüft …");

  try {
    const response = await fetch(
      "/api/important-emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          limit: 5
        })
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: raw
      };
    }

    if (data.configured === false) {
      speakExact(
        data.message ||
        "Mattl, Gmail ist noch nicht verbunden."
      );
      return;
    }

    if (!response.ok || data.error) {
      speakExact(
        "Mattl, ich konnte deine E-Mails gerade nicht zuverlässig abrufen."
      );
      return;
    }

    const emails =
      Array.isArray(data.emails)
        ? data.emails
        : [];

    if (!emails.length) {
      speakExact(
        "Mattl, ich habe aktuell keine wichtigen neuen E-Mails gefunden."
      );
      return;
    }

    const text =
      emails
        .slice(0, 3)
        .map(
          (mail, i) =>
            `${i + 1}. ${mail.from || "Unbekannter Absender"}, ${mail.subject || "ohne Betreff"}.`
        )
        .join(" ");

    speakExact(
      `Mattl, ich habe ${emails.length} relevante E-Mails gefunden. ${text}`
    );

  } catch (error) {
    console.error(error);

    speakExact(
      "Mattl, Gmail ist gerade nicht erreichbar."
    );
  }
}

/* =========================================================
   CALENDAR
   ========================================================= */

async function handleCalendar() {
  setLog("Kalender wird geprüft …");

  try {
    const response = await fetch(
      "/api/calendar-today",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: raw
      };
    }

    if (data.configured === false) {
      speakExact(
        data.message ||
        "Mattl, Google Kalender ist noch nicht verbunden."
      );
      return;
    }

    if (!response.ok || data.error) {
      speakExact(
        "Mattl, ich konnte deinen Kalender gerade nicht zuverlässig abrufen."
      );
      return;
    }

    const events =
      Array.isArray(data.events)
        ? data.events
        : [];

    if (!events.length) {
      speakExact(
        "Mattl, heute stehen keine Termine in deinem Kalender."
      );
      return;
    }

    const text =
      events
        .slice(0, 4)
        .map(
          event =>
            event.title ||
            event.summary ||
            "Termin"
        )
        .join(", ");

    speakExact(
      `Mattl, heute hast du ${events.length} Termine. ${text}.`
    );

  } catch (error) {
    console.error(error);

    speakExact(
      "Mattl, dein Kalender ist gerade nicht erreichbar."
    );
  }
}

/* =========================================================
   WEATHER
   ========================================================= */

function extractWeatherLocation(transcript) {
  const original =
    String(transcript || "").trim();

  const normalized =
    normalize(original);

  if (
    normalized.includes(
      "ludwigshafen"
    )
  ) {
    return "Ludwigshafen am Rhein";
  }

  const match =
    original.match(
      /\bin\s+(.+?)(?:\s+(?:heute|morgen))?[?.!,]*$/i
    );

  if (
    match &&
    match[1]
  ) {
    return match[1].trim();
  }

  return null;
}

async function handleWeather(
  transcript
) {
  const t =
    normalize(transcript);

  const day =
    /\bmorgen\b/.test(t)
      ? "tomorrow"
      : "today";

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

  setLog(
    "Wetter wird geprüft …"
  );

  try {
    const response =
      await fetch(
        "/api/weather",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            location,
            day
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
      data = {
        error: raw
      };
    }

    if (
      !response.ok ||
      data.error
    ) {
      speakExact(
        "Mattl, ich konnte das Wetter gerade nicht zuverlässig abrufen."
      );
      return;
    }

    const resolved =
      data.location?.name ||
      location;

    const forecast =
      data.forecast || {};

    const dayText =
      day === "tomorrow"
        ? "Morgen"
        : "Heute";

    speakExact(
      `${dayText} in ${resolved}: maximal ${forecast.max_temperature} Grad, minimal ${forecast.min_temperature} Grad. Regenwahrscheinlichkeit bis ${forecast.precipitation_probability} Prozent.`
    );

  } catch (error) {
    console.error(error);

    speakExact(
      "Mattl, die Wetterabfrage ist gerade fehlgeschlagen."
    );
  }
}

/* =========================================================
   GENERAL
   ========================================================= */

function handleGeneral(
  transcript
) {
  safeSend({
    type: "response.create",

    response: {
      output_modalities: [
        "audio"
      ],

      tool_choice: "none",

      max_output_tokens: 250,

      instructions:
        `Der Benutzer hat gesagt:

"${transcript}"

Antworte ausschließlich auf Deutsch.
Beantworte exakt die Frage.
Kurz und präzise.
Keine erfundenen Live-Daten.
Keine themenfremden Vorschläge.
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
    normalize(transcript);

  if (!text) {
    return;
  }

  if (requestInProgress) {
    return;
  }

  if (
    responseInProgress ||
    assistantSpeaking
  ) {
    cancelCurrentResponse();
  }

  requestInProgress = true;

  try {
    setLog(
      `Verstanden: ${transcript}`
    );

    if (
      isShopifyQuery(text)
    ) {
      await handleShopify(
        transcript
      );
      return;
    }

    if (
      isEmailQuery(text)
    ) {
      await handleEmails();
      return;
    }

    if (
      isCalendarQuery(text)
    ) {
      await handleCalendar();
      return;
    }

    if (
      isWeatherQuery(text)
    ) {
      await handleWeather(
        transcript
      );
      return;
    }

    handleGeneral(
      transcript
    );

  } finally {
    requestInProgress =
      false;
  }
}

/* =========================================================
   TRANSCRIPTION FALLBACK
   ========================================================= */

function resetTranscriptBuffer() {
  transcriptBuffer = "";

  if (transcriptTimer) {
    clearTimeout(
      transcriptTimer
    );
  }

  transcriptTimer = null;
}

function scheduleTranscriptFallback() {
  if (transcriptTimer) {
    clearTimeout(
      transcriptTimer
    );
  }

  transcriptTimer =
    setTimeout(
      async () => {
        const text =
          transcriptBuffer.trim();

        if (text) {
          resetTranscriptBuffer();

          await routeTranscript(
            text
          );
        }
      },
      900
    );
}

/* =========================================================
   GREETING
   ========================================================= */

function getGreeting() {
  const hour =
    Number(
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
    return "Guten Morgen, Mattl.";
  }

  if (
    hour >= 11 &&
    hour < 18
  ) {
    return "Guten Tag, Mattl.";
  }

  return "Guten Abend, Mattl.";
}

function requestGreeting() {
  greetingInProgress =
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

  connecting = true;
  button.disabled = true;

  resetTranscriptBuffer();

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
         * VAD bleibt aktiv,
         * aber OpenAI antwortet
         * NICHT automatisch.
         */
        safeSend({
          type:
            "session.update",

          session: {
            audio: {
              input: {
                transcription: {
                  model:
                    "gpt-4o-mini-transcribe",
                  language:
                    "de",
                  prompt:
                    "Deutsch. Druckelite24, Shopify, Bestellungen, Umsatz, E-Mail, Kalender und Wetter."
                },

                turn_detection: {
                  type:
                    "server_vad",

                  threshold:
                    0.75,

                  prefix_padding_ms:
                    300,

                  silence_duration_ms:
                    700,

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
          event.type,
          event
        );

        if (
          event.type ===
          "input_audio_buffer.speech_started"
        ) {
          resetTranscriptBuffer();

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

        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {
          setLog(
            "Verstehe …"
          );

          scheduleTranscriptFallback();
        }

        /*
         * INKREMENTELLE TRANSKRIPTION
         */
        if (
          event.type ===
          "conversation.item.input_audio_transcription.delta"
        ) {
          transcriptBuffer +=
            event.delta || "";

          setLog(
            `Verstanden: ${transcriptBuffer}`
          );

          scheduleTranscriptFallback();
        }

        /*
         * FERTIGE TRANSKRIPTION
         */
        if (
          event.type ===
          "conversation.item.input_audio_transcription.completed"
        ) {
          const transcript =
            String(
              event.transcript ||
              transcriptBuffer ||
              ""
            ).trim();

          resetTranscriptBuffer();

          if (transcript) {
            await routeTranscript(
              transcript
            );
          }

          return;
        }

        /*
         * TRANSKRIPTION FEHLGESCHLAGEN
         */
        if (
          event.type ===
          "conversation.item.input_audio_transcription.failed"
        ) {
          console.error(
            "Transcription failed:",
            event
          );

          setLog(
            "Spracherkennung fehlgeschlagen."
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

        if (
          event.type ===
          "response.done"
        ) {
          responseInProgress =
            false;

          if (
            event.response?.status ===
            "failed"
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
            setLog(
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
  resetTranscriptBuffer();

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
  requestInProgress = false;

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
