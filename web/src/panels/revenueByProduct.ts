// web/src/panels/revenueByProduct.ts
// Top 10 products by revenue (last 30 days) with quantity. 300 s poll.

import { CONFIG } from "../config.js";

interface Product {
  title: string;
  revenue: number;
  quantity: number;
}

function formatEur(amount: number, currency: string): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function initRevenueByProduct(container: HTMLElement) {
  render(container, null, "Laden …");
  fetchAndRender(container);
  setInterval(() => fetchAndRender(container), CONFIG.REVENUE_PRODUCT_POLL_MS);
}

async function fetchAndRender(container: HTMLElement) {
  try {
    const resp = await fetch("/api/shopify/revenue/by-product?days=30&limit=10");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { products: Product[]; currency: string };
    render(container, data.products, null, data.currency);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    render(container, null, `Fehler: ${msg}`);
  }
}

function render(
  container: HTMLElement,
  products: Product[] | null,
  error: string | null,
  currency = "EUR"
) {
  if (error) {
    container.innerHTML = `<div class="panel-error">${error}</div>`;
    return;
  }
  if (!products || products.length === 0) {
    container.innerHTML = `<div class="empty-state">Keine Produkte</div>`;
    return;
  }

  const maxRevenue = Math.max(...products.map((p) => p.revenue), 1);

  const rows = products
    .map(
      (p, i) => `
      <div class="product-row">
        <span class="product-rank">${i + 1}</span>
        <span class="product-title">${p.title}</span>
        <div class="product-bar-wrap">
          <div class="product-bar" style="--pct:${Math.round((p.revenue / maxRevenue) * 100)}%"></div>
        </div>
        <span class="product-revenue">${formatEur(p.revenue, currency)}</span>
        <span class="product-qty">${p.quantity} Stk.</span>
      </div>`
    )
    .join("");

  container.innerHTML = `<div class="product-list">${rows}</div>`;
}
