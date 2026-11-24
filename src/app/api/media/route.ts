import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "Richiesta multipart/form-data non valida" },
      { status: 400 },
    );
  }
  const files = form.getAll("files").filter(
    (v): v is File => v instanceof File,
  );
  if (!files.length) {
    return NextResponse.json({ error: "Nessun file ricevuto" }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const saved = [];
  for (const file of files) {
    if (file.size > MAX_SIZE) {
      saved.push({ error: `File "${file.name}" troppo grande (max 15MB)` });
      continue;
    }
    if (!ALLOWED.includes(file.type)) {
      saved.push({
        error: `Tipo "${file.type}" non supportato per ${file.name}`,
      });
      continue;
    }
    const ext = path.extname(file.name) || mimeToExt(file.type);
    const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const dest = path.join(UPLOAD_DIR, storedName);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buf);
    const record = await db.mediaFile.create({
      data: {
        deviceId,
        filename: file.name.slice(0, 200),
        storedName,
        mimeType: file.type,
        size: file.size,
      },
    });
    saved.push(record);
  }
  return NextResponse.json(saved);
}

export async function GET(req: NextRequest) {
  const deviceId = req.headers.get("x-device-id") || "anon";
  const list = await db.mediaFile.findMany({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(list);
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/bmp":
      return ".bmp";
    case "text/plain":
      return ".txt";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "application/msword":
      return ".doc";
    default:
      return "";
  }
}
