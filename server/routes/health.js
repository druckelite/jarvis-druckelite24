// server/routes/health.js
// GET /api/health  — liveness check (200 when process is alive)
// GET /api/status  — per-integration readiness check

import { Router } from "express";
import config from "../config.js";
import logger from "../logger.js";

const router = Router();

const JARVIS_STARTED_AT = Date.now();

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - JARVIS_STARTED_AT) / 1000),
    version: "13.0.0",
  });
});

// ---------------------------------------------------------------------------
// GET /api/status
// Per-integration checks. Each runs a lightweight probe and returns ok/error.
// ---------------------------------------------------------------------------
router.get("/status", async (_req, res) => {
  const now = new Date().toISOString();
  const results = {
    openai: { ok: false, checkedAt: now, detail: null },
    shopify: { ok: false, checkedAt: now, detail: null },
  };

  // OpenAI probe — list models endpoint (cheap, doesn't consume realtime quota)
  try {
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      results.openai.ok = true;
    } else {
      results.openai.detail = `HTTP ${resp.status}`;
    }
  } catch (err) {
    results.openai.detail = err.message;
    logger.warn({ err: err.message }, "OpenAI status probe failed");
  }

  // Shopify probe — lightweight introspection query
  // Shopify probe - skip if credentials not configured yet
  if (!config.SHOPIFY_ADMIN_TOKEN || !config.SHOPIFY_STORE_DOMAIN) {
    results.shopify.detail = "Not configured — add SHOPIFY_ADMIN_TOKEN and SHOPIFY_STORE_DOMAIN in Render";
  } else
  try {
    const resp = await fetch(
      `https://${config.SHOPIFY_STORE_DOMAIN}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": config.SHOPIFY_ADMIN_TOKEN,
        },
        body: JSON.stringify({ query: "{ shop { name } }" }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.errors) {
        results.shopify.detail = data.errors[0]?.message ?? "GraphQL error";
      } else {
        results.shopify.ok = true;
      }
    } else {
      results.shopify.detail = `HTTP ${resp.status}`;
    }
  } catch (err) {
    results.shopify.detail = err.message;
    logger.warn({ err: err.message }, "Shopify status probe failed");
  }

  res.json(results);
});

export default router;
