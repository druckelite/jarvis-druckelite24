/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V10 · OPENAI REALTIME TEXT + ELEVENLABS STREAMING
   ========================================================= */


/* =========================================================
   DOM
   ========================================================= */

const button =
  document.querySelector(
    "#toggle"
  );

const statusEl =
  document.querySelector(
    "#status"
  );

const logEl =
  document.querySelector(
    "#log"
  );

const remoteAudio =
  document.querySelector(
    "#remoteAudio"
  );


/* =========================================================
   STATE
   ========================================================= */

let active =
  false;

let starting =
  false;

let stopping =
  false;

let peerConnection =
  null;

let dataChannel =
  null;

let micStream =
  null;

let realtimeConnected =
  false;

let assistantSpeaking =
  false;

let greetingInProgress =
  false;

let responseInProgress =
  false;

let currentResponseText =
  "";

let elevenSocket =
  null;

let elevenConnected =
  false;

let elevenReady =
  false;

let elevenClosing =
  false;

let elevenTokenData =
  null;

let elevenSessionId =
  0;

let elevenAudioQueue =
  [];

let elevenAudioPlaying =
  false;

let currentElevenAudio =
  null;

let currentElevenObjectUrl =
  null;

const runningToolCalls =
  new Set();


/* =========================================================
   BACKGROUND CHECKS
   ========================================================= */

let proactiveCheckTimer =
  null;

let proactiveFirstCheckTimer =
  null;

let reminderCheckTimer =
  null;

const PROACTIVE_CHECK_INTERVAL_MS =
  20 *
  60 *
  1000;

const PROACTIVE_FIRST_CHECK_DELAY_MS =
  2 *
  60 *
  1000;

const REMINDER_CHECK_INTERVAL_MS =
  60 *
  1000;


/* =========================================================
   INTRO
   ========================================================= */

let introAudio =
  null;

let introFadeTimer =
  null;

const INTRO_START =
  4;

const INTRO_START_VOLUME =
  0.26;

const INTRO_VOICE_DELAY_MS =
  900;

const INTRO_BACKGROUND_VOLUME =
  0.018;

const INTRO_DUCK_DURATION_MS =
  650;

const INTRO_FADE_DURATION_MS =
  15000;


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(
  ms
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function safeJsonParse(
  value
) {

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

function setStatus(
  text
) {

  if (
    !statusEl
  ) {
    return;
  }

  statusEl.textContent =
    text;

  statusEl.classList.toggle(
    "online",
    text ===
      "Online"
  );
}


function setLog(
  text
) {

  if (
    !logEl
  ) {
    return;
  }

  logEl.textContent =
    text;
}


function setButtonActive(
  value
) {

  if (
    !button
  ) {
    return;
  }

  button.classList.toggle(
    "active",
    Boolean(
      value
    )
  );
}


function setJarvisState(
  state
) {

  document.body
    .dataset
    .jarvisState =
    state;
}


/* =========================================================
   DRAFT PANEL
   ========================================================= */

function showDraft(
  draft
) {

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
    draft?.body ||
    "";

  panel.style.display =
    "flex";
}


const draftCopyBtn =
  document.getElementById(
    "draftCopyBtn"
  );

if (
  draftCopyBtn
) {

  draftCopyBtn.addEventListener(
    "click",
    async () => {

      const subjectEl =
        document.getElementById(
          "draftSubject"
        );

      const bodyEl =
        document.getElementById(
          "draftBody"
        );

      const fullText =
        `${subjectEl?.textContent || ""}\n\n${bodyEl?.textContent || ""}`
          .trim();

      try {

        await navigator.clipboard
          .writeText(
            fullText
          );

        const original =
          draftCopyBtn.textContent;

        draftCopyBtn.textContent =
          "Kopiert!";

        setTimeout(
          () => {

            draftCopyBtn.textContent =
              original;

          },
          1500
        );

      } catch (
        error
      ) {

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

    const formatter =
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
      );

    const parts =
      formatter.formatToParts(
        new Date()
      );

    const hourPart =
      parts.find(
        part =>
          part.type ===
          "hour"
      );

    const hour =
      Number(
        hourPart?.value
      );

    if (
      !Number.isNaN(
        hour
      )
    ) {
      return hour;
    }

  } catch (
    error
  ) {

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

function pickRandom(
  items
) {

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

  if (
    hour >= 11 &&
    hour < 14
  ) {

    return pickRandom([
      "Hey Mattl. Da bin ich. Was machen wir?",
      "Mattl, ich bin da. Was steht an?",
      "Hey Mattl. Was gibt's?",
      "Da bist du ja, Mattl. Ich hatte kurz Hoffnung auf einen entspannten Vormittag."
    ]);
  }

  if (
    hour >= 14 &&
    hour < 18
  ) {

    return pickRandom([
      "Hey Mattl. Was steht heute noch an?",
      "Mattl, da bin ich. Dann retten wir mal den Rest des Tages.",
      "Hey Mattl. Was nehmen wir uns als Nächstes vor?",
      "Mattl, ich bin bereit. Langweilig wird's vermutlich wieder nicht."
    ]);
  }

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

  if (
    introFadeTimer
  ) {

    clearInterval(
      introFadeTimer
    );

    introFadeTimer =
      null;
  }

  if (
    introAudio
  ) {

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
      "/Intro.mp3?v=100"
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

          if (
            resolved
          ) {
            return;
          }

          resolved =
            true;

          resolve();
        };

      const play =
        async () => {

          try {

            if (
              !introAudio
            ) {

              done();
              return;
            }

            introAudio.currentTime =
              INTRO_START;

            await introAudio.play();

            done();

          } catch (
            error
          ) {

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
          once:
            true
        }
      );

      introAudio.addEventListener(
        "error",
        done,
        {
          once:
            true
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

  if (
    introFadeTimer
  ) {

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

        if (
          !introAudio
        ) {

          clearInterval(
            introFadeTimer
          );

          introFadeTimer =
            null;

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
          progress >=
          1
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

        if (
          !introAudio
        ) {

          clearInterval(
            introFadeTimer
          );

          introFadeTimer =
            null;

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
          progress >=
          1
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
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
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

  if (
    !micStream
  ) {
    return;
  }

  for (
    const track of
    micStream.getAudioTracks()
  ) {

    track.enabled =
      Boolean(
        enabled
      );
  }

  console.log(
    "Mikrofon:",
    enabled
      ? "AN"
      : "AUS"
  );
}


function stopMicrophone() {

  if (
    !micStream
  ) {
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
   OPENAI REALTIME SEND
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

  } catch (
    error
  ) {

    console.error(
      "Realtime Sendefehler:",
      error
    );

    return false;
  }
}


/* =========================================================
   ELEVENLABS TOKEN
   ========================================================= */

async function fetchElevenLabsToken() {

  const response =
    await fetch(
      "/api/elevenlabs-token",
      {
        method:
          "GET",

        cache:
          "no-store"
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.ok ||
    !data?.token
  ) {

    throw new Error(
      data?.error ||
      "ElevenLabs-Token fehlt."
    );
  }

  elevenTokenData =
    data;

  return data;
}


/* =========================================================
   ELEVENLABS AUDIO QUEUE
   ========================================================= */

function base64ToBlob(
  base64,
  mimeType =
    "audio/mpeg"
) {

  const binary =
    atob(
      base64
    );

  const len =
    binary.length;

  const bytes =
    new Uint8Array(
      len
    );

  for (
    let i = 0;
    i < len;
    i++
  ) {

    bytes[i] =
      binary.charCodeAt(
        i
      );
  }

  return new Blob(
    [bytes],
    {
      type:
        mimeType
    }
  );
}


function clearElevenAudioQueue() {

  elevenAudioQueue =
    [];

  elevenAudioPlaying =
    false;

  if (
    currentElevenAudio
  ) {

    try {
      currentElevenAudio.pause();
    } catch {}

    currentElevenAudio =
      null;
  }

  if (
    currentElevenObjectUrl
  ) {

    try {
      URL.revokeObjectURL(
        currentElevenObjectUrl
      );
    } catch {}

    currentElevenObjectUrl =
      null;
  }
}


async function playNextElevenAudio() {

  if (
    elevenAudioPlaying
  ) {
    return;
  }

  const next =
    elevenAudioQueue.shift();

  if (
    !next
  ) {

    if (
      active &&
      !responseInProgress &&
      !assistantSpeaking &&
      !greetingInProgress &&
      runningToolCalls.size ===
        0
    ) {

      setJarvisState(
        "listening"
      );

      setLog(
        "JARVIS hört zu."
      );

      setMicrophoneEnabled(
        true
      );
    }

    return;
  }

  elevenAudioPlaying =
    true;

  assistantSpeaking =
    true;

  setJarvisState(
    "speaking"
  );

  setLog(
    "JARVIS spricht."
  );

  setMicrophoneEnabled(
    false
  );

  const blob =
    base64ToBlob(
      next,
      "audio/mpeg"
    );

  currentElevenObjectUrl =
    URL.createObjectURL(
      blob
    );

  currentElevenAudio =
    new Audio(
      currentElevenObjectUrl
    );

  currentElevenAudio.volume =
    1;

  currentElevenAudio.onended =
    () => {

      try {

        URL.revokeObjectURL(
          currentElevenObjectUrl
        );

      } catch {}

      currentElevenObjectUrl =
        null;

      currentElevenAudio =
        null;

      elevenAudioPlaying =
        false;

      if (
        elevenAudioQueue.length
      ) {

        playNextElevenAudio();

      } else {

        assistantSpeaking =
          false;

        if (
          greetingInProgress
        ) {

          greetingInProgress =
            false;
        }

        if (
          active &&
          !responseInProgress &&
          runningToolCalls.size ===
            0
        ) {

          setJarvisState(
            "listening"
          );

          setLog(
            "JARVIS hört zu."
          );

          setTimeout(
            () => {

              if (
                active &&
                !assistantSpeaking &&
                !responseInProgress
              ) {

                setMicrophoneEnabled(
                  true
                );
              }

            },
            300
          );
        }
      }
    };

  currentElevenAudio.onerror =
    error => {

      console.warn(
        "ElevenLabs Audio Fehler:",
        error
      );

      elevenAudioPlaying =
        false;

      currentElevenAudio =
        null;

      playNextElevenAudio();
    };

  try {

    await currentElevenAudio
      .play();

  } catch (
    error
  ) {

    console.warn(
      "ElevenLabs Audio autoplay:",
      error
    );

    elevenAudioPlaying =
      false;

    currentElevenAudio =
      null;
  }
}


/* =========================================================
   ELEVENLABS WEBSOCKET
   ========================================================= */

function disconnectElevenLabs() {

  elevenConnected =
    false;

  elevenReady =
    false;

  elevenClosing =
    true;

  if (
    elevenSocket
  ) {

    try {
      elevenSocket.close();
    } catch {}

    elevenSocket =
      null;
  }

  clearElevenAudioQueue();

  elevenTokenData =
    null;

  elevenClosing =
    false;
}


async function connectElevenLabs() {

  disconnectElevenLabs();

  const config =
    await fetchElevenLabsToken();

  const token =
    config.token;

  const voiceId =
    config.voice_id;

  const modelId =
    config.model_id ||
    "eleven_flash_v2_5";

  const languageCode =
    config.language_code ||
    "de";

  const url =
    new URL(
      `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input`
    );

  url.searchParams.set(
    "model_id",
    modelId
  );

  url.searchParams.set(
    "output_format",
    "mp3_44100_128"
  );

  url.searchParams.set(
    "authorization",
    `Bearer ${token}`
  );

  url.searchParams.set(
    "language_code",
    languageCode
  );

  elevenSessionId +=
    1;

  const sessionId =
    elevenSessionId;

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const socket =
        new WebSocket(
          url.toString()
        );

      elevenSocket =
        socket;

      const timeout =
        setTimeout(
          () => {

            if (
              !elevenConnected
            ) {

              try {
                socket.close();
              } catch {}

              reject(
                new Error(
                  "ElevenLabs WebSocket Timeout."
                )
              );
            }

          },
          10000
        );

      socket.onopen =
        () => {

          clearTimeout(
            timeout
          );

          if (
            sessionId !==
            elevenSessionId
          ) {
            return;
          }

          elevenConnected =
            true;

          elevenReady =
            true;

          socket.send(
            JSON.stringify({
              text:
                " ",

              voice_settings: {
                stability:
                  0.52,

                similarity_boost:
                  0.82,

                style:
                  0.18,

                use_speaker_boost:
                  true
              },

              generation_config: {
                chunk_length_schedule: [
                  40,
                  60,
                  90,
                  120
                ]
              },

              xi_api_key:
                undefined
            })
          );

          console.log(
            "ElevenLabs WebSocket verbunden."
          );

          resolve();
        };

      socket.onmessage =
        event => {

          if (
            sessionId !==
            elevenSessionId
          ) {
            return;
          }

          const data =
            safeJsonParse(
              event.data
            );

          if (
            !data
          ) {
            return;
          }

          if (
            data.audio
          ) {

            elevenAudioQueue.push(
              data.audio
            );

            playNextElevenAudio();
          }

          if (
            data.isFinal
          ) {

            console.log(
              "ElevenLabs Antwort fertig."
            );
          }
        };

      socket.onerror =
        error => {

          console.error(
            "ElevenLabs WebSocket Fehler:",
            error
          );

          if (
            !elevenConnected
          ) {

            clearTimeout(
              timeout
            );

            reject(
              new Error(
                "ElevenLabs-Verbindung fehlgeschlagen."
              )
            );
          }
        };

      socket.onclose =
        () => {

          elevenConnected =
            false;

          elevenReady =
            false;

          if (
            !elevenClosing
          ) {

            console.log(
              "ElevenLabs WebSocket geschlossen."
            );
          }
        };
    }
  );
}


/* =========================================================
   ELEVENLABS TEXT SEND
   ========================================================= */

function sendTextToElevenLabs(
  text
) {

  const clean =
    String(
      text ||
      ""
    );

  if (
    !clean
  ) {
    return;
  }

  if (
    !elevenSocket ||
    elevenSocket.readyState !==
      WebSocket.OPEN ||
    !elevenReady
  ) {

    console.warn(
      "ElevenLabs nicht bereit."
    );

    return;
  }

  try {

    elevenSocket.send(
      JSON.stringify({
        text:
          clean,

        try_trigger_generation:
          true
      })
    );

  } catch (
    error
  ) {

    console.error(
      "ElevenLabs Text Sendefehler:",
      error
    );
  }
}


function flushElevenLabs() {

  if (
    !elevenSocket ||
    elevenSocket.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  try {

    elevenSocket.send(
      JSON.stringify({
        text:
          ""
      })
    );

  } catch (
    error
  ) {

    console.warn(
      "ElevenLabs Flush:",
      error
    );
  }
}


/* =========================================================
   SPEAK TEXT DIRECTLY
   ========================================================= */

function speakTextWithElevenLabs(
  text
) {

  const clean =
    String(
      text ||
      ""
    )
      .trim();

  if (
    !clean
  ) {
    return false;
  }

  responseInProgress =
    true;

  setMicrophoneEnabled(
    false
  );

  sendTextToElevenLabs(
    `${clean} `
  );

  flushElevenLabs();

  responseInProgress =
    false;

  return true;
}


/* =========================================================
   TOOL CALL
   ========================================================= */

async function executeRealtimeTool(
  event
) {

  const callId =
    String(
      event.call_id ||
      ""
    );

  const toolName =
    String(
      event.name ||
      ""
    );

  if (
    !callId ||
    !toolName
  ) {

    console.error(
      "Ungültiger Tool Call:",
      event
    );

    return;
  }

  if (
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

  setMicrophoneEnabled(
    false
  );

  let args =
    {};

  try {

    args =
      event.arguments
        ? JSON.parse(
            event.arguments
          )
        : {};

  } catch {

    args =
      {};
  }

  console.log(
    "[TOOL]",
    toolName,
    args
  );

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

  } catch (
    error
  ) {

    console.error(
      "Tool Request Fehler:",
      error
    );

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

  responseInProgress =
    true;

  sendRealtimeEvent({
    type:
      "response.create",

    response: {
      output_modalities: [
        "text"
      ]
    }
  });

  runningToolCalls.delete(
    callId
  );
}


/* =========================================================
   REALTIME EVENT HANDLER
   ========================================================= */

function handleRealtimeEvent(
  event
) {

  if (
    !event?.type
  ) {
    return;
  }

  console.log(
    "[REALTIME]",
    event.type
  );

  switch (
    event.type
  ) {


    case "session.created":

      console.log(
        "Realtime Session erstellt."
      );

      break;


    case "session.updated":

      console.log(
        "Realtime Session aktualisiert."
      );

      break;


    case "input_audio_buffer.speech_started":

      if (
        !active ||
        greetingInProgress ||
        assistantSpeaking
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

      setMicrophoneEnabled(
        false
      );

      break;


    case "response.function_call_arguments.done":

      executeRealtimeTool(
        event
      );

      break;


    case "response.created":

      responseInProgress =
        true;

      currentResponseText =
        "";

      setJarvisState(
        "thinking"
      );

      setLog(
        "JARVIS denkt …"
      );

      break;


    case "response.output_text.delta":

      if (
        event.delta
      ) {

        const delta =
          String(
            event.delta
          );

        currentResponseText +=
          delta;

        sendTextToElevenLabs(
          delta
        );
      }

      break;


    case "response.output_text.done":

      if (
        event.text
      ) {

        console.log(
          "JARVIS:",
          event.text
        );
      }

      flushElevenLabs();

      break;


    case "response.done": {

      responseInProgress =
        false;

      const hasFunctionCall =
        Array.isArray(
          event.response
            ?.output
        ) &&
        event.response
          .output
          .some(
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
        !elevenAudioPlaying &&
        elevenAudioQueue.length ===
          0
      ) {

        if (
          greetingInProgress
        ) {

          greetingInProgress =
            false;
        }

        if (
          active
        ) {

          setJarvisState(
            "listening"
          );

          setLog(
            "JARVIS hört zu."
          );

          setTimeout(
            () => {

              if (
                active &&
                !assistantSpeaking &&
                !responseInProgress
              ) {

                setMicrophoneEnabled(
                  true
                );
              }

            },
            300
          );
        }
      }

      break;
    }


    case "error":

      console.error(
        "Realtime Fehler:",
        event
      );

      responseInProgress =
        false;

      assistantSpeaking =
        false;

      setLog(
        event.error?.message ||
        "Realtime Fehler."
      );

      if (
        active
      ) {

        setTimeout(
          () => {

            if (
              active &&
              !assistantSpeaking
            ) {

              setMicrophoneEnabled(
                true
              );

              setJarvisState(
                "listening"
              );
            }

          },
          500
        );
      }

      break;


    default:

      break;
  }
}/* =========================================================
   OPENAI REALTIME WEBRTC
   ========================================================= */

async function connectRealtime() {

  if (
    realtimeConnected
  ) {
    return;
  }


  const pc =
    new RTCPeerConnection();


  peerConnection =
    pc;


  /* ---------------------------------------------------------
     MICROPHONE TRACK
     --------------------------------------------------------- */

  if (
    !micStream
  ) {

    await createMicrophoneStream();
  }


  const micTrack =
    micStream
      .getAudioTracks()[0];


  if (
    !micTrack
  ) {

    throw new Error(
      "Kein Mikrofon-Audiotrack gefunden."
    );
  }


  pc.addTrack(
    micTrack,
    micStream
  );


  /* ---------------------------------------------------------
     DATA CHANNEL
     --------------------------------------------------------- */

  const dc =
    pc.createDataChannel(
      "oai-events"
    );


  dataChannel =
    dc;


  dc.addEventListener(
    "open",
    () => {

      console.log(
        "OpenAI DataChannel offen."
      );

      realtimeConnected =
        true;
    }
  );


  dc.addEventListener(
    "close",
    () => {

      console.log(
        "OpenAI DataChannel geschlossen."
      );

      realtimeConnected =
        false;
    }
  );


  dc.addEventListener(
    "error",
    error => {

      console.error(
        "OpenAI DataChannel Fehler:",
        error
      );
    }
  );


  dc.addEventListener(
    "message",
    event => {

      const message =
        safeJsonParse(
          event.data
        );


      if (
        !message
      ) {
        return;
      }


      handleRealtimeEvent(
        message
      );
    }
  );


  /* ---------------------------------------------------------
     CREATE OFFER
     --------------------------------------------------------- */

  const offer =
    await pc.createOffer();


  await pc.setLocalDescription(
    offer
  );


  /* ---------------------------------------------------------
     OPENAI SESSION
     --------------------------------------------------------- */

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
      "OpenAI Realtime Verbindung fehlgeschlagen."
    );
  }


  const answer =
    {

      type:
        "answer",

      sdp:
        answerSdp
    };


  await pc.setRemoteDescription(
    answer
  );


  /* ---------------------------------------------------------
     WAIT DATA CHANNEL
     --------------------------------------------------------- */

  const start =
    Date.now();


  while (
    !dataChannel ||
    dataChannel.readyState !==
      "open"
  ) {

    if (
      Date.now() -
        start >
      10000
    ) {

      throw new Error(
        "OpenAI DataChannel Timeout."
      );
    }


    await sleep(
      50
    );
  }


  realtimeConnected =
    true;


  console.log(
    "OpenAI Realtime verbunden."
  );
}


/* =========================================================
   DISCONNECT REALTIME
   ========================================================= */

function disconnectRealtime() {

  realtimeConnected =
    false;


  if (
    dataChannel
  ) {

    try {
      dataChannel.close();
    } catch {}

    dataChannel =
      null;
  }


  if (
    peerConnection
  ) {

    try {
      peerConnection.close();
    } catch {}

    peerConnection =
      null;
  }
}


/* =========================================================
   RESPONSE CANCEL
   ========================================================= */

function cancelCurrentResponse() {

  if (
    !responseInProgress
  ) {
    return;
  }


  sendRealtimeEvent({
    type:
      "response.cancel"
  });


  responseInProgress =
    false;

  currentResponseText =
    "";


  clearElevenAudioQueue();


  setJarvisState(
    "listening"
  );


  setLog(
    "JARVIS hört zu."
  );


  if (
    active
  ) {

    setMicrophoneEnabled(
      true
    );
  }
}


/* =========================================================
   DIRECT ASSISTANT TEXT
   ========================================================= */

function requestExactSpeech(
  text
) {

  const clean =
    String(
      text || ""
    )
      .trim();


  if (
    !clean
  ) {
    return;
  }


  if (
    !dataChannel ||
    dataChannel.readyState !==
      "open"
  ) {

    speakTextWithElevenLabs(
      clean
    );

    return;
  }


  currentResponseText =
    "";

  responseInProgress =
    true;


  sendRealtimeEvent({

    type:
      "response.create",

    response: {

      output_modalities: [
        "text"
      ],

      instructions:
        `Antworte exakt mit folgendem deutschen Text und mit nichts anderem:

${clean}`
    }
  });
}


/* =========================================================
   GREETING
   ========================================================= */

async function speakGreeting() {

  if (
    !active
  ) {
    return;
  }


  greetingInProgress =
    true;


  setMicrophoneEnabled(
    false
  );


  setJarvisState(
    "speaking"
  );


  setLog(
    "JARVIS startet …"
  );


  await sleep(
    INTRO_VOICE_DELAY_MS
  );


  if (
    !active
  ) {
    return;
  }


  const greeting =
    getGreeting();


  requestExactSpeech(
    greeting
  );


  duckIntro();
}


/* =========================================================
   PROACTIVE MESSAGE
   ========================================================= */

function speakProactiveMessage(
  text
) {

  if (
    !active ||
    greetingInProgress ||
    assistantSpeaking ||
    responseInProgress ||
    runningToolCalls.size >
      0
  ) {

    return false;
  }


  const clean =
    String(
      text || ""
    )
      .trim();


  if (
    !clean
  ) {
    return false;
  }


  setMicrophoneEnabled(
    false
  );


  requestExactSpeech(
    clean
  );


  return true;
}


/* =========================================================
   PROACTIVE CHECK
   ========================================================= */

async function runProactiveCheck() {

  if (
    !active ||
    greetingInProgress ||
    assistantSpeaking ||
    responseInProgress ||
    runningToolCalls.size >
      0
  ) {

    return;
  }


  try {

    const response =
      await fetch(
        "/api/jarvis-checkin",
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


    const data =
      await response.json();


    if (
      !response.ok ||
      !data?.hasNotice ||
      !data?.text
    ) {

      return;
    }


    speakProactiveMessage(
      data.text
    );


  } catch (
    error
  ) {

    console.warn(
      "Proactive Check Fehler:",
      error
    );
  }
}


/* =========================================================
   REMINDER CHECK
   ========================================================= */

async function runReminderCheck() {

  if (
    !active ||
    greetingInProgress ||
    assistantSpeaking ||
    responseInProgress
  ) {

    return;
  }


  try {

    const response =
      await fetch(
        "/api/jarvis-reminder-check",
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


    const data =
      await response.json();


    if (
      !response.ok ||
      !data?.hasNotice ||
      !data?.text
    ) {

      return;
    }


    speakProactiveMessage(
      data.text
    );


  } catch (
    error
  ) {

    console.warn(
      "Reminder Check Fehler:",
      error
    );
  }
}


/* =========================================================
   BACKGROUND TIMERS
   ========================================================= */

function startBackgroundChecks() {

  stopBackgroundChecks();


  proactiveFirstCheckTimer =
    setTimeout(
      () => {

        runProactiveCheck();

      },
      PROACTIVE_FIRST_CHECK_DELAY_MS
    );


  proactiveCheckTimer =
    setInterval(
      () => {

        runProactiveCheck();

      },
      PROACTIVE_CHECK_INTERVAL_MS
    );


  reminderCheckTimer =
    setInterval(
      () => {

        runReminderCheck();

      },
      REMINDER_CHECK_INTERVAL_MS
    );
}


function stopBackgroundChecks() {

  if (
    proactiveFirstCheckTimer
  ) {

    clearTimeout(
      proactiveFirstCheckTimer
    );

    proactiveFirstCheckTimer =
      null;
  }


  if (
    proactiveCheckTimer
  ) {

    clearInterval(
      proactiveCheckTimer
    );

    proactiveCheckTimer =
      null;
  }


  if (
    reminderCheckTimer
  ) {

    clearInterval(
      reminderCheckTimer
    );

    reminderCheckTimer =
      null;
  }
}


/* =========================================================
   USER INTERRUPTION

   Wenn Mattl spricht, während ElevenLabs noch redet,
   Audio sofort stoppen und alte Antwort abbrechen.
   ========================================================= */

function handleUserInterruption() {

  if (
    !active
  ) {
    return;
  }


  if (
    !assistantSpeaking &&
    !responseInProgress
  ) {
    return;
  }


  console.log(
    "Mattl unterbricht JARVIS."
  );


  cancelCurrentResponse();


  clearElevenAudioQueue();


  assistantSpeaking =
    false;

  greetingInProgress =
    false;


  setMicrophoneEnabled(
    true
  );


  setJarvisState(
    "hearing"
  );


  setLog(
    "Ich höre zu …"
  );
}


/* =========================================================
   MICROPHONE SPEECH INTERRUPTION

   OpenAI sendet speech_started.
   Wir hängen zusätzlich einen Listener in den Handler ein.
   ========================================================= */

const originalHandleRealtimeEvent =
  handleRealtimeEvent;


handleRealtimeEvent =
  function (
    event
  ) {

    if (
      event?.type ===
      "input_audio_buffer.speech_started"
    ) {

      if (
        assistantSpeaking ||
        responseInProgress
      ) {

        handleUserInterruption();
      }
    }


    originalHandleRealtimeEvent(
      event
    );
  };


/* =========================================================
   START JARVIS
   ========================================================= */

async function startJarvis() {

  if (
    active ||
    starting
  ) {
    return;
  }


  starting =
    true;

  stopping =
    false;


  setButtonActive(
    true
  );


  setStatus(
    "Verbinde …"
  );


  setJarvisState(
    "starting"
  );


  setLog(
    "JARVIS wird gestartet …"
  );


  try {

    /* Intro muss direkt aus dem Klick-Kontext starten,
       damit Browser Audio erlauben. */

    const introPromise =
      startIntro();


    /* Mikrofon */

    await createMicrophoneStream();


    /* ElevenLabs zuerst verbinden */

    setLog(
      "ElevenLabs wird verbunden …"
    );


    await connectElevenLabs();


    /* OpenAI Realtime */

    setLog(
      "OpenAI Realtime wird verbunden …"
    );


    await connectRealtime();


    await introPromise;


    active =
      true;


    setStatus(
      "Online"
    );


    setJarvisState(
      "online"
    );


    startBackgroundChecks();


    await speakGreeting();


  } catch (
    error
  ) {

    console.error(
      "JARVIS Startfehler:",
      error
    );


    setStatus(
      "Fehler"
    );


    setLog(
      error.message ||
      "JARVIS konnte nicht gestartet werden."
    );


    await stopJarvis(
      false
    );


  } finally {

    starting =
      false;
  }
}


/* =========================================================
   STOP JARVIS
   ========================================================= */

async function stopJarvis(
  updateUi =
    true
) {

  if (
    stopping
  ) {
    return;
  }


  stopping =
    true;


  active =
    false;

  greetingInProgress =
    false;

  assistantSpeaking =
    false;

  responseInProgress =
    false;


  stopBackgroundChecks();


  setMicrophoneEnabled(
    false
  );


  clearElevenAudioQueue();


  disconnectElevenLabs();


  disconnectRealtime();


  stopMicrophone();


  stopIntro();


  runningToolCalls.clear();


  if (
    updateUi
  ) {

    setButtonActive(
      false
    );


    setStatus(
      "Offline"
    );


    setJarvisState(
      "offline"
    );


    setLog(
      "JARVIS ist offline."
    );
  }


  stopping =
    false;
}


/* =========================================================
   TOGGLE BUTTON
   ========================================================= */

if (
  button
) {

  button.addEventListener(
    "click",
    async () => {

      if (
        starting ||
        stopping
      ) {
        return;
      }


      if (
        active
      ) {

        await stopJarvis();

      } else {

        await startJarvis();
      }
    }
  );
}


/* =========================================================
   PAGE CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    stopBackgroundChecks();

    clearElevenAudioQueue();

    disconnectElevenLabs();

    disconnectRealtime();

    stopMicrophone();

    stopIntro();
  }
);


/* =========================================================
   INITIAL UI
   ========================================================= */

setStatus(
  "Offline"
);


setJarvisState(
  "offline"
);


setButtonActive(
  false
);


setLog(
  "JARVIS ist bereit."
);


/* =========================================================
   VERSION
   ========================================================= */

console.log(
  "=============================================="
);


console.log(
  "JARVIS APP V10 · OPENAI REALTIME + ELEVENLABS"
);


console.log(
  "Realtime: TEXT"
);


console.log(
  "Voice Engine: ElevenLabs"
);


console.log(
  "=============================================="
);
