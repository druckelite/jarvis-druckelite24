// server/routes/realtime.js
// POST /api/realtime/session
//
// Mints a short-lived ephemeral client secret from OpenAI and returns ONLY
// that secret + the model ID to the browser. The full OPENAI_API_KEY never
// leaves the server.
//
// VERIFIED endpoint (2026-08):
//   POST https://api.openai.com/v1/realtime/sessions
//   Returns: { client_secret: { value: "ek_..." }, model: "..." }
//
// The browser then connects directly to OpenAI via WebRTC using that secret.
// Audio NEVER transits this server.

import { Router } from "express";
import config from "../config.js";
import logger from "../logger.js";

const router = Router();

router.post("/session", async (_req, res) => {
  try {
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.OPENAI_REALTIME_MODEL,
        voice: config.OPENAI_VOICE,
        // Session instructions are set client-side via a session.update event
        // after the data channel opens, so the browser can customise them.
        // We pass a minimal config here to keep token minting fast.
        modalities: ["audio", "text"],
        input_audio_transcription: {
          model: "whisper-1",
          language: "de",
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.error(
        { status: resp.status },
        "OpenAI realtime session creation failed"
      );
      // Never return the raw upstream body — it may contain details that
      // could aid an attacker. Return a sanitised message.
      return res.status(resp.status).json({
        error: {
          code: "openai_session_error",
          message: `OpenAI returned ${resp.status}. Check OPENAI_API_KEY and model name.`,
        },
      });
    }

    const data = await resp.json();

    logger.info(
      { model: config.OPENAI_REALTIME_MODEL, voice: config.OPENAI_VOICE },
      "Realtime ephemeral token minted"
    );

    // Return ONLY what the browser needs. Strip any other fields.
    return res.json({
      client_secret: data.client_secret,
      model: config.OPENAI_REALTIME_MODEL,
    });
  } catch (err) {
    logger.error({ err: err.message }, "Realtime session endpoint error");
    return res.status(500).json({
      error: {
        code: "server_error",
        message: "Failed to create realtime session. Try again.",
      },
    });
  }
});

export default router;
