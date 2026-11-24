"use client";

/**
 * Tipi condivisi tra client e server per MediaFile, EmailAccount, ImportedEmail,
 * SyncResult. Solo tipi: niente dipendenze server qui.
 */
export interface MediaFileDTO {
  id: string;
  deviceId: string;
  filename: string;
  storedName: string;
  mimeType: string;
  size: number;
  parsed: boolean;
  parsedRaw?: string | null;
  parsedData?: string | null;
  eventId?: string | null;
  createdAt: string;
}

export interface EmailAccountDTO {
  id: string;
  email: string;
  active: boolean;
  searchFrom?: string | null;
  searchSubject?: string | null;
  imapHost: string;
  imapPort: number;
  lastSyncAt?: string | null;
  lastUid: number;
  syncedCount: number;
  error?: string | null;
  createdAt: string;
}

export interface ImportedEmailDTO {
  id: string;
  accountId: string;
  messageId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  parsedData?: { type?: string; title?: string; date?: string | null; time?: string | null; notes?: string | null; confidence?: string } | null;
  eventId?: string | null;
  dismissed: boolean;
  createdAt: string;
}

export interface SuggestedEvent {
  type: "circolare" | "impegno" | "compleanno";
  title: string;
  date: string | null;
  time: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}
