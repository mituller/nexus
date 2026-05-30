import { create } from "zustand";
import { FreshserviceTicket, getAssignedTickets } from "../services/freshservice";
import { useSettingsStore } from "./settings";

interface FreshserviceStore {
  tickets: FreshserviceTicket[];
  loading: boolean;
  connected: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  openTicket: (url: string) => void;
}

export const useFreshserviceStore = create<FreshserviceStore>((set) => ({
  tickets: [],
  loading: false,
  connected: false,
  error: null,

  fetch: async () => {
    const { settings } = useSettingsStore.getState();
    if (!settings.freshserviceUrl || !settings.freshserviceApiKey) return;

    set({ loading: true, error: null });
    try {
      const tickets = await getAssignedTickets(settings.freshserviceUrl, settings.freshserviceApiKey);
      set({ tickets, connected: true, loading: false });
    } catch (e) {
      set({ error: String(e), connected: false, loading: false });
    }
  },

  openTicket: (url) => {
    import("@tauri-apps/plugin-shell").then((m) => m.open(url));
  },
}));
