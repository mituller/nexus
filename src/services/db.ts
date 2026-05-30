import Database from "@tauri-apps/plugin-sql";
import { Task, TaskStatus, TaskPriority } from "../types";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:nexus.db");
  }
  return db;
}

export async function getTasks(): Promise<Task[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM tasks WHERE status != 'done' ORDER BY due_date ASC, created_at DESC"
  );
  return rows.map(rowToTask);
}

export async function getAllTasks(): Promise<Task[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM tasks ORDER BY created_at DESC"
  );
  return rows.map(rowToTask);
}

export async function createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
  const d = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d.execute(
    `INSERT INTO tasks (id, title, description, status, priority, due_date, source_type, source_id, tags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, task.title, task.description ?? null, task.status, task.priority,
     task.dueDate ?? null, task.sourceType ?? null, task.sourceId ?? null,
     JSON.stringify(task.tags), now, now]
  );
  return { ...task, id, createdAt: now, updatedAt: now };
}

export async function updateTask(id: string, updates: Partial<Omit<Task, "id" | "createdAt">>): Promise<void> {
  const d = await getDb();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.title !== undefined) { fields.push(`title = $${i++}`); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push(`description = $${i++}`); values.push(updates.description); }
  if (updates.status !== undefined) { fields.push(`status = $${i++}`); values.push(updates.status); }
  if (updates.priority !== undefined) { fields.push(`priority = $${i++}`); values.push(updates.priority); }
  if (updates.dueDate !== undefined) { fields.push(`due_date = $${i++}`); values.push(updates.dueDate); }
  if (updates.tags !== undefined) { fields.push(`tags = $${i++}`); values.push(JSON.stringify(updates.tags)); }

  fields.push(`updated_at = $${i++}`);
  values.push(now);
  values.push(id);

  await d.execute(
    `UPDATE tasks SET ${fields.join(", ")} WHERE id = $${i}`,
    values
  );
}

export async function deleteTask(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: (row.due_date as string) || undefined,
    sourceType: (row.source_type as Task["sourceType"]) || undefined,
    sourceId: (row.source_id as string) || undefined,
    tags: JSON.parse((row.tags as string) || "[]"),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
