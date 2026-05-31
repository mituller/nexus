# Nexus

A personal knowledge management desktop app that brings together your calendar, tasks, notes, tickets, and a self-building wiki into a single daily workspace.

![Nexus](src-tauri/icons/icon.svg)

---

## Features

### Dashboard
Daily morning briefing powered by AI — calendar events, open tasks, GitLab items, and Freshservice tickets summarised into a narrative. Heads-up alerts for back-to-back meetings, tentative events, and overdue items. Stats bar combines overdue tasks, GitLab items, and tickets.

### Calendar
Week and month views fed by iCal URLs — works with Outlook, Google Calendar, Apple Calendar, or any `.ics` feed. Click any event to see details or join a Teams meeting. Background pre-fetch keeps the calendar instant.

### Week Ahead
7-day planning view showing upcoming calendar events alongside tasks, GitLab items, and Freshservice tickets that are due or overdue during the week. AI overview button generates a narrative for the week.

### Tasks
Full task manager with priority, due dates, tags, and source tracking. Filter by priority, source, or tag (searchable combobox). GitLab issues and MRs displayed below personal tasks. Create a GitLab issue directly from any task. Task count badge in sidebar.

### Tickets
Freshservice ticket integration — shows open and pending tickets assigned to you. Status, priority, category, and due date displayed. Ticket count badge in sidebar.

### Notes
Markdown editor with autosave. Import `.eml` emails, `.vtt` transcripts (Teams/Zoom), or `.txt` files via drag-and-drop or file picker. AI extraction pulls out action items and creates tasks, with deduplication against your existing task list. Extracted notes are marked with a badge.

### Wiki
Karpathy-style compiled knowledge base — AI ingests your notes and builds wiki pages for people, projects, decisions, meetings, and concepts. Natural language query across the wiki. Lint check for orphaned pages and broken cross-links. Force-directed graph view showing connections between pages.

### Search
Global search (⌘K) across notes, tasks, wiki pages, GitLab items, and Freshservice tickets. GitLab and ticket results open directly in the browser.

### Quick Capture
⇧⌘N anywhere in the app opens a floating modal to create a task or note without leaving your current view.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Database | SQLite via tauri-plugin-sql |
| Settings | JSON store via tauri-plugin-store |
| AI | AWS Bedrock (Claude Sonnet via Rust command) |
| Calendar | iCal / ICS feeds (any provider) |
| GitLab | GitLab REST API v2 |
| Freshservice | Freshservice REST API v2 |

---

## Setup

### Prerequisites

- macOS (Apple Silicon or Intel)
- [Node.js](https://nodejs.org) v20+
- [Rust](https://rustup.rs) (installed automatically if missing)

### Install

```bash
# Clone the repo
git clone <repo-url>
cd nexus

# Install dependencies
npm install

# Start in development mode
source ~/.cargo/env && npm run tauri dev
```

The first build takes a few minutes while Cargo downloads and compiles dependencies. Subsequent starts are fast.

---

## Configuration

All credentials are set in **Settings** within the app. Nothing is hardcoded.

### Calendars
Go to **Settings → Calendars** and add iCal feed URLs:
- **Outlook:** Outlook Web → Settings → Calendar → Shared calendars → Publish → copy ICS link
- **Google Calendar:** Calendar Settings → your calendar → *Secret address in iCal format*

### AI (AWS Bedrock)
Nexus uses your existing AWS credentials — no separate API key needed.

1. Create an IAM user with `bedrock:InvokeModel` permission on `*`
2. Add credentials to `~/.aws/credentials`:
   ```ini
   [nexus-bedrock]
   aws_access_key_id = AKIA...
   aws_secret_access_key = ...
   ```
3. In Settings → Claude AI: set profile to `nexus-bedrock`, region to `us-east-1`, model to `us.anthropic.claude-sonnet-4-6`

### GitLab
In **Settings → GitLab**:
- **URL:** `https://gitlab.com/YourGroup` (group path optional — used to scope issues)
- **Token:** Personal Access Token with `read_api` scope (add `api` scope to also create issues from tasks)
- **Default project ID:** numeric project ID for creating issues from tasks

### Freshservice
In **Settings → Freshservice**:
- **URL:** `https://yourcompany.freshservice.com`
- **API Key:** found in your Freshservice profile under *API Settings*

---

## Development

```bash
# Frontend only (no app window, for component work)
npm run build

# Rust backend only
cd src-tauri && cargo build

# Full dev mode with hot reload
source ~/.cargo/env && npm run tauri dev
```

**Restart required** (not just HMR) when:
- Any file in `src-tauri/` changes
- A new SQLite migration is added
- `src-tauri/capabilities/default.json` changes

### Database

SQLite database lives at:
```
~/Library/Application Support/com.wsbeng.nexus/nexus.db
```

Settings and cached briefing:
```
~/Library/Application Support/com.wsbeng.nexus/nexus-settings.json
```

Migrations run automatically on startup (`src-tauri/migrations/`).

---

## Data & Privacy

All data is stored locally on your machine. Nothing is sent to external servers except:
- iCal feed URLs you configure (to fetch calendar events)
- GitLab and Freshservice API calls to the endpoints you configure
- AWS Bedrock API calls for AI features (through your own AWS account)

No analytics, no telemetry.
