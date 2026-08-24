// web/src/panels/orderWall.ts
// Live order wall — most recent 20 orders, 60 s polling.

import { CONFIG } from "../config.js";

interface Order {
  id: string;
  name: string;
  customer: string;
  total: number;
  currency: string;
  createdAt: string;
  fulfillmentStatus: string;
}

const STATUS_LABELS: Record<string, string> = {
  UNFULFILLED: "OFFEN",
  FULFILLED: "VERSANDT",
  PARTIALLY_FULFILLED: "TEIL",
  IN_PROGRESS: "IN BEARBEITUNG",
  SCHEDULED: "GEPLANT",
  ON_HOLD: "WARTEN",
  RESTOCKED: "STORNIERT",
};

function formatEur(amount: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function statusClass(status: string): string {
  if (status === "FULFILLED") return "status-ok";
  if (status === "UNFULFILLED") return "status-open";
  return "status-other";
}

export function initOrderWall(container: HTMLElement) {
  render(container, null, "Laden …");
  fetchAndRender(container);
  setInterval(() => fetchAndRender(container), CONFIG.ORDER_POLL_MS);
}

async function fetchAndRender(container: HTMLElement) {
  try {
    const resp = await fetch("/api/shopify/orders/recent?limit=20");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { orders: Order[]; cachedAt: string };
    render(container, data.orders, null, data.cachedAt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    render(container, null, `Fehler: ${msg}`);
  }
}

function render(
  container: HTMLElement,
  orders: Order[] | null,
  error: string | null,
  cachedAt?: string
) {
  if (error) {
    container.innerHTML = `<div class="panel-error">${error}</div>`;
    return;
  }
  if (!orders || orders.length === 0) {
    container.innerHTML = `<div class="empty-state">Keine Bestellungen</div>`;
    return;
  }

  const rows = orders
    .map(
      (o) => `
      <div class="order-row">
        <span class="order-name">${o.name}</span>
        <span class="order-customer">${o.customer}</span>
        <span class="order-total">${formatEur(o.total, o.currency)}</span>
        <span class="order-time">${formatTime(o.createdAt)}</span>
        <span class="order-status ${statusClass(o.fulfillmentStatus)}">${STATUS_LABELS[o.fulfillmentStatus] ?? o.fulfillmentStatus}</span>
      </div>`
    )
    .join("");

  const updated = cachedAt
    ? `Aktualisiert: ${formatTime(cachedAt)}`
    : "";

  container.innerHTML = `
    <div class="order-list">${rows}</div>
    <div class="panel-foot">${updated}</div>
  `;
}
