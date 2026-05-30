import Database from "@tauri-apps/plugin-sql";
import { Note, NoteSourceType } from "../types";

let db: Database | null = null;
async function getDb(): Promise<Database> {
  if (!db) db = await Database.load("sqlite:nexus.db");
  return db;
}

export async function getNotes(): Promise<Note[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM notes ORDER BY updated_at DESC"
  );
  return rows.map(rowToNote);
}

export async function getNoteById(id: string): Promise<Note | null> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM notes WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToNote(rows[0]) : null;
}

export async function createNote(
  note: Omit<Note, "id" | "createdAt" | "updatedAt">
): Promise<Note> {
  const d = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d.execute(
    `INSERT INTO notes (id, title, content, tags, linked_event_id, linked_event_title, source_type, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id, note.title, note.content, JSON.stringify(note.tags),
      note.linkedEventId ?? null, note.linkedEventTitle ?? null,
      note.sourceType, now, now,
    ]
  );
  return { ...note, id, createdAt: now, updatedAt: now };
}

export async function updateNote(
  id: string,
  updates: Partial<Omit<Note, "id" | "createdAt">>
): Promise<void> {
  const d = await getDb();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.title !== undefined) { fields.push(`title = $${i++}`); values.push(updates.title); }
  if (updates.content !== undefined) { fields.push(`content = $${i++}`); values.push(updates.content); }
  if (updates.tags !== undefined) { fields.push(`tags = $${i++}`); values.push(JSON.stringify(updates.tags)); }
  if (updates.linkedEventId !== undefined) { fields.push(`linked_event_id = $${i++}`); values.push(updates.linkedEventId); }
  if (updates.linkedEventTitle !== undefined) { fields.push(`linked_event_title = $${i++}`); values.push(updates.linkedEventTitle); }

  fields.push(`updated_at = $${i++}`);
  values.push(now);
  values.push(id);

  await d.execute(`UPDATE notes SET ${fields.join(", ")} WHERE id = $${i}`, values);
}

export async function deleteNote(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM notes WHERE id = $1", [id]);
}

export async function linkNoteTask(noteId: string, taskId: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "INSERT OR IGNORE INTO note_tasks (note_id, task_id) VALUES ($1, $2)",
    [noteId, taskId]
  );
}

function rowToNote(row: Record<string, unknown>): Note {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    tags: JSON.parse((row.tags as string) || "[]"),
    linkedEventId: (row.linked_event_id as string) ?? undefined,
    linkedEventTitle: (row.linked_event_title as string) ?? undefined,
    sourceType: row.source_type as NoteSourceType,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
