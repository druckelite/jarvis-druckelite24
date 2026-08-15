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
let startupSoundPlaying = false;
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
   5 SEKUNDEN STARTSOUND
   ========================================================= */

async function playStartupSound() {
  if (startupSoundPlaying) return;

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
      0.20,
      now + 0.25
    );

    master.gain.setValueAtTime(
      0.20,
      now + 4.25
    );

    master.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 5
    );

    master.connect(ctx.destination);


    /*
     * Tiefer System-Grundton.
     */
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();

    bass.type = "sine";

    bass.frequency.setValueAtTime(
      52,
      now
    );

    bass.frequency.exponentialRampToValueAtTime(
      82,
      now + 4.7
    );

    bassGain.gain.setValueAtTime(
      0.0001,
      now
    );

    bassGain.gain.exponentialRampToValueAtTime(
      0.22,
      now + 0.3
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
     * Eigene futuristische Tonfolge.
     */
    const notes = [
      { time: 0.20, freq: 110.00, duration: 1.00 },
      { time: 0.90, freq: 146.83, duration: 1.00 },
      { time: 1.60, freq: 196.00, duration: 1.00 },
      { time: 2.35, freq: 246.94, duration: 1.00 },
      { time: 3.15, freq: 329.63, duration: 1.10 },
      { time: 4.05, freq: 493.88, duration: 0.75 }
    ];

    for (const note of notes) {
      const oscillator =
        ctx.createOscillator();

      const gain =
        ctx.createGain();

      oscillator.type = "triangle";

      oscillator.frequency.setValueAtTime(
        note.freq,
        now + note.time
      );

      gain.gain.setValueAtTime(
        0.0001,
        now + note.time
      );

      gain.gain.exponentialRampToValueAtTime(
        0.14,
        now + note.time + 0.06
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
     * Kurzer Abschluss-Chime.
     */
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();

    chime.type = "sine";

    chime.frequency.setValueAtTime(
      659.25,
      now + 4.3
    );

    chime.frequency.exponentialRampToValueAtTime(
      987.77,
      now + 4.8
    );

    chimeGain.gain.setValueAtTime(
      0.0001,
      now + 4.3
    );

    chimeGain.gain.exponentialRampToValueAtTime(
      0.12,
      now + 4.4
    );

    chimeGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 4.95
    );

    chime.connect(chimeGain);
    chimeGain.connect(master);

    chime.start(now + 4.3);
    chime.stop(now + 5);


    await new Promise(
      resolve =>
        setTimeout(resolve, 5000)
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
   MIKROFON
   ========================================================= */

function setMicrophoneEnabled(enabled) {
  if (!localStream) return;

  for (
    const track of
    localStream.getAudioTracks()
  ) {
    track.enabled = enabled;
  }
}


/* =========================================================
   ANTWORT ABBRECHEN
   ========================================================= */

function cancelCurrentResponse() {
  if (
    !assistantSpeaking &&
    !responseInProgress
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

  assistantSpeaking = false;
  responseInProgress = false;
}


/* =========================================================
   STARTBEGRÜSSUNG
   ========================================================= */

function requestStartupGreeting() {
  greetingInProgress = true;

  /*
   * Während der Begrüßung Mikrofon aus:
   * TV oder andere Personen können nicht dazwischenreden.
   */
  setMicrophoneEnabled(false);

  safeSend({
    type:
      "conversation.item.create",

    item: {
      type: "message",
      role: "user",

      content: [
        {
          type: "input_text",
          text:
            "Gib jetzt ausschließlich die in deinen Systemanweisungen festgelegte Startbegrüßung passend zur aktuellen Tageszeit aus. Danach nichts weiter sagen."
        }
      ]
    }
  });

  safeSend({
    type: "response.create"
  });
}


/* =========================================================
   TOOL CALLS
   ========================================================= */

async function runTool(event) {
  if (!event.call_id) return;

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

  let endpoint = null;

  if (
    event.name === "get_weather"
  ) {
    endpoint = "/api/weather";
  }

  if (!endpoint) {
    safeSend({
      type:
        "conversation.item.create",

      item: {
        type:
          "function_call_output",

        call_id:
          event.call_id,

        output:
          JSON.stringify({
            error:
              `Tool ${event.name} ist noch nicht aktiv.`
          })
      }
    });

    safeSend({
      type: "response.create"
    });

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
   * Tool-Ergebnis an Realtime zurückgeben.
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
   * Danach genau eine Folgeantwort.
   */
  safeSend({
    type: "response.create"
  });
}


/* =========================================================
   JARVIS START
   ========================================================= */

async function startJarvis() {
  if (
    active ||
    connecting ||
    startupSoundPlaying
  ) {
    return;
  }

  connecting = true;
  button.disabled = true;

  setStatus("Starte …");
  setLog(
    "JARVIS wird initialisiert."
  );

  handledToolCalls.clear();

  assistantSpeaking = false;
  responseInProgress = false;
  greetingInProgress = false;


  try {

    /*
     * 1. STARTSOUND
     */
    await playStartupSound();


    /*
     * 2. REALTIME VERBINDUNG
     */
    setStatus("Verbinde …");

    setLog(
      "Voice-System wird verbunden."
    );


    pc =
      new RTCPeerConnection();


    /*
     * Nur EIN Remote-Audio.
     */
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


    pc.onconnectionstatechange =
      () => {

        const state =
          pc?.connectionState;

        console.log(
          "Peer connection:",
          state
        );

        if (
          state === "failed" ||
          state ===
            "disconnected"
        ) {
          setLog(
            "Voice-Verbindung wurde unterbrochen."
          );
        }
      };


    dc =
      pc.createDataChannel(
        "oai-events"
      );


    /*
     * 3. VERBINDUNG OFFEN
     */
    dc.onopen =
      () => {

        active = true;
        connecting = false;

        button.disabled = false;

        button.classList.add(
          "active"
        );

        setStatus("Online");

        setLog(
          "JARVIS startet …"
        );


        /*
         * Automatische Tageszeit-Begrüßung.
         */
        requestStartupGreeting();
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


    /*
     * SERVER EVENTS
     */
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

          setLog(
            "Ich höre zu …"
          );
        }


        if (
          event.type ===
          "input_audio_buffer.speech_stopped"
        ) {
          setLog(
            "Denke nach …"
          );
        }


        if (
          event.type ===
          "response.created"
        ) {
          responseInProgress =
            true;
        }


        /*
         * JARVIS spricht.
         */
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


        /*
         * Audio ist wirklich vollständig abgespielt.
         */
        if (
          event.type ===
          "output_audio_buffer.stopped"
        ) {

          assistantSpeaking =
            false;


          /*
           * Startbegrüßung ist fertig.
           * Jetzt Mikrofon einschalten.
           */
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

          if (active) {
            setLog(
              "JARVIS hört zu."
            );
          }
        }


        /*
         * Fertiger Funktionsaufruf.
         */
        if (
          event.type ===
          "response.function_call_arguments.done"
        ) {
          await runTool(event);
        }


        /*
         * Modellantwort beendet.
         */
        if (
          event.type ===
          "response.done"
        ) {

          responseInProgress =
            false;

          const responseStatus =
            event.response?.status;

          if (
            responseStatus ===
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
     * 4. MIKROFON HOLEN
     */
    localStream =
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


    /*
     * Noch deaktiviert.
     * Erst nach der Begrüßung einschalten.
     */
    setMicrophoneEnabled(false);


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


    /*
     * 5. WEBRTC OFFER
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
    remoteAudio.srcObject = null;
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

  setStatus("Offline");
  setLog("Bereit.");
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
