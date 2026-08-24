// web/src/panels/revenueDaily.ts
// Daily revenue for last 7 days — pure CSS bar chart, today highlighted. 60 s poll.

import { CONFIG } from "../config.js";

interface DayData {
  date: string;
  revenue: number;
  orderCount: number;
  isToday: boolean;
}

function formatEur(amount: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}.${m}`;
}

export function initRevenueDaily(container: HTMLElement) {
  render(container, null, "Laden …");
  fetchAndRender(container);
  setInterval(() => fetchAndRender(container), CONFIG.REVENUE_DAILY_POLL_MS);
}

async function fetchAndRender(container: HTMLElement) {
  try {
    const resp = await fetch("/api/shopify/revenue/daily?days=7");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { days: DayData[]; currency: string };
    render(container, data.days, null, data.currency);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    render(container, null, `Fehler: ${msg}`);
  }
}

function render(
  container: HTMLElement,
  days: DayData[] | null,
  error: string | null,
  currency = "EUR"
) {
  if (error) {
    container.innerHTML = `<div class="panel-error">${error}</div>`;
    return;
  }
  if (!days || days.length === 0) {
    container.innerHTML = `<div class="empty-state">Keine Daten</div>`;
    return;
  }

  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);

  const bars = days
    .map((d) => {
      const pct = Math.round((d.revenue / maxRevenue) * 100);
      const cls = d.isToday ? "bar today" : "bar";
      return `
        <div class="bar-col${d.isToday ? " bar-col--today" : ""}">
          <div class="bar-label">${formatEur(d.revenue, currency)}</div>
          <div class="${cls}" style="--pct:${pct}%"></div>
          <div class="bar-date">${shortDate(d.date)}</div>
          <div class="bar-count">${d.orderCount} Auftr.</div>
        </div>`;
    })
    .join("");

  container.innerHTML = `<div class="bar-chart">${bars}</div>`;
}
