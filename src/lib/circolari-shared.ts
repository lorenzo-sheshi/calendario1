// Utility pure (server-safe, niente window/localStorage).
// Importato sia dal client (circolari.ts) sia dalle route API.

export type EventType = "circolare" | "impegno" | "compleanno";

export const T: Record<EventType, [string, string]> = {
  circolare: ["📄", "Circolare"],
  impegno: ["📌", "Impegno"],
  compleanno: ["🎂", "Compleanno"],
};

export const pad = (n: number) => String(n).padStart(2, "0");

export const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function newEventId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

export const isEventType = (v: unknown): v is EventType =>
  v === "circolare" || v === "impegno" || v === "compleanno";
