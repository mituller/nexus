import { useEffect } from "react";
import { Layout } from "./components/layout/Layout";
import { useSettingsStore } from "./stores/settings";
import { useTaskStore } from "./stores/tasks";
import { useCalendarStore } from "./stores/calendar";
import { useGitLabStore } from "./stores/gitlab";
import { useNotesStore } from "./stores/notes";
import { useWikiStore } from "./stores/wiki";
import { scheduleMeetingNotifications, notifyOverdueTasks } from "./services/notifications";

export default function App() {
  const { load: loadSettings, settings, loaded } = useSettingsStore();
  const { load: loadTasks, tasks } = useTaskStore();
  const { fetchEvents, generateBriefing, prefetchCurrentWeek, todayEvents } = useCalendarStore();
  const { fetch: fetchGitLab } = useGitLabStore();
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
