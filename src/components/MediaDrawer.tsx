"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiFetch,
  EventItem,
  EventType,
  iso,
  longDate,
  T,
} from "@/lib/circolari";
import type {
  MediaFileDTO,
  SuggestedEvent,
} from "@/lib/circolari-dtos";

interface Props {
  open: boolean;
  onClose: () => void;
  deviceId: string;
  onEventCreated: (e: EventItem) => void;
  onToast: (m: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function MediaDrawer({
  open,
  onClose,
  deviceId,
  onEventCreated,
  onToast,
}: Props) {
  const [files, setFiles] = useState<MediaFileDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MediaFileDTO | null>(null);
  const [parsing, setParsing] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestedEvent | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      loadFiles();
    } else {
      dialogRef.current?.close();
      setSelected(null);
      setSuggestion(null);
    }
  }, [open]);

  async function loadFiles() {
    setLoading(true);
    try {
      const list = await apiFetch<MediaFileDTO[]>("/api/media");
      setFiles(list);
    } catch {
      onToast("Errore caricamento file");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(filesList: FileList | File[]) {
    setUploading(true);
    const form = new FormData();
    let valid = 0;
    for (const f of Array.from(filesList)) {
      form.append("files", f);
      valid++;
    }
    if (!valid) {
      setUploading(false);
      return;
    }
    try {
      const res = await apiFetch<(MediaFileDTO | { error: string })[]>(
        "/api/media",
        { method: "POST", body: form },
      );
      const ok = res.filter((r) => "id" in r) as MediaFileDTO[];
      const errs = res.filter((r) => "error" in r) as { error: string }[];
      if (errs.length) onToast(errs[0].error);
      if (ok.length) onToast(`${ok.length} file caricati`);
      await loadFiles();
    } catch (e) {
      console.error(e);
      onToast("Errore upload");
    } finally {
      setUploading(false);
    }
  }

  async function parseFile(file: MediaFileDTO) {
    setSelected(file);
    setParsing(true);
    setSuggestion(null);
    try {
      const res = await apiFetch<{ file: MediaFileDTO; suggestion: SuggestedEvent }>(
        `/api/media/${file.id}/parse`,
        { method: "POST" },
      );
      setSuggestion(res.suggestion);
      // Aggiorna file nella lista
      setFiles((prev) =>
        prev.map((f) =>
          f.id === res.file.id ? { ...f, parsed: true, parsedData: res.file.parsedData } : f,
        ),
      );
    } catch (e) {
      console.error(e);
      onToast("Errore analisi AI");
    } finally {
      setParsing(false);
    }
  }

  async function createEventFromMedia() {
    if (!selected || !suggestion) return;
    const title = suggestion.title || selected.filename;
    const date = suggestion.date || iso(new Date());
    const time = suggestion.time || "";
    const notes = suggestion.notes || "";
    const type: EventType =
      suggestion.type === "impegno" || suggestion.type === "compleanno"
        ? suggestion.type
        : "circolare";
    try {
      const event = await apiFetch<EventItem>(
        `/api/media/${selected.id}/event`,
        {
          method: "POST",
          body: JSON.stringify({ type, title, date, time: time || null, notes }),
        },
      );
      onEventCreated(event);
      onToast("Evento creato dal file");
      setSelected(null);
      setSuggestion(null);
      await loadFiles();
    } catch (e) {
      console.error(e);
      onToast("Errore creazione evento");
    }
  }

  async function deleteFile(file: MediaFileDTO) {
    if (!confirm(`Eliminare "${file.filename}"?`)) return;
    try {
      await apiFetch(`/api/media/${file.id}`, { method: "DELETE" });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (selected?.id === file.id) {
        setSelected(null);
        setSuggestion(null);
      }
      onToast("File eliminato");
    } catch (e) {
      console.error(e);
      onToast("Errore eliminazione");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="circolari-app drawer"
      aria-label="Carica file multimediali"
    >
      <div className="circolari-app" style={{ padding: 0, background: "var(--c-card)" }}>
        <div className="drawer-head">
          <h2>Circolari caricate</h2>
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
          {/* Input file FUORI dal div cliccabile per evitare double-trigger del picker */}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.txt,application/pdf,image/*,text/plain"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files?.length) handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
          {/* Upload zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
            }}
            style={{
              border: "2px dashed var(--c-line)",
              borderRadius: 16,
              padding: 24,
              textAlign: "center",
              cursor: "pointer",
              marginBottom: 16,
              color: "var(--c-mute)",
            }}
          >
            <div style={{ fontSize: "2rem" }}>📎</div>
            <div style={{ fontWeight: 600, color: "var(--c-ink)" }}>
              {uploading ? "Caricamento…" : "Trascina qui o clicca per selezionare"}
            </div>
            <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
              PDF, PNG, JPG, GIF, WebP, TXT · max 15 MB
            </div>
          </div>

        {/* List */}
        {loading ? (
          <div style={{ color: "var(--c-mute)" }}>Caricamento…</div>
        ) : files.length === 0 ? (
          <div style={{ color: "var(--c-mute)" }}>
            Nessun file caricato. Carica una circolare per estrarre automaticamente
            data e titolo con l'AI.
          </div>
        ) : (
          <ul className="list">
            {files.map((f) => (
              <li
                key={f.id}
                className={`it circolare`}
                style={{ cursor: "default" }}
                onClick={() => setSelected(f)}
              >
                <span className="em">{mimeTypeIcon(f.mimeType)}</span>
                <div style={{ flex: 1 }}>
                  <strong>{f.filename}</strong>
                  <small>
                    {(f.size / 1024).toFixed(1)} KB · {f.mimeType}
                    {f.parsed ? " · ✔ analizzato" : ""}
                    {f.eventId ? " · evento creato" : ""}
                  </small>
                </div>
                <div className="row" style={{ flex: "0 0 auto" }}>
                  <button
                    className="sec"
                    onClick={(e) => {
                      e.stopPropagation();
                      parseFile(f);
                    }}
                  >
                    {f.parsed ? "Rianalizza" : "Analizza"}
                  </button>
                  <button
                    className="sec danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFile(f);
                    }}
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Detail with suggestion */}
        {selected && (
          <div
            style={{
              marginTop: 16,
              borderTop: "1px solid var(--c-line)",
              paddingTop: 16,
            }}
          >
            <h3>Anteprima · {selected.filename}</h3>
            <MediaPreview file={selected} deviceId={deviceId} />
            {parsing ? (
              <div style={{ color: "var(--c-mute)", marginTop: 12 }}>
                Analisi AI in corso…
              </div>
            ) : suggestion ? (
              <div style={{ marginTop: 12 }}>
                <div
                  className="tag circolare"
                  style={{ fontSize: "0.85rem" }}
                >
                  Suggerimento AI · confidenza: {suggestion.confidence}
                </div>
                <SuggestionForm
                  initial={suggestion}
                  onSubmit={createEventFromMedia}
                  submitLabel="Crea evento"
                />
              </div>
            ) : selected.parsed ? (
              <button
                className="sec"
                style={{ marginTop: 12 }}
                onClick={() => parseFile(selected)}
              >
                Mostra suggerimento
              </button>
            ) : null}
          </div>
        )}
        </div>
      </div>
    </dialog>
  );
}

function mimeTypeIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼";
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("text/")) return "📝";
  return "📎";
}

function MediaPreview({
  file,
  deviceId,
}: {
  file: MediaFileDTO;
  deviceId: string;
}) {
  // Passa ?key= per permettere a iframe/img di ricevere il file
  // senza header x-device-id (che gli embed non possono inviare).
  const url = `/api/media/${file.id}/file?key=${encodeURIComponent(deviceId)}`;
  if (file.mimeType.startsWith("image/")) {
    return (
      <img
        src={url}
        alt={file.filename}
        style={{
          maxWidth: "100%",
          maxHeight: 320,
          borderRadius: 12,
          marginTop: 8,
          display: "block",
        }}
      />
    );
  }
  if (file.mimeType === "application/pdf") {
    return (
      <iframe
        src={url}
        title={file.filename}
        style={{
          width: "100%",
          height: 320,
          border: "1px solid var(--c-line)",
          borderRadius: 12,
          marginTop: 8,
        }}
      />
    );
  }
  return (
    <div style={{ color: "var(--c-mute)", marginTop: 8, fontSize: "0.85rem" }}>
      Anteprima non disponibile per {file.mimeType}
    </div>
  );
}

function SuggestionForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial: SuggestedEvent;
  onSubmit: (data: {
    type: EventType;
    title: string;
    date: string;
    time: string;
    notes: string;
  }) => void;
  submitLabel: string;
}) {
  const [type, setType] = useState<EventType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date || iso(new Date()));
  const [time, setTime] = useState(initial.time || "");
  const [notes, setNotes] = useState(initial.notes || "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ type, title, date, time, notes });
      }}
    >
      <label>
        Tipo
        <select
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
        >
          <option value="circolare">📄 Circolare</option>
          <option value="impegno">📌 Impegno</option>
          <option value="compleanno">🎂 Compleanno</option>
        </select>
      </label>
      <label>
        Titolo
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <div className="two">
        <label>
          Data
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Ora
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>
      <label>
        Note
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="btns">
        <button type="submit" className="pri">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
