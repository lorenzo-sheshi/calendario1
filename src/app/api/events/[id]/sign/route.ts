import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Toggle firma presa visione di una circolare. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const current = await db.event.findUnique({ where: { id } });
  if (!current || current.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  const signed = current.signed ? null : new Date().toISOString();
  const ev = await db.event.update({ where: { id }, data: { signed } });
  return NextResponse.json(ev);
}
