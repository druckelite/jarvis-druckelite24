// server/logger.js
// Pino structured-JSON logger. Single export consumed by all server modules.
// Log level comes from config, defaulting to "info".
// NEVER log tokens, API keys, or full customer records.

import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
