import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { testImapLogin } from "@/lib/gmail-imap";

/**
 * POST /api/gmail/accounts/[id]/test
 * Test di connessione IMAP (connect + select INBOX + logout).
 * Ritorna { ok: true } o { ok: false, error: "..." }.
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
  const result = await testImapLogin({
    email: acc.email,
    appPassword: acc.appPassword,
    imapHost: acc.imapHost,
    imapPort: acc.imapPort,
  });
  await db.emailAccount.update({
    where: { id },
    data: {
      error: result.ok ? null : result.error.slice(0, 500),
    },
  });
  return NextResponse.json(result);
}
