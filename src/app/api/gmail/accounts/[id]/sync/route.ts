import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncAccount } from "@/lib/gmail-sync";

/**
 * POST /api/gmail/accounts/[id]/sync  -> sincronizza un singolo account
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { id } = await params;
  const acc = await db.emailAccount.findUnique({ where: { id } });
  if (!acc || acc.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  const result = await syncAccount(id);
  return NextResponse.json(result);
}
