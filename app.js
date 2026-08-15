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
    console.warn("DataChannel ist nicht offen.");
    return false;
  }

  try {
    dc.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error(
      "DataChannel send error:",
      error
    );
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
   SPEAK EXACT TEXT
   ========================================================= */

function speakExact(text) {
  const sentence =
    String(text || "").trim();

  if (!sentence) return;

  console.log(
    "JARVIS soll sagen:",
    sentence
  );

  safeSend({
    type: "response.create",

    response: {
      output_modalities: ["audio"],

      tool_choice: "none",

      max_output_tokens: 160,

      instructions:
        `Sprich ausschließlich auf Deutsch.

Sprich exakt folgenden Inhalt und füge nichts hinzu:

"${sentence}"

Keine Rückfrage.
Kein zusätzlicher Kommentar.
Danach schweigen.`
    }
  });
}


/* =========================================================
   CLASSIFICATION
   ========================================================= */

function isShopifyQuery(text) {
  const t = normalize(text);

  return (
    /\bshopify\b/.test(t) ||
    /\bshop\b/.test(t) && /\b(umsatz|bestellung|verkauf|verkäufe)\b/.test(t) ||
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
   SHOPIFY
   ========================================================= */

async function handleShopify(transcript) {
  const t = normalize(transcript);

  const period =
    /\bgestern\b/.test(t)
      ? "yesterday"
      : "today";

  setLog(
    "Shopify wird abgefragt …"
  );

  console.log(
    "Direkter Shopify-Aufruf:",
    period
  );

  try {
    const response =
      await fetch(
        "/api/shopify-summary",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            period
          })
        }
      );

    const raw =
      await response.text();

    console.log(
      "Shopify HTTP:",
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


    /*
     * Shopify noch nicht verbunden.
     */
    if (
      data.configured === false
    ) {
      speakExact(
        data.message ||
        data.error ||
        "Mattl, Shopify ist momentan noch nicht vollständig verbunden."
      );

      return;
    }


    /*
     * HTTP- oder API-Fehler.
     */
    if (
      !response.ok ||
      data.error
    ) {
      console.error(
        "Shopify API Fehler:",
        data
      );

      speakExact(
        "Mattl, ich erreiche Shopify, aber die Abfrage ist fehlgeschlagen. Ich habe deshalb keine Zahlen erfunden."
      );

      return;
    }


    const orders =
      Number(
        data.orders || 0
      );

    const revenue =
      Number(
        data.revenue || 0
      );

    const currency =
      data.currency || "EUR";

    const average =
      Number(
        data.average_order_value || 0
      );

    const dayText =
      period === "yesterday"
        ? "Gestern"
        : "Heute";


    /*
     * Antwort abhängig von der Frage.
     */
    if (
      /\bwie viele\b/.test(t) ||
      /\banzahl\b/.test(t)
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
        `${dayText} hast du bei Shopify ${money(
          revenue,
          currency
        )} Umsatz mit ${orders} Bestellungen gemacht. Der durchschnittliche Bestellwert liegt bei ${money(
          average,
          currency
        )}.`
      );

      return;
    }


    speakExact(
      `${dayText} hast du ${orders} Shopify-Bestellungen mit insgesamt ${money(
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
      "Mattl, die Verbindung zu Shopify ist gerade fehlgeschlagen. Ich kann die aktuellen Daten deshalb nicht zuverlässig nennen."
    );
  }
}


/* =========================================================
   EMAIL
   ========================================================= */

async function handleEmails() {
  setLog(
    "E-Mails werden geprüft …"
  );

  try {
    const response =
      await fetch(
        "/api/important-emails",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            limit: 5
          })
        }
      );

    const raw =
      await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: raw
      };
    }

    if (
      data.configured === false
    ) {
      speakExact(
        data.message ||
        "Mattl, Gmail ist im Voice-JARVIS noch nicht verbunden."
      );

      return;
    }

    if (
      !response.ok ||
      data.error
    ) {
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

    const summaries =
      emails
        .slice(0, 3)
        .map((email, index) => {
          const sender =
            email.from || "unbekannter Absender";

          const subject =
            email.subject || "ohne Betreff";

          return `${index + 1}. ${sender}, Betreff: ${subject}.`;
        })
        .join(" ");

    speakExact(
      `Mattl, ich habe ${emails.length} relevante E-Mails gefunden. ${summaries}`
    );

  } catch (error) {
    console.error(
      "Email Fetch Error:",
      error
    );

    speakExact(
      "Mattl, die E-Mail-Verbindung ist gerade nicht erreichbar."
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
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({})
        }
      );

    const raw =
      await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: raw
      };
    }

    if (
      data.configured === false
    ) {
      speakExact(
        data.message ||
        "Mattl, Google Kalender ist im Voice-JARVIS noch nicht verbunden."
      );

      return;
    }

    if (
      !response.ok ||
      data.error
    ) {
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
        "Mattl, für heute stehen keine Termine in deinem Kalender."
      );

      return;
    }

    const summaries =
      events
        .slice(0, 4)
        .map(event => {
          return (
            event.title ||
            event.summary ||
            "Termin"
          );
        })
        .join(", ");

    speakExact(
      `Mattl, heute hast du ${events.length} Termine. ${summaries}.`
    );

  } catch (error) {
    console.error(
      "Calendar Fetch Error:",
      error
    );

    speakExact(
      "Mattl, die Kalenderverbindung ist gerade nicht erreichbar."
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

  /*
   * Bekannter häufiger Ort.
   */
  if (
    normalized.includes(
      "ludwigshafen"
    )
  ) {
    return "Ludwigshafen am Rhein";
  }

  /*
   * Einfacher Satz:
   * "Wetter in Mannheim morgen"
   */
  const match =
    original.match(
      /\bin\s+(.+?)(?:\s+(?:heute|morgen))?[?.!,]*$/i
    );

  if (match && match[1]) {
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
      data = JSON.parse(raw);
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

    const max =
      forecast.max_temperature;

    const min =
      forecast.min_temperature;

    const rain =
      forecast.precipitation_probability;

    const dayText =
      day === "tomorrow"
        ? "Morgen"
        : "Heute";

    speakExact(
      `${dayText} in ${resolved}: maximal ${max} Grad, minimal ${min} Grad. Die höchste Regenwahrscheinlichkeit liegt bei ${rain} Prozent.`
    );

  } catch (error) {
    console.error(
      "Weather Fetch Error:",
      error
    );

    speakExact(
      "Mattl, die Wetterabfrage ist gerade fehlgeschlagen."
    );
  }
}


/* =========================================================
   GENERAL ANSWER
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

Regeln:
- beantworte exakt die Frage
- kurz und präzise
- keine Reisen, Workouts oder andere themenfremde Vorschläge
- wenn du etwas nicht verstanden hast, frage kurz nach
- keine erfundenen Live-Daten
- keine automatische Anschlussfrage
- danach schweigen`
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

  if (!text) return;

  if (requestInProgress) {
    console.log(
      "Request läuft bereits."
    );
    return;
  }

  console.log(
    "TRANSKRIPTION:",
    transcript
  );

  if (
    responseInProgress ||
    assistantSpeaking
  ) {
    cancelCurrentResponse();
  }

  requestInProgress = true;

  try {
    if (
      isShopifyQuery(text)
    ) {
      console.log(
        "ROUTE => SHOPIFY"
      );

      await handleShopify(
        transcript
      );

      return;
    }

    if (
      isEmailQuery(text)
    ) {
      console.log(
        "ROUTE => EMAIL"
      );

      await handleEmails();

      return;
    }

    if (
      isCalendarQuery(text)
    ) {
      console.log(
        "ROUTE => CALENDAR"
      );

      await handleCalendar();

      return;
    }

    if (
      isWeatherQuery(text)
    ) {
      console.log(
        "ROUTE => WEATHER"
      );

      await handleWeather(
        transcript
      );

      return;
    }

    console.log(
      "ROUTE => GENERAL"
    );

    handleGeneral(
      transcript
    );

  } finally {
    /*
     * Bei direkten HTTP-Aufrufen können
     * wir wieder freigeben.
     *
     * Die eigentliche Audioantwort
     * läuft separat über Realtime.
     */
    requestInProgress = false;
  }
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
  greetingInProgress = true;

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
          .catch(error => {
            console.warn(
              "Audio play:",
              error
            );
          });
      };


    pc.onconnectionstatechange =
      () => {

        console.log(
          "Peer state:",
          pc?.connectionState
        );

        if (
          pc?.connectionState ===
          "failed"
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
      () => {

        console.log(
          "Realtime DataChannel offen."
        );

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
         *
         * VAD erkennt weiterhin
         * Anfang und Ende deiner Sprache.
         *
         * OpenAI soll aber NICHT
         * automatisch antworten.
         *
         * Erst unser Router entscheidet.
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

        console.log(
          "DataChannel geschlossen."
        );

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


        /*
         * Mattl beginnt zu sprechen.
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
         * Mattl hört auf.
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
         * DAS IST UNSER ROUTER-EVENT.
         *
         * Die Realtime-Transkription
         * ist jetzt fertig.
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

          await routeTranscript(
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


        if (
          event.type ===
          "output_audio_buffer.cleared"
        ) {

          assistantSpeaking =
            false;
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
     * Bis Begrüßung fertig:
     * Mikrofon aus.
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
     * WEBRTC OFFER
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
    remoteAudio.srcObject =
      null;
  } catch {}


  pc = null;
  dc = null;
  localStream = null;

  active = false;
  connecting = false;

  assistantSpeaking =
    false;

  responseInProgress =
    false;

  greetingInProgress =
    false;

  requestInProgress =
    false;


  button.disabled =
    false;

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
