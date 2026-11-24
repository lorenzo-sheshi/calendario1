import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newEventId, EventType } from "@/lib/circolari-shared";

/**
 * POST /api/media/[id]/event
 * Crea un Event dal MediaFile, usando i dati passati nel body
 * (eventualmente modificati dall'utente rispetto al suggerimento AI).
 * Body: { type?, title, date, time?, notes? }
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
  const body = await req.json().catch(() => ({}));
  if (!body.title || !body.date) {
    return NextResponse.json(
      { error: "title e date obbligatori" },
      { status: 400 },
    );
  }
  const type: EventType =
    body.type === "impegno" || body.type === "compleanno"
      ? body.type
      : "circolare";

  const evId = newEventId();
  // crea evento e collega media
  const [event] = await db.$transaction([
    db.event.create({
      data: {
        id: evId,
        deviceId,
        type,
        title: String(body.title).slice(0, 200),
        date: String(body.date),
        time: body.time ? String(body.time) : null,
        notes: body.notes ? String(body.notes).slice(0, 4000) : null,
        source: `media:${file.id}`,
      },
    }),
    db.mediaFile.update({
      where: { id: file.id },
      data: { eventId: evId },
    }),
  ]);
  return NextResponse.json(event, { status: 201 });
}
