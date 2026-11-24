import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Restituisce tutti gli eventi del dispositivo passato nell'header x-device-id.
 * Query string opzionali:
 *   - type=circolare|impegno|compleanno  (filtra per tipo)
 *   - from=YYYY-MM-DD & to=YYYY-MM-DD     (filtra per range di date)
 */
export async function GET(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;

  const events = await db.event.findMany({
    where: {
      deviceId,
      ...(type ? { type } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });
  return NextResponse.json(events);
}

/**
 * Crea un nuovo evento.
 * Body: { id, type, title, date, time?, notes? }
 */
export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const body = await req.json().catch(() => null);
  if (!body || !body.title || !body.date || !body.type) {
    return NextResponse.json(
      { error: "Mancano campi obbligatori (type, title, date)" },
      { status: 400 },
    );
  }
  const id = String(body.id || generateId());
  const existing = await db.event.findUnique({ where: { id } });
  if (existing) {
    return NextResponse.json({ error: "Evento già esistente" }, { status: 409 });
  }
  const ev = await db.event.create({
    data: {
      id,
      deviceId,
      type: body.type,
      title: String(body.title).slice(0, 200),
      date: String(body.date),
      time: body.time ? String(body.time) : null,
      notes: body.notes ? String(body.notes).slice(0, 4000) : null,
    },
  });
  return NextResponse.json(ev, { status: 201 });
}

/**
 * Aggiorna un evento esistente (stesso deviceId).
 * Body: { type?, title?, date?, time?, notes?, signed? }
 */
export async function PUT(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const body = await req.json().catch(() => null);
  if (!body || !body.id) {
    return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });
  }
  const current = await db.event.findUnique({ where: { id: String(body.id) } });
  if (!current || current.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  const data: Record<string, unknown> = {};
  for (const k of ["type", "title", "date", "time", "notes", "signed"]) {
    if (body[k] !== undefined) data[k] = body[k] === null ? null : String(body[k]).slice(0, k === "notes" ? 4000 : 200);
  }
  const ev = await db.event.update({ where: { id: String(body.id) }, data });
  return NextResponse.json(ev);
}

/**
 * Elimina un evento (stesso deviceId).
 */
export async function DELETE(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });
  }
  const current = await db.event.findUnique({ where: { id } });
  if (!current || current.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  await db.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function generateId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}
