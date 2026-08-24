// server/integrations/shopify/client.js
// Shopify Admin GraphQL HTTP client.
// Implements cost-aware rate-limit handling with exponential backoff.
// Read-only — no mutations, no writes.

import config from "../../config.js";
import logger from "../../logger.js";

const GQL_ENDPOINT = `https://${config.SHOPIFY_STORE_DOMAIN}/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`;

// Leaky-bucket state (restored from throttleStatus on each response).
let bucketAvailable = 1000; // conservative start
let bucketMaximum = 1000;

/**
 * Execute a GraphQL query against the Shopify Admin API.
 * Automatically retries on throttle with exponential backoff.
 *
 * @param {string} query - GraphQL document
 * @param {Record<string, unknown>} variables
 * @param {number} [attempt] - internal retry counter
 * @returns {Promise<unknown>} - the `data` field of the GraphQL response
 */
export async function shopifyQuery(query, variables = {}, attempt = 0) {
  const MAX_ATTEMPTS = 4;
  const BASE_DELAY_MS = 500;

  if (attempt >= MAX_ATTEMPTS) {
    throw new Error("Shopify GraphQL: max retry attempts exceeded");
  }

  // Back off proactively if the bucket is running low (< 20% remaining).
  if (bucketAvailable < bucketMaximum * 0.2 && attempt === 0) {
    const wait = 1000;
    logger.warn({ bucketAvailable, bucketMaximum }, "Shopify bucket low, backing off");
    await sleep(wait);
  }

  let resp;
  try {
    resp = await fetch(GQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.error({ err: err.message, attempt }, "Shopify fetch network error");
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(BASE_DELAY_MS * 2 ** attempt);
      return shopifyQuery(query, variables, attempt + 1);
    }
    throw err;
  }

  // Handle HTTP-level throttle (429) or server errors (5xx).
  if (resp.status === 429 || resp.status >= 500) {
    const retryAfter = Number(resp.headers.get("Retry-After") || 0) * 1000;
    const delay = Math.max(retryAfter, BASE_DELAY_MS * 2 ** attempt);
    logger.warn(
      { status: resp.status, delay, attempt },
      "Shopify rate limit or server error, retrying"
    );
    await sleep(delay);
    return shopifyQuery(query, variables, attempt + 1);
  }

  if (!resp.ok) {
    // 401 / 403 — credential problem, do not retry.
    const body = await resp.text();
    logger.error({ status: resp.status }, "Shopify returned non-retryable error");
    throw Object.assign(new Error(`Shopify HTTP ${resp.status}`), {
      status: resp.status,
      // Don't include body — may contain sensitive info.
    });
  }

  const json = await resp.json();

  // Update bucket from throttle extensions.
  const throttle = json?.extensions?.cost?.throttleStatus;
  if (throttle) {
    bucketAvailable = throttle.currentlyAvailable ?? bucketAvailable;
    bucketMaximum = throttle.maximumAvailable ?? bucketMaximum;
    logger.debug(
      { bucketAvailable, bucketMaximum },
      "Shopify throttle status updated"
    );
  }

  // GraphQL user errors — these are not retriable.
  if (json.errors) {
    const msg = json.errors[0]?.message ?? "Unknown GraphQL error";
    // Check for throttle within GraphQL errors (some versions return it here).
    if (msg.toLowerCase().includes("throttl")) {
      const delay = BASE_DELAY_MS * 2 ** attempt;
      logger.warn({ delay, attempt }, "Shopify GraphQL throttle, retrying");
      await sleep(delay);
      return shopifyQuery(query, variables, attempt + 1);
    }
    throw new Error(`Shopify GraphQL error: ${msg}`);
  }

  return json.data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
