import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncAllForDevice } from "@/lib/gmail-sync";

/**
 * POST /api/gmail/sync -> sincronizza tutti gli account attivi del dispositivo
 */
export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const results = await syncAllForDevice(deviceId);
  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
  const errors = results.filter((r) => !r.ok).map((r) => r.error).filter(Boolean);
  return NextResponse.json({
    ok: errors.length === 0,
    accounts: results.length,
    fetched: totalFetched,
    imported: totalImported,
    errors,
  });
}
