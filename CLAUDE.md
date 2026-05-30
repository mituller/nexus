# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nexus is a personal knowledge management desktop app built with **Tauri v2** (Rust backend) + **React 19 / TypeScript** frontend. It combines an AI-powered daily briefing, task manager, calendar view, notes, wiki, and GitLab integration into a single native app.

## Commands

```bash
# Development (starts Vite + Tauri in watch mode, opens the app window)
source ~/.cargo/env && npm run tauri dev

# Type-check + build frontend only
npm run build

# Compile Rust backend only (no app window)
cd src-tauri && cargo build

# The app has no test suite yet.
```

`npm run tauri dev` must be restarted (not just HMR'd) when:
- Any file in `src-tauri/` changes (Rust recompiles automatically but the binary must restart)
- A new SQLite migration is added (`src-tauri/migrations/`)
- `src-tauri/capabilities/default.json` changes (capability changes require a rebuild)

HMR handles all TypeScript/React changes without a restart.

## Architecture

### Two-layer app

**Frontend** (`src/`) — React + TypeScript running in a Tauri WebView. All business logic and UI lives here. Communicates with the Rust backend via `invoke()` calls and Tauri plugin APIs.

**Backend** (`src-tauri/src/lib.rs`) — Thin Rust layer. Currently exposes one command (`invoke_bedrock`) and registers all plugins. All data manipulation happens in TypeScript, not Rust.

### Data persistence — three stores

| Store | Location | What's in it |
|---|---|---|
| SQLite (`nexus.db`) | `~/.local/share/nexus/` (macOS: `~/Library/Application Support/nexus/`) | tasks, notes, wiki pages, note-task links |
| JSON store (`nexus-settings.json`) | same app data dir | `AppSettings`, cached daily briefing |
| In-memory (Zustand) | runtime only | all store state, derived from the above on load |

SQLite migrations run automatically at startup via `tauri-plugin-sql`. Add new migrations as `src-tauri/migrations/00N_name.sql` and register them in `lib.rs`.

### State management — Zustand stores

Every entity type has a Zustand store in `src/stores/`. The pattern is consistent: `load()` fetches from SQLite on startup, mutations write to SQLite then update in-memory state immediately. Stores call each other via `useXStore.getState()` (not hooks) to avoid circular dependencies.

`App.tsx` is the only place that orchestrates startup: loads settings → loads tasks/notes/wiki → if calendar feeds configured, fetches events → generates briefing.

### AI — AWS Bedrock via Rust command

All AI calls go through the `invoke_bedrock` Tauri command (`src-tauri/src/lib.rs`). The command:
1. Loads AWS credentials from `~/.aws/credentials` using the configured profile
2. Calls `bedrock:InvokeModel` with the Anthropic messages format
3. Returns the raw JSON response string

The frontend parses the response in `src/services/bedrock.ts`. **Never call the Anthropic API directly from the frontend** — always go through the Rust command so credentials stay in the native process.

AI features are spread across two services:
- `src/services/claude.ts` — daily briefing, note extraction
- `src/services/wikiAI.ts` — wiki ingest, query, lint

Both import `callClaude` from `src/services/bedrock.ts`.

### External HTTP — plugin-http only

The frontend uses `@tauri-apps/plugin-http` (`fetch` from `"@tauri-apps/plugin-http"`) for all external HTTP calls (iCal feeds, GitLab API). The capability in `src-tauri/capabilities/default.json` allows `https://**` and `http://**`. Do not use `window.fetch` — it has CORS restrictions in the WebView.

### Calendar — iCal feeds only

Calendars are configured as iCal URL feeds (Outlook, Google, or any `.ics` URL). Parsing is done in `src/services/ical.ts` using `ical.js`. Events carry `feedId`, `feedLabel`, and `color` from their source feed. All date comparisons use `date-fns` `format(new Date(isoString), "yyyy-MM-dd")` in **local timezone** — never `.toISOString().slice(0,10)` (that gives UTC dates, causing events to appear on the wrong day for users in UTC-offset timezones).

### Settings — all credentials configurable

`AppSettings` (defined in `src/types/index.ts`) is the single source of truth for all user configuration. No credentials are hardcoded. Settings are persisted in the JSON store and surfaced via `useSettingsStore`. The BedrockConfig shape (`{ profile, region, modelId }`) is passed explicitly to all AI functions rather than read globally.

## Key patterns

**Adding a new Tauri command**: define `async fn name(...)` in `lib.rs`, add to `tauri::generate_handler![...]`, then call from TypeScript with `invoke("name", { ... })`.

**Adding a new SQLite table**: create `src-tauri/migrations/00N_name.sql`, add a new `Migration { version: N, ... }` entry to the `migrations` vec in `lib.rs`, create a service file in `src/services/` mirroring the pattern in `db.ts` or `notes.ts`, and a Zustand store in `src/stores/`.

**Capabilities**: any new Tauri plugin or permission requires adding entries to `src-tauri/capabilities/default.json` and potentially `Cargo.toml`. Changing capabilities requires a Rust rebuild + dev server restart.

**Event dates**: always compare calendar event dates using local time. Use `format(new Date(event.start), "yyyy-MM-dd")` not `event.start.slice(0, 10)`.
