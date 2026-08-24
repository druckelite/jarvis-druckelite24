// web/src/panels/systemState.ts
// Displays live voice state (idle/listening/thinking/speaking/error)
// and integration health from /api/status. Updates live.

import { VoiceState, onStateChange } from "../voice/session.js";
import { CONFIG } from "../config.js";

interface StatusResult {
  ok: boolean;
  checkedAt: string;
  detail: string | null;
}

interface StatusResponse {
  openai: StatusResult;
  shopify: StatusResult;
}

export function initSystemState(container: HTMLElement) {
  // Initial render.
  updateStateDisplay(container, "idle");

  // Subscribe to voice state changes.
  onStateChange((state, detail) => {
    updateStateDisplay(container, state, detail);
  });

  // Poll /api/status.
  fetchStatus(container);
  setInterval(() => fetchStatus(container), CONFIG.STATUS_POLL_MS);
}

function updateStateDisplay(
  container: HTMLElement,
  state: VoiceState,
  detail?: string
) {
  const label = CONFIG.STATE_LABELS[state] ?? state.toUpperCase();
  const stateEl = container.querySelector<HTMLElement>(".voice-state-label");
  const detailEl = container.querySelector<HTMLElement>(".voice-state-detail");
  if (stateEl) stateEl.textContent = label;
  if (detailEl) detailEl.textContent = detail ?? "";
}

async function fetchStatus(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>(".integrations-list");
  if (!el) return;

  try {
    const resp = await fetch("/api/status");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as StatusResponse;
    renderStatus(el, data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    el.innerHTML = `<div class="panel-error">Status nicht erreichbar: ${msg}</div>`;
  }
}

function renderStatus(el: HTMLElement, data: StatusResponse) {
  const rows = (
    Object.entries(data) as [string, StatusResult][]
  )
    .map(([name, result]) => {
      const cls = result.ok ? "int-ok" : "int-fail";
      const label = result.ok ? "ONLINE" : "FEHLER";
      const detail = result.detail ? `<span class="int-detail">${result.detail}</span>` : "";
      return `
        <div class="int-row ${cls}">
          <span class="int-dot"></span>
          <span class="int-name">${name.toUpperCase()}</span>
          <span class="int-status">${label}</span>
          ${detail}
        </div>`;
    })
    .join("");

  el.innerHTML = rows;
}
