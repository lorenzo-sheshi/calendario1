# Circolari · Belluzzi da Vinci

PWA fullstack per la gestione di circolari scolastiche, impegni e compleanni.
Costruita con Next.js 16, TypeScript, Prisma + SQLite, Tailwind CSS.

## Funzionalità

- **Calendario mensile** con tre tipi di evento:
  - 📄 Circolari (firmabili per presa visione)
  - 📌 Impegni (compiti, verifiche, riunioni)
  - 🎂 Compleanni (ricorrenza annuale)
- **CRUD eventi** completo (crea, modifica, elimina, firma)
- **Caricamento file multimediali** (PDF, PNG, JPG, GIF, WebP, TXT) → l'AI
  estrae automaticamente tipo, titolo, data, ora e note
- **Integrazione Gmail** via IMAP per importare automaticamente le circolari
  dalla casella di posta (con filtri mittente/oggetto)
- **Modalità alternativa "Incolla email manualmente"** per account scolastici
  con IMAP bloccato dall'amministratore
- **PWA installabile**: manifest, service worker, icone, offline cache,
  notifiche push, scorciatoie "Nuovo evento" e "Vai a oggi"
- **Esportazione ICS** e link **Google Calendar** per ogni evento
- **Backup/ripristino JSON** di tutti gli eventi
- **Tema chiaro/scuro** automatico
- **Isolamento per-browser** tramite deviceId (ogni browser vede solo i
  propri eventi)

## Prerequisiti

- **Node.js 20+** (consigliato 22)
- **Bun** (consigliato) oppure npm/yarn/pnpm
- **Python 3** con Pillow (solo se vuoi rigenerare le icone PWA, vedi
  `scripts/gen_icons.py`) — non necessario per eseguire il progetto
- **pdftotext** (poppler-utils) per l'estrazione testo dai PDF testuali
  - Ubuntu/Debian: `sudo apt install poppler-utils`
  - macOS: `brew install poppler`
  - Windows: scarica poppler per Windows

## Setup (5 minuti)

### 1. Installa le dipendenze

```bash
# Con bun (consigliato)
bun install

# Oppure con npm
npm install
```

### 2. Crea il database SQLite

Il file `.env` contiene `DATABASE_URL=file:./db/custom.db` (path relativo).
Nota: con SQLite, Prisma risolve i path relativi rispetto alla directory
del file `schema.prisma` (`prisma/`), quindi il DB viene effettivamente
creato in `prisma/db/custom.db`. Questo è il comportamento standard di
Prisma e non richiede configurazione aggiuntiva.

```bash
bun run db:push
# oppure: npx prisma db push --accept-data-loss
```

Questo crea il DB con tutte le tabelle (Event, MediaFile, EmailAccount,
ImportedEmail).

### 3. Avvia il server di sviluppo

```bash
bun run dev
# oppure: npm run dev
```

Apri **http://localhost:3000** nel browser.

### 4. Build di produzione (opzionale)

```bash
bun run build
bun run start
# oppure: npm run build && npm run start
```

## Struttura del progetto

```
.
├── prisma/
│   └── schema.prisma          # Schema DB (Event, MediaFile, EmailAccount, ImportedEmail)
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker (cache offline + push)
│   ├── icon-*.png             # Icone PWA (192, 512, maskable, apple-touch)
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Metadata PWA (manifest, theme-color, apple-touch-icon)
│   │   ├── page.tsx           # Calendario principale (client component)
│   │   ├── globals.css        # Tailwind + stili calendario + drawer
│   │   └── api/
│   │       ├── events/        # CRUD eventi + firma circolari
│   │       ├── media/         # Upload file + parse AI + serve file
│   │       └── gmail/         # Account IMAP + sync + paste email
│   ├── components/
│   │   ├── MediaDrawer.tsx    # Drawer caricamento file
│   │   └── GmailDrawer.tsx    # Drawer integrazione Gmail
│   └── lib/
│       ├── circolari-shared.ts # Utility pure (server-safe)
│       ├── circolari.ts        # Utility client + apiFetch
│       ├── circolari-dtos.ts   # Tipi DTO
│       ├── db.ts              # Prisma client
│       ├── ai-parser.ts       # LLM/VLM extraction (z-ai-web-dev-sdk)
│       ├── gmail-imap.ts      # Client IMAP + testImapLogin + explainImapError
│       └── gmail-sync.ts      # Sync engine Gmail
├── uploads/                   # File caricati (creato automaticamente al primo upload)
├── prisma/db/                 # SQLite DB (creato da db:push in prisma/db/custom.db)
├── scripts/
│   └── gen_icons.py           # Generatore icone PWA (richiede Pillow)
├── package.json
├── tsconfig.json
├── next.config.ts
└── .env                       # DATABASE_URL
```

## API Routes

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET    | `/api/events` | Lista eventi (filtri: type, from, to) |
| POST   | `/api/events` | Crea evento |
| PUT    | `/api/events` | Modifica evento |
| DELETE | `/api/events?id=...` | Elimina evento |
| POST   | `/api/events/[id]/sign` | Toggle firma circolare |
| GET    | `/api/media` | Lista file caricati |
| POST   | `/api/media` | Upload file (multipart) |
| DELETE | `/api/media/[id]` | Elimina file |
| GET    | `/api/media/[id]/file` | Serve file binario |
| POST   | `/api/media/[id]/parse` | Analisi AI del file |
| POST   | `/api/media/[id]/event` | Crea evento dal file |
| GET    | `/api/gmail/accounts` | Lista account Gmail |
| POST   | `/api/gmail/accounts` | Aggiungi account |
| PATCH  | `/api/gmail/accounts/[id]` | Modifica account |
| DELETE | `/api/gmail/accounts/[id]` | Rimuovi account |
| POST   | `/api/gmail/accounts/[id]/sync` | Sync singolo account |
| POST   | `/api/gmail/accounts/[id]/test` | Test credenziali IMAP |
| POST   | `/api/gmail/sync` | Sync tutti gli account |
| GET    | `/api/gmail/emails` | Lista email importate |
| POST   | `/api/gmail/emails/[id]/event` | Crea evento da email |
| POST   | `/api/gmail/emails/[id]/dismiss` | Scarta email |
| POST   | `/api/gmail/paste` | Incolla email manualmente (senza IMAP) |

Tutte le route richiedono l'header `x-device-id` per l'isolamento
per-browser (il client lo imposta automaticamente).

## Integrazione Gmail

### Modalità 1: IMAP automatico (account Gmail normali)

1. Vai su **https://myaccount.google.com/apppasswords**
2. Genera una **App Password** di 16 caratteri (richiede 2FA attiva)
3. Apri l'app → ✉️ Gmail → "+ Aggiungi account Gmail"
4. Inserisci email + App Password (+ filtri opzionali)
5. Click "Salva e testa connessione"
6. Se il test passa, l'auto-sync ogni 5 minuti importerà le nuove email

### Modalità 2: Incolla email manualmente (account scolastici/aziendali)

Per account Google Workspace (`@studenti.*.edu.it`) dove l'amministratore
blocca IMAP o non supporta App Password:

1. Apri Gmail nel browser
2. Copia il testo di una circolare ricevuta
3. Apri l'app → ✉️ Gmail → "📋 Incolla email manualmente" → "Apri"
4. Incolla il testo (mittente e oggetto opzionali)
5. Click "Incolla e analizza" → l'AI estrae automaticamente i dati
6. Click "➕ Crea evento" per inserirlo nel calendario

## Caricamento circolari da file

1. Apri l'app → 📎 Carica file
2. Trascina o seleziona un PDF/PNG/JPG/TXT (max 15 MB)
3. Click "Analizza" sull'item → l'AI estrae tipo, titolo, data, ora, note
4. Rivedi il form precompilato → "Crea evento"

Formati supportati:
- **PDF**: estrazione testo con pdftotext + LLM (o VLM se scannerizzato)
- **PNG/JPG/GIF/WebP/BMP**: analisi visiva con VLM
- **TXT**: LLM diretto

## PWA: installazione sul dispositivo

- **Desktop Chrome/Edge**: icona "Installa" nella barra indirizzi
- **Android Chrome**: menu ⋮ → "Aggiungi a schermata Home"
- **iOS Safari**: icona Condividi → "Aggiungi a Home"
- **macOS Safari**: icona Condividi → "Aggiungi al Dock"

L'app funziona offline dopo il primo caricamento (service worker cache).

## Risoluzione problemi

### "Errore: Command failed" su Gmail sync

L'errore generico di imapflow viene intercettato e mostrato come messaggio
dettagliato con i 4 punti da verificare:
1. IMAP attivo in Gmail (Impostazioni → Inoltro e POP/IMAP)
2. 2FA attivo sul Google Account
3. App Password di 16 caratteri (NON la password normale)
4. App Password inserita senza spazi

Per account scolastici con IMAP bloccato: usa la modalità "Incolla email
manualmente".

### Database

Se il DB si corrompe o vuoi ricominciare da zero:

```bash
rm -f prisma/db/custom.db
bun run db:push
```

### Rigenerare le icone PWA

Richiede Python 3 + Pillow (`pip install Pillow`):

```bash
python3 scripts/gen_icons.py
```

## Tecnologie

- **Next.js 16** (App Router, Turbopack)
- **TypeScript 5**
- **Prisma 6** + **SQLite**
- **Tailwind CSS 4** + **shadcn/ui**
- **imapflow** + **mailparser** (IMAP Gmail)
- **z-ai-web-dev-sdk** (LLM + VLM per parsing AI)
- **pdf-parse** + **pdftotext** (estrazione testo PDF)

## Licenza

Progetto didattico — Istituto Belluzzi da Vinci.
