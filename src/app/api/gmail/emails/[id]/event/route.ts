import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newEventId } from "@/lib/circolari-shared";
import { isEventType } from "@/lib/circolari-shared";

/**
 * POST /api/gmail/emails/[id]/event
 * Converte un'email importata in Event.
 * Body: { type?, title, date, time?, notes? }
 *   Se body vuoto/parziale, usa parsedData salvato precedentemente.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const email = await db.importedEmail.findUnique({ where: { id } });
  if (!email || email.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  let parsed: Record<string, unknown> = {};
  if (email.parsedData) {
    try {
      parsed = JSON.parse(email.parsedData);
    } catch {
      parsed = {};
    }
  }
  const typeRaw = body.type ?? parsed.type;
  const type = isEventType(typeRaw) ? typeRaw : "circolare";
  const title = (body.title ?? parsed.title ?? email.subject) as string;
  const date = body.date ?? parsed.date;
  const time = body.time ?? parsed.time;
  const notes = body.notes ?? parsed.notes;

  if (!title || !date) {
    return NextResponse.json(
      {
        error: "title e date obbligatori (non è stato possibile estrarli dall'email)",
        parsed,
      },
      { status: 400 },
    );
  }

  const evId = newEventId();
  const [event] = await db.$transaction([
    db.event.create({
      data: {
        id: evId,
        deviceId,
        type,
        title: String(title).slice(0, 200),
        date: String(date),
        time: time ? String(time) : null,
        notes: notes ? String(notes).slice(0, 4000) : null,
        source: `gmail:${email.messageId}`,
      },
    }),
    db.importedEmail.update({
      where: { id: email.id },
      data: { eventId: evId },
    }),
  ]);
  return NextResponse.json(event, { status: 201 });
}
