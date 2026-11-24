import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/gmail/accounts  -> lista account del dispositivo
 * POST /api/gmail/accounts -> crea account
 *   body: { email, appPassword, searchFrom?, searchSubject?, imapHost?, imapPort? }
 */
export async function GET(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const accounts = await db.emailAccount.findMany({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
  });
  // non esponiamo appPassword
  return NextResponse.json(
    accounts.map((a) => ({
      id: a.id,
      email: a.email,
      active: a.active,
      searchFrom: a.searchFrom,
      searchSubject: a.searchSubject,
      imapHost: a.imapHost,
      imapPort: a.imapPort,
      lastSyncAt: a.lastSyncAt,
      lastUid: a.lastUid,
      syncedCount: a.syncedCount,
      error: a.error,
      createdAt: a.createdAt,
    })),
  );
}

export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const body = await req.json().catch(() => null);
  if (!body || !body.email || !body.appPassword) {
    return NextResponse.json(
      { error: "email e appPassword obbligatori" },
      { status: 400 },
    );
  }
  // Limit: max 3 account per dispositivo
  const count = await db.emailAccount.count({ where: { deviceId } });
  if (count >= 3) {
    return NextResponse.json(
      { error: "Massimo 3 account per dispositivo" },
      { status: 403 },
    );
  }
  const created = await db.emailAccount.create({
    data: {
      deviceId,
      email: String(body.email).slice(0, 200),
      appPassword: String(body.appPassword).slice(0, 100),
      imapHost: body.imapHost
        ? String(body.imapHost)
        : "imap.gmail.com",
      imapPort: body.imapPort ? Number(body.imapPort) : 993,
      searchFrom: body.searchFrom ? String(body.searchFrom).slice(0, 200) : null,
      searchSubject: body.searchSubject
        ? String(body.searchSubject).slice(0, 200)
        : null,
    },
  });
  return NextResponse.json(
    {
      id: created.id,
      email: created.email,
      active: created.active,
      searchFrom: created.searchFrom,
      searchSubject: created.searchSubject,
      imapHost: created.imapHost,
      imapPort: created.imapPort,
      lastSyncAt: created.lastSyncAt,
      lastUid: created.lastUid,
      syncedCount: created.syncedCount,
      error: created.error,
      createdAt: created.createdAt,
    },
    { status: 201 },
  );
}
