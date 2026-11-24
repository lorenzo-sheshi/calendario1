import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const acc = await db.emailAccount.findUnique({ where: { id } });
  if (!acc || acc.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  // Elimina anche le email importate
  await db.importedEmail.deleteMany({
    where: { accountId: id, deviceId },
  });
  await db.emailAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const acc = await db.emailAccount.findUnique({ where: { id } });
  if (!acc || acc.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.searchFrom === "string")
    data.searchFrom = body.searchFrom || null;
  if (typeof body.searchSubject === "string")
    data.searchSubject = body.searchSubject || null;
  if (typeof body.appPassword === "string" && body.appPassword)
    data.appPassword = String(body.appPassword).slice(0, 100);
  const updated = await db.emailAccount.update({ where: { id }, data });
  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    active: updated.active,
    searchFrom: updated.searchFrom,
    searchSubject: updated.searchSubject,
    imapHost: updated.imapHost,
    imapPort: updated.imapPort,
    lastSyncAt: updated.lastSyncAt,
    lastUid: updated.lastUid,
    syncedCount: updated.syncedCount,
    error: updated.error,
    createdAt: updated.createdAt,
  });
}
