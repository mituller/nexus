import { useEffect } from "react";
import { Layout } from "./components/layout/Layout";
import { useSettingsStore } from "./stores/settings";
import { useTaskStore } from "./stores/tasks";
import { useCalendarStore } from "./stores/calendar";
import { useGitLabStore } from "./stores/gitlab";
import { useNotesStore } from "./stores/notes";
import { useWikiStore } from "./stores/wiki";

export default function App() {
  const { load: loadSettings, settings, loaded } = useSettingsStore();
  const { load: loadTasks } = useTaskStore();
  const { fetchEvents, generateBriefing } = useCalendarStore();
  const { fetch: fetchGitLab } = useGitLabStore();
  const { load: loadNotes } = useNotesStore();
  const { load: loadWiki } = useWikiStore();

  useEffect(() => {
    loadSettings();
    loadTasks();
    loadNotes();
    loadWiki();
  }, [loadSettings, loadTasks]);

  useEffect(() => {
    if (!loaded) return;

    if (settings.icalFeeds.some((f) => f.enabled && f.url)) {
      fetchEvents().then(() => generateBriefing());
    }

    if (settings.gitlabToken && settings.gitlabUrl) {
      fetchGitLab();
    }
  }, [loaded, settings, fetchEvents, generateBriefing, fetchGitLab]);

  return <Layout />;
}
