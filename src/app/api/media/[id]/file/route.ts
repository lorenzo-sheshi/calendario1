import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/**
 * GET /api/media/[id]/file
 * Serve il file binario per anteprima nel browser (PDF embed, immagine inline).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // L'header x-device-id funziona per fetch JS, ma iframe/img/embeb non
  // possono passarlo. Accettiamo quindi anche ?key=<deviceId> come fallback.
  const url = new URL(req.url);
  const deviceId =
    req.headers.get("x-device-id") ||
    url.searchParams.get("key") ||
    "anon";
  const { id } = await params;
  const file = await db.mediaFile.findUnique({ where: { id } });
  if (!file || file.deviceId !== deviceId) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  const filePath = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File su disco mancante" }, { status: 410 });
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
