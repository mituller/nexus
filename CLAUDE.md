# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nexus is a personal knowledge management desktop app built with **Tauri v2** (Rust backend) + **React 19 / TypeScript** frontend. It combines an AI-powered daily briefing, task manager, calendar view, notes, wiki, GitLab, and Freshservice integrations into a single native macOS app.

## Commands

```bash
# Development (starts Vite + Tauri in watch mode, opens the app window)
source ~/.cargo/env && npm run tauri dev

# Type-check + build frontend only
npm run build

# Compile Rust backend only
cd src-tauri && cargo build

# Production build (creates .app + .dmg in src-tauri/target/release/bundle/)
source ~/.cargo/env && npm run tauri build
```

`npm run tauri dev` must be restarted (not just HMR) when:
- Any file in `src-tauri/` changes
- A new SQLite migration is added (`src-tauri/migrations/`)
- `src-tauri/capabilities/default.json` changes

HMR handles all TypeScript/React changes without a restart.

## Architecture

### Two-layer app

**Frontend** (`src/`) — React + TypeScript in a Tauri WebView. All business logic and UI lives here. Communicates with Rust via `invoke()` and Tauri plugin APIs.

**Backend** (`src-tauri/src/lib.rs`) — Thin Rust layer. Exposes two commands (`invoke_bedrock`, `extract_text_from_file`) and registers all plugins. All data manipulation happens in TypeScript.

### Data persistence — three stores

| Store | Location | What's in it |
|---|---|---|
| SQLite (`nexus.db`) | `~/Library/Application Support/com.wsbeng.nexus/` | tasks, notes, wiki pages, note-task links |
| JSON store (`nexus-settings.json`) | same dir | `AppSettings`, cached daily/weekly briefings, token usage |
| In-memory (Zustand) | runtime only | all derived state, loaded from above on startup |

SQLite migrations run automatically at startup via `tauri-plugin-sql`. Add new migrations as `src-tauri/migrations/00N_name.sql` and register them in `lib.rs`.

### State management — Zustand stores (`src/stores/`)

| Store | Purpose |
|---|---|
| `settings.ts` | All user configuration (AppSettings) |
| `tasks.ts` | Personal tasks |
| `calendar.ts` | Calendar events + range cache + daily briefing |
| `notes.ts` | Notes |
| `wiki.ts` | Wiki pages + expanded category state |
| `weekly.ts` | Weekly AI narrative (cached per day) |
| `gitlab.ts` | GitLab issues + MRs |
| `freshservice.ts` | Freshservice tickets |
| `folderWatcher.ts` | Watched folder polling + import badge |

Pattern: `load()` fetches from SQLite on startup; mutations write to SQLite then update in-memory state immediately. Stores call each other via `useXStore.getState()` (not hooks) to avoid re-render loops.

`App.tsx` orchestrates startup: load settings → load tasks/notes/wiki → start folder watcher → fetch calendar/GitLab/Freshservice → generate briefings.

### AI — AWS Bedrock via Rust command

All AI calls go through the `invoke_bedrock` Tauri command in `src-tauri/src/lib.rs`. It loads AWS credentials from `~/.aws/credentials` using the configured profile and calls `bedrock:InvokeModel`. **Never call any AI API directly from the frontend.**

The shared entry point is `src/services/bedrock.ts` → `callClaude(cfg, messages, maxTokens)`. Both `src/services/claude.ts` (briefing, note extraction) and `src/services/wikiAI.ts` (wiki ingest/query/lint) import from it.

Token usage is tracked automatically in `src/services/tokenUsage.ts` — every `callClaude` call fires-and-forgets an accumulator.

### External HTTP — plugin-http only

Use `fetch` from `"@tauri-apps/plugin-http"` for ALL external HTTP (iCal feeds, GitLab API, Freshservice API). Never use `window.fetch` — it has CORS restrictions in the WebView. Capability `https://**` is open.

### Calendar — iCal feeds only

Calendars are iCal URL feeds parsed in `src/services/ical.ts` using `ical.js`. Events carry `feedId`, `feedLabel`, and `color` from their source feed. The store (`calendar.ts`) caches ranges keyed by `"YYYY-MM-DD::YYYY-MM-DD"` with a 15-minute staleness threshold — Calendar view shows cached data instantly and refreshes silently.

**Critical date rule:** always compare event dates using **local timezone**. Use `format(new Date(isoString), "yyyy-MM-dd")` — never `.toISOString().slice(0,10)` which gives UTC and causes events to appear on the wrong day in non-UTC timezones.

### Settings — all credentials configurable

`AppSettings` (in `src/types/index.ts`) is the single source of truth for user configuration. No credentials are hardcoded. The `BedrockConfig` shape (`{ profile, region, modelId }`) is passed explicitly to all AI functions.

### Shared utilities (`src/utils/`)

- `calendar.ts` — `isAllDay()`, `isOverdue()`, `formatShortDate()`, `openExternalUrl()` — used across multiple components
- `priority.ts` — `GITLAB_PRIORITY_COLORS`, `FRESHSERVICE_PRIORITY_COLORS` — single source of priority badge styles

### Shared row components

- `src/components/gitlab/GitLabItemRow.tsx` — reusable GitLab issue row (Dashboard, Week Ahead, TaskList)
- `src/components/tickets/FreshserviceTicketRow.tsx` — reusable ticket row (Dashboard, Week Ahead, TicketsView)
- `src/components/ui/TaskItem.tsx` — shared task row with priority badge (Dashboard, Week Ahead, TaskList)

### Wiki — meeting page structure

For recurring meetings, `ingestNoteToWiki` (in `wikiAI.ts`) generates two pages:
1. **Dated occurrence page** — "Meeting Name – June 2, 2026" — full notes from that session
2. **Parent summary page** — "Meeting Name" — rolling themes/patterns, rewritten each ingest

In `WikiPageList.tsx`, meetings with `" – Month D, YYYY"` suffix are grouped under their parent as collapsible folder entries.

`wiki_processed_at` is reset when: a wiki page is deleted, a note's content changes, or re-extraction runs. This re-queues the note for ingest.

## Key patterns

**Adding a Tauri command:** define `async fn name(...)` in `lib.rs`, add to `tauri::generate_handler![...]`, call from TypeScript with `invoke("name", { ... })`.

**Adding a SQLite table:** create `src-tauri/migrations/00N_name.sql`, add `Migration { version: N, ... }` to `lib.rs`, create a service in `src/services/` (see `db.ts` or `notes.ts`), and a Zustand store in `src/stores/`.

**Adding a Tauri plugin:** add to `Cargo.toml` + register in `lib.rs` + add permissions to `capabilities/default.json`. Requires Rust rebuild + restart.

**Event dates:** use `format(new Date(e.start), "yyyy-MM-dd")` for local-timezone date comparisons.

**All-day events:** use `isAllDay(event)` from `src/utils/calendar.ts` — checks local midnight start + 24h multiple duration.
