import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const file = await db.mediaFile.findUnique({ where: { id } });
  if (!file || file.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  // scollega eventuale evento
  if (file.eventId) {
    await db.event.update({
      where: { id: file.eventId },
      data: { source: "manual" },
    });
  }
  await db.mediaFile.delete({ where: { id } });
  try {
    await fs.unlink(path.join(UPLOAD_DIR, file.storedName));
  } catch {
    /* file già assente */
  }
  return NextResponse.json({ ok: true });
}
