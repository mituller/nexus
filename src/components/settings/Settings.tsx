import { useState, useEffect } from "react";
import { Check, Plus, Trash2, GripVertical } from "lucide-react";
import { useSettingsStore } from "../../stores/settings";
import { AppSettings, ICalFeed, FEED_COLORS } from "../../types";

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
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Personal */}
      <Section title="Personal">
        <Field label="Your name" type="text" placeholder="Name" {...field("userName")} />
        <Field label="Email" type="email" placeholder="you@example.com" {...field("userEmail")} />
        <Field label="Timezone" type="text" placeholder="America/Chicago" {...field("timezone")} />
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-xs font-medium text-gray-600">Dark mode</p>
            <p className="text-xs text-gray-400 mt-0.5">Switch the app to a dark theme</p>
          </div>
          <button
            type="button"
            onClick={() => setLocal((p) => ({ ...p, darkMode: !p.darkMode }))}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${local.darkMode ? "bg-blue-600" : "bg-gray-300"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${local.darkMode ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
      </Section>

      {/* Calendars */}
      <Section title="Calendars">
        <div className="space-y-1 -mt-1 mb-3 text-xs text-gray-500">
          <p>Paste any <strong>iCal / ICS URL</strong> — works with Outlook, Google Calendar, Apple Calendar, and more.</p>
          <p>
            <strong>Outlook:</strong> Outlook Web → Settings → Calendar → Shared calendars → Publish → copy ICS link.
          </p>
          <p>
            <strong>Google:</strong> Google Calendar Settings → your calendar → "Secret address in iCal format."
          </p>
        </div>

        {local.icalFeeds.length === 0 && (
          <p className="text-sm text-gray-400 py-2">No calendars added yet.</p>
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
          className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus size={14} /> Add calendar
        </button>
      </Section>

      {/* GitLab */}
      <Section title="GitLab">
        <p className="text-xs text-gray-500 -mt-1 mb-3">
          Shows issues assigned to you on the Dashboard. Requires a Personal Access Token with{" "}
          <code className="bg-gray-100 px-1 rounded">read_api</code> scope.
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
        <p className="text-xs text-gray-400">
          To create issues from tasks, your token needs <code className="bg-gray-100 px-1 rounded">api</code> scope (not just <code className="bg-gray-100 px-1 rounded">read_api</code>).
        </p>
      </Section>

      {/* AWS Bedrock */}
      <Section title="Claude AI — via AWS Bedrock">
        <p className="text-xs text-gray-500 -mt-1 mb-3">
          Uses your existing AWS profile. Run{" "}
          <code className="bg-gray-100 px-1 rounded">aws sso login --profile {local.bedrockProfile || "freshservice-bedrock"}</code>{" "}
          before using AI features if your session has expired.
        </p>
        <Field label="AWS Profile" type="text" placeholder="freshservice-bedrock" {...field("bedrockProfile")} />
        <Field label="AWS Region" type="text" placeholder="us-east-1" {...field("bedrockRegion")} />
        <Field label="Model ID" type="text" placeholder="us.anthropic.claude-sonnet-4-6" {...field("bedrockModelId")} />
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
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
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
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
            <div className="absolute top-7 left-0 z-10 flex gap-1.5 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
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
          className="flex-shrink-0 w-40 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={feed.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
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
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
      />
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-800 mb-3">{title}</h2>
      <div className="space-y-3 bg-white rounded-lg border border-gray-200 px-4 py-4">
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
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
