// server/integrations/shopify/cache.js
// In-memory TTL cache shared by all Shopify API calls and voice tool lookups.
// Key = string (endpoint + serialised params).
// Shared cache means spoken "Wie ist der Umsatz heute?" reuses panel data.

import config from "../../config.js";
import logger from "../../logger.js";

const store = new Map(); // key -> { value, expiresAt }

/**
 * Get a cached value. Returns undefined on miss or expiry.
 * @param {string} key
 */
export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Store a value in the cache.
 * @param {string} key
 * @param {unknown} value
 * @param {number} [ttlMs] - overrides JARVIS_CACHE_TTL_MS when provided
 */
export function cacheSet(key, value, ttlMs) {
  const ttl = ttlMs ?? config.JARVIS_CACHE_TTL_MS;
  store.set(key, { value, expiresAt: Date.now() + ttl });
}

/**
 * Build a canonical cache key from a path and params object.
 * @param {string} path
 * @param {Record<string, unknown>} params
 * @returns {string}
 */
export function cacheKey(path, params = {}) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return sorted ? `${path}?${sorted}` : path;
}

// Periodic cleanup to avoid unbounded memory growth (runs every 5 minutes).
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [k, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(k);
      removed++;
    }
  }
  if (removed > 0) {
    logger.debug({ removed }, "Cache: expired entries evicted");
  }
}, 5 * 60 * 1000).unref();
