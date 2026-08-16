/* DRUCKELITE24 · JARVIS APP V9.3 */

const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

let active = false;
let starting = false;
let stopping = false;

let peerConnection = null;
let dataChannel = null;
let micStream = null;

let realtimeConnected = false;
let assistantSpeaking = false;
let greetingInProgress = false;

const runningToolCalls = new Set();


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

let proactiveCheckTimer = null;
let proactiveFirstCheckTimer = null;
let reminderCheckTimer = null;

const PROACTIVE_CHECK_INTERVAL_MS =
  20 * 60 * 1000;

const PROACTIVE_FIRST_CHECK_DELAY_MS =
  2 * 60 * 1000;

const REMINDER_CHECK_INTERVAL_MS =
  60 * 1000;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio = null;
let introFadeTimer = null;

const INTRO_START = 4;
const INTRO_START_VOLUME = 0.28;
const INTRO_VOICE_DELAY_MS = 1800;
const INTRO_BACKGROUND_VOLUME = 0.025;
const INTRO_DUCK_DURATION_MS = 400;
const INTRO_FADE_DURATION_MS = 7000;


/* =========================================================
   AUDIO LEVELING
   ========================================================= */

let playbackAudioContext = null;
let playbackSourceNode = null;
let playbackCompressor = null;
let playbackGain = null;


async function ensurePlaybackAudioContext() {

  if (!playbackAudioContext) {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;


    if (!AudioContextClass) {
      return null;
    }


    playbackAudioContext =
      new AudioContextClass({
        latencyHint: "interactive"
      });
  }


  if (
    playbackAudioContext.state ===
    "suspended"
  ) {

    try {
      await playbackAudioContext.resume();

    } catch (error) {

      console.warn(
        "AudioContext resume:",
        error
      );
    }
  }


  return playbackAudioContext;
}


function disconnectProcessedPlayback() {

  try {
    playbackSourceNode?.disconnect();
  } catch {}


  try {
    playbackCompressor?.disconnect();
  } catch {}


  try {
    playbackGain?.disconnect();
  } catch {}


  playbackSourceNode = null;
  playbackCompressor = null;
  playbackGain = null;
}


async function connectProcessedPlayback(stream) {

  const context =
    await ensurePlaybackAudioContext();


  if (!context) {
    return false;
  }


  disconnectProcessedPlayback();


  playbackSourceNode =
    context.createMediaStreamSource(
      stream
    );


  playbackCompressor =
    context.createDynamicsCompressor();


  /*
   * Pegel ausgleichen:
   *
   * Leise Anfänge werden angehoben.
   * Laute Spitzen werden abgefangen.
   */

  playbackCompressor.threshold.value =
    -34;

  playbackCompressor.knee.value =
    18;

  playbackCompressor.ratio.value =
    5;

  playbackCompressor.attack.value =
    0.004;

  playbackCompressor.release.value =
    0.22;


  playbackGain =
    context.createGain();


  playbackGain.gain.value =
    1.18;


  playbackSourceNode
    .connect(
      playbackCompressor
    )
    .connect(
      playbackGain
    )
    .connect(
      context.destination
    );


  return true;
}


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function safeJsonParse(value) {

  try {

    return JSON.parse(
      value
    );

  } catch {

    return null;
  }
}


/* =========================================================
   UI
   ========================================================= */

function setStatus(text) {

  if (!statusEl) {
    return;
  }


  statusEl.textContent =
    text;


  statusEl.classList.toggle(
    "online",
    text === "Online"
  );
}


function setLog(text) {

  if (logEl) {
    logEl.textContent =
      text;
  }
}


function setButtonActive(value) {

  if (button) {

    button.classList.toggle(
      "active",
      Boolean(value)
    );
  }
}


function setJarvisState(state) {

  document.body.dataset.jarvisState =
    state;
}


/* =========================================================
   DRAFT PANEL
   ========================================================= */

function showDraft(draft) {

  const panel =
    document.getElementById(
      "draftPanel"
    );


  const subjectEl =
    document.getElementById(
      "draftSubject"
    );


  const bodyEl =
    document.getElementById(
      "draftBody"
    );


  if (
    !panel ||
    !subjectEl ||
    !bodyEl
  ) {

    return;
  }


  subjectEl.textContent =
    draft?.subject
      ? `Betreff: ${draft.subject}`
      : "";


  bodyEl.textContent =
    draft?.body || "";


  panel.style.display =
    "flex";
}


const draftCopyBtn =
  document.getElementById(
    "draftCopyBtn"
  );


if (draftCopyBtn) {

  draftCopyBtn.addEventListener(
    "click",

    async () => {

      const subject =
        document.getElementById(
          "draftSubject"
        )?.textContent || "";


      const body =
        document.getElementById(
          "draftBody"
        )?.textContent || "";


      try {

        await navigator.clipboard.writeText(
          `${subject}\n\n${body}`.trim()
        );


        const old =
          draftCopyBtn.textContent;


        draftCopyBtn.textContent =
          "Kopiert!";


        setTimeout(
          () => {

            draftCopyBtn.textContent =
              old;

          },
          1500
        );


      } catch (error) {

        console.warn(
          "Kopieren fehlgeschlagen:",
          error
        );
      }
    }
  );
}


/* =========================================================
   BERLIN TIME
   ========================================================= */

function getBerlinHour() {

  try {

    const parts =
      new Intl.DateTimeFormat(
        "de-DE",
        {
          timeZone:
            "Europe/Berlin",

          hour:
            "numeric",

          hourCycle:
            "h23"
        }
      ).formatToParts(
        new Date()
      );


    const hour =
      Number(
        parts.find(
          part =>
            part.type === "hour"
        )?.value
      );


    if (
      !Number.isNaN(hour)
    ) {

      return hour;
    }


  } catch (error) {

    console.warn(
      "Berlin-Zeit Fehler:",
      error
    );
  }


  return new Date()
    .getHours();
}


/* =========================================================
   GREETING
   ========================================================= */

function pickRandom(items) {

  return items[
    Math.floor(
      Math.random() *
      items.length
    )
  ];
}


function getGreeting() {

  const hour =
    getBerlinHour();


  /*
   * Sehr früh morgens
   */

  if (
    hour >= 5 &&
    hour < 8
  ) {

    return pickRandom([

      "Morgen, Mattl. Ich bin da. Wir starten ruhig, der Tag wird noch lang genug.",

      "Morgen, Mattl. Ich bin wach. Das sollte für uns beide erstmal reichen.",

      "Guten Morgen, Mattl. Schauen wir mal, was heute auf uns wartet.",

      "Morgen, Mattl. Kaffee wäre vermutlich keine schlechte Idee. Ich bin jedenfalls bereit."

    ]);
  }


  /*
   * Morgen
   */

  if (
    hour >= 8 &&
    hour < 11
  ) {

    return pickRandom([

      "Morgen, Mattl. Ich bin da. Was steht an?",

      "Morgen, Mattl. Dann schauen wir mal, was heute wieder brennt.",

      "Guten Morgen, Mattl. Was nehmen wir uns zuerst vor?",

      "Mattl, guten Morgen. Ich bin bereit. Der ruhige Teil des Tages dürfte damit vorbei sein."

    ]);
  }


  /*
   * Vormittag / Mittag
   */

  if (
    hour >= 11 &&
    hour < 14
  ) {

    return pickRandom([

      "Hey Mattl. Da bin ich. Was machen wir?",

      "Mattl, ich bin da. Was steht an?",

      "Hey Mattl. Was gibt es?",

      "Da bist du ja, Mattl. Ich hatte kurz Hoffnung auf einen entspannten Vormittag."

    ]);
  }


  /*
   * Nachmittag
   */

  if (
    hour >= 14 &&
    hour < 18
  ) {

    return pickRandom([

      "Hey Mattl. Was steht heute noch an?",

      "Mattl, da bin ich. Dann retten wir mal den Rest des Tages.",

      "Hey Mattl. Was nehmen wir uns als Nächstes vor?",

      "Mattl, ich bin bereit. Langweilig wird es vermutlich wieder nicht."

    ]);
  }


  /*
   * Früher Abend
   */

  if (
    hour >= 18 &&
    hour < 21
  ) {

    return pickRandom([

      "Abend, Mattl. Was liegt noch an?",

      "Mattl, ich bin da. Feierabend hat offenbar noch etwas Zeit.",

      "Hey Mattl. Noch eine Runde? Was machen wir?",

      "Abend, Mattl. Schauen wir mal, was wir heute noch erledigt bekommen."

    ]);
  }


  /*
   * Später Abend
   */

  if (
    hour >= 21 &&
    hour < 24
  ) {

    return pickRandom([

      "Abend, Mattl. Feierabend scheint heute wieder eher ein theoretisches Konzept zu sein.",

      "Mattl, ich bin da. Andere nennen das jetzt vermutlich Feierabend.",

      "Hey Mattl. Noch nicht genug für heute? Na gut, was liegt an?",

      "Mattl, da bin ich. Wir ignorieren die Uhr einfach gemeinsam."

    ]);
  }


  /*
   * Nacht
   */

  return pickRandom([

    "Mattl ... ernsthaft? Na gut. Ich bin da.",

    "Mattl, Schlaf wird offenbar weiterhin überschätzt. Was machen wir?",

    "Na gut, Mattl. Dann tun wir so, als wäre das eine normale Arbeitszeit.",

    "Mattl, es ist spät. Natürlich arbeiten wir noch. Was sonst."

  ]);
}


/* =========================================================
   INTRO
   ========================================================= */

function stopIntro() {

  if (introFadeTimer) {

    clearInterval(
      introFadeTimer
    );


    introFadeTimer =
      null;
  }


  if (introAudio) {

    try {
      introAudio.pause();
    } catch {}


    try {
      introAudio.currentTime =
        0;
    } catch {}


    introAudio =
      null;
  }
}


async function startIntro() {

  stopIntro();


  introAudio =
    new Audio(
      "/Intro.mp3?v=93"
    );


  introAudio.preload =
    "auto";


  introAudio.volume =
    INTRO_START_VOLUME;


  return new Promise(
    resolve => {

      let resolved =
        false;


      const done =
        () => {

          if (resolved) {
            return;
          }


          resolved =
            true;


          resolve();
        };


      const play =
        async () => {

          try {

            if (!introAudio) {

              done();

              return;
            }


            introAudio.currentTime =
              INTRO_START;


            await introAudio.play();


            done();


          } catch (error) {

            console.warn(
              "Intro Fehler:",
              error
            );


            done();
          }
        };


      introAudio.addEventListener(
        "loadedmetadata",
        play,
        {
          once: true
        }
      );


      introAudio.addEventListener(
        "error",
        done,
        {
          once: true
        }
      );


      if (
        introAudio.readyState >=
        1
      ) {

        play();
      }


      introAudio.load();
    }
  );
}


function duckIntro() {

  if (
    !introAudio ||
    introAudio.paused
  ) {

    return;
  }


  if (introFadeTimer) {

    clearInterval(
      introFadeTimer
    );


    introFadeTimer =
      null;
  }


  const original =
    introAudio.volume;


  const start =
    performance.now();


  introFadeTimer =
    setInterval(
      () => {

        if (!introAudio) {
          return;
        }


        const progress =
          Math.min(

            (
              performance.now() -
              start
            ) /
            INTRO_DUCK_DURATION_MS,

            1
          );


        const smooth =
          progress *
          progress *
          (
            3 -
            2 *
            progress
          );


        introAudio.volume =
          original -
          (
            original -
            INTRO_BACKGROUND_VOLUME
          ) *
          smooth;


        if (
          progress >= 1
        ) {

          clearInterval(
            introFadeTimer
          );


          introFadeTimer =
            null;


          fadeIntroOut();
        }

      },
      40
    );
}


function fadeIntroOut() {

  if (
    !introAudio ||
    introAudio.paused
  ) {

    return;
  }


  const start =
    performance.now();


  const volume =
    introAudio.volume;


  introFadeTimer =
    setInterval(
      () => {

        if (!introAudio) {
          return;
        }


        const progress =
          Math.min(

            (
              performance.now() -
              start
            ) /
            INTRO_FADE_DURATION_MS,

            1
          );


        introAudio.volume =
          Math.max(

            0,

            volume *
            Math.pow(
              1 -
              progress,
              1.7
            )
          );


        if (
          progress >= 1
        ) {

          clearInterval(
            introFadeTimer
          );


          introFadeTimer =
            null;


          try {
            introAudio.pause();
          } catch {}


          introAudio =
            null;
        }

      },
      60
    );
}


/* =========================================================
   MICROPHONE
   ========================================================= */

async function createMicrophoneStream() {

  if (
    !navigator.mediaDevices
      ?.getUserMedia
  ) {

    throw new Error(
      "Mikrofon wird von diesem Browser nicht unterstützt."
    );
  }


  micStream =
    await navigator.mediaDevices
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


  return micStream;
}


function setMicrophoneEnabled(
  enabled
) {

  if (!micStream) {
    return;
  }


  for (
    const track of
    micStream.getAudioTracks()
  ) {

    track.enabled =
      Boolean(enabled);
  }
}


function stopMicrophone() {

  if (!micStream) {
    return;
  }


  try {

    for (
      const track of
      micStream.getTracks()
    ) {

      track.stop();
    }

  } catch {}


  micStream =
    null;
}


/* =========================================================
   REALTIME SEND
   ========================================================= */

function sendRealtimeEvent(
  event
) {

  if (
    !dataChannel ||
    dataChannel.readyState !==
      "open"
  ) {

    console.warn(
      "DataChannel nicht offen:",
      event?.type
    );


    return false;
  }


  try {

    dataChannel.send(
      JSON.stringify(
        event
      )
    );


    return true;


  } catch (error) {

    console.error(
      "Realtime Sendefehler:",
      error
    );


    return false;
  }
}


/* =========================================================
   SPEECH
   ========================================================= */

function speakExactText(text) {

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
    return false;
  }


  return sendRealtimeEvent({

    type:
      "response.create",


    response: {

      output_modalities: [
        "audio"
      ],


      instructions:
        `Sprich genau diese kurze Begrüßung auf Deutsch. ` +
        `Gleichmäßig laut, ruhig, tief und flüssig. ` +
        `Natürliches Hochdeutsch ohne fremden Akzent. ` +
        `Füge nichts hinzu: ${clean}`
    }
  });
}


function speakProactiveNotice(
  text
) {

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
    return false;
  }


  return sendRealtimeEvent({

    type:
      "response.create",


    response: {

      output_modalities: [
        "audio"
      ],


      instructions:
        `Melde dich kurz und natürlich bei Mattl. ` +
        `Gleichmäßige Lautstärke und ruhiges Hochdeutsch. ` +
        `Keine technische Erklärung und keine zusätzliche Frage: ${clean}`
    }
  });
}


/* =========================================================
   TOOL CALLS
   ========================================================= */

async function executeRealtimeTool(
  event
) {

  const callId =
    String(
      event.call_id || ""
    );


  const toolName =
    String(
      event.name || ""
    );


  if (
    !callId ||
    !toolName ||
    runningToolCalls.has(
      callId
    )
  ) {

    return;
  }


  runningToolCalls.add(
    callId
  );


  setJarvisState(
    "thinking"
  );


  setLog(
    `${toolName} wird ausgeführt …`
  );


  let args = {};


  try {

    args =
      event.arguments
        ? JSON.parse(
            event.arguments
          )
        : {};

  } catch {}


  let toolResult;


  try {

    const response =
      await fetch(
        "/api/realtime-tool",
        {

          method:
            "POST",


          headers: {

            "Content-Type":
              "application/json"
          },


          body:
            JSON.stringify({

              name:
                toolName,

              arguments:
                args
            })
        }
      );


    const raw =
      await response.text();


    try {

      toolResult =
        JSON.parse(
          raw
        );

    } catch {

      toolResult = {

        ok:
          false,

        error:
          raw ||
          "Ungültige Tool-Antwort."
      };
    }


    if (
      !response.ok
    ) {

      toolResult = {

        ...toolResult,

        ok:
          false
      };
    }


    if (
      toolResult?.draft
    ) {

      showDraft(
        toolResult.draft
      );
    }


  } catch (error) {

    toolResult = {

      ok:
        false,

      error:
        error.message ||
        "Tool konnte nicht ausgeführt werden."
    };
  }


  sendRealtimeEvent({

    type:
      "conversation.item.create",


    item: {

      type:
        "function_call_output",

      call_id:
        callId,

      output:
        JSON.stringify(
          toolResult
        )
    }
  });


  sendRealtimeEvent({

    type:
      "response.create",


    response: {

      output_modalities: [
        "audio"
      ]
    }
  });


  runningToolCalls.delete(
    callId
  );
}


/* =========================================================
   REALTIME EVENTS
   ========================================================= */

function handleRealtimeEvent(
  event
) {

  if (!event?.type) {
    return;
  }


  console.log(
    "[REALTIME]",
    event.type
  );


  switch (
    event.type
  ) {


    case "input_audio_buffer.speech_started":

      if (
        !active ||
        greetingInProgress
      ) {
        return;
      }


      setJarvisState(
        "hearing"
      );


      setLog(
        "Ich höre zu …"
      );

      break;


    case "input_audio_buffer.speech_stopped":

      if (
        !active ||
        greetingInProgress
      ) {
        return;
      }


      setJarvisState(
        "thinking"
      );


      setLog(
        "Denke nach …"
      );

      break;


    case "response.function_call_arguments.done":

      executeRealtimeTool(
        event
      );

      break;


    case "response.created":

      assistantSpeaking =
        true;


      setJarvisState(
        "thinking"
      );


      setLog(
        "JARVIS denkt …"
      );

      break;


    case "response.output_audio.delta":

      assistantSpeaking =
        true;


      setJarvisState(
        "speaking"
      );


      setLog(
        "JARVIS spricht."
      );

      break;


    case "response.output_audio_transcript.done":

      if (
        event.transcript
      ) {

        console.log(
          "JARVIS:",
          event.transcript
        );
      }

      break;


    case "response.done": {

      assistantSpeaking =
        false;


      const hasFunctionCall =
        Array.isArray(
          event.response?.output
        ) &&
        event.response.output.some(
          item =>
            item?.type ===
            "function_call"
        );


      if (
        hasFunctionCall
      ) {

        setJarvisState(
          "thinking"
        );


        setLog(
          "Live-Daten werden geladen …"
        );


        break;
      }


      if (
        greetingInProgress
      ) {

        greetingInProgress =
          false;


        setMicrophoneEnabled(
          true
        );


        setJarvisState(
          "listening"
        );


        setLog(
          "JARVIS hört zu."
        );


        break;
      }


      if (
        active &&
        runningToolCalls.size ===
          0
      ) {

        setJarvisState(
          "listening"
        );


        setLog(
          "JARVIS hört zu."
        );
      }


      break;
    }


    case "error":

      console.error(
        "Realtime Fehler:",
        event
      );


      setLog(
        event.error?.message ||
        "Realtime Fehler."
      );

      break;
  }
}


/* =========================================================
   WEBRTC
   ========================================================= */

async function connectRealtime() {

  if (!micStream) {

    throw new Error(
      "Mikrofon wurde nicht gestartet."
    );
  }


  if (
    typeof RTCPeerConnection ===
    "undefined"
  ) {

    throw new Error(
      "WebRTC wird nicht unterstützt."
    );
  }


  peerConnection =
    new RTCPeerConnection();


  peerConnection.ontrack =
    async event => {

      if (!remoteAudio) {

        throw new Error(
          "#remoteAudio fehlt in index.html."
        );
      }


      const stream =
        event.streams?.[0] ||
        new MediaStream([
          event.track
        ]);


      remoteAudio.srcObject =
        stream;


      remoteAudio.autoplay =
        true;


      remoteAudio.playsInline =
        true;


      const processed =
        await connectProcessedPlayback(
          stream
        );


      if (processed) {

        /*
         * HTML-Audio stumm.
         * Wiedergabe läuft über AudioContext.
         */

        remoteAudio.muted =
          true;


        remoteAudio.volume =
          0;


      } else {

        /*
         * Fallback falls WebAudio
         * im Browser nicht funktioniert.
         */

        remoteAudio.muted =
          false;


        remoteAudio.volume =
          1;


        remoteAudio
          .play()
          .catch(
            error => {

              console.warn(
                "Remote Audio autoplay:",
                error
              );
            }
          );
      }
    };


  peerConnection
    .onconnectionstatechange =
    () => {

      const state =
        peerConnection
          ?.connectionState;


      console.log(
        "[WEBRTC]",
        state
      );


      if (
        (
          state === "failed" ||
          state === "disconnected"
        ) &&
        active &&
        !stopping
      ) {

        setStatus(
          "Verbindung verloren"
        );


        setJarvisState(
          "offline"
        );


        setLog(
          "Realtime-Verbindung unterbrochen."
        );
      }
    };


  const tracks =
    micStream.getAudioTracks();


  if (
    !tracks.length
  ) {

    throw new Error(
      "Keine Mikrofon-Audiospur."
    );
  }


  peerConnection.addTrack(
    tracks[0],
    micStream
  );


  dataChannel =
    peerConnection
      .createDataChannel(
        "oai-events"
      );


  dataChannel.addEventListener(
    "message",

    event => {

      const data =
        safeJsonParse(
          event.data
        );


      if (data) {

        handleRealtimeEvent(
          data
        );
      }
    }
  );


  const channelReady =
    new Promise(
      (
        resolve,
        reject
      ) => {

        const timeout =
          setTimeout(
            () => {

              reject(
                new Error(
                  "Realtime DataChannel wurde nicht geöffnet."
                )
              );

            },
            15000
          );


        dataChannel.addEventListener(
          "open",
          () => {

            clearTimeout(
              timeout
            );


            realtimeConnected =
              true;


            resolve();
          },
          {
            once: true
          }
        );


        dataChannel.addEventListener(
          "error",
          () => {

            clearTimeout(
              timeout
            );


            reject(
              new Error(
                "Realtime DataChannel Fehler."
              )
            );

          },
          {
            once: true
          }
        );
      }
    );


  const offer =
    await peerConnection
      .createOffer();


  if (
    !offer?.sdp ||
    !offer.sdp.startsWith(
      "v=0"
    )
  ) {

    throw new Error(
      "Browser hat kein gültiges SDP erzeugt."
    );
  }


  await peerConnection
    .setLocalDescription(
      offer
    );


  const response =
    await fetch(
      "/api/realtime-session",
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


  const answerSdp =
    await response.text();


  if (
    !response.ok
  ) {

    throw new Error(
      answerSdp ||
      `Realtime HTTP ${response.status}`
    );
  }


  if (
    !answerSdp.startsWith(
      "v=0"
    )
  ) {

    throw new Error(
      "Ungültiges SDP-Answer."
    );
  }


  await peerConnection
    .setRemoteDescription({

      type:
        "answer",

      sdp:
        answerSdp
    });


  await channelReady;
}


/* =========================================================
   DISCONNECT
   ========================================================= */

function disconnectRealtime() {

  realtimeConnected =
    false;


  runningToolCalls.clear();


  if (dataChannel) {

    try {
      dataChannel.close();
    } catch {}


    dataChannel =
      null;
  }


  if (peerConnection) {

    try {
      peerConnection.close();
    } catch {}


    peerConnection =
      null;
  }


  disconnectProcessedPlayback();


  if (remoteAudio) {

    try {
      remoteAudio.pause();
    } catch {}


    try {
      remoteAudio.srcObject =
        null;
    } catch {}


    remoteAudio.muted =
      true;


    remoteAudio.volume =
      0;
  }
}


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

async function runBackgroundCheck(
  url
) {

  if (
    !active ||
    !realtimeConnected ||
    greetingInProgress ||
    assistantSpeaking ||
    runningToolCalls.size
  ) {

    return;
  }


  try {

    const response =
      await fetch(
        url,
        {

          method:
            "POST",


          headers: {

            "Content-Type":
              "application/json"
          },


          body:
            "{}"
        }
      );


    if (
      !response.ok
    ) {

      return;
    }


    const data =
      await response.json();


    if (
      data?.ok &&
      data.hasNotice &&
      data.text
    ) {

      speakProactiveNotice(
        data.text
      );
    }


  } catch (error) {

    console.warn(
      "Background Check:",
      error
    );
  }
}


function checkProactiveNotice() {

  return runBackgroundCheck(
    "/api/jarvis-checkin"
  );
}


function checkDueReminders() {

  return runBackgroundCheck(
    "/api/jarvis-reminder-check"
  );
}


function startProactiveChecks() {

  stopProactiveChecks();


  proactiveFirstCheckTimer =
    setTimeout(
      checkProactiveNotice,
      PROACTIVE_FIRST_CHECK_DELAY_MS
    );


  proactiveCheckTimer =
    setInterval(
      checkProactiveNotice,
      PROACTIVE_CHECK_INTERVAL_MS
    );


  reminderCheckTimer =
    setInterval(
      checkDueReminders,
      REMINDER_CHECK_INTERVAL_MS
    );
}


function stopProactiveChecks() {

  if (
    proactiveFirstCheckTimer
  ) {

    clearTimeout(
      proactiveFirstCheckTimer
    );
  }


  if (
    proactiveCheckTimer
  ) {

    clearInterval(
      proactiveCheckTimer
    );
  }


  if (
    reminderCheckTimer
  ) {

    clearInterval(
      reminderCheckTimer
    );
  }


  proactiveFirstCheckTimer =
    null;


  proactiveCheckTimer =
    null;


  reminderCheckTimer =
    null;
}


/* =========================================================
   START
   ========================================================= */

async function startJarvis() {

  if (
    active ||
    starting ||
    stopping
  ) {

    return;
  }


  starting =
    true;


  if (button) {

    button.disabled =
      true;
  }


  setJarvisState(
    "connecting"
  );


  setStatus(
    "Verbinde …"
  );


  setButtonActive(
    true
  );


  setLog(
    "JARVIS startet …"
  );


  try {

    /*
     * AudioContext direkt beim
     * Button-Klick freischalten.
     */

    await ensurePlaybackAudioContext();


    await createMicrophoneStream();


    await startIntro();


    await connectRealtime();


    active =
      true;


    setStatus(
      "Online"
    );


    await sleep(
      INTRO_VOICE_DELAY_MS
    );


    if (!active) {
      return;
    }


    duckIntro();


    greetingInProgress =
      true;


    setJarvisState(
      "speaking"
    );


    setLog(
      "JARVIS meldet sich."
    );


    if (
      !speakExactText(
        getGreeting()
      )
    ) {

      throw new Error(
        "Begrüßung konnte nicht gestartet werden."
      );
    }


    startProactiveChecks();


  } catch (error) {

    console.error(
      "JARVIS Startfehler:",
      error
    );


    active =
      false;


    greetingInProgress =
      false;


    stopProactiveChecks();


    disconnectRealtime();


    stopMicrophone();


    stopIntro();


    setJarvisState(
      "offline"
    );


    setStatus(
      "Offline"
    );


    setButtonActive(
      false
    );


    setLog(
      `Start fehlgeschlagen: ${error.message}`
    );


  } finally {

    starting =
      false;


    if (button) {

      button.disabled =
        false;
    }
  }
}


/* =========================================================
   STOP
   ========================================================= */

async function stopJarvis() {

  if (stopping) {
    return;
  }


  stopping =
    true;


  active =
    false;


  starting =
    false;


  assistantSpeaking =
    false;


  greetingInProgress =
    false;


  stopProactiveChecks();


  setMicrophoneEnabled(
    false
  );


  disconnectRealtime();


  stopMicrophone();


  stopIntro();


  setButtonActive(
    false
  );


  setJarvisState(
    "offline"
  );


  setStatus(
    "Offline"
  );


  setLog(
    "Bereit."
  );


  if (button) {

    button.disabled =
      false;
  }


  stopping =
    false;
}


/* =========================================================
   INITIAL
   ========================================================= */

setJarvisState(
  "offline"
);


setStatus(
  "Offline"
);


setLog(
  "Bereit."
);


if (remoteAudio) {

  remoteAudio.autoplay =
    true;


  remoteAudio.playsInline =
    true;


  remoteAudio.muted =
    true;


  remoteAudio.volume =
    0;
}


/* =========================================================
   BUTTON
   ========================================================= */

if (button) {

  button.addEventListener(
    "click",

    async () => {

      if (
        starting ||
        stopping
      ) {

        return;
      }


      if (active) {

        await stopJarvis();

      } else {

        await startJarvis();
      }
    }
  );
}


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "pagehide",

  () => {

    stopJarvis();
  }
);
