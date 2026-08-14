const button = document.querySelector("#toggle");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const remoteAudio = document.querySelector("#remoteAudio");

let pc = null;
let dc = null;
let localStream = null;
let active = false;

function setStatus(text) {
  statusEl.textContent = text;
}

function log(text) {
  logEl.textContent = text;
}

async function runTool(event) {
  let endpoint;
  let payload = {};
  try {
    payload = event.arguments ? JSON.parse(event.arguments) : {};
  } catch {}

  if (event.name === "get_shopify_summary") endpoint = "/api/shopify-summary";
  if (event.name === "get_important_emails") endpoint = "/api/important-emails";
  if (event.name === "get_calendar_today") endpoint = "/api/calendar-today";

  let result;
  if (!endpoint) {
    result = { error: `Unbekanntes Tool: ${event.name}` };
  } else {
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      result = await r.json();
    } catch (error) {
      result = { error: "Tool-Verbindung fehlgeschlagen." };
    }
  }

  dc.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: event.call_id,
      output: JSON.stringify(result)
    }
  }));
  dc.send(JSON.stringify({ type: "response.create" }));
}

async function startJarvis() {
  setStatus("Verbinde …");
  log("Mikrofon wird vorbereitet.");

  pc = new RTCPeerConnection();
  remoteAudio.srcObject = new MediaStream();

  pc.ontrack = (event) => {
    remoteAudio.srcObject.addTrack(event.track);
    remoteAudio.play().catch(() => {});
  };

  dc = pc.createDataChannel("oai-events");
  dc.onopen = () => {
    setStatus("Online");
    log("JARVIS hört zu.");
  };
  dc.onmessage = async (message) => {
    const event = JSON.parse(message.data);

    if (event.type === "response.function_call_arguments.done") {
      log(`Live-Daten: ${event.name}`);
      await runTool(event);
    }

    if (event.type === "error") {
      console.error(event);
      log("JARVIS-Fehler. Details stehen im Browser-Log.");
    }
  };

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch("/session", {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offer.sdp
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const answer = {
    type: "answer",
    sdp: await response.text()
  };
  await pc.setRemoteDescription(answer);
  active = true;
  button.classList.add("active");
}

function stopJarvis() {
  if (dc) dc.close();
  if (pc) pc.close();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  pc = dc = localStream = null;
  active = false;
  button.classList.remove("active");
  setStatus("Offline");
  log("Verbindung beendet.");
}

button.addEventListener("click", async () => {
  if (active) return stopJarvis();
  try {
    await startJarvis();
  } catch (error) {
    console.error(error);
    stopJarvis();
    log(`Start fehlgeschlagen: ${error.message}`);
  }
});
