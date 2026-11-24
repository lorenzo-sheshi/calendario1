import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suggestFromText } from "@/lib/ai-parser";
import { randomUUID } from "node:crypto";

/**
 * POST /api/gmail/paste
 * Modalità ALTERNATIVA all'IMAP per account scolastici/aziendali dove
 * l'amministratore blocca IMAP. L'utente copia manualmente il testo di
 * una circolare ricevuta su Gmail e lo incolla qui.
 *
 * Body: {
 *   from?: string,      // mittente visibile (opzionale)
 *   subject?: string,   // oggetto (opzionale)
 *   date?: string,      // YYYY-MM-DD o ISO (opzionale, default oggi)
 *   text: string        // corpo dell'email
 * }
 *
 * Salva in ImportedEmail (come se provenisse da sync IMAP) e ritorna
 * l'email + il suggerimento AI.
 */
export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const body = await req.json().catch(() => null);
  if (!body || !body.text || typeof body.text !== "string") {
    return NextResponse.json(
      { error: "text è obbligatorio" },
      { status: 400 },
    );
  }

  const text = String(body.text).slice(0, 8000);
  const from = body.from ? String(body.from).slice(0, 300) : "(incollata manualmente)";
  const subject = body.subject
    ? String(body.subject).slice(0, 500)
    : "(email incollata manualmente)";

  let date = new Date();
  if (body.date) {
    const parsed = new Date(body.date);
    if (!isNaN(parsed.getTime())) date = parsed;
  }

  // Suggerimento AI
  let parsedData: string | null = null;
  try {
    const suggestion = await suggestFromText(
      `${subject}\n\n${text}`.slice(0, 6000),
      `Email incollata manualmente, mittente: ${from}.`,
    );
    parsedData = JSON.stringify(suggestion);
  } catch (e) {
    console.warn("AI parse failed for pasted email", e);
  }

  // Salva come ImportedEmail; accountId è "manual" (non collegato a un account IMAP)
  const email = await db.importedEmail.create({
    data: {
      deviceId,
      accountId: "manual",
      messageId: `manual-${randomUUID()}`,
      from,
      subject,
      date,
      snippet: text.slice(0, 300),
      bodyText: text,
      parsedData,
    },
  });

  return NextResponse.json(
    {
      id: email.id,
      accountId: email.accountId,
      messageId: email.messageId,
      from: email.from,
      subject: email.subject,
      date: email.date,
      snippet: email.snippet,
      parsedData: parsedData ? safeJson(parsedData) : null,
      eventId: null,
      dismissed: false,
      createdAt: email.createdAt,
    },
    { status: 201 },
  );
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
