// server.js — Render compatibility shim
// Render dashboard is configured to run "node server.js".
// This file simply forwards to the real entry point at server/index.js.
// To update Render to use "node server/index.js" directly:
//   Render Dashboard -> Settings -> Start Command -> node server/index.js
import "./server/index.js";
