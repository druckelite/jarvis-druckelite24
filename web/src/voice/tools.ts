// web/src/voice/tools.ts
// Registers three Shopify data tools on the OpenAI Realtime session.
// When the model emits a function_call event, this module fetches the data
// from our backend and returns it as a function_call_output event.
//
// Tool descriptions are in German-oriented terms so the model correctly maps
// natural German phrases to the right tool.

import { sendEvent } from "./session.js";

interface FunctionCallEvent {
  type: "response.function_call_arguments.done";
  call_id: string;
  name: string;
  arguments: string;
}

// Tool definitions to register on the session.
export const TOOLS = [
  {
    type: "function",
    name: "get_recent_orders",
    description:
      "Gibt die letzten Bestellungen aus dem Druckelite24-Shop zurück. " +
      "Verwenden wenn der Nutzer fragt: 'Letzte Bestellungen', 'Was sind die neuesten Aufträge', " +
      "'Wie viele Bestellungen habe ich', 'Welche Bestellungen sind offen'.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Anzahl der zurückzugebenden Bestellungen (Standard 10, Maximum 20).",
          default: 10,
        },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "get_daily_revenue",
    description:
      "Gibt den Tagesumsatz der letzten Tage zurück. " +
      "Verwenden wenn der Nutzer fragt: 'Wie ist der Umsatz heute', 'Umsatz diese Woche', " +
      "'Wie viel haben wir heute verdient', 'Tagesumsatz'.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "Anzahl der vergangenen Tage (Standard 7, Maximum 30).",
          default: 7,
        },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "get_product_revenue",
    description:
      "Gibt die meistverkauften Produkte nach Umsatz zurück. " +
      "Verwenden wenn der Nutzer fragt: 'Was verkauft sich am besten', " +
      "'Welches Produkt hat den höchsten Umsatz', 'Top-Produkte', 'Bestseller'.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "Zeitraum in Tagen (Standard 30).",
          default: 30,
        },
        limit: {
          type: "integer",
          description: "Maximale Anzahl Produkte (Standard 10).",
          default: 10,
        },
      },
      required: [],
    },
  },
];

// Register tools on the session once data channel is open.
export function registerTools(dc: RTCDataChannel) {
  if (dc.readyState !== "open") return;

  sendEvent({
    type: "session.update",
    session: { tools: TOOLS, tool_choice: "auto" },
  });
}

// Attach function-call handler to the data channel.
export function attachToolHandler(dc: RTCDataChannel) {
  // We listen on the datachannel via the session module's event stream.
  // The session module re-emits relevant events; we hook into the raw DC here.
  dc.addEventListener("message", async (event: MessageEvent) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data as string) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg["type"] !== "response.function_call_arguments.done") return;

    const call = msg as unknown as FunctionCallEvent;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments) as Record<string, unknown>;
    } catch { /* ignore */ }

    const result = await dispatchTool(call.name, args);

    // Return result to the model.
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      },
    });

    // Ask for a new spoken response.
    sendEvent({ type: "response.create" });
  });
}

// ---------------------------------------------------------------------------
// Tool dispatch — calls backend endpoints
// ---------------------------------------------------------------------------
async function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (name) {
      case "get_recent_orders": {
        const limit = Math.min(Number(args["limit"] ?? 10), 20);
        const resp = await fetch(`/api/shopify/orders/recent?limit=${limit}`);
        return await resp.json();
      }
      case "get_daily_revenue": {
        const days = Math.min(Number(args["days"] ?? 7), 30);
        const resp = await fetch(`/api/shopify/revenue/daily?days=${days}`);
        return await resp.json();
      }
      case "get_product_revenue": {
        const days = Math.min(Number(args["days"] ?? 30), 60);
        const limit = Math.min(Number(args["limit"] ?? 10), 20);
        const resp = await fetch(
          `/api/shopify/revenue/by-product?days=${days}&limit=${limit}`
        );
        return await resp.json();
      }
      default:
        return { error: `Unbekanntes Tool: ${name}` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Tool-Fehler: ${msg}` };
  }
}

