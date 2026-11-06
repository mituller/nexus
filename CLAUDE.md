# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nexus is a personal knowledge management desktop app built with **Tauri v2** (Rust backend) + **React 19 / TypeScript** frontend. It combines an AI-powered daily briefing, task manager, calendar view, notes, wiki, and GitLab or GitHub integrations into a single native macOS app.

## Commands

```bash
# Development (starts Vite + Tauri in watch mode, opens the app window)
source ~/.cargo/env && npm run tauri dev

# Type-check + build frontend only
npm run build

# Run the frontend tests once (or `npm run test:watch`)
npm test

# Same, with a coverage report (HTML in coverage/)
npm run test:coverage

# Run the Rust tests
cd src-tauri && cargo test

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

**Backend** (`src-tauri/src/lib.rs`) — Thin Rust layer. Registers all plugins and exposes the commands that need native access: `invoke_bedrock`, `extract_text_from_file`, and the audio ones (`start_recording`, `stop_recording`, `audio_level`, `start_transcription`, `stop_transcription`, implemented in `audio.rs` / `transcribe.rs`). All data manipulation happens in TypeScript.

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
| `git.ts` | Issues + MRs/PRs from the selected provider (GitLab or GitHub) |
| `folderWatcher.ts` | Watched folder polling + import badge |

Pattern: `load()` fetches from SQLite on startup; mutations write to SQLite then update in-memory state immediately. Stores call each other via `useXStore.getState()` (not hooks) to avoid re-render loops.

`App.tsx` orchestrates startup: load settings → load tasks/notes/wiki → start folder watcher → fetch calendar and git items → generate briefings.

### AI — AWS Bedrock or OpenRouter

All AI calls go through `src/services/bedrock.ts` → `callClaude(cfg, messages, maxTokens)`, which picks the provider from `cfg.provider`. **Never call an AI API from anywhere else.**

- **Bedrock** uses the `invoke_bedrock` Tauri command in `src-tauri/src/lib.rs`. It loads AWS credentials from `~/.aws/credentials` using the configured profile and calls `bedrock:InvokeModel`.
- **OpenRouter** uses its OpenAI-compatible API through `plugin-http`, with the API key from Settings. `src/services/openRouter.ts` fetches and caches the model catalog for the Settings picker.

Both `src/services/claude.ts` (briefing, note extraction) and `src/services/wikiAI.ts` (wiki ingest/query/lint) import from it.

Token usage is tracked automatically in `src/services/tokenUsage.ts` — every `callClaude` call fires-and-forgets an accumulator.

### Audio recording & speaker diarization — Rust-native capture

The Notes section can record audio and produce a speaker-labelled (diarized) transcript. Mic capture happens in **Rust, not the WebView**: `WKWebView` doesn't reliably expose `navigator.mediaDevices` for `tauri://localhost` pages, and Rust capture gives Transcribe the raw PCM it wants.

- `src-tauri/src/audio.rs` — a dedicated thread owns the `cpal` input stream (`cpal::Stream` is `!Send`), downmixes every device format to mono 16-bit PCM, and tees it to (a) a writer thread that streams a WAV file to `~/Library/Application Support/com.wsbeng.nexus/recordings/` and (b) an optional in-memory PCM sink. Nothing is buffered in RAM, so long meetings are safe.
- `src-tauri/src/transcribe.rs` — Amazon Transcribe **streaming** with `show_speaker_label(true)`. `start_transcription` installs itself as the sink, aggregates ~100 ms audio events, and re-emits transcript results to the webview as `transcribe:update` events (`partial` / `final` / `ended` / `error`). Speaker ids (`spk_0`, `spk_1`, …) are Transcribe's own; naming them is the UI's job.
- `src/services/audio.ts` → `src/components/notes/RecorderPanel.tsx` (launched by the mic button in `NotesList`). Recording produces a new note tagged `transcript`/`recording`; labels are baked into the note body as `**Name:** …`.

Transcription always uses the AWS profile/region from Settings, **independent of the AI provider** setting — so OpenRouter users still need Bedrock credentials to transcribe.

**macOS microphone permission is a build concern, not just a runtime prompt:**

- `src-tauri/Info.plist` — `NSMicrophoneUsageDescription`. Without it macOS terminates the process the instant it opens the mic. Tauri merges it into the app bundle and embeds it in dev binaries (`__TEXT,__info_plist`), so `tauri dev` works too.
- `src-tauri/Entitlements.plist` — `com.apple.security.device.audio-input`, wired through `bundle.macOS.entitlements`; required for signed/notarized builds.

If the mic stops working after a rebuild, reset the TCC grant: `tccutil reset Microphone com.wsbeng.nexus`.

### External HTTP — plugin-http only

Use `fetch` from `"@tauri-apps/plugin-http"` for ALL external HTTP (iCal feeds, GitLab API, GitHub API, OpenRouter). Never use `window.fetch` — it has CORS restrictions in the WebView. Capability `https://**` is open.

### Calendar — iCal feeds only

Calendars are iCal URL feeds parsed in `src/services/ical.ts` using `ical.js`. Events carry `feedId`, `feedLabel`, and `color` from their source feed. The store (`calendar.ts`) caches ranges keyed by `"YYYY-MM-DD::YYYY-MM-DD"` with a 15-minute staleness threshold — Calendar view shows cached data instantly and refreshes silently.

**Critical date rule:** always compare event dates using **local timezone**. Use `format(new Date(isoString), "yyyy-MM-dd")` — never `.toISOString().slice(0,10)` which gives UTC and causes events to appear on the wrong day in non-UTC timezones.

**Range checks in `ical.ts`:** compare with `toJSDate()`, not `ICAL.Time.compare`, which reads a DATE value (all-day event) as midnight UTC instead of local midnight.

**Rescheduled occurrences:** always pass `exceptions` to `new ICAL.Event`, filtered by UID. Without it, `ical.js` relates every `RECURRENCE-ID` in the feed to every series. A rescheduled occurrence is emitted from its own VEVENT, so the series expansion skips it.

### Tests and CI

Frontend tests use Vitest and sit next to the code as `src/**/*.test.{ts,tsx}`. They cover utilities, services, stores, and the Tasks, search, quick capture, and Dashboard git components. Rust tests are `#[cfg(test)]` modules in `audio.rs` and `transcribe.rs`, for the code that doesn't need a microphone or AWS.

- `vitest.config.ts` sets `TZ=America/New_York` so UTC-versus-local mistakes fail on any machine, and `mockReset: true`, so set mock return values in each test or in `beforeEach`.
- Mock the boundary below the code under test: `@tauri-apps/plugin-sql` and `@tauri-apps/plugin-http` for services, `../services/*` for stores and components.
- Component tests start with `// @vitest-environment jsdom`, use React Testing Library, and call `cleanup` in `afterEach`.
- Mark a confirmed bug you aren't fixing yet with `it.fails("KNOWN BUG: ...")`. It starts failing once the bug is fixed, which is the cue to change it to `it`.

GitHub Actions runs `npm run build`, `npm run test:coverage` (with totals in the job summary, and no minimum enforced), and `cargo test` on macOS (`.github/workflows/github-ci.yml`), and CodeQL for TypeScript and Rust (`.github/workflows/codeql.yml`). The build is what type-checks: Vitest doesn't compile components, so a broken `.tsx` file can still pass `npm test`.

### Git — GitLab or GitHub

`settings.gitProvider` selects the backend. `src/services/gitlab.ts` and `src/services/github.ts` both map into the provider-agnostic types in `src/types/git.ts`, so the rest of the app doesn't care which is active. Creating an issue from a task (`src/services/gitlabWrite.ts`) only works with GitLab; closing an issue (`closeIssue` in `git.ts`) only works with GitHub.

`issueToTask` (`src/utils/gitTasks.ts`) copies an issue into a task with `sourceType` set to the provider. For those tasks `sourceId` is the issue's URL, not a note id, so check `isGitTask(task)` before treating `sourceId` as a note. Linked tasks and issues don't sync.

### Settings — all credentials configurable

`AppSettings` (in `src/types/index.ts`) is the single source of truth for user configuration. No credentials are hardcoded. The `BedrockConfig` shape (`{ provider, profile, region, modelId, openRouterApiKey, openRouterModel }`) is passed explicitly to all AI functions.

### Shared utilities (`src/utils/`)

- `calendar.ts` — `isAllDay()`, `isOverdue()`, `formatShortDate()`, `openExternalUrl()` — used across multiple components
- `priority.ts` — `GIT_PRIORITY_COLORS`, `extractPriorityFromLabels()` — priority badge styles and label parsing shared by the GitLab and GitHub backends

### Shared row components

- `src/components/git/GitItemRow.tsx` — reusable git issue row (Dashboard, Week Ahead)
- `src/components/ui/TaskItem.tsx` — shared task row with priority badge (Dashboard, Week Ahead)

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

**Clearing a task field:** pass `description` or `dueDate` to `updateTask` with the value `undefined` to clear it. Leave the key out to keep the current value.

**Event dates:** use `format(new Date(e.start), "yyyy-MM-dd")` for local-timezone date comparisons.

**All-day events:** use `isAllDay(event)` from `src/utils/calendar.ts` — checks that start and end are both at local midnight.
