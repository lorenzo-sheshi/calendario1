"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  apiFetch,
  byDay,
  downloadText,
  eventToICS,
  EventItem,
  EventType,
  getDeviceId,
  googleCalendarUrl,
  iso,
  longDate,
  newEventId,
  nextDate,
  pad,
  T,
} from "@/lib/circolari";
import MediaDrawer from "@/components/MediaDrawer";
import GmailDrawer from "@/components/GmailDrawer";

type Filter = EventType | "all";

export default function Page() {
  // Stato app
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<Date>(new Date());
  const [sel, setSel] = useState<string>(iso(new Date()));
  const [cur, setCur] = useState<EventItem | null>(null);

  // Modali
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(false);
  const detailRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLDialogElement>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Notifiche
  const [notifOn, setNotifOn] = useState(false);
  const sentRef = useRef<Record<string, number>>({});

  // Carica eventi dal server
  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<EventItem[]>("/api/events");
      setEvents(data);
    } catch (e) {
      console.error(e);
      showToast("Errore caricamento eventi");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Persistenza locale di `sent` (per le notifiche)
  useEffect(() => {
    try {
      sentRef.current = JSON.parse(
        localStorage.getItem("circolari-sent") || "{}",
      );
    } catch {
      sentRef.current = {};
    }
  }, []);

  // === SERVICE WORKER ===
  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("SW registration failed", err));
    }
  }, []);

  // === GESTIONE QUERY STRING (scorciatoie PWA) ===
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (action === "today") {
      const t = new Date();
      setView(t);
      setSel(iso(t));
    } else if (action === "new") {
      // Apri il form solo dopo che i dati sono caricati
      const t = setTimeout(() => openForm(null), 300);
      return () => clearTimeout(t);
    }
  }, []);

  // === TEMA SCURO (prefers-color-scheme) ===
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // === CHECK NOTIFICHE ===
  const check = useCallback(() => {
    if (
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const now = Date.now();
    const t = iso(new Date());
    events.forEach((e) => {
      const d = nextDate(e, t);
      if (!d) return;
      const w = new Date(`${d}T${e.time || "08:00"}`).getTime();
      (
        [
          [864e5, "Domani"],
          [36e5, "Tra un'ora"],
        ] as const
      ).forEach(([ms, txt]) => {
        const k = e.id + w + ms;
        if (now < w - ms || now >= w || sentRef.current[k]) return;
        sentRef.current[k] = 1;
        if (
          (ms === 864e5 && now >= w - 36e5) ||
          (ms === 36e5 && !e.time)
        )
          return;
        notify(`${T[e.type][0]} ${e.title}`, txt + (e.time ? " alle " + e.time : ""));
      });
    });
    localStorage.setItem(
      "circolari-sent",
      JSON.stringify(sentRef.current),
    );
  }, [events]);

  useEffect(() => {
    const id = setInterval(check, 30000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [check]);

  // === AUTO-SYNC GMAIL ogni 5 minuti (se ci sono account attivi) ===
  useEffect(() => {
    let cancelled = false;
    async function autoSync() {
      try {
        // Verifica se ci sono account Gmail attivi prima di triggerare
        const accounts = await apiFetch<
          { id: string; active: boolean }[]
        >("/api/gmail/accounts").catch(() => [] as { id: string; active: boolean }[]);
        if (cancelled || accounts.length === 0) return;
        const activeCount = accounts.filter((a) => a.active).length;
        if (activeCount === 0) return;
        const res = await apiFetch<{
          ok: boolean;
          imported: number;
          errors: string[];
        }>("/api/gmail/sync", { method: "POST" });
        if (cancelled) return;
        if (res.ok && res.imported > 0) {
          showToast(`${res.imported} nuove email Gmail importate`);
          // ricarica eventi per allinearli
          await reload();
        }
      } catch {
        /* silenzioso per auto-sync */
      }
    }
    // primo sync dopo 30s
    const first = setTimeout(autoSync, 30000);
    const interval = setInterval(autoSync, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [showToast, reload]);

  // === UTILITY RENDER ===
  const todayIso = iso(new Date());

  const cells = useMemo(() => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7;
    const n = new Date(y, m + 1, 0).getDate();
    const out: {
      key: string;
      day?: number;
      date?: string;
      types: EventType[];
      hasUnsigned: boolean;
    }[] = [];
    for (let i = 0; i < first; i++) {
      out.push({ key: "e" + i, types: [], hasUnsigned: false });
    }
    for (let d = 1; d <= n; d++) {
      const k = `${y}-${pad(m + 1)}-${pad(d)}`;
      const l = byDay(events, filter, k);
      const types = Array.from(new Set(l.map((e) => e.type)));
      const hasUnsigned = l.some(
        (e) => e.type === "circolare" && !e.signed,
      );
      out.push({
        key: k,
        day: d,
        date: k,
        types,
        hasUnsigned,
      });
    }
    return out;
  }, [view, events, filter]);

  const dayList = byDay(events, filter, sel);
  const upcoming = useMemo(() => {
    const t = iso(new Date());
    return events
      .filter((e) => filter === "all" || e.type === filter)
      .map((e) => [nextDate(e, t), e] as const)
      .filter((x): x is readonly [string, EventItem] => !!x[0])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(0, 6);
  }, [events, filter]);

  // === HANDLERS CRUD ===
  async function saveEvent(form: HTMLFormElement) {
    const fd = new FormData(form);
    const o: EventItem = {
      id: String(fd.get("id") || newEventId()),
      type: String(fd.get("type") || "circolare") as EventType,
      title: String(fd.get("title") || "").trim(),
      date: String(fd.get("date") || ""),
      time: String(fd.get("time") || "").trim() || null,
      notes: String(fd.get("notes") || "").trim() || null,
    };
    if (!o.title || !o.date) {
      showToast("Titolo e data sono obbligatori");
      return;
    }
    setFormOpen(false);
    try {
      if (editing) {
        const updated = await apiFetch<EventItem>("/api/events", {
          method: "PUT",
          body: JSON.stringify({ id: o.id, type: o.type, title: o.title, date: o.date, time: o.time, notes: o.notes }),
        });
        setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      } else {
        const created = await apiFetch<EventItem>("/api/events", {
          method: "POST",
          body: JSON.stringify(o),
        });
        setEvents((prev) => [...prev, created]);
      }
      setSel(o.date);
      setView(new Date(o.date + "T12:00"));
      showToast("Evento salvato");
      check();
    } catch (e) {
      console.error(e);
      showToast("Errore salvataggio");
    }
  }

  async function toggleSign(e: EventItem) {
    try {
      const updated = await apiFetch<EventItem>(
        `/api/events/${encodeURIComponent(e.id)}/sign`,
        { method: "POST" },
      );
      setEvents((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setCur(updated);
      showToast(updated.signed ? "Circolare firmata" : "Firma rimossa");
    } catch (err) {
      console.error(err);
      showToast("Errore firma");
    }
  }

  async function deleteEvent(e: EventItem) {
    if (!confirm(`Eliminare "${e.title}"?`)) return;
    try {
      await apiFetch<{ ok: boolean }>(
        `/api/events?id=${encodeURIComponent(e.id)}`,
        { method: "DELETE" },
      );
      setEvents((prev) => prev.filter((x) => x.id !== e.id));
      setCur(null);
      showToast("Evento eliminato");
    } catch (err) {
      console.error(err);
      showToast("Errore eliminazione");
    }
  }

  function openForm(e: EventItem | null) {
    setEditing(e);
    setFormOpen(true);
  }

  function openDetail(e: EventItem) {
    setCur(e);
  }

  useEffect(() => {
    const dlg = formRef.current;
    if (!dlg) return;
    // showModal() su dialog già aperto lancia InvalidStateError → rompe i bottoni.
    if (formOpen && !dlg.open) dlg.showModal();
    else if (!formOpen && dlg.open) dlg.close();
  }, [formOpen]);

  useEffect(() => {
    const dlg = detailRef.current;
    if (!dlg) return;
    // stessa protezione: dopo toggleSign cur si aggiorna ma il dialog è già aperto.
    if (cur && !dlg.open) dlg.showModal();
    else if (!cur && dlg.open) dlg.close();
  }, [cur]);

  // === EXPORT / IMPORT BACKUP ===
  function exportBackup() {
    downloadText(
      JSON.stringify(events, null, 2),
      "application/json",
      "circolari-backup.json",
    );
  }

  async function importBackup(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const ids = new Set(events.map((x) => x.id));
      if (!Array.isArray(data)) throw new Error("no array");
      let added = 0;
      const created: EventItem[] = [];
      for (const x of data) {
        if (x.id && x.title && x.date && !ids.has(x.id)) {
          const c = await apiFetch<EventItem>("/api/events", {
            method: "POST",
            body: JSON.stringify({
              id: x.id,
              type: x.type || "circolare",
              title: x.title,
              date: x.date,
              time: x.time || null,
              notes: x.notes || null,
            }),
          });
          created.push(c);
          added++;
        }
      }
      setEvents((prev) => [...prev, ...created]);
      showToast(`Backup ripristinato: ${added} eventi`);
    } catch {
      showToast("File di backup non valido");
    }
  }

  // === NOTIFICHE ===
  async function toggleNotifications() {
    if (!("Notification" in window)) {
      showToast(
        "Su iPhone aggiungi prima l'app alla schermata Home da Safari, poi riprova.",
      );
      return;
    }
    const p = await Notification.requestPermission();
    setNotifOn(p === "granted");
    showToast(p === "granted" ? "Notifiche attive" : "Notifiche non consentite");
    if (p === "granted") check();
  }

  useEffect(() => {
    setNotifOn(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted",
    );
  }, []);

  // === RENDER AIUTO ===
  const itemMarkup = (e: EventItem, d?: string) => {
    const age =
      e.type === "compleanno" && d
        ? ` · ${+d.slice(0, 4) - +e.date.slice(0, 4)} anni`
        : "";
    const signed =
      e.type === "circolare"
        ? e.signed
          ? " · ✔ firmata"
          : " · da firmare"
        : "";
    return (
      <li
        key={e.id + (d || "")}
        className={`it ${e.type}`}
        data-id={e.id}
        onClick={() => openDetail(e)}
      >
        <span className="em">{T[e.type][0]}</span>
        <div>
          <strong>{e.title}</strong>
          <small>
            {d && d !== sel ? longDate(d) + " · " : ""}
            {e.time || "Tutto il giorno"}
            {age}
            {signed}
          </small>
        </div>
      </li>
    );
  };

  const viewTitle = view.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={`circolari-app${dark ? " dark" : ""}`}>
      <header className="top">
        <div>
          <h1>Circolari</h1>
          <p>Istituto Belluzzi da Vinci</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="bellb"
            aria-label="Carica file (PDF, immagini…)"
            onClick={() => setMediaOpen(true)}
            title="Carica file"
          >
            📎
          </button>
          <button
            className="bellb"
            aria-label="Integrazione Gmail"
            onClick={() => setGmailOpen(true)}
            title="Integrazione Gmail"
          >
            ✉️
          </button>
          <button
            className="bellb"
            aria-label="Attiva le notifiche"
            onClick={toggleNotifications}
          >
            {notifOn ? "🔔" : "🔕"}
          </button>
        </div>
      </header>

      <main className="wrap">
        <section className="card">
          <div className="nav">
            <button
              className="ib"
              aria-label="Mese precedente"
              onClick={() =>
                setView(
                  (v) => new Date(v.getFullYear(), v.getMonth() - 1, 1),
                )
              }
            >
              ‹
            </button>
            <h2>{viewTitle}</h2>
            <button
              className="ib"
              aria-label="Mese successivo"
              onClick={() =>
                setView(
                  (v) => new Date(v.getFullYear(), v.getMonth() + 1, 1),
                )
              }
            >
              ›
            </button>
            <button
              className="pill"
              onClick={() => {
                const t = new Date();
                setView(t);
                setSel(iso(t));
              }}
            >
              Oggi
            </button>
          </div>

          <div className="chips">
            {(
              [
                ["all", "Tutti"],
                ["circolare", "📄 Circolari"],
                ["impegno", "📌 Impegni"],
                ["compleanno", "🎂 Compleanni"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                data-f={f}
                className={filter === f ? "on" : ""}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="wk">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mer</span>
            <span>Gio</span>
            <span>Ven</span>
            <span>Sab</span>
            <span>Dom</span>
          </div>

          <div className="grid">
            {cells.map((c) =>
              c.date ? (
                <button
                  key={c.key}
                  className={
                    "cell" +
                    (c.date === todayIso ? " today" : "") +
                    (c.date === sel ? " sel" : "")
                  }
                  data-d={c.date}
                  onClick={() => setSel(c.date!)}
                >
                  <b>{c.day}</b>
                  <i>
                    {c.types.map((t) => (
                      <u key={t} className={t} />
                    ))}
                  </i>
                  {c.hasUnsigned ? <s /> : null}
                </button>
              ) : (
                <span key={c.key} className="cell empty" />
              ),
            )}
          </div>
        </section>

        <aside className="side">
          <section className="card">
            <h3>{longDate(sel)}</h3>
            {loading ? (
              <ul className="list">
                <li className="none">Caricamento…</li>
              </ul>
            ) : dayList.length ? (
              <ul className="list">{dayList.map((e) => itemMarkup(e))}</ul>
            ) : (
              <ul className="list">
                <li className="none">
                  Nessun evento. Tocca “Nuovo” per aggiungerne uno.
                </li>
              </ul>
            )}
          </section>
          <section className="card">
            <h3>Prossimi eventi</h3>
            {upcoming.length ? (
              <ul className="list">
                {upcoming.map(([d, e]) => itemMarkup(e, d))}
              </ul>
            ) : (
              <ul className="list">
                <li className="none">Niente in programma.</li>
              </ul>
            )}
          </section>
        </aside>
      </main>

      <footer>
        <button className="link" onClick={exportBackup}>
          Salva backup
        </button>
        <label className="link">
          Ripristina backup
          <input
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBackup(f);
              e.target.value = "";
            }}
          />
        </label>
      </footer>

      <button className="fab" onClick={() => openForm(null)}>
        ＋ Nuovo
      </button>

      {/* ===== Dialog: form nuovo/modifica ===== */}
      <dialog ref={formRef} id="dlgF" onClose={() => setFormOpen(false)}>
        <form
          id="f"
          onSubmit={(e) => {
            e.preventDefault();
            saveEvent(e.currentTarget);
          }}
        >
          <h2 id="fh">{editing ? "Modifica evento" : "Nuovo evento"}</h2>
          <input type="hidden" name="id" defaultValue={editing?.id || ""} />
          <label>
            Tipo
            <select name="type" defaultValue={editing?.type || "circolare"}>
              <option value="circolare">📄 Circolare</option>
              <option value="impegno">📌 Impegno</option>
              <option value="compleanno">🎂 Compleanno</option>
            </select>
          </label>
          <label>
            Titolo
            <input
              name="title"
              required
              placeholder="Es. Compleanno di Marco"
              defaultValue={editing?.title || ""}
            />
          </label>
          <div className="two">
            <label>
              Data
              <input
                type="date"
                name="date"
                required
                defaultValue={editing?.date || sel}
              />
            </label>
            <label>
              Ora (facoltativa)
              <input
                type="time"
                name="time"
                defaultValue={editing?.time || ""}
              />
            </label>
          </div>
          <label>
            Note
            <textarea
              name="notes"
              rows={3}
              defaultValue={editing?.notes || ""}
            />
          </label>
          <div className="btns">
            <button
              type="button"
              className="sec"
              onClick={() => setFormOpen(false)}
            >
              Annulla
            </button>
            <button type="submit" className="pri">
              Salva
            </button>
          </div>
        </form>
      </dialog>

      {/* ===== Dialog: dettaglio ===== */}
      <dialog
        ref={detailRef}
        id="dlgD"
        onClose={() => setCur(null)}
      >
        {cur && <DetailBody e={cur} onSign={toggleSign} onEdit={(e) => {
          setCur(null);
          openForm(e);
        }} onDelete={deleteEvent} />}
      </dialog>

      {/* ===== Drawer: caricamento file multimediali ===== */}
      <MediaDrawer
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        deviceId={getDeviceId()}
        onEventCreated={(ev) => {
          setEvents((prev) => [...prev, ev]);
          setSel(ev.date);
          setView(new Date(ev.date + "T12:00"));
          setMediaOpen(false);
        }}
        onToast={showToast}
      />

      {/* ===== Drawer: integrazione Gmail ===== */}
      <GmailDrawer
        open={gmailOpen}
        onClose={() => setGmailOpen(false)}
        onEventCreated={(ev) => {
          setEvents((prev) => [...prev, ev]);
          setSel(ev.date);
          setView(new Date(ev.date + "T12:00"));
        }}
        onToast={showToast}
      />

      <div id="toast" className={toast ? "on" : ""} role="status">
        {toast}
      </div>
    </div>
  );
}

function DetailBody({
  e,
  onSign,
  onEdit,
  onDelete,
}: {
  e: EventItem;
  onSign: (e: EventItem) => void;
  onEdit: (e: EventItem) => void;
  onDelete: (e: EventItem) => void;
}) {
  return (
    <>
      <div id="dt">
        <p className={`tag ${e.type}`}>
          {T[e.type][0]} {T[e.type][1]}
        </p>
        <h2>{e.title}</h2>
        <p>
          {longDate(e.date)}, {e.date.slice(0, 4)}
          {e.time ? " · " + e.time : ""}
          {e.type === "compleanno" ? " · ogni anno" : ""}
        </p>
        {e.source && e.source !== "manual" ? (
          <p style={{ fontSize: "0.8rem", color: "var(--c-mute)" }}>
            {e.source.startsWith("media:")
              ? "📎 Creato da file caricato"
              : e.source.startsWith("gmail:")
                ? "✉️ Creato da email Gmail"
                : `Origine: ${e.source}`}
          </p>
        ) : null}
        {e.notes ? <p className="notes">{e.notes}</p> : null}
        {e.signed ? (
          <p className="notes">
            ✔ Firmata il{" "}
            {new Date(e.signed).toLocaleString("it-IT", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        ) : null}
      </div>
      <div className="btns col">
        {e.type === "circolare" ? (
          <button className="pri" onClick={() => onSign(e)}>
            {e.signed ? "↩ Rimuovi la firma" : "✍ Firma per presa visione"}
          </button>
        ) : null}
        <button
          className="sec"
          onClick={() => {
            const ics = eventToICS(e);
            downloadText(ics, "text/calendar", "evento.ics");
          }}
        >
          📲 Aggiungi al calendario (.ics)
        </button>
        <button
          className="sec"
          onClick={() => window.open(googleCalendarUrl(e), "_blank")}
        >
          Apri in Google Calendar
        </button>
        <div className="row">
          <button className="sec" onClick={() => onEdit(e)}>
            ✏️ Modifica
          </button>
          <button
            className="sec danger"
            onClick={() => onDelete(e)}
          >
            🗑 Elimina
          </button>
        </div>
      </div>
    </>
  );
}

// notifica wrapper
async function notify(title: string, body: string) {
  const opts: NotificationOptions = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* fallback */
  }
  if ("Notification" in window) new Notification(title, opts);
}
