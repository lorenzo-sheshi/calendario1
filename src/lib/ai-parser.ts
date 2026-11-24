/**
 * Helper per invocare il modello LLM/VLM (z-ai-web-dev-sdk) dal backend.
 * Si occupa di:
 *   - Estrarre JSON valido da un testo/immagine
 *   - Suggerire i dati di un evento { type, title, date, time, notes }
 *
 * z-ai-web-dev-sdk è server-only.
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs";

export interface SuggestedEvent {
  type: "circolare" | "impegno" | "compleanno";
  title: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

const SYSTEM_PROMPT = `Sei un assistente che analizza circolari scolastiche, comunicazioni e documenti e ne estrae le informazioni per inserirle in un calendario.

Per ogni contenuto fornito devi individuare:
- type: "circolare" se è una comunicazione ufficiale della scuola o un avviso; "impegno" se è una scadenza, compito, verifica, riunione; "compleanno" se è un compleanno.
- title: un titolo sintetico (max 80 caratteri).
- date: data dell'evento in formato YYYY-MM-DD. Se l'evento ha anno non specificato, usa l'anno corrente. Se non c'è una data, restituisci null.
- time: orario HH:MM se specificato, altrimenti null.
- notes: eventuali note utili (max 500 caratteri). Includi dettagli come luogo, docente, classe destinataria, scadenze.
- confidence: high se data e titolo sono chiari; medium se alcuni dati sono dedotti; low se incerto.

Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo né markdown.
Schema: {"type": string, "title": string, "date": string|null, "time": string|null, "notes": string|null, "confidence": "high"|"medium"|"low"}
Se il contenuto non contiene informazioni utili per un evento, rispondi con: {"type":"circolare","title":"","date":null,"time":null,"notes":null,"confidence":"low"}`;

let zaiPromise: Promise<ZAI> | null = null;
async function getClient(): Promise<ZAI> {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

/**
 * Estrae dati evento da un testo (PDF text/plain, email body).
 */
export async function suggestFromText(
  text: string,
  contextHint?: string,
): Promise<SuggestedEvent> {
  const zai = await getClient();
  const user = `${contextHint ? contextHint + "\n\n" : ""}Contenuto da analizzare:\n"""\n${text.slice(0, 6000)}\n"""`;
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
  });
  const raw = completion.choices[0]?.message?.content || "";
  return parseSuggestion(raw);
}

/**
 * Estrae dati evento da un'immagine (PNG/JPG) usando il VLM.
 */
export async function suggestFromImage(
  filePath: string,
  mimeType: string,
): Promise<SuggestedEvent> {
  const zai = await getClient();
  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString("base64");
  const dataUrl = `data:${mimeType};base64,${b64}`;
  const completion = await zai.chat.completions.createVision({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analizza questa immagine che contiene una circolare/comunicazione scolastica. Estrai i dati dell'evento come JSON.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });
  const raw = completion.choices[0]?.message?.content || "";
  return parseSuggestion(raw);
}

/**
 * Estrae dati evento da un PDF usando il VLM con file_url (base64).
 */
export async function suggestFromPdf(
  filePath: string,
): Promise<SuggestedEvent> {
  const zai = await getClient();
  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString("base64");
  const dataUrl = `data:application/pdf;base64,${b64}`;
  const completion = await zai.chat.completions.createVision({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analizza questo PDF che contiene una circolare/comunicazione scolastica. Estrai i dati dell'evento come JSON.",
          },
          { type: "file_url", file_url: { url: dataUrl } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });
  const raw = completion.choices[0]?.message?.content || "";
  return parseSuggestion(raw);
}

function parseSuggestion(raw: string): SuggestedEvent {
  // Cerca il primo oggetto JSON nel testo (anche se circondato da prose)
  const match = raw.match(/\{[\s\S]*\}/);
  const fallback: SuggestedEvent = {
    type: "circolare",
    title: "",
    date: null,
    time: null,
    notes: null,
    confidence: "low",
  };
  if (!match) return { ...fallback, notes: raw.slice(0, 500) || null };
  try {
    const obj = JSON.parse(match[0]) as Partial<SuggestedEvent>;
    const type: SuggestedEvent["type"] =
      obj.type === "impegno" || obj.type === "compleanno"
        ? obj.type
        : "circolare";
    return {
      type,
      title: String(obj.title || "").slice(0, 200),
      date: normalizeDate(obj.date),
      time: normalizeTime(obj.time),
      notes: obj.notes ? String(obj.notes).slice(0, 2000) : null,
      confidence: obj.confidence === "high" || obj.confidence === "medium"
        ? obj.confidence
        : "low",
    };
  } catch {
    return { ...fallback, notes: raw.slice(0, 500) || null };
  }
}

function normalizeDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = input.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // prova formati italiani DD/MM/YYYY
  const m2 = input.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m2) {
    const y = m2[3];
    const mo = m2[2].padStart(2, "0");
    const d = m2[1].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return null;
}

function normalizeTime(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = input.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return null;
}

/** Estrae testo grezzo da un PDF usando pdftotext (CLI) - più affidabile del VLM per PDF testuali. */
export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    const { stdout } = await exec("pdftotext", ["-layout", filePath, "-"], {
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout.slice(0, 8000);
  } catch {
    return "";
  }
}
