# Nexus

A personal knowledge management desktop app that unifies your calendar, tasks, notes, tickets, and a self-building wiki into a single daily workspace — powered by AWS Bedrock (Claude).

![Nexus](src-tauri/icons/icon.svg)

---

## Features

### Dashboard
AI-generated morning briefing with a narrative summary of your day. Stats bar shows meetings, high-priority tasks, and overdue items (tasks + GitLab items + Freshservice tickets). Heads-up alerts for back-to-back meetings, tentative events, and scheduling conflicts. Meeting cards link directly to Teams and let you create meeting notes in one click.

### Calendar
Week and month views fed by iCal URLs — Outlook, Google Calendar, Apple Calendar, or any `.ics` feed. Click any event to open a detail popup with attendee info, Teams join link, and meeting notes creation. All-day events pinned in a strip above the time grid. Background pre-fetch keeps navigation instant.

### Week Ahead
7-day planning view: full calendar for the week + tasks, GitLab items, and Freshservice tickets due or overdue that week. AI overview generates a week narrative (cached, regenerates each day). Task checkboxes let you close items directly from this view.

### Tasks
Full task manager sorted by priority. Filter by priority, source, or tag (searchable combobox). Done tasks stay in place with strikethrough — delete when ready. Tasks created from notes have a link back to the source note. GitLab issues and MRs displayed below personal tasks. Create a GitLab issue from any task. Task count badge in sidebar.

### Tickets
Freshservice tickets assigned to you — open and pending. Status, priority, category, and due date. Ticket count badge in sidebar.

### Notes
Markdown editor with autosave and live preview. Import files via drag-and-drop or browse:
- **`.eml`** — emails (parses MIME, extracts body, handles base64/quoted-printable)
- **`.vtt`** — Teams/Zoom transcripts (strips timestamps, groups by speaker)
- **`.txt` / `.md`** — plain text
- **`.docx` / `.doc` / `.rtf` / `.pdf`** — extracted via macOS `textutil`

AI extraction pulls out action items with fuzzy deduplication against existing tasks (skip, update, or create new). Extracted notes are marked with a badge and re-queued for wiki ingest automatically when re-extracted.

**Watched folder** — configure a folder path in Settings; Nexus scans it every 30 seconds and auto-imports any supported files. Processed files move to `_processed/` subfolder. Badge in sidebar shows new imports.

### Wiki
Karpathy-style compiled knowledge base. AI ingests notes and builds wiki pages per entity type:
- **Recurring meetings** (daily standup, etc.) → dated occurrence page + rolling summary parent page, grouped in folder view
- **People, projects, concepts, decisions** → merge behavior, accumulating knowledge over time

Natural language query, lint check for orphaned pages and broken cross-links, force-directed graph view. Clicking a graph node opens that page. Deleting a wiki page resets the source notes so they re-queue for ingest. Editing note content automatically re-queues it.

### Search
Global search ⌘K — notes, tasks, wiki pages, GitLab items, and Freshservice tickets. GitLab and ticket results open in the browser.

### Quick Capture
⇧⌘N anywhere — floating modal to create a task or note without leaving the current view.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Database | SQLite via tauri-plugin-sql |
| Settings / cache | JSON store via tauri-plugin-store |
| AI | AWS Bedrock — Claude Sonnet (via Rust `invoke_bedrock` command) |
| Calendar | iCal / ICS feeds (any provider) |
| GitLab | GitLab REST API v2 (personal access token) |
| Freshservice | Freshservice REST API v2 (API key) |
| File access | tauri-plugin-fs, tauri-plugin-dialog |
| Notifications | tauri-plugin-notification |

---

## Setup

### Prerequisites

- macOS (Apple Silicon or Intel)
- Node.js v20+
- Rust (install via `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)

### Install

```bash
git clone <repo-url>
cd nexus
npm install
source ~/.cargo/env && npm run tauri dev
```

The first Rust compile takes 3–5 minutes. Subsequent starts are fast (~10 seconds).

---

## Configuration

All credentials are set in **Settings** — nothing is hardcoded.

### Calendars (`Settings → Calendars`)
Add one or more iCal feed URLs:
- **Outlook:** Outlook Web → Settings → Calendar → Shared calendars → Publish → copy ICS link
- **Google:** Calendar Settings → your calendar → *Secret address in iCal format*
- Any `.ics` URL works

### AI — AWS Bedrock (`Settings → Claude AI`)
Nexus uses your existing AWS credentials — no Anthropic API account needed.

1. Create an IAM user with only `bedrock:InvokeModel` on `*`
2. Add to `~/.aws/credentials`:
   ```ini
   [nexus-bedrock]
   aws_access_key_id = AKIA...
   aws_secret_access_key = ...
   ```
3. Set **AWS Profile** → `nexus-bedrock`, **Region** → `us-east-1`, **Model ID** → `us.anthropic.claude-sonnet-4-6`
4. Make sure the model has access enabled in the AWS Bedrock console (Model access → Anthropic)

Token usage (daily + monthly) and estimated cost is shown in Settings.

### GitLab (`Settings → GitLab`)
- **URL:** `https://gitlab.com/YourGroup` (group scopes the issue list)
- **Token:** Personal Access Token with `read_api` scope (add `api` to create issues from tasks)
- **Default project ID:** numeric project ID for task → issue creation

### Freshservice (`Settings → Freshservice`)
- **URL:** `https://yourcompany.freshservice.com`
- **API Key:** Profile → API Settings in Freshservice

### Watched Folder (`Settings → Watched Folder`)
- Enable the toggle and set a folder path (Browse button opens a picker)
- Nexus scans every 30 seconds; processed files move to `_processed/`
- Supports: `.eml`, `.vtt`, `.txt`, `.md`, `.docx`, `.doc`, `.rtf`, `.pdf`

---

## Development

```bash
# Frontend only (type-check + bundle, no app window)
npm run build

# Rust backend only
cd src-tauri && cargo build

# Full dev mode (Vite + Tauri + HMR)
source ~/.cargo/env && npm run tauri dev

# Production build
source ~/.cargo/env && npm run tauri build
```

**Full restart required** (not just HMR) when:
- Anything in `src-tauri/` changes (Rust recompiles on file watch but the binary must relaunch)
- A new SQLite migration is added to `src-tauri/migrations/`
- `src-tauri/capabilities/default.json` changes

### Database locations

```
~/Library/Application Support/com.wsbeng.nexus/nexus.db          ← SQLite
~/Library/Application Support/com.wsbeng.nexus/nexus-settings.json ← Settings + cache
```

Migrations run automatically on startup. Current migrations:
- `001_initial.sql` — tasks, oauth_tokens
- `002_notes.sql` — notes, note_tasks
- `003_wiki.sql` — wiki_pages, wiki_links, notes.wiki_processed_at
- `004_notes_extracted.sql` — notes.extracted_at

---

## Data & Privacy

All data is stored locally. External calls are only made to services you explicitly configure:
- iCal feed URLs (calendar events)
- GitLab API at your configured URL
- Freshservice API at your configured URL
- AWS Bedrock via your own AWS account and credentials

No analytics, no telemetry, no data leaves your machine except through integrations you set up.
