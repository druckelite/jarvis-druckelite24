// web/src/main.ts
// Application entry point.
// Wires together voice session, panels, clock, and tap-to-talk.

import "./styles/app.css";

import { connect, disconnect, onStateChange } from "./voice/session.js";
import { initTapToTalk, startWakeWordDetection } from "./voice/wakeword.js";
import { initOrderWall } from "./panels/orderWall.js";
import { initRevenueDaily } from "./panels/revenueDaily.js";
import { initRevenueByProduct } from "./panels/revenueByProduct.js";
import { initSystemState } from "./panels/systemState.js";
import { CONFIG } from "./config.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector<T>(sel)!;

const orbEl         = $<HTMLButtonElement>(".voice-orb");
const stateLabelEl  = $<HTMLElement>(".voice-state-label");
const stateDetailEl = $<HTMLElement>(".voice-state-detail");
const tapBtn        = $<HTMLButtonElement>("#tapBtn");
const clockTimeEl   = $<HTMLElement>("#clockTime");
const clockDateEl   = $<HTMLElement>("#clockDate");

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
function updateClock() {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const dateStr = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
  if (clockTimeEl) clockTimeEl.textContent = timeStr;
  if (clockDateEl) clockDateEl.textContent = dateStr;
}
updateClock();
setInterval(updateClock, 1000);

// ---------------------------------------------------------------------------
// Voice state display
// ---------------------------------------------------------------------------
onStateChange((state, detail) => {
  if (stateLabelEl) stateLabelEl.textContent = CONFIG.STATE_LABELS[state] ?? state.toUpperCase();
  if (stateDetailEl) stateDetailEl.textContent = detail ?? "";
});

// ---------------------------------------------------------------------------
// Orb click — connect or disconnect
// ---------------------------------------------------------------------------
let sessionActive = false;

async function toggleSession() {
  if (sessionActive) {
    disconnect();
    sessionActive = false;
    if (tapBtn) { tapBtn.disabled = true; tapBtn.textContent = "?? SPRECHEN"; }
  } else {
    try {
      await connect();
      sessionActive = true;
      if (tapBtn) tapBtn.disabled = false;
      // Start wake word detection after mic is granted.
      startWakeWordDetection();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (stateDetailEl) stateDetailEl.textContent = msg;
    }
  }
}

if (orbEl) orbEl.addEventListener("click", toggleSession);

// ---------------------------------------------------------------------------
// Tap-to-talk
// ---------------------------------------------------------------------------
if (tapBtn) initTapToTalk(tapBtn);

// ---------------------------------------------------------------------------
// Dashboard panels
// ---------------------------------------------------------------------------
const orderContainer      = $<HTMLElement>("#panelOrdersBody");
const revDailyContainer   = $<HTMLElement>("#panelRevenueDailyBody");
const revProductContainer = $<HTMLElement>("#panelRevProductBody");
const systemContainer     = $<HTMLElement>("#panelSystem");

if (orderContainer)      initOrderWall(orderContainer);
if (revDailyContainer)   initRevenueDaily(revDailyContainer);
if (revProductContainer) initRevenueByProduct(revProductContainer);
if (systemContainer)     initSystemState(systemContainer);


