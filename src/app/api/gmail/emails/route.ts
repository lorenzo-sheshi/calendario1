import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/gmail/emails -> lista email importate (non scartate, non convertite)
 *   ?status=all | pending | converted | dismissed (default: pending)
 */
export async function GET(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";

  const where: Record<string, unknown> = { deviceId };
  if (status === "pending") {
    where.dismissed = false;
    where.eventId = null;
  } else if (status === "converted") {
    where.eventId = { not: null };
  } else if (status === "dismissed") {
    where.dismissed = true;
  }

  const list = await db.importedEmail.findMany({
    where,
    orderBy: { date: "desc" },
    take: 100,
  });
  return NextResponse.json(
    list.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      messageId: e.messageId,
      from: e.from,
      subject: e.subject,
      date: e.date,
      snippet: e.snippet,
      parsedData: e.parsedData ? safeJson(e.parsedData) : null,
      eventId: e.eventId,
      dismissed: e.dismissed,
      createdAt: e.createdAt,
    })),
  );
};

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
