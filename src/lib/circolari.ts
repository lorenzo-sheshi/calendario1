// Tipi e utility lato client per l'app Circolari.
// Importato solo da componenti client: niente dipendenze server qui.

export type { EventType } from "@/lib/circolari-shared";
import type { EventType } from "@/lib/circolari-shared";
// Importa per uso locale (icsSpan, eventToICS usano iso/pad/T) E re-exporta
// per i consumer. Senza l'import locale, `iso(x)` dentro icsSpan è undefined
// perché `export { X } from "..."` non mette X nello scope del modulo.
import { T, pad, iso, newEventId } from "@/lib/circolari-shared";
export { T, pad, iso, newEventId };

export interface EventItem {
  id: string;
  type: EventType;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM
  notes?: string | null;
  signed?: string | null; // ISO timestamp della firma (solo circolari)
  source?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[c] as string,
  );

/** True se l'evento occorre in data `d` (con ricorrenza annuale per compleanni). */
export const onDay = (e: EventItem, d: string) =>
  e.date === d ||
  (e.type === "compleanno" && e.date.slice(5) === d.slice(5) && d > e.date);

/** Prossima occorrenza utile di un evento a partire da `today`. */
export const nextDate = (e: EventItem, t: string): string | null => {
  if (e.type !== "compleanno") return e.date >= t ? e.date : null;
  const y = +t.slice(0, 4);
  let c = y + e.date.slice(4);
  if (c < t) c = y + 1 + e.date.slice(4);
  return c < e.date ? e.date : c;
};

export const longDate = (d: string) =>
  new Date(d + "T12:00").toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export const byDay = (
  events: EventItem[],
  filter: EventType | "all",
  d: string,
) =>
  events
    .filter((e) => (filter === "all" || e.type === filter) && onDay(e, d))
    .sort((a, b) => ((a.time || "") < (b.time || "") ? -1 : 1));

export const ymd = (s: string) => s.replace(/-/g, "");

/** Range [start, end] in formato ICS a partire da un evento. */
export const icsSpan = (e: EventItem): [string, string] => {
  const s = new Date(`${e.date}T${e.time || "12:00"}`);
  const t = new Date(s);
  const f = (x: Date) =>
    ymd(iso(x)) + (e.time ? `T${pad(x.getHours())}${pad(x.getMinutes())}00` : "");
  if (e.time) t.setHours(t.getHours() + 1);
  else t.setDate(t.getDate() + 1);
  return [f(s), f(t)];
};

const tx = (s: unknown) =>
  String(s ?? "")
    .replace(/[,;\\]/g, "\\$&")
    .replace(/\n/g, "\\n");

/** Genera il payload .ics di un evento. */
export const eventToICS = (e: EventItem): string => {
  const [a, b] = icsSpan(e);
  const al = (t: string, d: string) =>
    `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${d}\r\nTRIGGER:${t}\r\nEND:VALARM`;
  const al2 = e.time
    ? [al("-P1D", "Domani"), al("-PT1H", "Tra un'ora")]
    : [al("-PT15H", "Domani"), al("PT8H", "Oggi")];
  const txt = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Circolari//IT",
    "BEGIN:VEVENT",
    `UID:${e.id}@circolari`,
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]|\.\d+/g, ""),
    e.time ? "DTSTART:" + a : "DTSTART;VALUE=DATE:" + a,
    e.time ? "DTEND:" + b : "DTEND;VALUE=DATE:" + b,
    e.type === "compleanno" ? "RRULE:FREQ=YEARLY" : "",
    "SUMMARY:" + tx(T[e.type][0] + " " + e.title),
    "DESCRIPTION:" + tx(e.notes),
    ...al2,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return txt;
};

export const googleCalendarUrl = (e: EventItem): string => {
  const [a, b] = icsSpan(e);
  const q = encodeURIComponent;
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${q(e.title)}&dates=${a}/${b}&details=${q(e.notes || "")}` +
    (e.type === "compleanno" ? "&recur=RRULE:FREQ=YEARLY" : "")
  );
};

/** Device-id stabile per browser, salvato in localStorage. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "circolari-device-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      "dev_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8);
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Wrapper fetch che inietta x-device-id. */
export async function apiFetch<T>(
  url: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  headers.set("x-device-id", getDeviceId());
  if (opts.body && !headers.has("Content-Type")) {
    // NON impostare Content-Type se il body è FormData: il browser deve
    // generare il boundary multipart automaticamente. Se forziamo
    // application/json, il server non riesce a parsare i file.
    if (!(opts.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
  }
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${txt || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function downloadText(
  txt: string,
  type: string,
  name: string,
) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([txt], { type: type + ";charset=utf-8" }),
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
