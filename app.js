/* =========================================================
   DRUCKELITE24 · JARVIS
   APP.JS

   V8.2 · EMPFINDLICHKEIT DEUTLICH ERHÖHT
   (Basis: V8.1, überarbeitet am 15.08.2026)

   ÄNDERUNGEN GEGENÜBER V8.1:
   17. JARVIS hat wiederholt nur auf laute Stimme reagiert - die
       Erkennungsschwelle war zu hoch. MIN_VOICE_THRESHOLD,
       MAX_VOICE_THRESHOLD und NOISE_MULTIPLIER deutlich herabgesetzt.
       Unproblematisch bei gelegentlichen Fehlauslösern durch
       Hintergrundgeräusche - die Weckwort-Prüfung fängt die still ab.

   ÄNDERUNGEN GEGENÜBER V8.0:
   16. Die Intro-Musik wurde bisher abrupt abgewürgt, sobald die
       Begrüßung fertig gesprochen war - egal wo das eingebaute
       sanfte Ausblenden (duckIntro/fadeIntroOut, zusammen ca. 8,5
       Sekunden) gerade stand. Jetzt läuft nach der Begrüßung noch
       eine Pause von 4,5 Sekunden, in der die Musik natürlich weiter
       ausklingt, bevor sicherheitshalber trotzdem gestoppt wird.
       Zusätzlich die Vorlaufzeit vor der Begrüßung von 1200ms auf
       1800ms erhöht - insgesamt ist der Soundtrack dadurch spürbar
       länger zu hören.

   ÄNDERUNGEN GEGENÜBER V7.9:
   15. Zeitmessung eingebaut (Browser-Konsole, Zeilen mit "[TIMING]"):
       Transkription, ChatGPT-Antwort, Zeit bis der erste Ton hörbar
       wird, komplette Sprachausgabe, Gesamtzeit pro Runde. Zweck:
       endlich sehen, WO die Zeit tatsächlich hängt, statt weiter zu
       raten. Browser-Konsole öffnen (F12), eine Frage stellen, die
       Zeilen mit "[TIMING]" ablesen.

   ÄNDERUNGEN GEGENÜBER V7.8:
   13. Die Startzeremonie-Kürzung aus V7.6 hatte die Intro-Musik
       praktisch unhörbar gemacht (nur noch 500ms, bevor sie schon
       wieder ausgeblendet wurde). Jetzt 1200ms - Mittelweg zwischen
       hörbarer Musik und schnellem Start.
   14. Lautstärke-Normalisierung von Spitzenpegel auf RMS
       (durchschnittliche Lautstärke) umgestellt - der Spitzenpegel
       allein hat nicht gereicht, um alle Sätze gleich LAUT wirken zu
       lassen, nur gleich laut im lautesten Moment.

   ÄNDERUNGEN GEGENÜBER V7.7:
   12. JARVIS meldet sich jetzt auch von sich aus, ohne dass Mattl ihn
       anspricht - aktuell für offene/unbearbeitete Shopify-Bestellungen.
       Prüft alle 20 Minuten im Hintergrund (erster Check nach 2
       Minuten), meldet sich aber nur, wenn der Server tatsächlich
       etwas Neues findet (siehe /api/jarvis-checkin in server.js) -
       nicht bei jedem Check aufs Neue. E-Mails sind noch nicht dabei,
       da Gmail bei Mattl noch nicht verbunden ist (Phase 2).

   ÄNDERUNGEN GEGENÜBER V7.6:
   11. JARVIS hört jetzt durchgehend zu (Mikro bleibt nach dem Start
       offen), reagiert aber nur, wenn "Jarvis" im Gesagten vorkommt -
       Hintergrundgespräche, Telefonate etc. werden still ignoriert.
       Kein separater Erkennungsdienst nötig: die Prüfung läuft einfach
       auf dem bereits vorhandenen Transkriptions-Text.
       Einmal geweckt, bleibt JARVIS für AWAKE_TIMEOUT_MS (aktuell 60s)
       "wach" und reagiert auf alles, ohne dass "Jarvis" wiederholt
       werden muss - erst nach einer echten Gesprächspause muss er
       wieder geweckt werden. Der Start-Klick selbst zählt schon als
       Wecken, die erste Frage danach braucht das Wort nicht.

   ÄNDERUNGEN GEGENÜBER V7.4:
   7. Der kurze Lautstärke-Ausgleich am Anfang (nur die ersten 350ms)
      hat nicht gereicht, weil offenbar ganze Sätze insgesamt leiser
      oder lauter zurückkommen können - nicht nur ihr Anfang. Jetzt
      wird jeder Audio-Clip vor dem Abspielen gemessen (Spitzenpegel)
      und auf ein einheitliches Ziel normalisiert, damit JARVIS bei
      jedem Satz gleich laut klingt.

   ÄNDERUNGEN GEGENÜBER V7.3:
   5. Antworten werden satzweise vertont und abgespielt (Fließband-
      Prinzip), statt auf die komplette Sprachausgabe zu warten -
      JARVIS fängt jetzt an zu sprechen, sobald der erste Satz fertig
      ist, während der Rest im Hintergrund weiter generiert wird.
   6. Kurzer automatischer Lautstärke-Ausgleich am Anfang jedes
      Audio-Clips gegen das "leise Anlaufen" der Stimme.

   ÄNDERUNGEN GEGENÜBER V7.2:
   1. Pegelmessung startet nicht mehr bei 0, sondern beim
      zuletzt gemessenen Raumpegel -> die ersten 100-200ms
      einer neuen Aufnahme werden nicht mehr "verschluckt".
   2. Automatische Neukalibrierung des Raumpegels, wenn
      JARVIS länger nichts gehört hat (Standby-Timeout) -
      passt sich an, wenn sich Umgebungsgeräusche ändern.
   3. Absicherung, falls der Recorder in einem "hängenden"
      Zustand stecken bleibt - JARVIS setzt sich dann
      automatisch zurück, statt stumm zu bleiben.
   4. Etwas mehr Toleranz bei Sprechpausen (SILENCE_DURATION_MS),
      damit kurze Denkpausen mitten im Satz nicht als
      "Satzende" gewertet werden.

   ---------------------------------------------------------
   ARCHITEKTUR (unverändert)

   Browser-Mikrofon
        ↓
   MediaRecorder
        ↓
   automatische Raumpegel-Kalibrierung
        ↓
   Spracherkennung / Stille-Erkennung
        ↓
   /api/transcribe
        ↓
   OpenAI Transcription
        ↓
   /api/jarvis-chat
        ↓
   OpenAI Responses API
        ↓
   /api/elevenlabs-tts
        ↓
   ElevenLabs · einzige Stimme

   KEIN OPENAI REALTIME · KEIN CEDAR · KEIN WEBRTC
   ========================================================= */


/* ============ DOM ============ */
const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

/* ============ STATE ============ */
let active = false;
let starting = false;
let assistantSpeaking = false;
let processing = false;

/* ============ WECKWORT ============ */
let jarvisAwake = false;
let lastInteractionAt = 0;

/* ============ PROAKTIVER CHECK ============ */
let proactiveCheckTimer = null;
let proactiveFirstCheckTimer = null;

/* ============ MICROPHONE ============ */
let micStream = null;
let mediaRecorder = null;
let audioChunks = [];

/* ============ AUDIO ANALYSIS ============ */
let audioContext = null;
let analyser = null;
let sourceNode = null;
let silenceCheckTimer = null;
let recordingStartedAt = 0;
let lastVoiceAt = 0;

let voiceDetected = false;
let voiceCandidateStartedAt = 0;
let discardCurrentRecording = false;

let smoothedAudioLevel = 0;
let ambientNoiseLevel = 0.008;
let dynamicVoiceThreshold = 0.018;

/* ============ CONVERSATION ============ */
let previousResponseId = null;

/* ============ ELEVENLABS ============ */
let elevenAudio = null;
let elevenObjectUrl = null;
let currentAudioSource = null;
let ttsController = null;

/* ============ NETWORK ============ */
let transcriptionController = null;
let chatController = null;

/* ============ INTRO ============ */
let introAudio = null;
let introFadeTimer = null;

/* ============ SETTINGS · INTRO ============ */
const INTRO_START = 4;
const INTRO_START_VOLUME = 0.28;
// War 2000ms, dann auf 500ms gekürzt für einen schnelleren Start -
// dabei ist die Musik aber praktisch untergegangen. 1200ms war ein
// erster Mittelweg. Jetzt auf 1800ms erhöht, damit der Soundtrack
// insgesamt länger und deutlicher zu hören ist, bevor die Begrüßung
// einsetzt - der Start bleibt trotzdem spürbar schneller als die
// ursprünglichen 2000ms plus dem alten abrupten Abwürgen am Ende.
const INTRO_VOICE_DELAY_MS = 1800;
const INTRO_BACKGROUND_VOLUME = 0.025;
const INTRO_DUCK_DURATION_MS = 1500;
const INTRO_FADE_DURATION_MS = 7000;

/* ============ SETTINGS · VOICE DETECTION ============ */
const MIN_RECORDING_MS = 550;

// War 850ms - mehr Toleranz für kurze Denkpausen mitten im Satz.
const SILENCE_DURATION_MS = 1000;

// FIX: JARVIS hat wiederholt nur auf laute Stimme reagiert - die
// Schwelle war schlicht zu hoch angesetzt. Alle drei Werte deutlich
// herabgesetzt, damit normale Gesprächslautstärke zuverlässig erkannt
// wird. Das Risiko, öfter auf Hintergrundgeräusche "anzuspringen", ist
// inzwischen unproblematisch: die Weckwort-Prüfung ("Jarvis") fängt
// solche Fehlauslöser ohnehin still ab, bevor irgendetwas passiert.
const MIN_VOICE_THRESHOLD = 0.012;
const MAX_VOICE_THRESHOLD = 0.035;
const NOISE_MULTIPLIER = 1.4;
const VOICE_CONFIRM_MS = 120;
const WAIT_FOR_VOICE_MS = 15000;
const MAX_RECORDING_MS = 20000;
// War 650ms - kürzer, damit JARVIS schneller ins Zuhören kommt.
// Für eine grobe Raumpegel-Schätzung reicht das weiterhin.
const NOISE_CALIBRATION_MS = 400;

/*
 * Wie lange JARVIS nach der letzten echten Interaktion "wach" bleibt,
 * ohne dass "Jarvis" erneut gesagt werden muss. Danach braucht es
 * wieder das Weckwort. Frei einstellbar - länger für gemütlichere
 * Gespräche, kürzer, falls er zu oft auf Hintergrundgespräche reagiert.
 */
const AWAKE_TIMEOUT_MS = 60000;
const LISTENING_RESUME_DELAY_MS = 1100;

/*
 * Wie oft JARVIS im Hintergrund prüft, ob es etwas Wichtiges zu sagen
 * gibt (z.B. offene Bestellungen) - auch ohne dass Mattl ihn anspricht.
 * Er meldet sich nur, wenn der Server tatsächlich etwas Neues findet,
 * nicht bei jedem Check aufs Neue (siehe /api/jarvis-checkin).
 */
const PROACTIVE_CHECK_INTERVAL_MS = 20 * 60 * 1000; // alle 20 Minuten
const PROACTIVE_FIRST_CHECK_DELAY_MS = 2 * 60 * 1000; // erster Check nach 2 Minuten

/* ============ NETWORK TIMEOUTS ============ */
const TRANSCRIPTION_TIMEOUT_MS = 30000;
const CHAT_TIMEOUT_MS = 45000;
const ELEVEN_TIMEOUT_MS = 25000;


/* =========================================================
   UI
   ========================================================= */

function setStatus(text) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle("online", text === "Online");
}

function setLog(text) {
  if (!logEl) return;
  logEl.textContent = text;
}

function setButtonActive(value) {
  if (!button) return;
  button.classList.toggle("active", !!value);
}

function setJarvisState(state) {
  document.body.dataset.jarvisState = state;
}


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


/* =========================================================
   BERLIN TIME
   ========================================================= */

function getBerlinHour() {
  try {
    const formatter = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hourCycle: "h23"
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find(part => part.type === "hour");
    const hour = Number(hourPart?.value);
    if (!Number.isNaN(hour)) return hour;
  } catch (error) {
    console.warn("Berlin-Zeit Fehler:", error);
  }
  return new Date().getHours();
}


/* =========================================================
   RANDOM / GREETING
   ========================================================= */

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getGreeting() {
  const hour = getBerlinHour();

  if (hour >= 5 && hour < 11) {
    return pickRandom([
      "Morgen, Mattl. Bin da. Was steht an?",
      "Morgen, Mattl. Mal sehen, was heute wieder brennt.",
      "Hey Mattl. Morgen. Was machen wir?"
    ]);
  }

  if (hour >= 11 && hour < 14) {
    return pickRandom([
      "Hey Mattl. Bin da. Was gibt's?",
      "Mattl, da bin ich. Was steht an?",
      "Hey Mattl. Was machen wir?",
      "Da bist du ja. Ich hatte schon Hoffnung auf einen ruhigen Vormittag."
    ]);
  }

  if (hour >= 14 && hour < 18) {
    return pickRandom([
      "Hey Mattl. Was steht noch an?",
      "Mattl, da bin ich. Was gibt's?",
      "Da bist du ja. Dann retten wir mal den Rest des Tages."
    ]);
  }

  if (hour >= 18 && hour < 23) {
    return pickRandom([
      "Hey Mattl. Noch nicht genug für heute?",
      "Mattl, da bin ich. Was liegt noch an?",
      "Feierabend war wohl nur eine Theorie."
    ]);
  }

  return pickRandom([
    "Mattl ... ernsthaft? Na gut. Ich bin da.",
    "Hey Mattl. Schlaf wird offenbar weiterhin überschätzt.",
    "Mattl, es ist spät. Natürlich arbeiten wir noch."
  ]);
}


/* =========================================================
   INTRO
   ========================================================= */

function stopIntro() {
  if (introFadeTimer) {
    clearInterval(introFadeTimer);
    introFadeTimer = null;
  }
  if (introAudio) {
    try { introAudio.pause(); } catch {}
    try { introAudio.currentTime = 0; } catch {}
    introAudio = null;
  }
}

async function startIntro() {
  stopIntro();
  introAudio = new Audio("/Intro.mp3?v=8");
  introAudio.preload = "auto";
  introAudio.volume = INTRO_START_VOLUME;

  return new Promise(resolve => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const play = async () => {
      try {
        if (!introAudio) return done();
        introAudio.currentTime = INTRO_START;
        await introAudio.play();
        done();
      } catch (error) {
        console.error("Intro error:", error);
        done();
      }
    };

    introAudio.addEventListener("loadedmetadata", play, { once: true });
    introAudio.addEventListener("error", done, { once: true });
    if (introAudio.readyState >= 1) play();
    introAudio.load();
  });
}

function duckIntro() {
  if (!introAudio || introAudio.paused) return;
  if (introFadeTimer) {
    clearInterval(introFadeTimer);
    introFadeTimer = null;
  }

  const original = introAudio.volume;
  const start = performance.now();

  introFadeTimer = setInterval(() => {
    if (!introAudio) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;
      return;
    }
    const progress = Math.min((performance.now() - start) / INTRO_DUCK_DURATION_MS, 1);
    const smooth = progress * progress * (3 - 2 * progress);
    introAudio.volume = original - (original - INTRO_BACKGROUND_VOLUME) * smooth;

    if (progress >= 1) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;
      fadeIntroOut();
    }
  }, 40);
}

function fadeIntroOut() {
  if (!introAudio || introAudio.paused) return;

  const start = performance.now();
  const volume = introAudio.volume;

  introFadeTimer = setInterval(() => {
    if (!introAudio) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;
      return;
    }
    const progress = Math.min((performance.now() - start) / INTRO_FADE_DURATION_MS, 1);
    introAudio.volume = Math.max(0, volume * Math.pow(1 - progress, 1.7));

    if (progress >= 1) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;
      try { introAudio.pause(); } catch {}
      introAudio = null;
    }
  }, 60);
}


/* =========================================================
   CLEANUP HELPERS
   ========================================================= */

function stopElevenAudio() {
  if (currentAudioSource) {
    try {
      currentAudioSource.onended = null;
      currentAudioSource.stop();
    } catch {}
    currentAudioSource = null;
  }

  if (elevenAudio) {
    elevenAudio.onended = null;
    elevenAudio.onerror = null;
    try { elevenAudio.pause(); } catch {}
    try { elevenAudio.removeAttribute("src"); } catch {}
    elevenAudio = null;
  }
  if (elevenObjectUrl) {
    try { URL.revokeObjectURL(elevenObjectUrl); } catch {}
    elevenObjectUrl = null;
  }
}

function stopSilenceMonitor() {
  if (silenceCheckTimer) {
    clearInterval(silenceCheckTimer);
    silenceCheckTimer = null;
  }
}

function stopAudioAnalysis() {
  stopSilenceMonitor();
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  analyser = null;
  if (audioContext) {
    try { audioContext.close(); } catch {}
    audioContext = null;
  }
}

function stopMicrophoneTracks() {
  if (micStream) {
    try {
      for (const track of micStream.getTracks()) track.stop();
    } catch {}
    micStream = null;
  }
}


/* =========================================================
   AUDIO LEVEL
   ========================================================= */

function getRawAudioLevel() {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);

  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / data.length);
}

function getAudioLevel() {
  const raw = getRawAudioLevel();
  smoothedAudioLevel = smoothedAudioLevel * 0.65 + raw * 0.35;
  return smoothedAudioLevel;
}


/* =========================================================
   AUDIO ANALYSIS
   ========================================================= */

async function startAudioAnalysis() {
  if (!micStream) return;
  stopAudioAnalysis();

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("AudioContext wird von diesem Browser nicht unterstützt.");
  }

  audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") {
    try { await audioContext.resume(); } catch {}
  }

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;

  sourceNode = audioContext.createMediaStreamSource(micStream);
  sourceNode.connect(analyser);

  smoothedAudioLevel = 0;
}


/* =========================================================
   AMBIENT NOISE CALIBRATION
   ========================================================= */

async function calibrateAmbientNoise() {
  if (!active || !analyser) return;

  // Intro und JARVIS-Audio müssen vollständig still sein.
  stopIntro();
  stopElevenAudio();
  await sleep(250);

  setJarvisState("listening");
  setLog("Mikrofon wird angepasst …");

  const samples = [];
  const started = Date.now();

  while (active && Date.now() - started < NOISE_CALIBRATION_MS) {
    samples.push(getRawAudioLevel());
    await sleep(40);
  }

  if (!samples.length) {
    dynamicVoiceThreshold = MIN_VOICE_THRESHOLD;
    return;
  }

  samples.sort((a, b) => a - b);

  // 60%-Perzentil: kurzfristige Peaks (Tastatur, Stuhl) fallen kaum ins Gewicht.
  const usefulIndex = Math.floor(samples.length * 0.60);
  ambientNoiseLevel = samples[Math.min(usefulIndex, samples.length - 1)];

  dynamicVoiceThreshold = clamp(
    ambientNoiseLevel * NOISE_MULTIPLIER,
    MIN_VOICE_THRESHOLD,
    MAX_VOICE_THRESHOLD
  );

  console.log("Ambient:", ambientNoiseLevel.toFixed(4));
  console.log("Voice threshold:", dynamicVoiceThreshold.toFixed(4));

  setLog(jarvisAwake ? "JARVIS hört zu." : "Warte auf \"Jarvis\" …");
}


/* =========================================================
   WECKWORT
   ========================================================= */

/*
 * Prüft, ob "Jarvis" im transkribierten Text vorkommt - inklusive
 * ein paar gängiger Varianten, falls die Spracherkennung den Namen
 * mal anders versteht. Neue Varianten einfach ergänzen, falls JARVIS
 * öfter mal nicht aufwacht, obwohl der Name gesagt wurde.
 */
const WAKE_WORD_PATTERNS = [
  /\bjarvis\b/i,
  /\bjarwis\b/i,
  /\bdscharvis\b/i,
  /\bcharvis\b/i,
  /\byarvis\b/i
];

function containsWakeWord(text) {
  const value = String(text || "");
  return WAKE_WORD_PATTERNS.some(pattern => pattern.test(value));
}


/* =========================================================
   MIME TYPE
   ========================================================= */

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}


/* =========================================================
   START RECORDING TURN
   ========================================================= */

async function startRecordingTurn() {
  if (!active || processing || assistantSpeaking) return;
  if (!micStream) return;

  // FIX: Recorder hing noch in einem alten Zustand fest -
  // statt für immer stumm zu bleiben, setzen wir ihn zurück
  // und starten in Kürze neu.
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    console.warn("Recorder war noch aktiv - wird zurückgesetzt.");
    try {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    } catch {}
    mediaRecorder = null;
    setTimeout(() => {
      if (active && !processing && !assistantSpeaking) startRecordingTurn();
    }, 300);
    return;
  }

  audioChunks = [];
  voiceDetected = false;
  voiceCandidateStartedAt = 0;
  discardCurrentRecording = false;
  lastVoiceAt = 0;

  // FIX: Vorher startete die Pegelmessung bei jeder neuen Aufnahme
  // bei 0 und musste sich erst über mehrere Messungen "hochtasten".
  // Wer sofort losredet, wurde in den ersten ~150ms zu leise gemessen -
  // JARVIS hat den Anfang des Satzes verpasst oder gar nicht reagiert.
  // Jetzt starten wir direkt beim zuletzt gemessenen Raumpegel.
  smoothedAudioLevel = ambientNoiseLevel;

  const mimeType = getSupportedMimeType();

  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(micStream, { mimeType })
      : new MediaRecorder(micStream);
  } catch (error) {
    console.error("MediaRecorder error:", error);
    setLog("Audioaufnahme konnte nicht gestartet werden - versuche erneut …");
    // FIX: Vorher blieb JARVIS hier für immer hängen. Jetzt wird
    // nach kurzer Pause automatisch ein neuer Versuch gestartet.
    setTimeout(() => {
      if (active && !processing && !assistantSpeaking) startRecordingTurn();
    }, 1000);
    return;
  }

  mediaRecorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    stopSilenceMonitor();

    const duration = Date.now() - recordingStartedAt;
    const recorderType = mediaRecorder?.mimeType || "audio/webm";
    const wasTimeout = discardCurrentRecording;

    if (!active) return;

    // Keine echte Stimme erkannt: nichts an OpenAI senden.
    if (discardCurrentRecording || !voiceDetected) {
      audioChunks = [];
      discardCurrentRecording = false;
      setJarvisState("listening");
      setLog(jarvisAwake ? "JARVIS hört zu." : "Warte auf \"Jarvis\" …");

      setTimeout(async () => {
        if (!active || processing || assistantSpeaking) return;

        // FIX: Nach einer langen stillen Phase (15s ohne Stimme)
        // wird der Raumpegel automatisch neu gemessen, damit sich
        // JARVIS an veränderte Hintergrundgeräusche anpasst,
        // statt mit einer veralteten Schwelle weiterzuhören.
        if (wasTimeout) {
          await calibrateAmbientNoise();
          if (!active) return;
        }

        startRecordingTurn();
      }, 200);

      return;
    }

    if (duration < MIN_RECORDING_MS) {
      audioChunks = [];
      setTimeout(() => {
        if (active && !processing && !assistantSpeaking) startRecordingTurn();
      }, 200);
      return;
    }

    const blob = new Blob(audioChunks, { type: recorderType });
    audioChunks = [];

    if (blob.size < 1000) {
      setTimeout(() => {
        if (active && !processing && !assistantSpeaking) startRecordingTurn();
      }, 200);
      return;
    }

    await processRecordedAudio(blob);
  };

  recordingStartedAt = Date.now();
  setJarvisState("listening");
  setLog(jarvisAwake ? "JARVIS hört zu." : "Warte auf \"Jarvis\" …");

  mediaRecorder.start(200);
  startSilenceMonitor();
}


/* =========================================================
   VOICE + SILENCE MONITOR
   ========================================================= */

function startSilenceMonitor() {
  stopSilenceMonitor();

  silenceCheckTimer = setInterval(() => {
    if (!mediaRecorder || mediaRecorder.state !== "recording") return;

    const now = Date.now();
    const level = getAudioLevel();
    const recordingDuration = now - recordingStartedAt;

    if (!voiceDetected) {
      if (level > dynamicVoiceThreshold) {
        if (!voiceCandidateStartedAt) voiceCandidateStartedAt = now;

        if (now - voiceCandidateStartedAt >= VOICE_CONFIRM_MS) {
          voiceDetected = true;
          lastVoiceAt = now;
          setJarvisState("hearing");
          setLog("Ich höre zu …");
          console.log(
            "Voice detected.",
            "Level:", level.toFixed(4),
            "Threshold:", dynamicVoiceThreshold.toFixed(4)
          );
        }
      } else {
        voiceCandidateStartedAt = 0;
      }

      // Nach langer Ruhe einfach neuen Aufnahmezyklus starten.
      if (recordingDuration > WAIT_FOR_VOICE_MS) {
        discardCurrentRecording = true;
        try { mediaRecorder.stop(); } catch {}
        return;
      }

      return;
    }

    // Stimme läuft bereits - leisere Silben zählen auch als Fortsetzung.
    const continuationThreshold = Math.max(
      MIN_VOICE_THRESHOLD * 0.65,
      dynamicVoiceThreshold * 0.58
    );

    if (level > continuationThreshold) {
      lastVoiceAt = now;
      setJarvisState("hearing");
      setLog("Ich höre zu …");
    }

    const silenceDuration = now - lastVoiceAt;

    // Satz beendet.
    if (recordingDuration > MIN_RECORDING_MS && silenceDuration > SILENCE_DURATION_MS) {
      console.log("Sentence finished.");
      setJarvisState("thinking");
      setLog("Verarbeite Sprache …");
      try { mediaRecorder.stop(); } catch {}
      return;
    }

    // Sicherheitslimit.
    if (recordingDuration > MAX_RECORDING_MS) {
      console.warn("Recording limit reached.");
      try { mediaRecorder.stop(); } catch {}
    }
  }, 60);
}


/* =========================================================
   TRANSCRIPTION
   ========================================================= */

async function transcribeAudio(blob) {
  if (transcriptionController) {
    try { transcriptionController.abort(); } catch {}
  }
  transcriptionController = new AbortController();

  const timeout = setTimeout(() => {
    try { transcriptionController?.abort(); } catch {}
  }, TRANSCRIPTION_TIMEOUT_MS);

  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
      signal: transcriptionController.signal
    });

    clearTimeout(timeout);

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(raw || "Ungültige Transkriptionsantwort.");
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const text = String(data.text || "").trim();
    if (!text) {
      throw new Error("Keine verständliche Sprache erkannt.");
    }

    return text;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}


/* =========================================================
   JARVIS CHAT
   ========================================================= */

async function askJarvis(transcript) {
  if (chatController) {
    try { chatController.abort(); } catch {}
  }
  chatController = new AbortController();

  const timeout = setTimeout(() => {
    try { chatController?.abort(); } catch {}
  }, CHAT_TIMEOUT_MS);

  try {
    const response = await fetch("/api/jarvis-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: transcript,
        previous_response_id: previousResponseId
      }),
      signal: chatController.signal
    });

    clearTimeout(timeout);

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(raw || "Ungültige JARVIS-Antwort.");
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const answer = String(data.text || "").trim();
    if (!answer) {
      throw new Error("JARVIS hat keinen Antworttext geliefert.");
    }

    if (data.response_id) {
      previousResponseId = data.response_id;
    }

    return answer;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}


/* =========================================================
   ELEVENLABS SPEAK
   =========================================================

   FIX (V7.4): Vorher wurde IMMER auf die komplette vertonte Antwort
   gewartet, bevor JARVIS überhaupt zu sprechen anfing. Jetzt wird die
   Antwort in einzelne Sätze zerlegt, satzweise vertont und wie am
   Fließband abgespielt: Satz 1 startet, sobald er fertig ist - Satz 2
   wird währenddessen schon im Hintergrund generiert. Bei kurzen
   Antworten (nur ein Satz) verhält es sich wie vorher.

   Zusätzlich: Ein kurzer Lautstärke-Ausgleich am Anfang jedes
   Audio-Clips gleicht das "leise Anlaufen" der Stimme aus.
   ========================================================= */

let playbackAudioContext = null;

function getPlaybackAudioContext() {
  // Bevorzugt denselben AudioContext wie die Mikrofonanalyse -
  // nur falls der (noch) nicht existiert oder bereits geschlossen ist,
  // legen wir einen eigenen für die Wiedergabe an.
  if (audioContext && audioContext.state !== "closed") {
    return audioContext;
  }

  if (!playbackAudioContext || playbackAudioContext.state === "closed") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    playbackAudioContext = new AudioContextClass();
  }

  return playbackAudioContext;
}

/*
 * Zerlegt einen Antworttext in einzelne Sätze, damit die Sprachausgabe
 * satzweise starten kann, statt auf die komplette Antwort zu warten.
 */
function splitSentences(text) {
  const value = String(text || "").trim();
  if (!value) return [];

  const matches = value.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  if (!matches || !matches.length) return [value];

  const sentences = matches.map(part => part.trim()).filter(Boolean);

  // Rest ohne abschließendes Satzzeichen (z.B. letzter Satz) nicht verlieren.
  const consumedLength = matches.join("").length;
  if (consumedLength < value.length) {
    const remainder = value.slice(consumedLength).trim();
    if (remainder) sentences.push(remainder);
  }

  return sentences.length ? sentences : [value];
}

async function fetchTtsBlob(text, controller) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;

  const response = await fetch("/api/elevenlabs-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: cleanText }),
    signal: controller.signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs HTTP ${response.status}: ${errorText}`);
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error("ElevenLabs hat kein Audio geliefert.");
  }

  return blob;
}

function playBlob(blob) {
  return new Promise((resolve, reject) => {
    stopElevenAudio();

    // Einfache Wiedergabe ohne Normalisierung - Rückfalllösung, falls
    // Web Audio nicht verfügbar ist oder die Analyse fehlschlägt.
    const playPlain = () => {
      elevenObjectUrl = URL.createObjectURL(blob);
      elevenAudio = new Audio(elevenObjectUrl);
      elevenAudio.preload = "auto";
      elevenAudio.volume = 1;
      elevenAudio.onended = () => resolve();
      elevenAudio.onerror = () => reject(new Error("ElevenLabs-Audio konnte nicht abgespielt werden."));
      elevenAudio.play().catch(reject);
    };

    const ctx = getPlaybackAudioContext();
    if (!ctx) {
      playPlain();
      return;
    }

    (async () => {
      try {
        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => {});
        }

        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // FIX V7.6: Spitzenpegel-Normalisierung hat nicht gereicht.
        // Zwei Sätze können denselben Spitzenwert haben (einen einzelnen
        // lauten Ton) und trotzdem unterschiedlich LAUT WIRKEN, weil die
        // durchschnittliche Lautstärke (RMS) unterschiedlich ist. Jetzt
        // wird auf den RMS-Wert normalisiert - das bildet die gefühlte
        // Lautstärke viel besser ab. Der Spitzenwert wird trotzdem
        // weiter mitgemessen, damit die Verstärkung nicht übersteuert
        // (kein Knacksen/Verzerren).
        let sumSquares = 0;
        let sampleCount = 0;
        let peak = 0;

        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          const data = audioBuffer.getChannelData(channel);
          for (let i = 0; i < data.length; i += 4) {
            const sample = data[i];
            const abs = Math.abs(sample);
            if (abs > peak) peak = abs;
            sumSquares += sample * sample;
            sampleCount++;
          }
        }

        const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;

        // Zielwert für die durchschnittliche Lautstärke - falls JARVIS
        // insgesamt zu leise oder zu laut wirkt, hier anpassen.
        const TARGET_RMS = 0.18;
        const MAX_GAIN = 8;

        let gainValue = rms > 0.0005 ? Math.min(TARGET_RMS / rms, MAX_GAIN) : 1;

        // Sicherheitsnetz gegen Verzerrung: Verstärkung kappen, falls sie
        // den Spitzenwert über die Hörbarkeitsgrenze treiben würde.
        if (peak > 0) {
          const projectedPeak = peak * gainValue;
          if (projectedPeak > 0.98) {
            gainValue = 0.98 / peak;
          }
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        const gain = ctx.createGain();
        gain.gain.value = gainValue;

        source.connect(gain);
        gain.connect(ctx.destination);

        source.onended = () => resolve();
        currentAudioSource = source;
        source.start();
      } catch (error) {
        console.warn("Normalisierte Wiedergabe fehlgeschlagen, spiele normal ab:", error);
        playPlain();
      }
    })();
  });
}

async function speakWithElevenLabs(text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;

  stopElevenAudio();

  if (ttsController) {
    try { ttsController.abort(); } catch {}
  }
  ttsController = new AbortController();

  const timeout = setTimeout(() => {
    try { ttsController?.abort(); } catch {}
  }, ELEVEN_TIMEOUT_MS);

  assistantSpeaking = true;
  const speakStart = performance.now();

  try {
    setJarvisState("thinking");
    setLog("JARVIS bereitet die Stimme vor …");

    const sentences = splitSentences(cleanText);
    const chunks = sentences.length > 1 ? sentences : [cleanText];

    // Ersten Satz sofort anfordern - der Rest folgt im Hintergrund,
    // während schon abgespielt wird.
    let nextBlobPromise = fetchTtsBlob(chunks[0], ttsController);

    for (let i = 0; i < chunks.length; i++) {
      if (!active) break;

      const blob = await nextBlobPromise;
      if (!active || !blob) break;

      if (i === 0) {
        console.log(`[TIMING] Zeit bis erster Ton hörbar wird: ${Math.round(performance.now() - speakStart)}ms`);
      }

      if (i + 1 < chunks.length) {
        nextBlobPromise = fetchTtsBlob(chunks[i + 1], ttsController);
      }

      setJarvisState("speaking");
      setLog("JARVIS spricht.");

      await playBlob(blob);
    }

    console.log(`[TIMING] Komplette Sprachausgabe (${chunks.length} Satz-Teile) fertig: ${Math.round(performance.now() - speakStart)}ms`);
  } finally {
    clearTimeout(timeout);
    assistantSpeaking = false;
    stopElevenAudio();
  }
}


/* =========================================================
   PROCESS RECORDED AUDIO
   ========================================================= */

async function processRecordedAudio(blob) {
  if (!active || processing) return;
  processing = true;

  let spokeResponse = false;
  const turnStart = performance.now();

  try {
    setJarvisState("thinking");
    setLog("Verarbeite Sprache …");

    const transcribeStart = performance.now();
    const transcript = await transcribeAudio(blob);
    console.log(`[TIMING] Transkription (Browser -> Server -> zurück): ${Math.round(performance.now() - transcribeStart)}ms`);
    if (!active) return;

    console.log("Mattl:", transcript);

    // FIX: JARVIS hört jetzt durchgehend zu, reagiert aber nur, wenn
    // entweder "Jarvis" im Gesagten vorkommt, oder er aus einer noch
    // laufenden Unterhaltung heraus bereits "wach" ist (siehe
    // AWAKE_TIMEOUT_MS). Alles andere - Hintergrundgespräch, Telefonat,
    // Selbstgespräch - wird still ignoriert.
    const stillAwake = jarvisAwake && Date.now() - lastInteractionAt < AWAKE_TIMEOUT_MS;

    if (!stillAwake && !containsWakeWord(transcript)) {
      console.log("Kein Weckwort erkannt, ignoriere:", transcript);
      jarvisAwake = false;
      setJarvisState("listening");
      setLog("Warte auf \"Jarvis\" …");
      return;
    }

    jarvisAwake = true;
    lastInteractionAt = Date.now();

    setLog(`Verstanden: ${transcript}`);

    await sleep(150);
    setLog("Denke nach …");

    const chatStart = performance.now();
    const answer = await askJarvis(transcript);
    console.log(`[TIMING] ChatGPT-Antwort (Browser -> Server -> zurück): ${Math.round(performance.now() - chatStart)}ms`);
    if (!active) return;

    console.log("JARVIS:", answer);

    await speakWithElevenLabs(answer);
    spokeResponse = true;

    console.log(`[TIMING] ===> GESAMT von "Aufnahme fertig" bis "letzter Ton verklungen": ${Math.round(performance.now() - turnStart)}ms`);
  } catch (error) {
    console.error("JARVIS turn error:", error);

    if (error.name === "AbortError") {
      setLog("Vorgang wurde abgebrochen.");
    } else {
      setLog(`JARVIS Fehler: ${error.message}`);
    }

    await sleep(1000);
  } finally {
    processing = false;
    assistantSpeaking = false;

    if (active) {
      // Nach einer ignorierten Aufnahme (kein Weckwort, nichts gesagt)
      // muss nicht auf Lautsprecher-Echo gewartet werden - also kurze
      // Pause. Nur nach einer echten JARVIS-Antwort die längere Pause,
      // damit kein Lautsprecher-Restschall aufgeschnappt wird.
      const resumeDelay = spokeResponse ? LISTENING_RESUME_DELAY_MS : 150;

      setTimeout(() => {
        if (active && !processing && !assistantSpeaking) startRecordingTurn();
      }, resumeDelay);
    }
  }
}


/* =========================================================
   PROAKTIVER HINTERGRUND-CHECK
   =========================================================

   Läuft periodisch im Hintergrund, unabhängig davon, ob Mattl gerade
   etwas fragt. Fragt den Server, ob es etwas Wichtiges gibt (z.B.
   offene Bestellungen) - der Server entscheidet, ob es sich lohnt,
   sich zu melden (siehe /api/jarvis-checkin), damit JARVIS nicht bei
   jedem Check dieselbe Sache wiederholt.
   ========================================================= */

async function checkProactiveNotice() {
  if (!active || processing || assistantSpeaking) return;

  processing = true;
  let spokeResponse = false;

  try {
    // Laufende, aber noch "leere" Aufnahme sauber unterbrechen, falls
    // JARVIS gerade passiv zuhört, während der Check auslöst.
    if (mediaRecorder && mediaRecorder.state === "recording") {
      discardCurrentRecording = true;
      try { mediaRecorder.stop(); } catch {}
    }

    const response = await fetch("/api/jarvis-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previous_response_id: previousResponseId })
    });

    if (!response.ok) return;

    const data = await response.json();
    if (!data || !data.ok || !data.hasNotice || !data.text) return;
    if (!active) return;

    console.log("JARVIS (von sich aus):", data.text);

    if (data.response_id) {
      previousResponseId = data.response_id;
    }

    // Ein proaktiver Hinweis zählt als "Ansprechen" - die direkte
    // Reaktion darauf braucht kein erneutes "Jarvis".
    jarvisAwake = true;
    lastInteractionAt = Date.now();

    await speakWithElevenLabs(data.text);
    spokeResponse = true;
  } catch (error) {
    console.warn("Proaktiver Check fehlgeschlagen:", error);
  } finally {
    processing = false;
    assistantSpeaking = false;

    if (active) {
      const resumeDelay = spokeResponse ? LISTENING_RESUME_DELAY_MS : 150;
      setTimeout(() => {
        if (active && !processing && !assistantSpeaking) startRecordingTurn();
      }, resumeDelay);
    }
  }
}

function startProactiveChecks() {
  stopProactiveChecks();

  proactiveFirstCheckTimer = setTimeout(() => {
    checkProactiveNotice();
  }, PROACTIVE_FIRST_CHECK_DELAY_MS);

  proactiveCheckTimer = setInterval(() => {
    checkProactiveNotice();
  }, PROACTIVE_CHECK_INTERVAL_MS);
}

function stopProactiveChecks() {
  if (proactiveFirstCheckTimer) {
    clearTimeout(proactiveFirstCheckTimer);
    proactiveFirstCheckTimer = null;
  }
  if (proactiveCheckTimer) {
    clearInterval(proactiveCheckTimer);
    proactiveCheckTimer = null;
  }
}


/* =========================================================
   START JARVIS
   ========================================================= */

async function startJarvis() {
  if (active || starting) return;
  starting = true;
  if (button) button.disabled = true;

  setJarvisState("connecting");
  setStatus("Verbinde …");
  setButtonActive(true);
  setLog("JARVIS startet …");

  try {
    previousResponseId = null;
    processing = false;
    assistantSpeaking = false;
    ambientNoiseLevel = 0.008;
    dynamicVoiceThreshold = MIN_VOICE_THRESHOLD;

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        // Aus lassen: sonst werden leise Hintergrundgeräusche künstlich verstärkt.
        autoGainControl: false,
        channelCount: 1
      }
    });

    await startAudioAnalysis();
    await startIntro();

    active = true;
    setStatus("Online");

    await sleep(INTRO_VOICE_DELAY_MS);
    if (!active) return;

    duckIntro();

    processing = true;
    await speakWithElevenLabs(getGreeting());
    processing = false;
    if (!active) return;

    // FIX: Vorher wurde die Intro-Musik hier abrupt abgewürgt, egal wo
    // das sanfte Ausblenden (duckIntro/fadeIntroOut) gerade stand - das
    // klang abgehackt statt natürlich. Jetzt lassen wir sie noch 4,5
    // Sekunden lang von selbst weiter ausklingen (die Fade-Timer laufen
    // im Hintergrund bereits seit duckIntro() weiter), bevor wir sie
    // zur Sicherheit trotzdem hart stoppen - falls sie bis dahin noch
    // nicht ganz verklungen sein sollte.
    await sleep(4500);
    if (!active) return;

    stopIntro();
    stopElevenAudio();
    await sleep(200);

    await calibrateAmbientNoise();
    if (!active) return;

    // Der Start-Klick selbst zählt schon als "Wecken" - die erste
    // Frage danach braucht "Jarvis" nicht nochmal.
    jarvisAwake = true;
    lastInteractionAt = Date.now();

    startProactiveChecks();

    await sleep(100);
    startRecordingTurn();
  } catch (error) {
    console.error("JARVIS Start error:", error);

    active = false;
    setJarvisState("offline");
    setStatus("Offline");
    setButtonActive(false);
    setLog(`Start fehlgeschlagen: ${error.message}`);

    stopProactiveChecks();
    stopMicrophoneTracks();
    stopAudioAnalysis();
  } finally {
    starting = false;
    if (button) button.disabled = false;
  }
}


/* =========================================================
   STOP JARVIS
   ========================================================= */

async function stopJarvis() {
  active = false;
  starting = false;
  processing = false;
  assistantSpeaking = false;
  previousResponseId = null;
  voiceDetected = false;
  voiceCandidateStartedAt = 0;
  discardCurrentRecording = false;
  jarvisAwake = false;
  lastInteractionAt = 0;

  stopProactiveChecks();
  stopSilenceMonitor();

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    } catch {}
  }
  mediaRecorder = null;
  audioChunks = [];

  if (transcriptionController) {
    try { transcriptionController.abort(); } catch {}
    transcriptionController = null;
  }
  if (chatController) {
    try { chatController.abort(); } catch {}
    chatController = null;
  }
  if (ttsController) {
    try { ttsController.abort(); } catch {}
    ttsController = null;
  }

  stopElevenAudio();
  stopIntro();
  stopAudioAnalysis();
  stopMicrophoneTracks();

  if (remoteAudio) {
    try {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
      remoteAudio.muted = true;
      remoteAudio.volume = 0;
    } catch {}
  }

  setButtonActive(false);
  setJarvisState("offline");
  setStatus("Offline");
  setLog("Bereit.");

  if (button) button.disabled = false;
}


/* =========================================================
   INITIAL STATE
   ========================================================= */

setJarvisState("offline");

if (remoteAudio) {
  remoteAudio.muted = true;
  remoteAudio.volume = 0;
}


/* =========================================================
   BUTTON
   ========================================================= */

if (button) {
  button.addEventListener("click", async () => {
    if (starting) return;
    if (active) {
      await stopJarvis();
      return;
    }
    await startJarvis();
  });
} else {
  console.error("#toggle-Button wurde nicht gefunden.");
}


/* =========================================================
   PAGE CLEANUP
   ========================================================= */

window.addEventListener("pagehide", () => {
  stopJarvis();
});
