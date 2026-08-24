// web/src/config.ts
// Frontend-side configuration constants.
// Nothing secret lives here — all credentials are backend-only.

export const CONFIG = {
  // Panel poll intervals (ms)
  ORDER_POLL_MS: 60_000,
  REVENUE_DAILY_POLL_MS: 60_000,
  REVENUE_PRODUCT_POLL_MS: 300_000,
  STATUS_POLL_MS: 30_000,

  // Wake word (lowercased, matched loosely)
  WAKE_WORD: "hey jarvis",

  // Voice state labels (German)
  STATE_LABELS: {
    idle: "BEREIT",
    listening: "ZUHÖREN",
    thinking: "DENKEN",
    speaking: "SPRECHEN",
    error: "FEHLER",
    reconnecting: "VERBINDE",
  } as const,
} as const;
