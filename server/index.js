// server/index.js
// Express 4 application bootstrap.
// Mounts all routes, adds pino-http request logging.
// Serves the Vite-built frontend from web/dist in production.

import express from "express";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pinoHttp from "pino-http";

import config from "./config.js";
import logger from "./logger.js";
import healthRouter from "./routes/health.js";
import realtimeRouter from "./routes/realtime.js";
import shopifyRouter from "./routes/shopify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ---------------------------------------------------------------------------
// Request logging (pino-http)
// ---------------------------------------------------------------------------
app.use(
  pinoHttp({
    logger,
    // Redact any token-shaped values from log output.
    redact: ["req.headers.authorization", "req.headers['x-shopify-access-token']"],
    // Don't log health checks at info level — too noisy.
    customLogLevel(req, res, err) {
      if (res.statusCode < 400 && req?.url === "/api/health") return "trace";
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  })
);

// ---------------------------------------------------------------------------
// Body parsing (JSON for API routes)
// ---------------------------------------------------------------------------
app.use("/api", express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use("/api", healthRouter);
app.use("/api/realtime", realtimeRouter);
app.use("/api/shopify", shopifyRouter);

// ---------------------------------------------------------------------------
// Static frontend (Vite build output)
// ---------------------------------------------------------------------------
const distPath = join(__dirname, "..", "web", "dist");

if (config.NODE_ENV === "production") {
  app.use(express.static(distPath));
  // Mail Studio — serve dedicated HTML at /mail
  app.get("/mail", (_req, res) => {
    res.sendFile(join(__dirname, "..", "druckelite24-mail.html"));
  });
  // SPA fallback — serve index.html for any non-API route.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(distPath, "index.html"));
  });
} else {
  // In dev, Vite serves the frontend on a separate port.
  // Keep the Intro.mp3 file accessible directly for local testing.
  app.use(express.static(join(__dirname, "..")));
}

// ---------------------------------------------------------------------------
// Unhandled route (API 404)
// ---------------------------------------------------------------------------
app.use("/api/*", (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "API route not found." } });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, "Unhandled error");
  res.status(500).json({ error: { code: "server_error", message: "Internal server error." } });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, model: config.OPENAI_REALTIME_MODEL },
    "JARVIS server started"
  );
});

export default app;
