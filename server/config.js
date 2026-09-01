// server/config.js
// Central configuration. ALL process.env access lives here and nowhere else.
// Validated with zod — exits with a named error message on any failure.

import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  // OpenAI
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  OPENAI_VOICE: z.string().default("alloy"),

  // Shopify
  SHOPIFY_STORE_DOMAIN: z.string().default(""),
  SHOPIFY_ADMIN_TOKEN: z.string().default(""),
  SHOPIFY_API_VERSION: z.string().default("2025-07"),

  // JARVIS behaviour
  JARVIS_LANGUAGE: z.string().default("de-DE"),
  JARVIS_WAKE_WORD: z.string().default("hey jarvis"),
  JARVIS_VAD_SILENCE_MS: z.coerce.number().int().min(200).max(3000).default(600),
  JARVIS_CACHE_TTL_MS: z.coerce.number().int().min(1000).default(60000),

  // Runtime
  PORT: z.coerce.number().int().default(10000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

let config;

try {
  config = schema.parse(process.env);
} catch (err) {
  const messages = err.errors
    .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
    .join("\n");
  process.stderr.write(
    `[JARVIS] Configuration error — check your .env file:\n${messages}\n`
  );
  process.exit(1);
}

export default config;

