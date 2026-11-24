"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiFetch,
  EventItem,
  EventType,
  iso,
} from "@/lib/circolari";
import type {
  EmailAccountDTO,
  ImportedEmailDTO,
  SuggestedEvent,
} from "@/lib/circolari-dtos";

interface Props {
  open: boolean;
  onClose: () => void;
  onEventCreated: (e: EventItem) => void;
  onToast: (m: string) => void;
}

export default function GmailDrawer({
  open,
  onClose,
  onEventCreated,
  onToast,
}: Props) {
  const [accounts, setAccounts] = useState<EmailAccountDTO[]>([]);
  const [emails, setEmails] = useState<ImportedEmailDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Form per nuovo account
  const [email, setEmail] = useState("");
  const [appPwd, setAppPwd] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  // Modalità "Incolla email manualmente" (fallback per account scolastici senza IMAP)
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteFrom, setPasteFrom] = useState("");
  const [pasteSubject, setPasteSubject] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      reload();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  async function reload() {
    setLoading(true);
    try {
      const [acc, em] = await Promise.all([
        apiFetch<EmailAccountDTO[]>("/api/gmail/accounts"),
        apiFetch<ImportedEmailDTO[]>("/api/gmail/emails?status=pending"),
      ]);
      setAccounts(acc);
      setEmails(em);
    } catch {
      onToast("Errore caricamento Gmail");
    } finally {
      setLoading(false);
    }
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !appPwd) return;
    try {
      const created = await apiFetch<EmailAccountDTO>(
        "/api/gmail/accounts",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            appPassword: appPwd,
            searchFrom: fromFilter || null,
            searchSubject: subjectFilter || null,
          }),
        },
      );
      setEmail("");
      setAppPwd("");
      setFromFilter("");
      setSubjectFilter("");
      onToast("Account aggiunto. Eseguo test di connessione…");
      await reload();
      // Auto-test dopo aggiunta
      await testAccount(created.id);
    } catch (err) {
      console.error(err);
      onToast("Errore salvataggio account");
    }
  }

  async function testAccount(id: string) {
    setTestingId(id);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/gmail/accounts/${id}/test`,
        { method: "POST" },
      );
      if (res.ok) {
        onToast("✓ Connessione riuscita");
      } else {
        onToast(`Test fallito — vedi dettaglio nell'elenco`);
      }
      await reload();
    } catch (e) {
      console.error(e);
      onToast("Errore test connessione");
    } finally {
      setTestingId(null);
    }
  }

  async function removeAccount(id: string) {
    if (!confirm("Rimuovere questo account e tutte le email importate?")) return;
    try {
      await apiFetch(`/api/gmail/accounts/${id}`, { method: "DELETE" });
      onToast("Account rimosso");
      await reload();
    } catch {
      onToast("Errore rimozione");
    }
  }

  async function toggleActive(acc: EmailAccountDTO) {
    try {
      await apiFetch(`/api/gmail/accounts/${acc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !acc.active }),
      });
      await reload();
    } catch {
      onToast("Errore aggiornamento");
    }
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        accounts: number;
        fetched: number;
        imported: number;
        errors: string[];
      }>("/api/gmail/sync", { method: "POST" });
      if (res.ok) {
        onToast(
          res.imported
            ? `${res.imported} nuove email importate`
            : "Nessuna nuova email",
        );
      } else {
        onToast(
          `Errore: ${res.errors[0]?.slice(0, 80) || "sincronizzazione fallita"}`,
        );
      }
      await reload();
    } catch (e) {
      console.error(e);
      onToast("Errore sync");
    } finally {
      setSyncing(false);
    }
  }

  async function syncOne(id: string) {
    setSyncing(true);
    try {
      const res = await apiFetch<{ ok: boolean; imported: number; error?: string }>(
        `/api/gmail/accounts/${id}/sync`,
        { method: "POST" },
      );
      if (res.ok) {
        onToast(
          res.imported
            ? `${res.imported} nuove email`
            : "Nessuna nuova email",
        );
      } else {
        onToast(`Errore: ${res.error?.slice(0, 80) || "sync fallita"}`);
      }
      await reload();
    } catch (e) {
      console.error(e);
      onToast("Errore sync");
    } finally {
      setSyncing(false);
    }
  }

  async function convertEmail(em: ImportedEmailDTO) {
    const p = em.parsedData;
    const type: EventType =
      p?.type === "impegno" || p?.type === "compleanno" ? p.type : "circolare";
    const title = p?.title || em.subject;
    const date = p?.date || iso(new Date());
    const time = p?.time || "";
    const notes = p?.notes || em.snippet;
    try {
      const event = await apiFetch<EventItem>(
        `/api/gmail/emails/${em.id}/event`,
        {
          method: "POST",
          body: JSON.stringify({ type, title, date, time: time || null, notes }),
        },
      );
      onEventCreated(event);
      onToast("Evento creato dall'email");
      await reload();
    } catch (e) {
      console.error(e);
      onToast("Errore conversione");
    }
  }

  async function dismissEmail(em: ImportedEmailDTO) {
    try {
      await apiFetch(`/api/gmail/emails/${em.id}/dismiss`, { method: "POST" });
      onToast("Email scartata");
      await reload();
    } catch {
      onToast("Errore");
    }
  }

  // Modalità alternativa: incolla email manualmente (per account scolastici senza IMAP)
  async function pasteEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) {
      onToast("Inserisci il testo dell'email");
      return;
    }
    setPasting(true);
    try {
      await apiFetch("/api/gmail/paste", {
        method: "POST",
        body: JSON.stringify({
          from: pasteFrom || null,
          subject: pasteSubject || null,
          text: pasteText,
        }),
      });
      onToast("Email incollata. L'AI sta analizzando il contenuto…");
      setPasteFrom("");
      setPasteSubject("");
      setPasteText("");
      setPasteOpen(false);
      await reload();
    } catch (err) {
      console.error(err);
      onToast("Errore salvataggio email");
    } finally {
      setPasting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="circolari-app drawer"
      aria-label="Integrazione Gmail"
    >
      <div className="circolari-app" style={{ padding: 0, background: "var(--c-card)" }}>
        <div className="drawer-head">
          <h2>Integrazione Gmail</h2>
          <button
            className="drawer-close"
            aria-label="Chiudi"
            onClick={onClose}
            title="Chiudi"
          >
            ✕
          </button>
        </div>
        <div className="drawer-body">
        <p style={{ color: "var(--c-mute)", fontSize: "0.9rem", marginBottom: 14 }}>
          Collega una casella Gmail per importare automaticamente le circolari.
          Usa una <strong>App Password</strong> Google (non la password principale):
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--c-pri)", marginLeft: 4 }}
          >
            generane una qui
          </a>
          .
        </p>

        {/* Sync button */}
        {accounts.length > 0 && (
          <div className="btns" style={{ marginBottom: 14 }}>
            <button className="pri" onClick={syncAll} disabled={syncing}>
              {syncing ? "Sincronizzazione…" : "🔄 Sincronizza tutti ora"}
            </button>
          </div>
        )}

        {/* Lista account */}
        {accounts.length > 0 && (
          <ul className="list" style={{ marginBottom: 14 }}>
            {accounts.map((a) => (
              <li
                key={a.id}
                className="it circolare"
                style={{ cursor: "default", alignItems: "flex-start" }}
              >
                <span className="em">✉️</span>
                <div style={{ flex: 1 }}>
                  <strong>{a.email}</strong>
                  <small>
                    {a.active ? "attivo" : "in pausa"} ·{" "}
                    {a.syncedCount} email importate ·{" "}
                    {a.lastSyncAt
                      ? `ultimo sync: ${new Date(a.lastSyncAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}`
                      : "mai sincronizzato"}
                  </small>
                  {a.searchFrom && (
                    <small>Filtro mittente: {a.searchFrom}</small>
                  )}
                  {a.searchSubject && (
                    <small>Filtro oggetto: {a.searchSubject}</small>
                  )}
                  {a.error && (
                    <div className="err-box" style={{ marginTop: 6 }}>
                      <strong>⚠️ Errore:</strong>
                      {"\n"}
                      {a.error}
                    </div>
                  )}
                </div>
                <div className="row" style={{ flex: "0 0 auto", flexWrap: "wrap", gap: 6, alignContent: "flex-start" }}>
                  <button
                    className="sec"
                    onClick={() => testAccount(a.id)}
                    disabled={testingId === a.id || syncing}
                    title="Verifica subito le credenziali IMAP"
                  >
                    {testingId === a.id ? "Test…" : "Test"}
                  </button>
                  <button className="sec" onClick={() => syncOne(a.id)} disabled={syncing}>
                    Sync
                  </button>
                  <button className="sec" onClick={() => toggleActive(a)}>
                    {a.active ? "Pausa" : "Attiva"}
                  </button>
                  <button
                    className="sec danger"
                    onClick={() => removeAccount(a.id)}
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Form nuovo account */}
        <details style={{ marginBottom: 14 }}>
          <summary style={{ cursor: "pointer", color: "var(--c-pri)", fontWeight: 600 }}>
            + Aggiungi account Gmail
          </summary>
          <form onSubmit={addAccount} style={{ marginTop: 12 }}>
            <label>
              Email Gmail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="es. circolari@istituto.edu"
                required
              />
            </label>
            <label>
              App Password (16 caratteri)
              <input
                type="password"
                value={appPwd}
                onChange={(e) => setAppPwd(e.target.value)}
                placeholder="abcd efgh ijkl mnop"
                required
              />
            </label>
            <div className="two">
              <label>
                Filtro mittente (facoltativo)
                <input
                  value={fromFilter}
                  onChange={(e) => setFromFilter(e.target.value)}
                  placeholder="es. segreteria@istituto.edu"
                />
              </label>
              <label>
                Filtro oggetto (facoltativo)
                <input
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  placeholder="es. circolare"
                />
              </label>
            </div>
            <div className="btns">
              <button type="submit" className="pri">
                Salva e testa connessione
              </button>
            </div>
          </form>
        </details>

        {/* === MODALITÀ ALTERNATIVA: incolla email manualmente ===
             Per account scolastici/aziendali dove IMAP è bloccato dall'admin. */}
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 12,
            background: "var(--c-bg)",
            border: "1px solid var(--c-line)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "1.2rem" }}>📋</span>
            <strong style={{ flex: 1 }}>
              Incolla email manualmente
            </strong>
            <button
              className="sec"
              style={{ flex: "0 0 auto", padding: "6px 12px" }}
              onClick={() => setPasteOpen((v) => !v)}
            >
              {pasteOpen ? "Annulla" : "Apri"}
            </button>
          </div>
          <p
            style={{
              fontSize: "0.82rem",
              color: "var(--c-mute)",
              margin: "6px 0 0",
              lineHeight: 1.5,
            }}
          >
            Se il tuo account Gmail scolastico ({`@studenti.ittsrimini.edu.it`})
            ha IMAP bloccato dall&apos;amministratore, copia il testo di una
            circolare ricevuta su Gmail (dal browser o dall&apos;app) e incollalo
            qui: l&apos;AI estrarrà automaticamente data, titolo e note
            dell&apos;evento.
          </p>
          {pasteOpen && (
            <form onSubmit={pasteEmail} style={{ marginTop: 12 }}>
              <div className="two">
                <label>
                  Mittente (facoltativo)
                  <input
                    value={pasteFrom}
                    onChange={(e) => setPasteFrom(e.target.value)}
                    placeholder="es. segreteria@ittsrimini.edu.it"
                  />
                </label>
                <label>
                  Oggetto (facoltativo)
                  <input
                    value={pasteSubject}
                    onChange={(e) => setPasteSubject(e.target.value)}
                    placeholder="es. Circolare n. 47"
                  />
                </label>
              </div>
              <label>
                Testo dell&apos;email
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Incolla qui il testo completo della circolare (Ctrl+V / Cmd+V)…"
                  required
                  style={{ fontFamily: "inherit" }}
                />
              </label>
              <div className="btns">
                <button type="submit" className="pri" disabled={pasting}>
                  {pasting ? "Analisi AI in corso…" : "Incolla e analizza"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Email importate */}
        <h3 style={{ marginTop: 18, marginBottom: 8 }}>
          Email da elaborare ({emails.length})
        </h3>
        {loading ? (
          <div style={{ color: "var(--c-mute)" }}>Caricamento…</div>
        ) : emails.length === 0 ? (
          <div style={{ color: "var(--c-mute)" }}>
            Nessuna email da elaborare. Premi "Sincronizza tutti ora" per
            scaricare nuove email.
          </div>
        ) : (
          <ul className="list">
            {emails.map((em) => {
              const sugg = em.parsedData;
              return (
                <li
                  key={em.id}
                  className="it circolare"
                  style={{ cursor: "default", alignItems: "flex-start" }}
                >
                  <span className="em">📨</span>
                  <div style={{ flex: 1 }}>
                    <strong>{em.subject}</strong>
                    <small>
                      Da: {em.from} ·{" "}
                      {new Date(em.date).toLocaleString("it-IT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </small>
                    <small style={{ display: "block", marginTop: 4 }}>
                      {em.snippet.slice(0, 150)}…
                    </small>
                    {sugg && (
                      <small
                        style={{
                          display: "block",
                          marginTop: 4,
                          color: "var(--c-pri)",
                        }}
                      >
                        💡 AI suggerisce:{" "}
                        {sugg.title || "(nessun titolo)"}{" "}
                        {sugg.date ? `· ${sugg.date}` : ""}
                        {sugg.time ? ` ${sugg.time}` : ""}{" "}
                        (confidenza: {sugg.confidence})
                      </small>
                    )}
                  </div>
                  <div className="row" style={{ flex: "0 0 auto", flexWrap: "wrap" }}>
                    <button
                      className="pri"
                      style={{ flex: "0 0 auto" }}
                      onClick={() => convertEmail(em)}
                    >
                      ➕ Crea evento
                    </button>
                    <button
                      className="sec"
                      onClick={() => dismissEmail(em)}
                    >
                      Scarta
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        </div>
      </div>
    </dialog>
  );
}
