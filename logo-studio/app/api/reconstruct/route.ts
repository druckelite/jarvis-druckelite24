const PROMPT = `Erstelle ausschließlich das abgebildete Kundenlogo vollständig neu und liefere es als freigestellte PNG-Datei mit transparentem Hintergrund. Das vorhandene Logo dient als verbindliche Vorlage. Baue das Logo von Grund auf neu auf, da die Ausgangsdatei eine schlechte Qualität und unsaubere Kanten besitzt.

Wichtige Vorgaben:
* Logo so exakt wie möglich nach der Vorlage rekonstruieren
* Schriften, Formen, Symbole, Farben, Abstände und Proportionen originalgetreu übernehmen
* Keine kreative Neuinterpretation und keine Modernisierung
* Keine zusätzlichen Elemente hinzufügen
* Keine Inhalte entfernen oder verändern
* Alle Konturen sauber, gleichmäßig und gestochen scharf ausarbeiten
* Keine weißen Umrandungen
* Keine Weißblitzer oder störenden weißen Pixel
* Keine ausgefransten, verpixelten oder unscharfen Kanten
* Keine Schatten, kein Glow und keine zusätzlichen Effekte
* Hintergrund vollständig entfernen
* Auch Zwischenräume und Innenflächen sauber freistellen
* Farben klar, deckend und gleichmäßig darstellen
* Logo mittig ausrichten und nicht anschneiden

Ausgabeanforderungen:
* PNG mit vollständig transparentem Hintergrund
* hohe Detailtiefe
* saubere, geschlossene Kanten
* druckfertig für DTF- und Textildruck
* ausschließlich das Logo, ohne Mock-up, Kleidungsstück, Hintergrund, Schachbrettmuster oder Präsentationsfläche

Das Endergebnis muss wie eine professionell neu aufgebaute Originaldatei wirken und der Vorlage optisch so genau wie möglich entsprechen.`;

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: "Die Bildbearbeitung ist noch nicht aktiviert. Der OpenAI-API-Schlüssel muss einmalig hinterlegt werden." }, { status: 503 });
    const incoming = await request.formData();
    const logo = incoming.get("logo");
    if (!(logo instanceof File)) return Response.json({ error: "Bitte lade zuerst ein Logo hoch." }, { status: 400 });
    if (!/^image\/(png|jpeg|webp)$/.test(logo.type)) return Response.json({ error: "Dieses Dateiformat wird nicht unterstützt." }, { status: 415 });
    if (logo.size > 20 * 1024 * 1024) return Response.json({ error: "Die Datei ist größer als 20 MB." }, { status: 413 });
    const body = new FormData();
    body.append("model", "gpt-image-2"); body.append("image", logo, logo.name); body.append("prompt", PROMPT);
    body.append("background", "transparent"); body.append("output_format", "png"); body.append("quality", "high"); body.append("size", "2048x2048"); body.append("input_fidelity", "high");
    const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body });
    const data = await response.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
    if (!response.ok) {
      const message = response.status === 429 ? "Das Bearbeitungslimit ist gerade erreicht. Bitte versuche es in Kürze erneut." : "Das Logo konnte nicht bearbeitet werden. Bitte versuche es erneut.";
      console.error("OpenAI image edit failed", response.status, data.error?.message);
      return Response.json({ error: message }, { status: response.status });
    }
    const image = data.data?.[0]?.b64_json;
    if (!image) return Response.json({ error: "Es wurde keine Bilddatei zurückgegeben." }, { status: 502 });
    return Response.json({ image });
  } catch (error) {
    console.error("Logo reconstruction failed", error);
    return Response.json({ error: "Bei der Bearbeitung ist ein Fehler aufgetreten. Bitte versuche es erneut." }, { status: 500 });
  }
}
