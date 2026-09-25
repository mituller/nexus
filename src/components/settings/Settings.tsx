import { useState, useEffect } from "react";
import { Check, Plus, Trash2, GripVertical, FolderOpen, RefreshCw } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useFolderWatcherStore } from "../../stores/folderWatcher";
import { useSettingsStore } from "../../stores/settings";
import { AppSettings, ICalFeed, FEED_COLORS } from "../../types";
import { getDailyUsage, getMonthlyUsage, estimateCost, formatTokens, formatCost, PeriodUsage } from "../../services/tokenUsage";
import { aiConfigFromSettings, hasAIConfig } from "../../services/claude";
import { OpenRouterModelPicker } from "./OpenRouterModelPicker";

export function Settings() {
  const { settings, update } = useSettingsStore();
  const [local, setLocal] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(settings); }, [settings]);

  function field(key: keyof Omit<AppSettings, "icalFeeds" | "darkMode">) {
    return {
      value: local[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setLocal((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  async function handleSave() {
    await update(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ─── Feed management ────────────────────────────────────────────────────────

  function addFeed() {
    const usedColors = local.icalFeeds.map((f) => f.color);
    const nextColor = FEED_COLORS.find((c) => !usedColors.includes(c)) ?? FEED_COLORS[0];
    const newFeed: ICalFeed = {
      id: crypto.randomUUID(),
      label: "",
      url: "",
      color: nextColor,
      enabled: true,
    };
    setLocal((prev) => ({ ...prev, icalFeeds: [...prev.icalFeeds, newFeed] }));
  }

  function updateFeed(id: string, patch: Partial<ICalFeed>) {
    setLocal((prev) => ({
      ...prev,
      icalFeeds: prev.icalFeeds.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function removeFeed(id: string) {
    setLocal((prev) => ({
      ...prev,
      icalFeeds: prev.icalFeeds.filter((f) => f.id !== id),
    }));
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Personal */}
      <Section title="Personal">
        <Field label="Your name" type="text" placeholder="Name" {...field("userName")} />
        <Field label="Email" type="email" placeholder="you@example.com" {...field("userEmail")} />
        <Field label="Timezone" type="text" placeholder="America/Chicago" {...field("timezone")} />
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-500">Dark mode</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Switch the app to a dark theme</p>
          </div>
          <button
            type="button"
            onClick={() => setLocal((p) => ({ ...p, darkMode: !p.darkMode }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${local.darkMode ? "bg-purple-600" : "bg-gray-300"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-gray-800 shadow transition-transform ${local.darkMode ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
      </Section>

      {/* Calendars */}
      <Section title="Calendars">
        <div className="space-y-1 -mt-1 mb-3 text-xs text-gray-500 dark:text-gray-500">
          <p>Paste any <strong>iCal / ICS URL</strong> — works with Outlook, Google Calendar, Apple Calendar, and more.</p>
          <p>
            <strong>Outlook:</strong> Outlook Web → Settings → Calendar → Shared calendars → Publish → copy ICS link.
          </p>
          <p>
            <strong>Google:</strong> Google Calendar Settings → your calendar → "Secret address in iCal format."
          </p>
        </div>

        {local.icalFeeds.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No calendars added yet.</p>
        )}

        <div className="space-y-2">
          {local.icalFeeds.map((feed) => (
            <FeedRow
              key={feed.id}
              feed={feed}
              onChange={(patch) => updateFeed(feed.id, patch)}
              onRemove={() => removeFeed(feed.id)}
            />
          ))}
        </div>

        <button
          onClick={addFeed}
          className="mt-3 flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 font-medium"
        >
          <Plus size={14} /> Add calendar
        </button>
      </Section>

      {/* Git repo */}
      <Section title="Git Repo">
        <p className="text-xs text-gray-500 dark:text-gray-500 -mt-1 mb-3">
          Shows issues and pull requests assigned to you on the Dashboard.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-500 mb-1">Provider</label>
          <select
            value={local.gitProvider}
            onChange={(e) => setLocal((p) => ({ ...p, gitProvider: e.target.value as "gitlab" | "github" }))}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
          >
            <option value="gitlab">GitLab</option>
            <option value="github">GitHub</option>
          </select>
        </div>

        {local.gitProvider === "github" ? (
          <>
            <Field label="Personal Access Token" type="password" placeholder="ghp_… / ghp_gh…" {...field("githubToken")} />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Classic token with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">repo</code> scope, or a fine-grained token with
              read access to <strong>Issues</strong> and <strong>Pull requests</strong>. Shown: open issues assigned to you and open PRs you authored.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-500 -mt-1 mb-3">
              Requires a Personal Access Token with{" "}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">read_api</code> scope.
            </p>
            <Field label="GitLab URL" type="text" placeholder="https://gitlab.com" {...field("gitlabUrl")} />
            <Field label="Personal Access Token" type="password" placeholder="glpat-…" {...field("gitlabToken")} />
            <Field
              label="Project filters (comma-separated IDs, blank = all)"
              type="text"
              placeholder="123, 456"
              {...field("gitlabProjectFilters")}
            />
            <Field
              label="Default project ID for creating issues"
              type="text"
              placeholder="123"
              {...field("gitlabDefaultProjectId")}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              To create issues from tasks, your token needs <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">api</code> scope (not just <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">read_api</code>).
            </p>
          </>
        )}
      </Section>

      {/* Freshservice */}
      <Section title="Freshservice">
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1 mb-3">
          Shows tickets assigned to you. Use your Freshservice subdomain URL and an API key from{" "}
          <strong>Profile → API Settings</strong>.
        </p>
        <Field label="Freshservice URL" type="text" placeholder="https://yourcompany.freshservice.com" {...field("freshserviceUrl")} />
        <Field label="API Key" type="password" placeholder="your-api-key" {...field("freshserviceApiKey")} />
      </Section>

      {/* Watched Folder */}
      <WatchedFolderSection local={local} setLocal={setLocal} />

      {/* Claude AI */}
      <Section title="AI">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-500 mb-1">Provider</label>
          <select
            value={local.aiProvider}
            onChange={(e) => setLocal((p) => ({ ...p, aiProvider: e.target.value as "bedrock" | "openrouter" }))}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
          >
            <option value="bedrock">AWS Bedrock</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>

        {local.aiProvider === "openrouter" ? (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-500 -mt-1 mb-3">
              Routes AI calls through{" "}
              <a
                href="https://openrouter.ai"
                className="text-purple-600 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                openrouter.ai
              </a>
              {" "}— pick any OpenAI-compatible model. Get an API key at{" "}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://openrouter.ai/keys</code>.
            </p>
            <Field label="API Key" type="password" placeholder="sk-or-v1-…" {...field("openRouterApiKey")} />
            <OpenRouterModelPicker
              value={local.openRouterModel}
              onChange={(modelId) => setLocal((p) => ({ ...p, openRouterModel: modelId }))}
            />
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-500 -mt-1 mb-3">
              Uses your existing AWS profile. Run{" "}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">aws sso login --profile {local.bedrockProfile || "freshservice-bedrock"}</code>{" "}
              before using AI features if your session has expired.
            </p>
            <Field label="AWS Profile" type="text" placeholder="freshservice-bedrock" {...field("bedrockProfile")} />
            <Field label="AWS Region" type="text" placeholder="us-east-1" {...field("bedrockRegion")} />
            <Field label="Model ID" type="text" placeholder="us.anthropic.claude-sonnet-4-6" {...field("bedrockModelId")} />
          </>
        )}
        <TokenUsageDisplay />
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
        >
          Save settings
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check size={14} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Feed row ────────────────────────────────────────────────────────────────

interface FeedRowProps {
  feed: ICalFeed;
  onChange: (patch: Partial<ICalFeed>) => void;
  onRemove: () => void;
}

function FeedRow({ feed, onChange, onRemove }: FeedRowProps) {
  const [showColors, setShowColors] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical size={14} className="text-gray-300 shrink-0" />

        {/* Color picker trigger */}
        <div className="relative">
          <button
            onClick={() => setShowColors((v) => !v)}
            className="w-5 h-5 rounded-full border-2 border-white shadow-sm ring-1 ring-gray-200 shrink-0"
            style={{ backgroundColor: feed.color }}
            title="Pick color"
          />
          {showColors && (
            <div className="absolute top-7 left-0 z-10 flex gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2">
              {FEED_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onChange({ color: c }); setShowColors(false); }}
                  className={`w-5 h-5 rounded-full ring-offset-1 transition-all ${feed.color === c ? "ring-2 ring-gray-500" : "hover:ring-2 hover:ring-gray-300"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        <input
          type="text"
          placeholder="Calendar name"
          value={feed.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-shrink-0 w-40 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
        />

        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={feed.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-gray-300 text-purple-600"
          />
          Enabled
        </label>

        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
          <Trash2 size={14} />
        </button>
      </div>

      <input
        type="url"
        placeholder="https://…/calendar.ics"
        value={feed.url}
        onChange={(e) => onChange({ url: e.target.value })}
        className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
      />
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{title}</h2>
      <div className="space-y-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-4">
        {children}
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  type: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Field({ label, type, placeholder, value, onChange }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
      />
    </div>
  );
}

function WatchedFolderSection({ local, setLocal }: { local: AppSettings; setLocal: React.Dispatch<React.SetStateAction<AppSettings>> }) {
  const { running, lastScanned, lastError, newNoteCount, tasksCreated, scanNow, stopPolling } = useFolderWatcherStore();
  const [scanning, setScanning] = useState(false);
  const aiReady = hasAIConfig(aiConfigFromSettings(local));

  async function pickFolder() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setLocal((p) => ({ ...p, watchFolderPath: selected }));
    }
  }

  async function handleScanNow() {
    setScanning(true);
    // Scan the path shown in the form, even if it hasn't been saved yet.
    const count = await scanNow(local.watchFolderPath);
    setScanning(false);
    const { lastError: err, tasksCreated: created } = useFolderWatcherStore.getState();
    if (err) alert(`Scan failed: ${err}`);
    else if (count === 0) alert("No new files found.");
    else {
      const taskNote = created > 0 ? ` Extracted ${created} task${created !== 1 ? "s" : ""}.` : "";
      alert(`Imported ${count} file${count !== 1 ? "s" : ""} as notes.${taskNote}`);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Watched Folder</h2>
      <div className="space-y-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
          Nexus scans this folder every 30 seconds and imports new files as notes.
          Processed files are moved to a <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">_processed</code> subfolder.
          Supports: .eml, .vtt, .txt, .md, .docx, .doc, .rtf, .pdf
        </p>

        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Enable watched folder</p>
            {lastScanned && <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">Last scanned {lastScanned.toLocaleTimeString()}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !local.watchFolderEnabled;
              setLocal((p) => ({ ...p, watchFolderEnabled: next }));
              if (!next && running) stopPolling();
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${local.watchFolderEnabled ? "bg-purple-600" : "bg-gray-300 dark:bg-gray-600"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${local.watchFolderEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Folder path */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Folder path</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="/Users/you/Documents/Nexus/inbox"
              value={local.watchFolderPath}
              onChange={(e) => setLocal((p) => ({ ...p, watchFolderPath: e.target.value }))}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 font-mono text-xs"
            />
            <button
              type="button"
              onClick={pickFolder}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <FolderOpen size={14} /> Browse
            </button>
          </div>
        </div>

        {/* Auto-extract toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Auto-extract tasks with AI</p>
            <p className="text-xs text-gray-400 dark:text-gray-600">Creates tasks from each imported note; duplicates are skipped</p>
            {local.watchFolderAutoExtract && !aiReady && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {local.aiProvider === "openrouter"
                  ? "Needs an OpenRouter API key and model below"
                  : "Needs an AWS Bedrock profile, region, and model below"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setLocal((p) => ({ ...p, watchFolderAutoExtract: !p.watchFolderAutoExtract }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${local.watchFolderAutoExtract ? "bg-purple-600" : "bg-gray-300 dark:bg-gray-600"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${local.watchFolderAutoExtract ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Manual scan */}
        {local.watchFolderPath && (
          <button
            type="button"
            onClick={handleScanNow}
            disabled={scanning}
            className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 disabled:opacity-40"
          >
            <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Scan now"}
          </button>
        )}

        {lastError && (
          <p className="text-xs text-red-600 dark:text-red-400 break-all">Last scan failed: {lastError}</p>
        )}

        {newNoteCount > 0 && (
          <p className="text-xs text-green-600 dark:text-green-400">
            {newNoteCount} new note{newNoteCount !== 1 ? "s" : ""} imported
            {tasksCreated > 0 && ` · ${tasksCreated} task${tasksCreated !== 1 ? "s" : ""} extracted`}
          </p>
        )}
      </div>
    </section>
  );
}

function TokenUsageDisplay() {
  const [daily, setDaily] = useState<PeriodUsage | null>(null);
  const [monthly, setMonthly] = useState<PeriodUsage | null>(null);

  async function load() {
    const [d, m] = await Promise.all([getDailyUsage(), getMonthlyUsage()]);
    setDaily(d);
    setMonthly(m);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!daily || !monthly) return null;

  const hasAnyUsage = daily.inputTokens > 0 || daily.outputTokens > 0 ||
                      monthly.inputTokens > 0 || monthly.outputTokens > 0;

  return (
    <div className="mt-1 pt-3 border-t border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-500 mb-2">Token usage</p>

      {hasAnyUsage ? (
        <>
          {/* Two-column layout: Today | This Month */}
          <div className="grid grid-cols-2 gap-3">
            <UsagePeriod label="Today" usage={daily} />
            <UsagePeriod label="This month" usage={monthly} />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
            ~$3/MTok input · $15/MTok output. Day resets midnight, month resets 1st.
          </p>
        </>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-600">No AI calls made yet.</p>
      )}
    </div>
  );
}

function UsagePeriod({ label, usage }: { label: string; usage: PeriodUsage }) {
  const cost = estimateCost(usage);
  const hasUsage = usage.inputTokens > 0 || usage.outputTokens > 0;

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</p>
      {hasUsage ? (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500">Input</span>
            <span className="font-mono text-gray-700 dark:text-gray-300">{formatTokens(usage.inputTokens)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500">Output</span>
            <span className="font-mono text-gray-700 dark:text-gray-300">{formatTokens(usage.outputTokens)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 dark:text-gray-500">Calls</span>
            <span className="font-mono text-gray-700 dark:text-gray-300">{usage.callCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200 dark:border-gray-600 font-semibold">
            <span className="text-gray-600 dark:text-gray-400">Est. cost</span>
            <span className="text-gray-900 dark:text-white">{formatCost(cost)}</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-300 dark:text-gray-600">—</p>
      )}
    </div>
  );
}
