// server/routes/shopify.js
// Three read-only Shopify data endpoints consumed by dashboard panels and
// voice tools. All responses are cached (JARVIS_CACHE_TTL_MS).
//
// GET /api/shopify/orders/recent?limit=20
// GET /api/shopify/revenue/daily?days=7
// GET /api/shopify/revenue/by-product?days=30&limit=10

import { Router } from "express";
import { shopifyQuery } from "../integrations/shopify/client.js";
import {
  RECENT_ORDERS_QUERY,
  ORDERS_IN_RANGE_QUERY,
  PRODUCT_REVENUE_QUERY,
} from "../integrations/shopify/queries.js";
import { cacheGet, cacheSet, cacheKey } from "../integrations/shopify/cache.js";
import logger from "../logger.js";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO string to YYYY-MM-DD (Berlin / Europe timezone). */
function toDateStr(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Get Berlin midnight UTC for a given YYYY-MM-DD string. */
function berlinMidnightUTC(dateStr) {
  // dateStr = "2026-08-22"
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use Intl to find the UTC offset at that local midnight.
  const approx = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(approx);
  const vals = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  const localAsUTC = Date.UTC(+vals.year, +vals.month - 1, +vals.day, +vals.hour, +vals.minute, +vals.second);
  return new Date(approx.getTime() - (localAsUTC - approx.getTime()));
}

/** Paginate through all orders in a date range using a GraphQL query. */
async function fetchAllOrderPages(query, minISO, maxISO) {
  const results = [];
  let cursor = null;
  let pages = 0;
  do {
    const data = await shopifyQuery(query, {
      createdAtMin: minISO,
      createdAtMax: maxISO,
      cursor,
    });
    const conn = data.orders;
    for (const { node } of conn.edges) results.push(node);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    pages++;
    if (pages > 20) break; // safety limit
  } while (cursor);
  return results;
}

/** Standardised error response — never leaks upstream details. */
function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// ---------------------------------------------------------------------------
// GET /api/shopify/orders/recent
// ---------------------------------------------------------------------------
router.get("/orders/recent", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 50);
  const key = cacheKey("orders/recent", { limit });
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    const data = await shopifyQuery(RECENT_ORDERS_QUERY, { limit });
    const orders = data.orders.edges.map(({ node }) => ({
      id: node.id,
      name: node.name,
      customer: node.customer?.displayName ?? "Unbekannt",
      total: parseFloat(node.totalPriceSet.shopMoney.amount),
      currency: node.totalPriceSet.shopMoney.currencyCode,
      createdAt: node.createdAt,
      fulfillmentStatus: node.displayFulfillmentStatus,
    }));
    const payload = { orders, cachedAt: new Date().toISOString() };
    cacheSet(key, payload);
    logger.info({ count: orders.length }, "Shopify recent orders fetched");
    return res.json(payload);
  } catch (err) {
    logger.error({ err: err.message }, "orders/recent failed");
    const status = err.status === 401 ? 401 : 502;
    return sendError(res, status, "shopify_error", "Could not fetch orders. Check Shopify credentials.");
  }
});

// ---------------------------------------------------------------------------
// GET /api/shopify/revenue/daily
// ---------------------------------------------------------------------------
router.get("/revenue/daily", async (req, res) => {
  const days = Math.min(parseInt(req.query.days ?? "7", 10), 30);
  const key = cacheKey("revenue/daily", { days });
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    const now = new Date();
    const todayStr = toDateStr(now);

    // Build array of day strings (oldest first).
    const dayStrings = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dayStrings.push(toDateStr(d));
    }

    const oldestDay = dayStrings[0];
    const minDate = berlinMidnightUTC(oldestDay);
    const maxDate = new Date(now.getTime() + 86400000); // now + 1 day buffer

    const orders = await fetchAllOrderPages(
      ORDERS_IN_RANGE_QUERY,
      minDate.toISOString(),
      maxDate.toISOString()
    );

    // Group by Berlin date.
    const byDay = {};
    let currency = "EUR";
    for (const order of orders) {
      const dayStr = toDateStr(new Date(order.createdAt));
      if (!byDay[dayStr]) byDay[dayStr] = { revenue: 0, orderCount: 0 };
      byDay[dayStr].revenue += parseFloat(order.totalPriceSet.shopMoney.amount);
      byDay[dayStr].orderCount++;
      currency = order.totalPriceSet.shopMoney.currencyCode;
    }

    const daysResult = dayStrings.map((date) => ({
      date,
      revenue: Math.round((byDay[date]?.revenue ?? 0) * 100) / 100,
      orderCount: byDay[date]?.orderCount ?? 0,
      isToday: date === todayStr,
    }));

    const payload = { days: daysResult, currency, cachedAt: new Date().toISOString() };
    cacheSet(key, payload);
    logger.info({ days }, "Shopify daily revenue fetched");
    return res.json(payload);
  } catch (err) {
    logger.error({ err: err.message }, "revenue/daily failed");
    return sendError(res, 502, "shopify_error", "Could not fetch daily revenue.");
  }
});

// ---------------------------------------------------------------------------
// GET /api/shopify/revenue/by-product
// ---------------------------------------------------------------------------
router.get("/revenue/by-product", async (req, res) => {
  const days = Math.min(parseInt(req.query.days ?? "30", 10), 60);
  const limit = Math.min(parseInt(req.query.limit ?? "10", 10), 20);
  const key = cacheKey("revenue/by-product", { days, limit });
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  try {
    const now = new Date();
    const minDate = new Date(now.getTime() - days * 86400000);
    const orders = await fetchAllOrderPages(
      PRODUCT_REVENUE_QUERY,
      minDate.toISOString(),
      now.toISOString()
    );

    // Aggregate by product title.
    const map = {};
    let currency = "EUR";
    for (const order of orders) {
      for (const { node: li } of order.lineItems.edges) {
        const title = li.title;
        if (!map[title]) map[title] = { revenue: 0, quantity: 0 };
        map[title].revenue += parseFloat(li.originalTotalSet.shopMoney.amount);
        map[title].quantity += li.quantity;
        currency = li.originalTotalSet.shopMoney.currencyCode;
      }
    }

    const products = Object.entries(map)
      .map(([title, vals]) => ({
        title,
        revenue: Math.round(vals.revenue * 100) / 100,
        quantity: vals.quantity,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);

    const payload = { products, currency, cachedAt: new Date().toISOString() };
    cacheSet(key, payload);
    logger.info({ days, productCount: products.length }, "Shopify product revenue fetched");
    return res.json(payload);
  } catch (err) {
    logger.error({ err: err.message }, "revenue/by-product failed");
    return sendError(res, 502, "shopify_error", "Could not fetch product revenue.");
  }
});

export default router;

