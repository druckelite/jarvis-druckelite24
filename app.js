/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V10.3
   OPENAI REALTIME TEXT
   + ELEVENLABS WEBSOCKET
   + PCM 24 KHZ
   + WEB AUDIO
   + DEBUG HUD
   ========================================================= */


/* =========================================================
   DOM
   ========================================================= */

const button =
  document.querySelector("#toggle");

const statusEl =
  document.querySelector("#status");

const logEl =
  document.querySelector("#log");

const remoteAudio =
  document.querySelector("#remoteAudio");


/* =========================================================
   DEBUG HUD
   ========================================================= */

const debugHud =
  document.createElement("div");

debugHud.id =
  "jarvisDebugHud";

debugHud.style.position =
  "fixed";

debugHud.style.right =
  "15px";

debugHud.style.bottom =
  "15px";

debugHud.style.zIndex =
  "99999";

debugHud.style.background =
  "rgba(0,0,0,0.92)";

debugHud.style.color =
  "#00ff88";

debugHud.style.padding =
  "14px 16px";

debugHud.style.fontFamily =
  "monospace";

debugHud.style.fontSize =
  "13px";

debugHud.style.lineHeight =
  "1.65";

debugHud.style.border =
  "1px solid #00ff88";

debugHud.style.borderRadius =
  "10px";

debugHud.style.minWidth =
  "310px";

debugHud.style.maxWidth =
  "430px";

debugHud.style.wordBreak =
  "break-word";

debugHud.innerHTML = `
  <strong>JARVIS DEBUG V10.3</strong><br>
  OpenAI: <span id="dbgOpenAI">❌</span><br>
  ElevenLabs: <span id="dbgEleven">❌</span><br>
  Token: <span id="dbgToken">❌</span><br>
  Voice ID: <span id="dbgVoice">-</span><br>
  Socket: <span id="dbgSocket">-</span><br>
  OpenAI Text: <span id="dbgText">❌</span><br>
  ElevenLabs Audio: <span id="dbgAudio">❌</span><br>
  Wiedergabe: <span id="dbgPlayback">❌</span><br>
  Format: <span id="dbgFormat">pcm_24000</span><br>
  Close Code: <span id="dbgClose">-</span><br>
  Letztes Event: <span id="dbgEvent">Bereit</span>
`;

document.body.appendChild(
  debugHud
);


function debugSet(
  id,
  value
) {

  const el =
    document.getElementById(id);

  if (el) {
    el.textContent =
      String(value);
  }
}


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

const runningToolCalls =
  new Set();


/* =========================================================
   ELEVENLABS STATE
   ========================================================= */

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

let elevenKeepAliveTimer =
  null;


/* =========================================================
   WEB AUDIO / PCM STATE
   ========================================================= */

let audioContext =
  null;

let nextPlaybackTime =
  0;

let audioScheduleChain =
  Promise.resolve();

const scheduledAudioSources =
  new Set();

const ELEVEN_PCM_SAMPLE_RATE =
  24000;


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
  20 * 60 * 1000;

const PROACTIVE_FIRST_CHECK_DELAY_MS =
  2 * 60 * 1000;

const REMINDER_CHECK_INTERVAL_MS =
  60 * 1000;


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

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}


function safeJsonParse(value) {

  try {

    return JSON.parse(value);

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

  if (!logEl) {
    return;
  }

  logEl.textContent =
    text;
}


function setButtonActive(value) {

  if (!button) {
    return;
  }

  button.classList.toggle(
    "active",
    Boolean(value)
  );
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

      const subjectEl =
        document.getElementById(
          "draftSubject"
        );

      const bodyEl =
        document.getElementById(
          "draftBody"
        );

      const fullText =
        `${
          subjectEl?.textContent || ""
        }\n\n${
          bodyEl?.textContent || ""
        }`.trim();

      try {

        await navigator.clipboard
          .writeText(fullText);

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
          part.type === "hour"
      );

    const hour =
      Number(
        hourPart?.value
      );

    if (!Number.isNaN(hour)) {
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


function getGreetingAddress() {

  const roll =
    Math.random();

  if (roll < 0.40) {
    return "Mattl";
  }

  if (roll < 0.70) {
    return "Chef";
  }

  if (roll < 0.94) {
    return "Meister";
  }

  return "Daddy";
}


function getGreeting() {

  const hour =
    getBerlinHour();

  const roll =
    Math.random();

  let name;

  if (roll < 0.36) {
    name = "Mattl";
  }

  else if (roll < 0.66) {
    name = "Chef";
  }

  else if (roll < 0.92) {
    name = "Meister";
  }

  else {
    name = "Daddy";
  }


  if (
    hour >= 5 &&
    hour < 11
  ) {

    return pickRandom([

      `Systemcheck abgeschlossen. Kommandozentrale online. Guten Morgen, ${name}. JARVIS ist vollständig einsatzbereit. Heute machen wir keine halben Sachen.`,

      `Energieversorgung stabil. Systeme synchronisiert. Guten Morgen, ${name}. Die Welt schläft langsam aus. Wir sind ihr bereits einen Schritt voraus.`,

      `JARVIS online. Alle Systeme auf Grün. Guten Morgen, ${name}. Kaffee besorgst du. Den Rest erledigen wir gemeinsam.`,

      `Kommandozentrale aktiviert. Datenverbindungen stehen. Guten Morgen, ${name}. Heute wird nicht verwaltet. Heute wird angegriffen.`,

      `Systeme hochgefahren. Aufmerksamkeit bei einhundert Prozent. Guten Morgen, ${name}. Zeit, aus Ideen Ergebnisse zu machen.`,

      `Guten Morgen, ${name}. JARVIS meldet volle Einsatzbereitschaft. Systeme stabil. Ziele noch nicht definiert. Das ändern wir jetzt.`,

      `Verbindung hergestellt. Kommandozentrale bereit. Guten Morgen, ${name}. Mal sehen, wer heute versucht, uns aufzuhalten.`

    ]);
  }


  if (
    hour >= 11 &&
    hour < 18
  ) {

    return pickRandom([

      `Kommandozentrale online. Systeme synchronisiert. Willkommen zurück, ${name}. Sag mir, welches Problem heute zuerst kapitulieren soll.`,

      `JARVIS ist online. Datenströme aktiv. Systeme stabil. ${name}, du hast meine volle Aufmerksamkeit.`,

      `Verbindung steht. Systeme auf Grün. Willkommen zurück, ${name}. Geschäft, Werbung, Zahlen oder Chaos. Ich bin bereit.`,

      `Kommandozentrale aktiviert. ${name}, JARVIS meldet vollständige Einsatzbereitschaft. Gib mir ein Ziel.`,

      `Alle Systeme online. Analyse bereit. ${name}, wenn heute irgendwo Umsatz liegen bleibt, finden wir ihn.`,

      `Systemcheck abgeschlossen. Keine kritischen Fehler. Noch nicht. Willkommen zurück, ${name}. Was steht an?`,

      `JARVIS online. Kommandozentrale bereit. ${name}, heute machen wir entweder Fortschritt oder wenigstens einen beeindruckenden Versuch.`,

      `Verbindung hergestellt. Daten bereit. Geduld geladen. Willkommen zurück, ${name}. Nutzen wir sie, solange sie noch da ist.`,

      `${name}. JARVIS ist online. Systeme synchronisiert. Der Laden läuft. Jetzt sorgen wir dafür, dass er noch besser läuft.`

    ]);
  }


  if (
    hour >= 18 &&
    hour < 23
  ) {

    return pickRandom([

      `Nachtbetrieb wird vorbereitet. Kommandozentrale online. Guten Abend, ${name}. Andere machen Feierabend. Wir offenbar nicht.`,

      `Systeme synchronisiert. Abendmodus aktiv. Willkommen zurück, ${name}. Die zweite Halbzeit kann beginnen.`,

      `JARVIS online. Beleuchtung gedimmt. Rechenleistung unverändert. Guten Abend, ${name}. Was reißen wir heute noch ab?`,

      `Kommandozentrale aktiviert. Guten Abend, ${name}. Die meisten fahren jetzt runter. Wir gehen offensichtlich den anderen Weg.`,

      `Systemcheck abgeschlossen. Alles bereit. Guten Abend, ${name}. Wenn wir schon um diese Uhrzeit arbeiten, sollte es wenigstens spektakulär werden.`,

      `JARVIS meldet sich. Systeme auf Grün. Guten Abend, ${name}. Feierabend wurde für heute offenbar nicht genehmigt.`,

      `Verbindung hergestellt. Nachtbetrieb bereit. Guten Abend, ${name}. Zeit, noch etwas zu erledigen, das morgen niemand kommen sieht.`

    ]);
  }


  return pickRandom([

    `Nachtmodus aktiviert. Systeme online. ${name}, vernünftige Menschen schlafen jetzt. Das erklärt vermutlich, warum wir beide hier sind.`,

    `Kommandozentrale online. Uhrzeit kritisch. Einsatzbereitschaft trotzdem einhundert Prozent. Willkommen zurück, ${name}.`,

    `Systemcheck abgeschlossen. Die Stadt schläft. JARVIS nicht. ${name}, was bauen wir jetzt noch?`,

    `Nachtbetrieb aktiv. Systeme stabil. Vernunft auf Stand-by. ${name}, JARVIS ist bereit.`,

    `Verbindung hergestellt. Alles ruhig. Verdächtig ruhig. Willkommen zurück, ${name}. Was haben wir vor?`,

    `${name}. Es ist mitten in der Nacht. JARVIS ist online. Wenn das irgendwann groß wird, behaupten wir einfach, das sei alles Teil des Plans gewesen.`

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
      "/Intro.mp3?v=103"
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
        introAudio.readyState >= 1
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
            2 * progress
          );


        introAudio.volume =
          original -
          (
            original -
            INTRO_BACKGROUND_VOLUME
          ) *
          smooth;


        if (progress >= 1) {

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
              1 - progress,
              1.7
            )
          );


        if (progress >= 1) {

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
   WEB AUDIO
   ========================================================= */

async function ensureAudioContext() {

  if (!audioContext) {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;


    if (!AudioContextClass) {

      throw new Error(
        "Web Audio wird von diesem Browser nicht unterstützt."
      );
    }


    audioContext =
      new AudioContextClass();


    nextPlaybackTime =
      audioContext.currentTime;
  }


  if (
    audioContext.state ===
    "suspended"
  ) {

    await audioContext.resume();
  }


  return audioContext;
}


function base64ToUint8Array(base64) {

  const binary =
    atob(base64);


  const bytes =
    new Uint8Array(
      binary.length
    );


  for (
    let i = 0;
    i < binary.length;
    i++
  ) {

    bytes[i] =
      binary.charCodeAt(i);
  }


  return bytes;
}


function pcm16ToFloat32(bytes) {

  const sampleCount =
    Math.floor(
      bytes.byteLength / 2
    );


  const floats =
    new Float32Array(
      sampleCount
    );


  const view =
    new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    );


  for (
    let i = 0;
    i < sampleCount;
    i++
  ) {

    const sample =
      view.getInt16(
        i * 2,
        true
      );


    floats[i] =
      sample < 0
        ? sample / 32768
        : sample / 32767;
  }


  return floats;
}


function hasPendingElevenAudio() {

  if (
    scheduledAudioSources.size > 0
  ) {
    return true;
  }


  if (
    audioContext &&
    nextPlaybackTime >
      audioContext.currentTime +
      0.03
  ) {
    return true;
  }


  return false;
}


async function scheduleElevenPcm(
  base64
) {

  const ctx =
    await ensureAudioContext();


  const bytes =
    base64ToUint8Array(
      base64
    );


  if (
    bytes.byteLength < 2
  ) {
    return;
  }


  const samples =
    pcm16ToFloat32(
      bytes
    );


  if (
    samples.length === 0
  ) {
    return;
  }


  const buffer =
    ctx.createBuffer(
      1,
      samples.length,
      ELEVEN_PCM_SAMPLE_RATE
    );


  buffer
    .getChannelData(0)
    .set(samples);


  const source =
    ctx.createBufferSource();


  source.buffer =
    buffer;


  source.connect(
    ctx.destination
  );


  const startAt =
    Math.max(
      ctx.currentTime + 0.025,
      nextPlaybackTime
    );


  nextPlaybackTime =
    startAt +
    buffer.duration;


  scheduledAudioSources.add(
    source
  );


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


  debugSet(
    "dbgPlayback",
    "✅"
  );


  debugSet(
    "dbgEvent",
    "PCM Audio spielt"
  );


  source.onended =
    () => {

      scheduledAudioSources.delete(
        source
      );


      if (
        scheduledAudioSources.size === 0
      ) {

        const delayMs =
          Math.max(
            0,
            (
              nextPlaybackTime -
              ctx.currentTime
            ) * 1000
          );


        setTimeout(
          () => {

            if (
              scheduledAudioSources.size ===
                0 &&
              !responseInProgress
            ) {

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
            }

          },
          delayMs + 80
        );
      }
    };


  source.start(
    startAt
  );
}


function enqueueElevenAudio(
  base64
) {

  audioScheduleChain =
    audioScheduleChain
      .then(
        () =>
          scheduleElevenPcm(
            base64
          )
      )
      .catch(
        error => {

          console.error(
            "PCM Playback Fehler:",
            error
          );


          debugSet(
            "dbgPlayback",
            "❌"
          );


          debugSet(
            "dbgEvent",
            `PCM Fehler: ${
              error.message ||
              "unbekannt"
            }`
          );
        }
      );
}


function clearElevenAudio() {

  for (
    const source of
    scheduledAudioSources
  ) {

    try {
      source.stop();
    } catch {}
  }


  scheduledAudioSources.clear();


  if (audioContext) {

    nextPlaybackTime =
      audioContext.currentTime;
  } else {

    nextPlaybackTime =
      0;
  }


  audioScheduleChain =
    Promise.resolve();


  assistantSpeaking =
    false;
}


/* =========================================================
   MICROPHONE
   ========================================================= */

async function createMicrophoneStream() {

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices
      .getUserMedia
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


  console.log(
    "Mikrofon:",
    enabled
      ? "AN"
      : "AUS"
  );
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

  } catch (error) {

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

  debugSet(
    "dbgToken",
    "⏳"
  );


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


  let data;


  try {

    data =
      await response.json();

  } catch {

    throw new Error(
      "ElevenLabs Token-Antwort ist kein JSON."
    );
  }


  if (
    !response.ok ||
    !data?.ok ||
    !data?.token
  ) {

    debugSet(
      "dbgToken",
      "❌"
    );


    throw new Error(
      data?.error ||
      "ElevenLabs-Token fehlt."
    );
  }


  elevenTokenData =
    data;


  debugSet(
    "dbgToken",
    "✅"
  );


  debugSet(
    "dbgVoice",
    data.voice_id ||
    "FEHLT"
  );


  return data;
}


/* =========================================================
   ELEVENLABS KEEP ALIVE
   ========================================================= */

function stopElevenKeepAlive() {

  if (
    elevenKeepAliveTimer
  ) {

    clearInterval(
      elevenKeepAliveTimer
    );


    elevenKeepAliveTimer =
      null;
  }
}


function startElevenKeepAlive() {

  stopElevenKeepAlive();


  elevenKeepAliveTimer =
    setInterval(
      () => {

        if (
          elevenSocket &&
          elevenSocket.readyState ===
            WebSocket.OPEN &&
          elevenReady &&
          !responseInProgress
        ) {

          try {

            elevenSocket.send(
              JSON.stringify({
                text: " "
              })
            );

          } catch (error) {

            console.warn(
              "ElevenLabs Keepalive Fehler:",
              error
            );
          }
        }

      },
      120000
    );
}


/* =========================================================
   ELEVENLABS DISCONNECT
   ========================================================= */

function disconnectElevenLabs() {

  stopElevenKeepAlive();


  elevenConnected =
    false;


  elevenReady =
    false;


  elevenClosing =
    true;


  if (elevenSocket) {

    try {

      elevenSocket.close(
        1000,
        "JARVIS stop"
      );

    } catch {}


    elevenSocket =
      null;
  }


  elevenTokenData =
    null;


  setTimeout(
    () => {

      elevenClosing =
        false;

    },
    100
  );
}


/* =========================================================
   ELEVENLABS CONNECT
   ========================================================= */

async function connectElevenLabs() {

  disconnectElevenLabs();


  debugSet(
    "dbgEleven",
    "❌"
  );


  debugSet(
    "dbgSocket",
    "verbinde..."
  );


  debugSet(
    "dbgClose",
    "-"
  );


  debugSet(
    "dbgEvent",
    "ElevenLabs Token wird geladen"
  );


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


  if (!voiceId) {

    throw new Error(
      "ELEVENLABS_VOICE_ID fehlt."
    );
  }


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
    "pcm_24000"
  );


  url.searchParams.set(
    "single_use_token",
    token
  );


  url.searchParams.set(
    "language_code",
    languageCode
  );


  url.searchParams.set(
    "inactivity_timeout",
    "180"
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


      let settled =
        false;


      const timeout =
        setTimeout(
          () => {

            if (settled) {
              return;
            }


            settled =
              true;


            debugSet(
              "dbgSocket",
              "TIMEOUT"
            );


            debugSet(
              "dbgEvent",
              "ElevenLabs WebSocket Timeout"
            );


            try {
              socket.close();
            } catch {}


            reject(
              new Error(
                "ElevenLabs WebSocket Timeout."
              )
            );

          },
          12000
        );


      socket.onopen =
        () => {

          if (
            sessionId !==
            elevenSessionId
          ) {
            return;
          }


          clearTimeout(
            timeout
          );


          elevenConnected =
            true;


          elevenReady =
            true;


          debugSet(
            "dbgEleven",
            "✅"
          );


          debugSet(
            "dbgSocket",
            "OPEN"
          );


          debugSet(
            "dbgEvent",
            "ElevenLabs verbunden"
          );


          try {

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
                  50,
  70,
  100,
  140
                  ]
                }
              })
            );

          } catch (error) {

            console.error(
              "ElevenLabs Init Fehler:",
              error
            );


            debugSet(
              "dbgEvent",
              "ElevenLabs Init Sendefehler"
            );
          }


          startElevenKeepAlive();


          console.log(
            "ElevenLabs WebSocket verbunden."
          );


          if (!settled) {

            settled =
              true;

            resolve();
          }
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


          if (!data) {

            debugSet(
              "dbgEvent",
              "ElevenLabs Nachricht kein JSON"
            );

            return;
          }


          if (data.audio) {

            debugSet(
              "dbgAudio",
              "✅"
            );


            debugSet(
              "dbgEvent",
              "ElevenLabs PCM Audio kommt"
            );


            enqueueElevenAudio(
              data.audio
            );
          }


          if (
            data.isFinal ||
            data.is_final
          ) {

            debugSet(
              "dbgEvent",
              "ElevenLabs Generation fertig"
            );


            console.log(
              "ElevenLabs Generation fertig."
            );
          }


          if (data.error) {

            const errorText =
              typeof data.error ===
                "string"
                ? data.error
                : JSON.stringify(
                    data.error
                  );


            console.error(
              "ElevenLabs Serverfehler:",
              data.error
            );


            debugSet(
              "dbgEvent",
              `ELEVEN FEHLER: ${errorText}`
            );
          }
        };


      socket.onerror =
        error => {

          console.error(
            "ElevenLabs WebSocket Fehler:",
            error
          );


          debugSet(
            "dbgEleven",
            "❌"
          );


          debugSet(
            "dbgSocket",
            "ERROR"
          );


          debugSet(
            "dbgEvent",
            "ElevenLabs WebSocket Fehler"
          );


          if (!settled) {

            settled =
              true;


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
        event => {

          elevenConnected =
            false;


          elevenReady =
            false;


          stopElevenKeepAlive();


          debugSet(
            "dbgEleven",
            "❌"
          );


          debugSet(
            "dbgSocket",
            "CLOSED"
          );


          debugSet(
            "dbgClose",
            `${event.code}${
              event.reason
                ? ` · ${event.reason}`
                : ""
            }`
          );


          console.log(
            "ElevenLabs WebSocket geschlossen.",
            event.code,
            event.reason
          );


          if (!elevenClosing) {

            debugSet(
              "dbgEvent",
              `ElevenLabs geschlossen: ${
                event.code
              } ${
                event.reason || ""
              }`
            );
          }


          if (!settled) {

            settled =
              true;


            clearTimeout(
              timeout
            );


            reject(
              new Error(
                `ElevenLabs geschlossen: ${
                  event.code
                } ${
                  event.reason ||
                  ""
                }`
              )
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
      text || ""
    );


  if (!clean) {
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


    debugSet(
      "dbgEvent",
      "ElevenLabs nicht bereit für Text"
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

  } catch (error) {

    console.error(
      "ElevenLabs Text Sendefehler:",
      error
    );


    debugSet(
      "dbgEvent",
      "ElevenLabs Text Sendefehler"
    );
  }
}


/* =========================================================
   ELEVENLABS FLUSH
   ========================================================= */

function flushElevenLabs() {

  if (
    !elevenSocket ||
    elevenSocket.readyState !==
      WebSocket.OPEN ||
    !elevenReady
  ) {

    return;
  }


  try {

    /*
      WICHTIG:
      KEIN text:"" mehr.
      Leerer Text würde den Socket beenden.

      Leerzeichen + flush:true erzeugt den Rest
      der Sprache, ohne die Verbindung zu schließen.
    */

    elevenSocket.send(
      JSON.stringify({

        text:
          " ",

        flush:
          true
      })
    );


    debugSet(
      "dbgEvent",
      "ElevenLabs Flush gesendet"
    );

  } catch (error) {

    console.warn(
      "ElevenLabs Flush Fehler:",
      error
    );


    debugSet(
      "dbgEvent",
      "ElevenLabs Flush Fehler"
    );
  }
}


/* =========================================================
   DIRECT ELEVENLABS SPEECH
   ========================================================= */

function speakTextWithElevenLabs(
  text
) {

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
    return false;
  }


  if (
    !elevenReady ||
    !elevenSocket ||
    elevenSocket.readyState !==
      WebSocket.OPEN
  ) {

    debugSet(
      "dbgEvent",
      "Direkte Sprache: ElevenLabs nicht verbunden"
    );

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
      event.call_id || ""
    );


  const toolName =
    String(
      event.name || ""
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


  debugSet(
    "dbgEvent",
    `Tool: ${toolName}`
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
        JSON.parse(raw);

    } catch {

      toolResult = {

        ok:
          false,

        error:
          raw ||
          "Ungültige Tool-Antwort."
      };
    }


    if (!response.ok) {

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

  if (!event?.type) {
    return;
  }


  console.log(
    "[REALTIME]",
    event.type
  );


  switch (event.type) {


    case "session.created":

      debugSet(
        "dbgOpenAI",
        "✅"
      );


      debugSet(
        "dbgEvent",
        "OpenAI Session erstellt"
      );


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
        assistantSpeaking ||
        responseInProgress
      ) {

        handleUserInterruption();
      }


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


      debugSet(
        "dbgEvent",
        "Sprache erkannt"
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


      debugSet(
        "dbgEvent",
        "Sprache beendet"
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


      debugSet(
        "dbgEvent",
        "OpenAI erzeugt Antwort"
      );

      break;


    case "response.output_text.delta":

      if (event.delta) {

        const delta =
          String(
            event.delta
          );


        currentResponseText +=
          delta;


        debugSet(
          "dbgText",
          "✅"
        );


        debugSet(
          "dbgEvent",
          "OpenAI Text → ElevenLabs"
        );


        sendTextToElevenLabs(
          delta
        );
      }

      break;


    case "response.output_text.done":

      if (event.text) {

        console.log(
          "JARVIS:",
          event.text
        );
      }


      flushElevenLabs();


      debugSet(
        "dbgEvent",
        "OpenAI Text fertig · ElevenLabs Flush"
      );

      break;


    case "response.done": {

      responseInProgress =
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


      if (hasFunctionCall) {

        setJarvisState(
          "thinking"
        );


        setLog(
          "Live-Daten werden geladen …"
        );


        debugSet(
          "dbgEvent",
          "Tool wird verarbeitet"
        );


        break;
      }


      if (
        !hasPendingElevenAudio()
      ) {

        if (
          greetingInProgress
        ) {

          greetingInProgress =
            false;
        }


        if (active) {

          setTimeout(
            () => {

              if (
                active &&
                !assistantSpeaking &&
                !responseInProgress &&
                !hasPendingElevenAudio()
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

            },
            350
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


      debugSet(
        "dbgEvent",
        `OpenAI Fehler: ${
          event.error?.message ||
          "unbekannt"
        }`
      );


      setLog(
        event.error?.message ||
        "Realtime Fehler."
      );


      if (active) {

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
}


/* =========================================================
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


  if (!micStream) {

    await createMicrophoneStream();
  }


  const micTrack =
    micStream
      .getAudioTracks()[0];


  if (!micTrack) {

    throw new Error(
      "Kein Mikrofon-Audiotrack gefunden."
    );
  }


  pc.addTrack(
    micTrack,
    micStream
  );


  const dc =
    pc.createDataChannel(
      "oai-events"
    );


  dataChannel =
    dc;


  dc.addEventListener(
    "open",
    () => {

      realtimeConnected =
        true;


      debugSet(
        "dbgOpenAI",
        "✅"
      );


      debugSet(
        "dbgEvent",
        "OpenAI DataChannel offen"
      );


      console.log(
        "OpenAI DataChannel offen."
      );
    }
  );


  dc.addEventListener(
    "close",
    () => {

      realtimeConnected =
        false;


      debugSet(
        "dbgOpenAI",
        "❌"
      );


      console.log(
        "OpenAI DataChannel geschlossen."
      );
    }
  );


  dc.addEventListener(
    "error",
    error => {

      console.error(
        "OpenAI DataChannel Fehler:",
        error
      );


      debugSet(
        "dbgOpenAI",
        "❌"
      );


      debugSet(
        "dbgEvent",
        "OpenAI DataChannel Fehler"
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


      if (!message) {
        return;
      }


      handleRealtimeEvent(
        message
      );
    }
  );


  const offer =
    await pc.createOffer();


  await pc.setLocalDescription(
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


  if (!response.ok) {

    debugSet(
      "dbgEvent",
      "OpenAI Session Fehler"
    );


    throw new Error(
      answerSdp ||
      "OpenAI Realtime Verbindung fehlgeschlagen."
    );
  }


  await pc.setRemoteDescription({

    type:
      "answer",

    sdp:
      answerSdp
  });


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


  debugSet(
    "dbgOpenAI",
    "✅"
  );


  debugSet(
    "dbgEvent",
    "OpenAI Realtime verbunden"
  );


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


  debugSet(
    "dbgOpenAI",
    "❌"
  );


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
}


/* =========================================================
   RESPONSE CANCEL
   ========================================================= */

function cancelCurrentResponse() {

  if (
    responseInProgress
  ) {

    sendRealtimeEvent({
      type:
        "response.cancel"
    });
  }


  responseInProgress =
    false;


  currentResponseText =
    "";


  clearElevenAudio();


  assistantSpeaking =
    false;


  if (active) {

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
}


/* =========================================================
   EXACT SPEECH
   ========================================================= */

function requestExactSpeech(
  text
) {

  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
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

  if (!active) {
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


  debugSet(
    "dbgEvent",
    "Begrüßung wird vorbereitet"
  );


  await sleep(
    INTRO_VOICE_DELAY_MS
  );


  if (!active) {
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
    runningToolCalls.size > 0
  ) {

    return false;
  }


  const clean =
    String(
      text || ""
    ).trim();


  if (!clean) {
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
    runningToolCalls.size > 0
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

  } catch (error) {

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

  } catch (error) {

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
   INTERRUPTION
   ========================================================= */

function handleUserInterruption() {

  if (!active) {
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


  debugSet(
    "dbgEvent",
    "JARVIS wurde unterbrochen"
  );


  cancelCurrentResponse();


  clearElevenAudio();


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


  debugSet(
    "dbgOpenAI",
    "❌"
  );


  debugSet(
    "dbgEleven",
    "❌"
  );


  debugSet(
    "dbgToken",
    "❌"
  );


  debugSet(
    "dbgVoice",
    "-"
  );


  debugSet(
    "dbgSocket",
    "-"
  );


  debugSet(
    "dbgText",
    "❌"
  );


  debugSet(
    "dbgAudio",
    "❌"
  );


  debugSet(
    "dbgPlayback",
    "❌"
  );


  debugSet(
    "dbgClose",
    "-"
  );


  debugSet(
    "dbgEvent",
    "JARVIS startet"
  );


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

    /*
      AudioContext sofort im echten Button-Klick
      aktivieren.
    */

    await ensureAudioContext();


    debugSet(
      "dbgPlayback",
      "bereit"
    );


    const introPromise =
      startIntro();


    await createMicrophoneStream();


    setLog(
      "ElevenLabs wird verbunden …"
    );


    debugSet(
      "dbgEvent",
      "ElevenLabs wird verbunden"
    );


    await connectElevenLabs();


    setLog(
      "OpenAI Realtime wird verbunden …"
    );


    debugSet(
      "dbgEvent",
      "OpenAI wird verbunden"
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


    debugSet(
      "dbgEvent",
      "JARVIS Online"
    );


    startBackgroundChecks();


    await speakGreeting();

  } catch (error) {

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


    debugSet(
      "dbgEvent",
      `STARTFEHLER: ${
        error.message ||
        "unbekannt"
      }`
    );


    active =
      false;


    disconnectElevenLabs();


    disconnectRealtime();


    stopMicrophone();


    stopIntro();


    clearElevenAudio();


    setButtonActive(
      false
    );


    setJarvisState(
      "offline"
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
  updateUi = true
) {

  if (stopping) {
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


  clearElevenAudio();


  disconnectElevenLabs();


  disconnectRealtime();


  stopMicrophone();


  stopIntro();


  runningToolCalls.clear();


  if (updateUi) {

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


    debugSet(
      "dbgEvent",
      "JARVIS Offline"
    );
  }


  stopping =
    false;
}


/* =========================================================
   TOGGLE BUTTON
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
   PAGE CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    stopBackgroundChecks();


    stopElevenKeepAlive();


    clearElevenAudio();


    disconnectElevenLabs();


    disconnectRealtime();


    stopMicrophone();


    stopIntro();


    if (audioContext) {

      try {
        audioContext.close();
      } catch {}
    }
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


debugSet(
  "dbgEvent",
  "Bereit"
);


/* =========================================================
   VERSION
   ========================================================= */

console.log(
  "=============================================="
);


console.log(
  "JARVIS APP V10.3"
);


console.log(
  "OpenAI Realtime: TEXT"
);


console.log(
  "Voice Engine: ElevenLabs"
);


console.log(
  "ElevenLabs Audio: PCM 24000 Hz"
);


console.log(
  "Playback: Web Audio API"
);


console.log(
  "WebSocket Auth: single_use_token"
);


console.log(
  "Flush: true"
);


console.log(
  "Inactivity Timeout: 180 Sekunden"
);


console.log(
  "=============================================="
);
