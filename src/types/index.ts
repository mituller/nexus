import { GitProvider } from "./git";

export type TaskStatus = "open" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  sourceType?: "manual" | "calendar" | "transcript" | "gitlab";
  sourceId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ICalFeed {
  id: string;
  label: string;
  url: string;
  color: string;
  enabled: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isOrganizer: boolean;
  isTentative: boolean;
  attendees: Attendee[];
  location?: string;
  teamsLink?: string;
  description?: string;
  bodyPreview?: string;
  feedId: string;
  feedLabel: string;
  color: string;
}

export interface Attendee {
  name: string;
  email: string;
  response?: "accepted" | "declined" | "tentative" | "none";
}

export interface HeadsUpItem {
  type: "overdue" | "tentative" | "back_to_back" | "tomorrow" | "info";
  message: string;
  taskId?: string;  // internal task → navigate to Tasks
  url?: string;     // external item → open in browser
}

export interface DailyBriefing {
  stats: {
    meetingsToday: number;
    highPriorityTasks: number;
    overdueTasks: number;
    unreadAlerts: number;
  };
  headsUp: HeadsUpItem[];
  narrative: string;
  generatedAt: string;
}

export type WikiEntityType = "person" | "project" | "concept" | "decision" | "meeting" | "general";

export interface WikiPage {
  id: string;
  title: string;
  content: string;
  entityType: WikiEntityType;
  tags: string[];
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WikiPageDraft {
  title: string;
  entityType: WikiEntityType;
  content: string;
  isNew: boolean;
}

export type NoteSourceType = "manual" | "transcript";

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  linkedEventId?: string;
  linkedEventTitle?: string;
  sourceType: NoteSourceType;
  extractedAt?: string;
  wikiProcessedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedNoteData {
  tasks: Array<{
    title: string;
    priority: TaskPriority;
    dueDate?: string;
    tags: string[];
  }>;
  summary: string;
  entities: string[];
}

export type AIProvider = "bedrock" | "openrouter";

/**
 * AI provider configuration. `provider` selects which backend is used:
 * - "bedrock"      → AWS Bedrock via the local AWS profile (profile/region/modelId)
 * - "openrouter"   → OpenRouter's OpenAI-compatible API (apiKey/model)
 */
export interface BedrockConfig {
  provider: AIProvider;
  profile: string;
  region: string;
  modelId: string;
  openRouterApiKey: string;
  openRouterModel: string;
}

export interface AppSettings {
  userName: string;
  userEmail: string;
  timezone: string;
  darkMode: boolean;
  icalFeeds: ICalFeed[];
  // Git repo (GitLab or GitHub)
  gitProvider: GitProvider;
  gitlabUrl: string;
  gitlabToken: string;
  gitlabProjectFilters: string;
  gitlabDefaultProjectId: string;
  githubToken: string;
  // AI provider
  aiProvider: AIProvider;
  // AWS Bedrock
  bedrockProfile: string;
  bedrockRegion: string;
  bedrockModelId: string;
  // OpenRouter
  openRouterApiKey: string;
  openRouterModel: string;
  // Watched folder
  watchFolderEnabled: boolean;
  watchFolderPath: string;
  watchFolderAutoExtract: boolean;
  // Wiki UI state — which sidebar categories are expanded. Absent key = expanded.
  wikiExpandedCategories: Partial<Record<WikiEntityType, boolean>>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  userName: "",
  userEmail: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  darkMode: false,
  icalFeeds: [],
  gitProvider: "gitlab",
  gitlabUrl: "https://gitlab.com",
  gitlabToken: "",
  gitlabProjectFilters: "",
  gitlabDefaultProjectId: "",
  githubToken: "",
  aiProvider: "bedrock",
  bedrockProfile: "freshservice-bedrock",
  bedrockRegion: "us-east-1",
  bedrockModelId: "us.anthropic.claude-sonnet-4-6",
  openRouterApiKey: "",
  openRouterModel: "~anthropic/claude-sonnet-latest",
  // Watched folder
  watchFolderEnabled: false,
  watchFolderPath: "",
  watchFolderAutoExtract: false,
  wikiExpandedCategories: {},
};

export const FEED_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#ef4444", // red
  "#f97316", // orange
  "#14b8a6", // teal
  "#ec4899", // pink
  "#eab308", // yellow
];
