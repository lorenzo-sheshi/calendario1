import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/gmail/emails/[id]/dismiss -> segna email come scartata
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
  await db.importedEmail.update({
    where: { id },
    data: { dismissed: true },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const email = await db.importedEmail.findUnique({ where: { id } });
  if (!email || email.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (email.eventId) {
    await db.event.update({
      where: { id: email.eventId },
      data: { source: "manual" },
    });
  }
  await db.importedEmail.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
