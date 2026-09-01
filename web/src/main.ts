// web/src/main.ts — JARVIS Druckelite24 UI entry point
import "./styles/app.css";
import { connect, disconnect, onStateChange, VoiceState } from "./voice/session.js";
import { initTapToTalk, startWakeWordDetection } from "./voice/wakeword.js";

// ─── DOM helpers ───────────────────────────────────────────────────────────
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ─── State display ─────────────────────────────────────────────────────────
const stateLabels: Record<VoiceState, string> = {
  idle: "BEREIT FÜR IHRE ANWEISUNGEN",
  listening: "ICH HÖRE ZU...",
  thinking: "VERARBEITE IHRE ANFRAGE...",
  speaking: "JARVIS SPRICHT",
  error: "VERBINDUNGSFEHLER",
  reconnecting: "VERBINDE...",
};
const onlineLabels: Record<VoiceState, string> = {
  idle: "● ONLINE",
  listening: "● ZUHÖREN",
  thinking: "● DENKEN",
  speaking: "● SPRECHEN",
  error: "● FEHLER",
  reconnecting: "● VERBINDE",
};

onStateChange((state: VoiceState, detail?: string) => {
  const detailEl = el("statusDetail");
  const onlineEl = el("onlineLabel");
  if (detailEl) detailEl.textContent = detail ?? stateLabels[state];
  if (onlineEl) onlineEl.textContent = onlineLabels[state];
});

// ─── Connect button (orb / connect icon) ──────────────────────────────────
let sessionActive = false;
const connectBtn = el("connectBtn");
const micFab = el("micFab") as HTMLButtonElement;

async function toggleSession() {
  if (sessionActive) {
    disconnect();
    sessionActive = false;
    micFab.disabled = true;
    micFab.dataset["active"] = "false";
  } else {
    try {
      await connect();
      sessionActive = true;
      micFab.disabled = false;
      startWakeWordDetection();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const d = el("statusDetail");
      if (d) d.textContent = msg;
    }
  }
}
if (connectBtn) connectBtn.addEventListener("click", toggleSession);

// ─── Tap-to-talk (mic FAB) ────────────────────────────────────────────────
if (micFab) {
  initTapToTalk(micFab);
  micFab.disabled = true;
}

// ─── Quick chip commands ───────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>(".quick-chip[data-cmd]").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!sessionActive) {
      await toggleSession();
      setTimeout(() => { /* command would be sent after session ready */ }, 800);
    }
  });
});

// ─── Particle canvas ───────────────────────────────────────────────────────
initParticles();

function initParticles() {
  const canvas = document.getElementById("particleCanvas") as HTMLCanvasElement;
  if (!canvas) return;
  const wrap = canvas.parentElement!;
  const ctx = canvas.getContext("2d")!;

  function resize() {
    canvas.width = wrap.offsetWidth;
    canvas.height = wrap.offsetHeight;
  }
  resize();
  new ResizeObserver(resize).observe(wrap);

  type Particle = {
    x: number; y: number; vx: number; vy: number;
    r: number; life: number; maxLife: number; hue: number;
  };
  const particles: Particle[] = [];
  const cx = () => canvas.width / 2;
  const cy = () => canvas.height / 2;

  function spawn() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 80;
    particles.push({
      x: cx() + Math.cos(angle) * radius,
      y: cy() + Math.sin(angle) * radius,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.3 - Math.random() * 0.5,
      r: 1 + Math.random() * 1.5,
      life: 0,
      maxLife: 80 + Math.random() * 80,
      hue: 310 + Math.random() * 40,
    });
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (Math.random() < 0.4) spawn();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      const t = p.life / p.maxLife;
      const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},100%,65%,${alpha * 0.7})`;
      ctx.fill();
      if (p.life >= p.maxLife) particles.splice(i, 1);
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// ─── Weather (Open-Meteo, free, no key) ───────────────────────────────────
fetchWeather();
setInterval(fetchWeather, 30 * 60 * 1000);

async function fetchWeather() {
  const WX_ICONS: Record<number, string> = {
    0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",48:"🌫",
    51:"🌦",53:"🌦",55:"🌧",61:"🌧",63:"🌧",65:"🌧",
    71:"🌨",73:"🌨",75:"❄️",80:"🌦",81:"🌧",82:"⛈",
    95:"⛈",96:"⛈",99:"⛈"
  };
  const WX_DESC: Record<number, string> = {
    0:"Klar",1:"Überwiegend klar",2:"Teils bewölkt",3:"Bedeckt",
    45:"Nebel",48:"Nebel",51:"Leichter Nieselregen",53:"Nieselregen",55:"Starker Nieselregen",
    61:"Leichter Regen",63:"Regen",65:"Starker Regen",
    71:"Leichter Schnee",73:"Schnee",75:"Starker Schnee",
    80:"Schauer",81:"Starke Schauer",82:"Heftiger Schauer",
    95:"Gewitter",96:"Gewitter mit Hagel",99:"Schweres Gewitter"
  };
  try {
    const r = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=49.4774&longitude=8.4352" +
      "&current_weather=true&daily=temperature_2m_max,temperature_2m_min," +
      "precipitation_probability_max,windspeed_10m_max&timezone=Europe%2FBerlin&forecast_days=1"
    );
    const data = await r.json() as {
      current_weather: { temperature: number; windspeed: number; weathercode: number };
      daily: {
        temperature_2m_max: number[]; temperature_2m_min: number[];
        precipitation_probability_max: number[]; windspeed_10m_max: number[];
      };
    };
    const cw = data.current_weather;
    const d = data.daily;
    const code = cw.weathercode;
    const tempEl = el("wxTemp"); if (tempEl) tempEl.textContent = `${Math.round(cw.temperature)}°`;
    const iconEl = el("wxIcon"); if (iconEl) iconEl.textContent = WX_ICONS[code] ?? "🌡";
    const descEl = el("wxDesc"); if (descEl) descEl.textContent = WX_DESC[code] ?? "";
    const maxEl  = el("wxMax");  if (maxEl)  maxEl.textContent  = `${Math.round(d.temperature_2m_max[0])}°`;
    const minEl  = el("wxMin");  if (minEl)  minEl.textContent  = `${Math.round(d.temperature_2m_min[0])}°`;
    const rainEl = el("wxRain"); if (rainEl) rainEl.textContent = `${d.precipitation_probability_max[0] ?? 0}%`;
    const windEl = el("wxWind"); if (windEl) windEl.textContent = `${Math.round(d.windspeed_10m_max[0])} km/h`;
  } catch { /* silent fail */ }
}

// ─── Shopify stats from existing endpoints ────────────────────────────────
fetchShopifyStats();
setInterval(fetchShopifyStats, 60_000);

async function fetchShopifyStats() {
  try {
    // Daily revenue
    const [revResp, ordResp] = await Promise.all([
      fetch("/api/shopify/revenue/daily?days=7"),
      fetch("/api/shopify/orders/recent?limit=20"),
    ]);
    if (revResp.ok) {
      const revData = await revResp.json() as {
        days: { date: string; revenue: number; orderCount: number; isToday: boolean }[];
        currency: string;
      };
      const today = revData.days.find(d => d.isToday);
      const yesterday = revData.days[revData.days.length - 2];
      const revTodayEl = el("statRevToday");
      if (revTodayEl) revTodayEl.textContent = fmtEur(today?.revenue ?? 0, revData.currency);
      const ordTodayEl = el("statOrdToday");
      if (ordTodayEl) ordTodayEl.textContent = String(today?.orderCount ?? 0);
      // Trend
      if (today && yesterday && yesterday.revenue > 0) {
        const pct = ((today.revenue - yesterday.revenue) / yesterday.revenue * 100).toFixed(1);
        const s = el("statRevSub");
        if (s) s.textContent = `${Number(pct) >= 0 ? "▲" : "▼"} ${Math.abs(Number(pct))}% vs. gestern`;
      }
      // Mini bars
      renderMiniBars(revData.days);
    }
    if (ordResp.ok) {
      const ordData = await ordResp.json() as {
        orders: { fulfillmentStatus: string }[];
      };
      const open = ordData.orders.filter(o => o.fulfillmentStatus === "UNFULFILLED").length;
      const fulfilled = ordData.orders.filter(o => o.fulfillmentStatus === "FULFILLED").length;
      const openEl = el("statOpen");
      if (openEl) openEl.textContent = String(open);
      const fulfEl = el("statFulfilled");
      if (fulfEl) fulfEl.textContent = fmtEur(0, "EUR").replace("0,00","—") + " / " + fulfilled;
    }
  } catch { /* silent */ }
}

function fmtEur(amount: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(amount);
}

function renderMiniBars(days: { revenue: number; isToday: boolean }[]) {
  const container = el("revBars");
  if (!container) return;
  const max = Math.max(...days.map(d => d.revenue), 1);
  container.innerHTML = days.map(d => {
    const pct = Math.max(4, Math.round((d.revenue / max) * 100));
    return `<div class="mini-bar${d.isToday ? " today" : ""}" style="height:${pct}%"></div>`;
  }).join("");
}

// ─── Status grid live check ───────────────────────────────────────────────
fetchStatus();
setInterval(fetchStatus, 30_000);

async function fetchStatus() {
  try {
    const r = await fetch("/api/status");
    if (!r.ok) return;
    const data = await r.json() as {
      openai: { ok: boolean; detail: string | null };
      shopify: { ok: boolean; detail: string | null };
    };
    setDot("sgOpenAIDot", "sgOpenAISub", data.openai.ok, data.openai.detail ?? "");
    setDot("sgShopifyDot", "sgShopifySub", data.shopify.ok, data.shopify.detail ?? "");
  } catch { /* silent */ }
}

function setDot(dotId: string, subId: string, ok: boolean, detail: string) {
  const dot = el(dotId);
  const sub = el(subId);
  if (dot) { dot.className = "sg-dot " + (ok ? "ok" : "err"); }
  if (sub) sub.textContent = ok ? "Verbunden" : (detail || "Fehler");
}

