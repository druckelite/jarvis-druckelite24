"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
type JobState = "idle" | "ready" | "processing" | "done" | "error";
const steps = ["Vorlage und Proportionen analysieren", "Logo originalgetreu neu aufbauen", "Hintergrund und Weißblitzer entfernen", "Druckdatei mit 300 DPI vorbereiten"];

function UploadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" /></svg>;
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14" /></svg>;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function setUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value);
}

async function preparePrintPng(sourceUrl: string) {
  const sourceBlob = await fetch(sourceUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = 3000;
  canvas.height = 3000;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Die Druckdatei konnte nicht vorbereitet werden.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const canvasBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG konnte nicht erzeugt werden.")), "image/png"));
  const png = new Uint8Array(await canvasBlob.arrayBuffer());
  const chunk = new Uint8Array(21);
  setUint32(chunk, 0, 9);
  chunk.set([112, 72, 89, 115], 4);
  setUint32(chunk, 8, 11811);
  setUint32(chunk, 12, 11811);
  chunk[16] = 1;
  setUint32(chunk, 17, crc32(chunk.slice(4, 17)));
  const output = new Uint8Array(png.length + chunk.length);
  output.set(png.slice(0, 33), 0);
  output.set(chunk, 33);
  output.set(png.slice(33), 54);
  return new Blob([output], { type: "image/png" });
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [state, setState] = useState<JobState>("idle");
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [sourceUrl, resultUrl]);

  useEffect(() => {
    if (state !== "processing") return;
    const timer = window.setInterval(() => setActiveStep((current) => Math.min(current + 1, steps.length - 1)), 5000);
    return () => window.clearInterval(timer);
  }, [state]);

  const filename = useMemo(() => {
    if (!file) return "logo-druckfertig.png";
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "-");
    return `${base}-druckfertig.png`;
  }, [file]);

  function selectFile(selected?: File) {
    if (!selected) return;
    if (!selected.type.match(/^image\/(png|jpeg|webp)$/)) {
      setError("Bitte lade eine PNG-, JPG- oder WEBP-Datei hoch."); setState("error"); return;
    }
    if (selected.size > MAX_FILE_SIZE) { setError("Die Datei ist größer als 20 MB."); setState("error"); return; }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(selected); setSourceUrl(URL.createObjectURL(selected)); setResultUrl(null); setError(""); setState("ready");
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) { selectFile(event.target.files?.[0]); event.target.value = ""; }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }

  async function reconstruct() {
    if (!file) return;
    setState("processing"); setActiveStep(0); setError("");
    try {
      const formData = new FormData(); formData.append("logo", file);
      const response = await fetch("/api/reconstruct", { method: "POST", body: formData });
      const data = await response.json() as { image?: string; error?: string };
      if (!response.ok || !data.image) throw new Error(data.error || "Die Bearbeitung ist fehlgeschlagen.");
      const printBlob = await preparePrintPng(`data:image/png;base64,${data.image}`);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(printBlob)); setActiveStep(steps.length - 1); setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Die Bearbeitung ist fehlgeschlagen."); setState("error");
    }
  }

  function reset() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null); setSourceUrl(null); setResultUrl(null); setError(""); setState("idle");
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Druckelite24 Logo Studio Startseite"><span className="brand-mark">DE</span><span><strong>DRUCKELITE</strong><b>24.DE</b></span></a>
        <div className="studio-label"><i /> LOGO STUDIO</div>
      </header>
      <section className="workspace">
        <div className="intro">
          <span className="eyebrow">KI-GESTÜTZTE LOGOREKONSTRUKTION</span>
          <h1>Aus schlechter Vorlage wird<br /><em>eine saubere Druckdatei.</em></h1>
          <p>Logo hochladen, automatisch originalgetreu neu aufbauen lassen und direkt als transparente PNG herunterladen.</p>
        </div>
        <div className="work-card">
          <div className="card-head"><div><span className="step-number">01</span><h2>Kundenlogo hochladen</h2></div><span className="privacy"><i /> VERTRAULICHE VERARBEITUNG</span></div>
          {!file ? (
            <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}>
              <span className="upload-icon"><UploadIcon /></span><h3>Logo hier ablegen</h3><p>oder vom Computer auswählen</p><button type="button">DATEI AUSWÄHLEN</button><small>PNG, JPG oder WEBP · maximal 20 MB</small>
            </div>
          ) : (
            <div className="editor-grid">
              <figure className="preview-panel"><figcaption>ORIGINALVORLAGE</figcaption><div className="image-stage">{sourceUrl && <img src={sourceUrl} alt="Hochgeladene Logovorlage" />}</div><div className="file-line"><span>{file.name}</span><button type="button" onClick={reset}>Entfernen</button></div></figure>
              <div className={`process-panel ${state === "done" ? "result-panel" : ""}`}>
                {state === "done" && resultUrl ? <><div className="result-label"><span>✓</span> DRUCKDATEI FERTIG</div><div className="image-stage checker"><img src={resultUrl} alt="Neu aufgebautes Logo mit transparentem Hintergrund" /></div><dl className="specs"><div><dt>FORMAT</dt><dd>PNG transparent</dd></div><div><dt>AUFLÖSUNG</dt><dd>3000 × 3000 px</dd></div><div><dt>DRUCK</dt><dd>300 DPI</dd></div></dl></> : <><span className="step-number">02</span><h2>Professionell neu aufbauen</h2><p>Schriften, Formen, Farben und Proportionen bleiben so nah wie möglich an deiner Vorlage.</p><ul className="process-list">{steps.map((step, index) => <li key={step} className={state === "processing" && index === activeStep ? "active" : state === "processing" && index < activeStep ? "complete" : ""}><span>{state === "processing" && index < activeStep ? "✓" : index + 1}</span>{step}</li>)}</ul></>}
              </div>
            </div>
          )}
          {error && <div className="error-box" role="alert">{error}</div>}
          {file && <div className="action-row">{state === "done" && resultUrl ? <><button className="secondary" type="button" onClick={reset}>NEUES LOGO</button><a className="primary" href={resultUrl} download={filename}><DownloadIcon /> PNG HERUNTERLADEN</a></> : <button className="primary reconstruct" type="button" disabled={state === "processing"} onClick={reconstruct}>{state === "processing" ? <><span className="spinner" /> LOGO WIRD NEU AUFGEBAUT …</> : "LOGO JETZT NEU AUFBAUEN"}</button>}</div>}
        </div>
        <div className="features"><div><b>01</b><span><strong>ORIGINALGETREU</strong><small>Keine kreative Neuinterpretation</small></span></div><div><b>02</b><span><strong>SAUBER FREIGESTELLT</strong><small>Keine Weißblitzer oder Schatten</small></span></div><div><b>03</b><span><strong>DRUCKFERTIG</strong><small>Für DTF- und Textildruck optimiert</small></span></div></div>
      </section>
      <input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onInput} />
      <footer><span>DRUCKELITE24.DE</span><p>Automatische Logorekonstruktion · Ergebnisse bitte vor dem Druck fachlich prüfen.</p></footer>
    </main>
  );
}
