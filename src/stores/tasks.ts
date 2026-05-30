import { create } from "zustand";
import { Task } from "../types";
import * as db from "../services/db";

interface TaskStore {
  tasks: Task[];
  loading: boolean;
  load: () => Promise<void>;
  add: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Promise<Task>;
  update: (id: string, updates: Partial<Omit<Task, "id" | "createdAt">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  complete: (id: string) => Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const tasks = await db.getTasks();
    set({ tasks, loading: false });
  },

  add: async (task) => {
    const created = await db.createTask(task);
    set({ tasks: [created, ...get().tasks] });
    return created;
  },

  update: async (id, updates) => {
    await db.updateTask(id, updates);
    set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)) });
  },

  remove: async (id) => {
    await db.deleteTask(id);
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
  },

  complete: async (id) => {
    await db.updateTask(id, { status: "done" });
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
  },
}));
