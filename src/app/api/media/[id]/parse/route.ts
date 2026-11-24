import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";
import { suggestFromImage, suggestFromPdf, suggestFromText, extractPdfText } from "@/lib/ai-parser";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/**
 * POST /api/media/[id]/parse
 * Esegue il parsing AI del file e salva parsedRaw + parsedData.
 * Ritorna i dati suggeriti per conferma.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const file = await db.mediaFile.findUnique({ where: { id } });
  if (!file || file.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  const filePath = path.join(UPLOAD_DIR, file.storedName);
  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: "File su disco mancante" }, { status: 410 });
  }

  let rawText = "";
  let suggestion;
  try {
    if (file.mimeType === "application/pdf") {
      // Prima prova pdftotext (testo strutturato)
      rawText = await extractPdfText(filePath);
      if (rawText && rawText.length > 50) {
        suggestion = await suggestFromText(rawText, "Contenuto di un PDF scolastico.");
      } else {
        // PDF scannerizzato: usa VLM con file_url
        suggestion = await suggestFromPdf(filePath);
        rawText = suggestion.notes || "(PDF senza testo estratto, analizzato come immagine)";
      }
    } else if (file.mimeType.startsWith("image/")) {
      suggestion = await suggestFromImage(filePath, file.mimeType);
      rawText = suggestion.notes || "(analisi visiva)";
    } else if (file.mimeType === "text/plain") {
      rawText = await fs.readFile(filePath, "utf8");
      suggestion = await suggestFromText(rawText);
    } else {
      // docx/doc: non supportati direttamente, prova pdftotext? no.
      return NextResponse.json(
        { error: `Tipo ${file.mimeType} non ancora supportato per il parsing` },
        { status: 422 },
      );
    }
  } catch (e) {
    console.error("parse error", e);
    return NextResponse.json(
      { error: "Errore durante l'analisi AI del file" },
      { status: 502 },
    );
  }

  await db.mediaFile.update({
    where: { id },
    data: {
      parsed: true,
      parsedRaw: rawText.slice(0, 8000),
      parsedData: JSON.stringify(suggestion),
    },
  });

  return NextResponse.json({ file: { ...file, parsed: true, parsedRaw: rawText.slice(0, 8000), parsedData: JSON.stringify(suggestion) }, suggestion });
}
