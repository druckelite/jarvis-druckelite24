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
let toolResponsePending = false;
let startupSoundPlaying = false;

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

function log(text) {
  logEl.textContent = text;
}


/* =========================================================
   5-SECOND JARVIS STARTUP SOUND
   ========================================================= */

async function playStartupSound() {
  if (startupSoundPlaying) {
    return;
  }

  startupSoundPlaying = true;

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContextClass) {
    startupSoundPlaying = false;
    return;
  }

  let ctx;

  try {
    ctx = new AudioContextClass();

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    const master = ctx.createGain();

    master.gain.setValueAtTime(
      0.0001,
      now
    );

    master.gain.exponentialRampToValueAtTime(
      0.18,
      now + 0.25
    );

    master.gain.setValueAtTime(
      0.18,
      now + 4.25
    );

    master.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 5
    );

    master.connect(
      ctx.destination
    );


    /*
     * Tiefer technischer Grundton.
     */
    const bass =
      ctx.createOscillator();

    const bassGain =
      ctx.createGain();

    bass.type = "sine";

    bass.frequency.setValueAtTime(
      55,
      now
    );

    bass.frequency.exponentialRampToValueAtTime(
      82.4,
      now + 4.6
    );

    bassGain.gain.setValueAtTime(
      0.0001,
      now
    );

    bassGain.gain.exponentialRampToValueAtTime(
      0.20,
      now + 0.35
    );

    bassGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 4.9
    );

    bass.connect(bassGain);
    bassGain.connect(master);

    bass.start(now);
    bass.stop(now + 5);


    /*
     * Futuristische aufsteigende Töne.
     * Eigene Sequenz, keine kopierte Melodie.
     */
    const notes = [
      {
        time: 0.15,
        frequency: 110,
        duration: 1.25
      },
      {
        time: 0.85,
        frequency: 146.83,
        duration: 1.15
      },
      {
        time: 1.55,
        frequency: 196,
        duration: 1.10
      },
      {
        time: 2.35,
        frequency: 246.94,
        duration: 1.05
      },
      {
        time: 3.15,
        frequency: 329.63,
        duration: 1.30
      },
      {
        time: 4.00,
        frequency: 493.88,
        duration: 0.85
      }
    ];

    for (const note of notes) {
      const oscillator =
        ctx.createOscillator();

      const gain =
        ctx.createGain();

      oscillator.type =
        "triangle";

      oscillator.frequency.setValueAtTime(
        note.frequency,
        now + note.time
      );

      gain.gain.setValueAtTime(
        0.0001,
        now + note.time
      );

      gain.gain.exponentialRampToValueAtTime(
        0.16,
        now + note.time + 0.05
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.time + note.duration
      );

      oscillator.connect(gain);
      gain.connect(master);

      oscillator.start(
        now + note.time
      );

      oscillator.stop(
        now +
        note.time +
        note.duration
      );
    }


    /*
     * Kurzer Tech-Chime am Ende.
     */
    const endTone =
      ctx.createOscillator();

    const endGain =
      ctx.createGain();

    endTone.type = "sine";

    endTone.frequency.setValueAtTime(
      659.25,
      now + 4.35
    );

    endTone.frequency.exponentialRampToValueAtTime(
      987.77,
      now + 4.75
    );

    endGain.gain.setValueAtTime(
      0.0001,
      now + 4.3
    );

    endGain.gain.exponentialRampToValueAtTime(
      0.12,
      now + 4.4
    );

    endGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 4.95
    );

    endTone.connect(endGain);
    endGain.connect(master);

    endTone.start(
      now + 4.3
    );

    endTone.stop(
      now + 5
    );


    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          5000
        )
    );

  } catch (error) {
    console.error(
      "Startup sound error:",
      error
    );
  } finally {
    startupSoundPlaying = false;

    if (ctx) {
      try {
        await ctx.close();
      } catch {}
    }
  }
}


/* =========================================================
   REALTIME SEND
   ========================================================= */

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


/* =========================================================
   STOP CURRENT RESPONSE
   ========================================================= */

function cancelCurrentResponse() {
  if (
    !responseInProgress &&
    !assistantSpeaking
  ) {
    return;
  }

  safeSend({
    type: "response.cancel"
  });

  safeSend({
    type:
      "output_audio_buffer.clear"
  });

  responseInProgress = false;
  assistantSpeaking = false;
}


/* =========================================================
   TOOLS
   ========================================================= */

async function runTool(event) {
  if (!event.call_id) {
    return;
  }

  if (
    handledToolCalls.has(
      event.call_id
    )
  ) {
    return;
  }

  handledToolCalls.add(
    event.call_id
  );

  let endpoint = null;
  let payload = {};

  try {
    payload =
      event.arguments
        ? JSON.parse(
            event.arguments
          )
        : {};
  } catch {
    payload = {};
  }

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

    case "remember_fact":
      endpoint =
        "/api/memory/remember";
      break;

    case "recall_memory":
      endpoint =
        "/api/memory/recall";
      break;

    default:
      endpoint = null;
  }

  log(
    `Live-Daten: ${event.name}`
  );

  let result;

  if (!endpoint) {
    result = {
      error:
        `Unbekanntes Tool: ${event.name}`
    };
  } else {
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
          "Live-Daten konnten nicht geladen werden."
      };
    }
  }

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
   * Genau EINE Folgeantwort.
   */
  if (!toolResponsePending) {
    toolResponsePending = true;

    safeSend({
      type:
        "response.create"
    });
  }
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

  setStatus(
    "Starte …"
  );

  log(
    "JARVIS wird vorbereitet."
  );

  handledToolCalls.clear();

  responseInProgress = false;
  toolResponsePending = false;
  assistantSpeaking = false;

  try {

    /*
     * ZUERST unser eigener
     * 5-Sekunden-Startsound.
     */
    await playStartupSound();


    setStatus(
      "Verbinde …"
    );

    log(
      "Mikrofon wird vorbereitet."
    );


    pc =
      new RTCPeerConnection();


    pc.onconnectionstatechange =
      () => {
        const state =
          pc?.connectionState;

        console.log(
          "Peer connection:",
          state
        );

        if (
          state === "connected"
        ) {
          setStatus(
            "Online"
          );
        }

        if (
          state === "failed" ||
          state ===
            "disconnected" ||
          state === "closed"
        ) {
          log(
            "Voice-Verbindung wurde unterbrochen."
          );
        }
      };


    /*
     * Nur EIN Remote-Audio.
     */
    pc.ontrack =
      event => {
        if (
          event.streams?.[0]
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

        log(
          "JARVIS hört zu."
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


    dc.onerror =
      error => {
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

          log(
            "Ich höre zu …"
          );
        }


        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {
          log(
            "Denke nach …"
          );
        }


        /*
         * Antwort beginnt.
         */
        if (
          event.type ===
          "response.created"
        ) {
          responseInProgress =
            true;
        }


        /*
         * JARVIS beginnt zu sprechen.
         */
        if (
          event.type ===
          "output_audio_buffer.started"
        ) {
          assistantSpeaking =
            true;

          responseInProgress =
            true;

          log(
            "JARVIS spricht."
          );
        }


        /*
         * Audio beendet.
         */
        if (
          event.type ===
            "output_audio_buffer.stopped" ||
          event.type ===
            "output_audio_buffer.cleared"
        ) {
          assistantSpeaking =
            false;

          if (
            active &&
            !responseInProgress
          ) {
            log(
              "JARVIS hört zu."
            );
          }
        }


        /*
         * Fertiger Tool-Aufruf.
         */
        if (
          event.type ===
          "response.function_call_arguments.done"
        ) {
          await runTool(
            event
          );
        }


        /*
         * Antwort vollständig beendet.
         */
        if (
          event.type ===
          "response.done"
        ) {
          responseInProgress =
            false;

          toolResponsePending =
            false;

          const status =
            event.response
              ?.status;

          if (
            status ===
            "failed"
          ) {
            console.error(
              "Response failed:",
              event.response
            );

            log(
              "JARVIS konnte die Antwort nicht erzeugen."
            );

            return;
          }

          if (
            active &&
            !assistantSpeaking
          ) {
            log(
              "JARVIS hört zu."
            );
          }
        }


        /*
         * Serverfehler.
         */
        if (
          event.type ===
          "error"
        ) {
          console.error(
            "Realtime error:",
            event
          );

          const code =
            event.error
              ?.code || "";

          if (
            code !==
            "response_cancel_not_active"
          ) {
            log(
              event.error
                ?.message ||
              "JARVIS-Fehler."
            );
          }
        }
      };


    /*
     * Mikrofon.
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


    for (
      const track of
      localStream
        .getAudioTracks()
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


    const answerSdp =
      await response.text();


    await pc.setRemoteDescription({
      type:
        "answer",

      sdp:
        answerSdp
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


/* =========================================================
   STOP JARVIS
   ========================================================= */

function stopJarvis() {
  try {
    cancelCurrentResponse();
  } catch {}


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
        localStream
          .getTracks()
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

  toolResponsePending =
    false;

  handledToolCalls.clear();

  button.disabled = false;

  button.classList.remove(
    "active"
  );

  setStatus(
    "Offline"
  );

  log(
    "Bereit."
  );
}


/* =========================================================
   BUTTON
   ========================================================= */

button.addEventListener(
  "click",
  async () => {
    if (
      connecting ||
      startupSoundPlaying
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


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "pagehide",
  () => {
    stopJarvis();
  }
);
