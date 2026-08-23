const $ = selector => document.querySelector(selector);

const state = {
  active: false,
  starting: false,
  pc: null,
  dc: null,
  mic: null,
  responseActive: false,
  speaking: false,
  greeting: false,
  currentMail: null,
  gmailDraftId: null,
  newWhatsAppDraft: null,
  whatsappVoiceDraft: null,
  selectedWhatsAppId: null,
  proactiveTimer: null,
  reminderTimer: null,
  intro: null,
  introFade: null
};

const ui = {
  toggle: $("#toggle"),
  status: $("#status"),
  log: $("#log"),
  coreState: $("#coreState"),
  remoteAudio: $("#remoteAudio"),
  inbox: $("#inboxList"),
  whatsapp: $("#whatsappList"),
  mailModal: $("#mailModal"),
  draftPanel: $("#draftPanel")
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setState(name, message) {
  document.body.dataset.jarvisState = name;
  const labels = {
    offline: "STANDBY",
    connecting: "VERBINDUNG",
    listening: "ZUHÖREN",
    hearing: "INPUT",
    thinking: "DENKEN",
    speaking: "SPRECHEN"
  };
  if (ui.coreState) ui.coreState.textContent = labels[name] || name.toUpperCase();
  if (message && ui.log) ui.log.textContent = message;
}

function setOnline(value) {
  if (!ui.status) return;
  ui.status.textContent = value ? "ONLINE" : "OFFLINE";
  ui.status.classList.toggle("online", value);
}

function setConnector(id, ok, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || (ok ? "ONLINE" : "OFFLINE");
}

function setDot(id, ok) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("ok", Boolean(ok));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initials(name) {
  const parts = String(name || "")
    .replace(/<[^>]+>/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : (parts[0] || "M").slice(0, 2)
  ).toUpperCase();
}

function senderName(from) {
  const value = String(from || "").trim();
  const quoted = value.match(/^"([^"]+)"/)?.[1];
  if (quoted) return quoted;
  const before = value.split("<")[0].trim();
  if (before) return before;
  return value.split("@")[0] || "Unbekannt";
}

function formatTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/* ---------- Boot / clock ---------- */

(function boot() {
  const steps = [
    "CORE INITIALISIEREN",
    "OPENAI REALTIME",
    "SHOPIFY CONNECTOR",
    "GMAIL CONNECTOR",
    "SUPERCHAT CONNECTOR",
    "JARVIS BEREIT"
  ];
  let i = 0;
  const status = $("#bootStatus");
  const progress = $("#bootProgress");
  const timer = setInterval(() => {
    if (status) status.textContent = steps[i] || steps.at(-1);
    if (progress) progress.style.width = `${Math.min(100, ((i + 1) / steps.length) * 100)}%`;
    i += 1;
    if (i >= steps.length) {
      clearInterval(timer);
      setTimeout(() => {
        const el = $("#boot");
        el?.classList.add("done");
        setTimeout(() => el?.remove(), 500);
      }, 260);
    }
  }, 130);
})();

(function clock() {
  const update = () => {
    const now = new Date();
    $("#clockTime").textContent =
      new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).format(now);
    $("#clockDate").textContent =
      new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(now);
  };
  update();
  setInterval(update, 1000);
})();

/* ---------- Intro soundtrack ---------- */

function stopIntro() {
  if (state.introFade) {
    clearInterval(state.introFade);
    state.introFade = null;
  }
  if (state.intro) {
    try { state.intro.pause(); } catch {}
    state.intro = null;
  }
}

async function playIntro() {
  stopIntro();
  const audio = new Audio("/Intro.mp3?v=12");
  state.intro = audio;
  audio.preload = "auto";
  audio.volume = 0.055;

  try {
    await audio.play();
  } catch (error) {
    console.warn("Intro nicht abspielbar:", error);
  }
}

function duckAndFadeIntro() {
  const audio = state.intro;
  if (!audio || audio.paused) return;

  const startVolume = audio.volume;
  const started = performance.now();

  state.introFade = setInterval(() => {
    if (!state.intro) {
      clearInterval(state.introFade);
      state.introFade = null;
      return;
    }

    const p = Math.min(1, (performance.now() - started) / 900);
    state.intro.volume =
      Math.max(0.006, startVolume * (1 - p * 0.9));

    if (p >= 1) {
      clearInterval(state.introFade);
      state.introFade = null;

      const fadeStart = performance.now();
      state.introFade = setInterval(() => {
        if (!state.intro) return;
        const q = Math.min(1, (performance.now() - fadeStart) / 3200);
        state.intro.volume = 0.006 * (1 - q);
        if (q >= 1) stopIntro();
      }, 60);
    }
  }, 40);
}

/* ---------- Realtime transport ---------- */

function sendEvent(event) {
  if (!state.dc || state.dc.readyState !== "open") return false;
  state.dc.send(JSON.stringify(event));
  return true;
}

async function createMic() {
  if (state.mic) return state.mic;

  state.mic = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    }
  });

  return state.mic;
}

function stopMic() {
  try {
    state.mic?.getTracks().forEach(track => track.stop());
  } catch {}
  state.mic = null;
}

function cancelResponse() {
  if (state.responseActive) {
    sendEvent({ type: "response.cancel" });
  }
  state.responseActive = false;
  state.speaking = false;
}

function handleRealtimeEvent(event) {
  if (!event?.type) return;

  switch (event.type) {
    case "session.created":
      break;

    case "input_audio_buffer.speech_started":
      setState("hearing", "Ich höre zu …");
      /*
        Mikrofon bleibt IMMER an. Die Realtime-API übernimmt
        mit interrupt_response=true das Barge-in.
      */
      break;

    case "input_audio_buffer.speech_stopped":
      setState("thinking", "Einen Moment …");
      break;

    case "response.created":
      state.responseActive = true;
      setState("thinking", "JARVIS denkt …");
      break;

    case "response.output_audio.delta":
      state.speaking = true;
      if (state.greeting) duckAndFadeIntro();
      setState("speaking", "JARVIS spricht.");
      break;

    case "response.output_audio.done":
      state.speaking = false;
      break;

    case "response.function_call_arguments.done":
      executeTool(event);
      break;

    case "response.done": {
      state.responseActive = false;

      const hasTool =
        Array.isArray(event.response?.output) &&
        event.response.output.some(item => item?.type === "function_call");

      if (hasTool) {
        setState("thinking", "Live-Daten werden geladen …");
        return;
      }

      state.greeting = false;
      setTimeout(() => {
        if (state.active && !state.responseActive && !state.speaking) {
          setState("listening", "JARVIS hört zu.");
        }
      }, 120);
      break;
    }

    case "error":
      console.error("Realtime Fehler:", event);
      state.responseActive = false;
      state.speaking = false;
      setState("listening", event.error?.message || "Realtime-Fehler.");
      break;
  }
}

async function connectRealtime() {
  const pc = new RTCPeerConnection();
  state.pc = pc;

  const mic = await createMic();
  mic.getAudioTracks().forEach(track => pc.addTrack(track, mic));

  pc.addEventListener("track", event => {
    const stream = event.streams?.[0];
    if (!stream || !ui.remoteAudio) return;
    ui.remoteAudio.srcObject = stream;
    ui.remoteAudio.volume = 1;
    ui.remoteAudio.play().catch(() => {});
  });

  const dc = pc.createDataChannel("oai-events");
  state.dc = dc;

  dc.addEventListener("message", e => {
    try {
      handleRealtimeEvent(JSON.parse(e.data));
    } catch (error) {
      console.warn("Realtime Event ungültig:", error);
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch("/api/realtime-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp"
    },
    body: offer.sdp
  });

  const answer = await response.text();

  if (!response.ok) {
    throw new Error(answer || "OpenAI Realtime konnte nicht verbunden werden.");
  }

  await pc.setRemoteDescription({
    type: "answer",
    sdp: answer
  });

  const started = Date.now();
  while (dc.readyState !== "open") {
    if (Date.now() - started > 10000) {
      throw new Error("Realtime DataChannel Timeout.");
    }
    await sleep(50);
  }
}

function disconnectRealtime() {
  try { state.dc?.close(); } catch {}
  try { state.pc?.close(); } catch {}
  state.dc = null;
  state.pc = null;
}

function requestSpeech(text) {
  const clean = String(text || "").trim();
  if (!clean) return false;

  state.responseActive = true;

  return sendEvent({
    type: "response.create",
    response: {
      output_modalities: ["audio"],
      instructions:
        `Antworte exakt mit diesem deutschen Inhalt, natürlich gesprochen, und mit nichts anderem:\n${clean}`
    }
  });
}

function sendUserText(text) {
  const clean = String(text || "").trim();
  if (!clean) return false;

  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: clean
        }
      ]
    }
  });

  state.responseActive = true;

  return sendEvent({
    type: "response.create",
    response: {
      output_modalities: ["audio"]
    }
  });
}

/* ---------- Start / stop ---------- */

function greetingText() {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hourCycle: "h23"
    }).format(new Date())
  );

  if (hour >= 5 && hour < 11) {
    return "Guten Morgen, Mattl. JARVIS ist online. Systeme bereit. Was steht an?";
  }
  if (hour >= 18 && hour < 23) {
    return "Guten Abend, Mattl. JARVIS ist online. Was nehmen wir uns vor?";
  }
  if (hour >= 23 || hour < 5) {
    return "Mattl, JARVIS ist online. Vernünftige Menschen schlafen. Wir offenbar nicht.";
  }
  return "Willkommen zurück, Mattl. JARVIS ist online und hört zu.";
}

async function startJarvis() {
  if (state.active || state.starting) return;
  state.starting = true;

  setState("connecting", "JARVIS startet …");
  setOnline(false);

  try {
    /*
      Sound startet im echten Klick-Event, damit Browser-Autoplay
      nicht dazwischenfunkt.
    */
    const introPromise = playIntro();

    await connectRealtime();
    await introPromise;

    state.active = true;
    setOnline(true);
    setConnector("sysOpenAI", true, "ONLINE");

    startBackgroundChecks();

    state.greeting = true;
    await sleep(320);
    requestSpeech(greetingText());

  } catch (error) {
    console.error(error);
    state.active = false;
    setOnline(false);
    setState("offline", error.message || "Start fehlgeschlagen.");
    stopIntro();
    disconnectRealtime();
    stopMic();
  } finally {
    state.starting = false;
  }
}

async function stopJarvis() {
  state.active = false;
  cancelResponse();
  stopBackgroundChecks();
  stopIntro();
  disconnectRealtime();
  stopMic();
  setOnline(false);
  setState("offline", "JARVIS ist offline.");
}

ui.toggle?.addEventListener("click", () => {
  state.active ? stopJarvis() : startJarvis();
});

/* ---------- Tool execution ---------- */

async function executeTool(event) {
  const callId = String(event.call_id || "");
  const name = String(event.name || "");
  if (!callId || !name) return;

  let args = {};
  try {
    args = event.arguments
      ? JSON.parse(event.arguments)
      : {};
  } catch {}

  if (
    ["get_email_message", "create_email_reply_draft", "move_email_to_bearbeitet"].includes(name) &&
    !args.message_id &&
    state.currentMail?.id
  ) {
    args.message_id = state.currentMail.id;
  }

  if (
    name === "send_email_draft" &&
    !args.draft_id &&
    state.gmailDraftId
  ) {
    args.draft_id = state.gmailDraftId;
  }

  if (
    ["get_whatsapp_conversation", "create_whatsapp_reply_draft", "create_whatsapp_voice_draft"].includes(name) &&
    !args.conversation_id &&
    state.selectedWhatsAppId
  ) {
    args.conversation_id = state.selectedWhatsAppId;
  }

  setState("thinking", `${name} …`);

  let result;
  try {
    const response = await fetch("/api/realtime-tool", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        arguments: args
      })
    });

    result = await response.json();

    if (!response.ok) {
      throw new Error(result?.error || "Tool fehlgeschlagen.");
    }

    consumeToolResult(name, result);

  } catch (error) {
    result = {
      ok: false,
      error: error.message || "Tool fehlgeschlagen."
    };
  }

  sendEvent({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(result)
    }
  });

  state.responseActive = true;
  sendEvent({
    type: "response.create",
    response: {
      output_modalities: ["audio"]
    }
  });
}

function consumeToolResult(name, result) {
  if (result?.email) {
    openMailModal(result.email);
  }

  if (result?.draft) {
    state.gmailDraftId =
      result.gmail_draft_id ||
      result.draft.gmail_draft_id ||
      state.gmailDraftId;
    showDraft(result.draft, "E-MAIL");
  }

  if (result?.whatsapp_draft) {
    state.newWhatsAppDraft =
      name === "create_new_whatsapp_draft"
        ? result.whatsapp_draft
        : null;

    showDraft({
      subject:
        `WhatsApp · ${result.whatsapp_draft.recipient || result.whatsapp_draft.contact_name || "Kunde"}`,
      body: result.whatsapp_draft.text
    }, "WHATSAPP");
  }

  if (result?.whatsapp_voice_draft) {
    state.whatsappVoiceDraft = result.whatsapp_voice_draft;
    showDraft({
      subject:
        `Sprachnachricht · ${result.whatsapp_voice_draft.recipient || "Kunde"}`,
      body: result.whatsapp_voice_draft.text
    }, "WHATSAPP VOICE");
  }

  if (result?.sent?.sent) {
    state.gmailDraftId = null;
    hideDraft();
    loadInbox();
  }

  if (result?.moved?.moved) {
    closeMailModal();
    loadInbox();
  }

  if (result?.conversation?.id) {
    state.selectedWhatsAppId = result.conversation.id;
  }
}

/* ---------- Dashboard Shopify ---------- */

function euro(value) {
  return Number(value || 0).toLocaleString(
    "de-DE",
    {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }
  );
}

async function callTool(name, args = {}) {
  const response = await fetch("/api/realtime-tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      arguments: args
    })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data?.error || `${name} fehlgeschlagen.`);
  }
  return data.result || data;
}

async function loadShop() {
  try {
    const [today, yesterday, open] =
      await Promise.all([
        callTool("get_shopify_summary", { period: "today" }),
        callTool("get_shopify_summary", { period: "yesterday" }),
        callTool("get_shopify_open_orders")
      ]);

    $("#statRevenue").textContent = euro(today.revenue);
    $("#statOrders").textContent = today.orders ?? "—";
    $("#statAov").textContent = euro(today.average_order_value);
    $("#statYesterday").textContent =
      `${yesterday.orders ?? 0} · ${euro(yesterday.revenue)}`;
    $("#statOpenOrders").textContent =
      open.count ?? "—";

    $("#shopUpdated").textContent =
      `AKTUALISIERT ${formatTime(new Date())} UHR`;

    setDot("shopDot", true);
    setConnector("sysShop", true);
  } catch (error) {
    $("#shopUpdated").textContent =
      "SHOPIFY NICHT ERREICHBAR";
    setDot("shopDot", false);
    setConnector("sysShop", false);
  }
}

/* ---------- Dashboard Gmail ---------- */

function renderInbox(emails) {
  if (!ui.inbox) return;

  if (!Array.isArray(emails) || !emails.length) {
    ui.inbox.innerHTML =
      `<div class="empty-state">Keine Mails im Posteingang.</div>`;
    return;
  }

  ui.inbox.innerHTML =
    emails.slice(0, 5).map(mail => {
      const name = senderName(mail.from);
      return `
        <div class="mail-row" data-mail-id="${escapeHtml(mail.id)}">
          <div class="avatar">${escapeHtml(initials(name))}</div>
          <div class="row-copy">
            <b>${mail.unread ? "● " : ""}${escapeHtml(name)} · ${escapeHtml(mail.subject || "(kein Betreff)")}</b>
            <span>${escapeHtml(mail.snippet || "")}</span>
          </div>
          <time class="row-time">${escapeHtml(formatTime(mail.internalDate || mail.date))}</time>
        </div>`;
    }).join("");
}

async function loadInbox() {
  try {
    const response = await fetch("/api/gmail-inbox", {
      cache: "no-store"
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data?.error || "Gmail nicht erreichbar.");
    }

    renderInbox(data.emails);
    setConnector("sysMail", true);
  } catch (error) {
    ui.inbox.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message || "Gmail nicht erreichbar.")}</div>`;
    setConnector("sysMail", false);
  }
}

$("#refreshMailBtn")?.addEventListener("click", loadInbox);

ui.inbox?.addEventListener("click", event => {
  const row = event.target.closest("[data-mail-id]");
  if (row?.dataset.mailId) {
    loadMail(row.dataset.mailId);
  }
});

async function loadMail(id) {
  try {
    const response = await fetch(
      `/api/gmail-message/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || "Mail konnte nicht geöffnet werden.");
    }
    openMailModal(data.email);
  } catch (error) {
    ui.log.textContent = error.message;
  }
}

function openMailModal(mail) {
  state.currentMail = mail;
  $("#mailSubject").textContent = mail.subject || "(kein Betreff)";
  $("#mailFrom").textContent = mail.from || "Unbekannt";
  $("#mailDate").textContent = mail.date
    ? new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(mail.date))
    : "—";
  $("#mailBody").textContent =
    mail.body || mail.snippet || "Kein Inhalt.";
  ui.mailModal.classList.add("open");
  ui.mailModal.setAttribute("aria-hidden", "false");
}

function closeMailModal() {
  ui.mailModal?.classList.remove("open");
  ui.mailModal?.setAttribute("aria-hidden", "true");
}

$("#mailClose")?.addEventListener("click", closeMailModal);

$("#mailRead")?.addEventListener("click", () => {
  if (!state.currentMail) return;
  if (!state.active) {
    ui.log.textContent = "JARVIS muss zuerst online sein.";
    return;
  }
  requestSpeech(
    `E-Mail von ${senderName(state.currentMail.from)}. Betreff: ${state.currentMail.subject}. ${state.currentMail.body || state.currentMail.snippet || ""}`
  );
});

$("#mailReply")?.addEventListener("click", async () => {
  if (!state.currentMail?.id) return;

  try {
    const response = await fetch("/api/realtime-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "create_email_reply_draft",
        arguments: {
          message_id: state.currentMail.id,
          instruction:
            "Formuliere selbstständig eine passende, professionelle und freundliche Antwort auf die Kundenmail. Beantworte das Anliegen konkret. Erfinde keine Preise, Liefertermine oder Zusagen."
        }
      })
    });

    const data = await response.json();
    if (!response.ok || !data.ok || !data.draft) {
      throw new Error(data?.error || "Entwurf fehlgeschlagen.");
    }

    state.gmailDraftId =
      data.gmail_draft_id ||
      data.draft.gmail_draft_id;

    showDraft(data.draft, "E-MAIL");
    closeMailModal();

  } catch (error) {
    ui.log.textContent = error.message;
  }
});

$("#mailDone")?.addEventListener("click", async () => {
  if (!state.currentMail?.id) return;
  try {
    await callTool(
      "move_email_to_bearbeitet",
      { message_id: state.currentMail.id }
    );
    closeMailModal();
    await loadInbox();
  } catch (error) {
    ui.log.textContent = error.message;
  }
});

/* ---------- Draft ---------- */

function showDraft(draft, target) {
  $("#draftTarget").textContent = target || "ENTWURF";
  $("#draftSubject").textContent =
    draft.subject ? `Betreff: ${draft.subject}` : "";
  $("#draftBody").textContent =
    draft.body || draft.text || "";
  ui.draftPanel.hidden = false;
}

function hideDraft() {
  ui.draftPanel.hidden = true;
}

$("#draftClose")?.addEventListener("click", hideDraft);

$("#draftCopy")?.addEventListener("click", async () => {
  const text =
    `${$("#draftSubject").textContent}\n\n${$("#draftBody").textContent}`.trim();
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
});

$("#draftSend")?.addEventListener("click", async () => {
  if (!window.confirm("Wirklich senden?")) return;

  try {
    let payload;

    if (state.whatsappVoiceDraft) {
      payload = {
        name: "send_whatsapp_voice_draft",
        arguments: {
          confirmation_text: "senden"
        }
      };
    } else if (state.newWhatsAppDraft) {
      payload = {
        name: "send_new_whatsapp_draft",
        arguments: {
          confirmation_text: "senden"
        }
      };
    } else if (state.gmailDraftId) {
      payload = {
        name: "send_email_draft",
        arguments: {
          draft_id: state.gmailDraftId,
          confirmation_text: "senden"
        }
      };
    } else {
      throw new Error("Kein sendbarer Entwurf vorhanden.");
    }

    const response = await fetch("/api/realtime-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || "Senden fehlgeschlagen.");
    }

    state.gmailDraftId = null;
    state.newWhatsAppDraft = null;
    state.whatsappVoiceDraft = null;
    hideDraft();
    loadInbox();
    loadWhatsApp();

  } catch (error) {
    ui.log.textContent = error.message;
  }
});

/* ---------- WhatsApp ---------- */

function renderWhatsApp(items) {
  if (!ui.whatsapp) return;
  if (!Array.isArray(items) || !items.length) {
    ui.whatsapp.innerHTML =
      `<div class="empty-state">Keine WhatsApp-Chats geladen.</div>`;
    return;
  }

  ui.whatsapp.innerHTML =
    items.slice(0, 5).map((item, index) => `
      <div class="wa-row" data-wa-id="${escapeHtml(item.id || "")}">
        <div class="avatar">${String(index + 1).padStart(2, "0")}</div>
        <div class="row-copy">
          <b>${escapeHtml(item.name || item.handle || "WhatsApp-Kontakt")}</b>
          <span>${escapeHtml(item.preview || "Chat öffnen")}</span>
        </div>
        <time class="row-time">${escapeHtml(formatTime(item.updated_at))}</time>
      </div>
    `).join("");
}

async function loadWhatsApp() {
  try {
    const response = await fetch(
      "/api/superchat-conversations?limit=5",
      { cache: "no-store" }
    );
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || "Superchat nicht erreichbar.");
    }
    renderWhatsApp(data.conversations);
    setDot("waDot", true);
    setConnector("sysWa", true);
  } catch (error) {
    ui.whatsapp.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message || "Superchat nicht erreichbar.")}</div>`;
    setDot("waDot", false);
    setConnector("sysWa", false);
  }
}

ui.whatsapp?.addEventListener("click", async event => {
  const row = event.target.closest("[data-wa-id]");
  if (!row?.dataset.waId) return;
  state.selectedWhatsAppId = row.dataset.waId;
  ui.log.textContent =
    "WhatsApp-Chat ausgewählt. Frag mich einfach, was der Kunde möchte.";
});

/* ---------- Weather ---------- */

const weatherCodes = {
  0:"KLAR",1:"MEIST KLAR",2:"TEILS BEWÖLKT",3:"BEDECKT",
  45:"NEBEL",48:"NEBEL",51:"NIESELN",53:"NIESELN",55:"NIESELN",
  61:"REGEN",63:"REGEN",65:"STARKREGEN",71:"SCHNEE",73:"SCHNEE",
  75:"SCHNEE",80:"SCHAUER",81:"SCHAUER",82:"SCHAUER",95:"GEWITTER"
};

async function loadWeather() {
  try {
    const response = await fetch("/api/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Ludwigshafen am Rhein",
        day: "today"
      })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data?.error || "Wetter nicht erreichbar.");
    }

    const current = data.current || {};
    const f = data.forecast || {};

    $("#wxTemp").textContent =
      typeof current.temperature_2m === "number"
        ? `${Math.round(current.temperature_2m)}°`
        : "—°";
    $("#wxWind").textContent =
      typeof current.wind_speed_10m === "number"
        ? Math.round(current.wind_speed_10m)
        : "—";
    $("#wxDesc").textContent =
      weatherCodes[f.weather_code] || "—";
    $("#wxMax").textContent =
      typeof f.max_temperature === "number"
        ? `${Math.round(f.max_temperature)}°`
        : "—°";
    $("#wxMin").textContent =
      typeof f.min_temperature === "number"
        ? `${Math.round(f.min_temperature)}°`
        : "—°";
    $("#wxRain").textContent =
      typeof f.precipitation_probability === "number"
        ? `${f.precipitation_probability}%`
        : "—%";

    setDot("wxDot", true);

  } catch {
    $("#wxDesc").textContent = "OFFLINE";
    setDot("wxDot", false);
  }
}

/* ---------- Background notices ---------- */

async function runCheckin() {
  if (!state.active || state.responseActive || state.speaking) return;

  try {
    const response = await fetch("/api/jarvis-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const data = await response.json();
    if (response.ok && data?.hasNotice && data?.text) {
      requestSpeech(data.text);
    }
  } catch {}
}

async function runReminderCheck() {
  if (!state.active || state.responseActive || state.speaking) return;

  try {
    const response = await fetch("/api/jarvis-reminder-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const data = await response.json();
    if (response.ok && data?.hasNotice && data?.text) {
      requestSpeech(data.text);
    }
  } catch {}
}

function startBackgroundChecks() {
  stopBackgroundChecks();
  state.proactiveTimer =
    setInterval(runCheckin, 15000);
  state.reminderTimer =
    setInterval(runReminderCheck, 60000);
}

function stopBackgroundChecks() {
  if (state.proactiveTimer) clearInterval(state.proactiveTimer);
  if (state.reminderTimer) clearInterval(state.reminderTimer);
  state.proactiveTimer = null;
  state.reminderTimer = null;
}

/* ---------- Quick commands ---------- */

document.querySelectorAll("[data-command]").forEach(button => {
  button.addEventListener("click", () => {
    if (!state.active) {
      ui.log.textContent = "JARVIS muss zuerst online sein.";
      return;
    }
    sendUserText(button.dataset.command);
  });
});

/* ---------- Canvas core ---------- */

(function coreAnimation() {
  const canvas = $("#coreCanvas");
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext("2d");
  const points = Array.from({ length: 140 }, (_, i) => {
    const a = i * 2.399963;
    const y = 1 - (i / 139) * 2;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });
  let rot = 0;

  function draw() {
    const size = canvas.clientWidth || 140;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);

    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }

    ctx.clearRect(0, 0, px, px);
    const cs = getComputedStyle(document.body);
    const color = cs.getPropertyValue("--core").trim() || "#e70779";
    const cx = px / 2;
    const cy = px / 2;
    const R = px * .34;
    rot += document.body.dataset.jarvisState === "speaking" ? .018 : .006;

    ctx.fillStyle = color;

    for (const p of points) {
      const x = p[0] * Math.cos(rot) - p[2] * Math.sin(rot);
      const z = p[0] * Math.sin(rot) + p[2] * Math.cos(rot);
      ctx.globalAlpha = .18 + ((z + 1) / 2) * .72;
      ctx.beginPath();
      ctx.arc(cx + x * R, cy + p[1] * R, 1.2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  draw();
})();

/* ---------- Initial dashboard ---------- */

loadShop();
loadInbox();
loadWhatsApp();
loadWeather();

setInterval(loadShop, 5 * 60 * 1000);
setInterval(loadInbox, 8 * 1000);
setInterval(loadWhatsApp, 30 * 1000);
setInterval(loadWeather, 15 * 60 * 1000);

/* Wake-word URL compatibility: ?autostart=1&startup=briefing */
window.addEventListener("load", () => {
  const params = new URLSearchParams(location.search);
  if (params.get("autostart") !== "1") return;

  setTimeout(async () => {
    try {
      await startJarvis();

      const startup = params.get("startup");
      const commands = {
        briefing: "Gib mir mein Tagesbriefing.",
        shop: "Wie läuft mein Business heute?",
        mail: "Welche wichtigen ungelesenen Mails habe ich?",
        orders: "Wie viele Bestellungen sind offen?"
      };

      if (commands[startup]) {
        setTimeout(
          () => sendUserText(commands[startup]),
          1800
        );
      }
    } catch {}
  }, 450);
});

window.addEventListener("beforeunload", () => {
  stopBackgroundChecks();
  stopIntro();
  disconnectRealtime();
  stopMic();
});
