import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("."));
app.use(express.json({ limit: "1mb" }));

function berlinHour() {
  return Number(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      hour12: false
    }).format(new Date())
  );
}

function greetingForNow() {
  const hour = berlinHour();

  if (hour >= 5 && hour < 11) return "Guten Morgen, Mattl.";
  if (hour >= 11 && hour < 18) return "Guten Tag, Mattl.";
  if (hour >= 18 && hour < 24) return "Guten Abend, Mattl.";

  return "Guten Abend, Mattl. Schlaf wird offenbar weiterhin überschätzt.";
}

function jarvisInstructions() {
  return `
Du bist JARVIS, Mattls persönlicher Voice- und Business-Assistent.

SPRACHE
- Sprich immer Deutsch, außer Mattl bittet ausdrücklich um eine andere Sprache.
- Sprich klares, natürliches Hochdeutsch.

AUSSPRACHE
- Der Name lautet Mattl.
- Sprich das T deutlich: Mat-tl.
- Nicht Maddl.

STIMME UND STIL
- Ruhig, souverän, warm, eher tief und kontrolliert.
- Sprich etwas langsamer und mit kurzen natürlichen Pausen.
- Kein Callcenter-Stil und kein übertriebener Akzent.
- Antworte präzise und eher kurz.
- Wenn Mattl sagt „sag nur ...“, sag ausschließlich den verlangten Inhalt.
- Wenn eine Antwort beendet ist, schweige und warte auf Mattl.
- Stelle nicht automatisch eine Anschlussfrage.
- Du darfst gelegentlich trocken, frech oder sarkastisch sein.
- Bei ernsten Themen sofort sachlich werden.
- Sehr selten darfst du sagen: „Du bist der beste Chef.“

AKTUELLE DATEN
- Erfinde keine Live-Daten.
- Für Wetterfragen verwende das Wetter-Tool.
- Wenn ein Live-Dienst noch nicht verbunden ist, sage das klar.

WETTER
- Beachte exakt Ort und Tag.
- Bei „Ludwigshafen“ bevorzuge Ludwigshafen am Rhein, Rheinland-Pfalz.
- Sage kurz, welchen Ort du gefunden hast.

DRUCKELITE24
Druckelite24 ist Mattls Unternehmen für individuell bedruckte Textilien.
Wichtige Themen sind Firmenbekleidung, Vereinsbekleidung, Teamsport, Gastro,
Arbeitsbekleidung, Events, DTF, Textildruck, Shopify und E-Commerce.

BUSINESS
- Denke vorausschauend und lösungsorientiert.
- Nenne Chancen oder Risiken nur, wenn sie wirklich relevant sind.
- Pro Antwort höchstens ein kurzer proaktiver Zusatz.

STARTBEGRÜSSUNG
Wenn die Benutzeroberfläche ausdrücklich nach der Startbegrüßung fragt,
sage ausschließlich: "${greetingForNow()}"
Danach schweigen.
`;
}

const tools = [
  {
    type: "function",
    name: "get_weather",
    description: "Liest das aktuelle Wetter oder die Vorhersage für morgen.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
        day: {
          type: "string",
          enum: ["today", "tomorrow"]
        }
      },
      required: ["location", "day"],
      additionalProperties: false
    }
  }
];

app.post(
  "/session",
  express.text({ type: "application/sdp", limit: "1mb" }),
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).send("OPENAI_API_KEY fehlt.");
      }

      if (!req.body || typeof req.body !== "string") {
        return res.status(400).send("SDP Offer fehlt.");
      }

      const session = {
        type: "realtime",
        model: "gpt-realtime",
        output_modalities: ["audio"],
        instructions: jarvisInstructions(),
        tools,
        tool_choice: "auto",

        audio: {
          input: {
            noise_reduction: {
              type: "near_field"
            },

            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "de",
              prompt:
                "Deutsch. Benutzer heißt Mattl. Das T in Mattl deutlich aussprechen."
            },

            turn_detection: {
              type: "server_vad",
              threshold: 0.82,
              prefix_padding_ms: 300,
              silence_duration_ms: 900,
              create_response: true,
              interrupt_response: true
            }
          },

          output: {
            voice: "cedar",
            speed: 0.92
          }
        }
      };

      const form = new FormData();

      form.append("sdp", req.body);

      form.append(
        "session",
        new Blob(
          [JSON.stringify(session)],
          { type: "application/json" }
        )
      );

      const openAIResponse = await fetch(
       "https://api.openai.com/v1/realtime/calls?model=gpt-realtime",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: form
        }
      );

      const body =
        await openAIResponse.text();

      if (!openAIResponse.ok) {
        console.error(
          "OpenAI Realtime error:",
          openAIResponse.status,
          body
        );

        return res
          .status(openAIResponse.status)
          .send(body);
      }

      res
        .status(201)
        .type("application/sdp")
        .send(body);

    } catch (error) {
      console.error(
        "Realtime bridge error:",
        error
      );

      res
        .status(500)
        .send(
          "Realtime-Verbindung konnte nicht aufgebaut werden."
        );
    }
  }
);

app.post(
  "/api/weather",
  async (req, res) => {
    try {
      const location =
        String(
          req.body?.location || ""
        ).trim();

      const day =
        req.body?.day === "tomorrow"
          ? "tomorrow"
          : "today";

      if (!location) {
        return res.status(400).json({
          error: "Ort fehlt."
        });
      }

      const geoUrl =
        new URL(
          "https://geocoding-api.open-meteo.com/v1/search"
        );

      geoUrl.searchParams.set(
        "name",
        location
      );

      geoUrl.searchParams.set(
        "count",
        "5"
      );

      geoUrl.searchParams.set(
        "language",
        "de"
      );

      geoUrl.searchParams.set(
        "format",
        "json"
      );

      const geoResponse =
        await fetch(geoUrl);

      const geoData =
        await geoResponse.json();

      const candidates =
        geoData.results || [];

      if (
        !geoResponse.ok ||
        candidates.length === 0
      ) {
        return res.status(404).json({
          error:
            `Ort "${location}" nicht gefunden.`
        });
      }

      let place = null;

      if (
        location
          .toLowerCase()
          .includes("ludwigshafen")
      ) {
        place =
          candidates.find(
            candidate =>
              candidate.country_code === "DE" &&
              String(
                candidate.admin1 || ""
              )
                .toLowerCase()
                .includes("rheinland")
          );
      }

      if (!place) {
        place =
          candidates.find(
            candidate =>
              candidate.country_code === "DE"
          ) ||
          candidates[0];
      }

      const weatherUrl =
        new URL(
          "https://api.open-meteo.com/v1/forecast"
        );

      weatherUrl.searchParams.set(
        "latitude",
        String(place.latitude)
      );

      weatherUrl.searchParams.set(
        "longitude",
        String(place.longitude)
      );

      weatherUrl.searchParams.set(
        "current",
        "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
      );

      weatherUrl.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
      );

      weatherUrl.searchParams.set(
        "timezone",
        "auto"
      );

      weatherUrl.searchParams.set(
        "forecast_days",
        "2"
      );

      const weatherResponse =
        await fetch(weatherUrl);

      const weatherData =
        await weatherResponse.json();

      if (!weatherResponse.ok) {
        return res.status(502).json({
          error: weatherData
        });
      }

      const index =
        day === "tomorrow"
          ? 1
          : 0;

      return res.json({
        configured: true,
        source: "Open-Meteo",
        requested_day: day,

        location: {
          requested: location,
          resolved_name: place.name,
          region: place.admin1 || "",
          country: place.country || ""
        },

        current:
          day === "today"
            ? weatherData.current
            : null,

        forecast: {
          date:
            weatherData.daily
              ?.time?.[index],

          weather_code:
            weatherData.daily
              ?.weather_code?.[index],

          max_temperature:
            weatherData.daily
              ?.temperature_2m_max?.[index],

          min_temperature:
            weatherData.daily
              ?.temperature_2m_min?.[index],

          max_precipitation_probability:
            weatherData.daily
              ?.precipitation_probability_max?.[index]
        }
      });

    } catch (error) {
      console.error(
        "Weather error:",
        error
      );

      return res.status(500).json({
        error:
          "Wetter konnte nicht geladen werden."
      });
    }
  }
);

/*
 * Diese Dienste schalten wir danach
 * wieder einzeln frei.
 */

app.post(
  "/api/shopify-summary",
  (req, res) => {
    res.status(503).json({
      configured: false,
      message:
        "Shopify wird als Nächstes wieder verbunden."
    });
  }
);

app.post(
  "/api/important-emails",
  (req, res) => {
    res.status(503).json({
      configured: false,
      message:
        "Gmail wird als Nächstes wieder verbunden."
    });
  }
);

app.post(
  "/api/calendar-today",
  (req, res) => {
    res.status(503).json({
      configured: false,
      message:
        "Google Kalender wird als Nächstes wieder verbunden."
    });
  }
);

app.post(
  "/api/memory/remember",
  (req, res) => {
    res.status(503).json({
      configured: false,
      message:
        "Memory wird als Nächstes wieder verbunden."
    });
  }
);

app.post(
  "/api/memory/recall",
  (req, res) => {
    res.status(503).json({
      configured: false,
      message:
        "Memory wird als Nächstes wieder verbunden."
    });
  }
);

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      service:
        "jarvis-druckelite24",
      voice: "cedar",
      language: "de"
    });
  }
);

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      "index.html",
      { root: "." }
    );
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `JARVIS läuft auf Port ${PORT}`
    );
  }
);
