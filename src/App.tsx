import { useEffect, Component, ErrorInfo, ReactNode } from "react";
import { Layout } from "./components/layout/Layout";
import { useSettingsStore } from "./stores/settings";
import { useTaskStore } from "./stores/tasks";
import { useCalendarStore } from "./stores/calendar";
import { useGitLabStore } from "./stores/gitlab";
import { useFreshserviceStore } from "./stores/freshservice";
import { useNotesStore } from "./stores/notes";
import { useWikiStore } from "./stores/wiki";
import { scheduleMeetingNotifications, notifyOverdueTasks } from "./services/notifications";

export default function App() {
  const { load: loadSettings, settings, loaded } = useSettingsStore();
  const { load: loadTasks, tasks } = useTaskStore();
  const { fetchEvents, generateBriefing, prefetchCurrentWeek, todayEvents } = useCalendarStore();
  const { fetch: fetchGitLab } = useGitLabStore();
  const { fetch: fetchTickets } = useFreshserviceStore();
  const { load: loadNotes } = useNotesStore();
  const { load: loadWiki } = useWikiStore();

  useEffect(() => {
    loadSettings();
    loadTasks();
    loadNotes();
    loadWiki();
  }, [loadSettings, loadTasks, loadNotes, loadWiki]);

  // Apply dark mode class to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (settings.darkMode) html.classList.add("dark");
    else html.classList.remove("dark");
  }, [settings.darkMode]);

  useEffect(() => {
    if (!loaded) return;

    if (settings.icalFeeds.some((f) => f.enabled && f.url)) {
      fetchEvents().then(() => generateBriefing());
      // Pre-fetch full current week in background so Calendar view opens instantly
      prefetchCurrentWeek();
    }

    if (settings.gitlabToken && settings.gitlabUrl) {
      fetchGitLab();
    }

    if (settings.freshserviceUrl && settings.freshserviceApiKey) {
      fetchTickets();
    }

    // Notify on startup if there are overdue tasks
    notifyOverdueTasks(tasks).catch(() => {});
  }, [loaded, settings, fetchEvents, generateBriefing, fetchGitLab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-schedule meeting notifications whenever today's events change
  useEffect(() => {
    if (todayEvents.length > 0) {
      scheduleMeetingNotifications(todayEvents).catch(() => {});
    }
  }, [todayEvents]);

  return <Layout />;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("App error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-gray-500 bg-gray-50 px-8">
          <p className="text-lg font-semibold text-gray-700">Something went wrong</p>
          <p className="text-sm text-center max-w-md">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
