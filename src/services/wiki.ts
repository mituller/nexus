import Database from "@tauri-apps/plugin-sql";
import { WikiPage, WikiEntityType } from "../types";

let db: Database | null = null;
async function getDb(): Promise<Database> {
  if (!db) db = await Database.load("sqlite:nexus.db");
  return db;
}

export async function getWikiPages(): Promise<WikiPage[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM wiki_pages ORDER BY entity_type, title COLLATE NOCASE"
  );
  return rows.map(rowToPage);
}

export async function getWikiPageByTitle(title: string): Promise<WikiPage | null> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM wiki_pages WHERE title = $1 COLLATE NOCASE",
    [title]
  );
  return rows[0] ? rowToPage(rows[0]) : null;
}

export async function searchWikiPages(query: string): Promise<WikiPage[]> {
  const d = await getDb();
  const like = `%${query}%`;
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM wiki_pages WHERE title LIKE $1 OR content LIKE $1 ORDER BY updated_at DESC LIMIT 20",
    [like]
  );
  return rows.map(rowToPage);
}

export async function createWikiPage(
  page: Omit<WikiPage, "id" | "createdAt" | "updatedAt">
): Promise<WikiPage> {
  const d = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d.execute(
    `INSERT INTO wiki_pages (id, title, content, entity_type, tags, source_ids, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, page.title, page.content, page.entityType,
     JSON.stringify(page.tags), JSON.stringify(page.sourceIds), now, now]
  );
  return { ...page, id, createdAt: now, updatedAt: now };
}

export async function updateWikiPage(
  id: string,
  updates: Partial<Omit<WikiPage, "id" | "createdAt">>
): Promise<void> {
  const d = await getDb();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.title !== undefined) { fields.push(`title = $${i++}`); values.push(updates.title); }
  if (updates.content !== undefined) { fields.push(`content = $${i++}`); values.push(updates.content); }
  if (updates.entityType !== undefined) { fields.push(`entity_type = $${i++}`); values.push(updates.entityType); }
  if (updates.tags !== undefined) { fields.push(`tags = $${i++}`); values.push(JSON.stringify(updates.tags)); }
  if (updates.sourceIds !== undefined) { fields.push(`source_ids = $${i++}`); values.push(JSON.stringify(updates.sourceIds)); }

  fields.push(`updated_at = $${i++}`);
  values.push(now);
  values.push(id);

  await d.execute(`UPDATE wiki_pages SET ${fields.join(", ")} WHERE id = $${i}`, values);
}

export async function upsertWikiPageByTitle(
  title: string,
  entityType: WikiEntityType,
  content: string,
  sourceId: string
): Promise<WikiPage> {
  const existing = await getWikiPageByTitle(title);
  if (existing) {
    const sourceIds = [...new Set([...existing.sourceIds, sourceId])];
    await updateWikiPage(existing.id, { content, sourceIds });
    return { ...existing, content, sourceIds, updatedAt: new Date().toISOString() };
  }
  return createWikiPage({ title, content, entityType, tags: [], sourceIds: [sourceId] });
}

export async function deleteWikiPage(id: string): Promise<void> {
  const d = await getDb();
  // Get the page's source note IDs before deleting
  const rows = await d.select<{ source_ids: string }[]>(
    "SELECT source_ids FROM wiki_pages WHERE id = $1", [id]
  );
  if (rows[0]) {
    const sourceIds: string[] = JSON.parse(rows[0].source_ids || "[]");
    // Reset wiki_processed_at on source notes so they can be re-ingested
    for (const noteId of sourceIds) {
      await d.execute(
        "UPDATE notes SET wiki_processed_at = NULL, updated_at = $1 WHERE id = $2",
        [new Date().toISOString(), noteId]
      );
    }
  }
  await d.execute("DELETE FROM wiki_pages WHERE id = $1", [id]);
}

export async function markNoteWikiProcessed(noteId: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE notes SET wiki_processed_at = $1 WHERE id = $2",
    [new Date().toISOString(), noteId]
  );
}

export async function getUnprocessedNotes(): Promise<Array<{ id: string; title: string; content: string }>> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT id, title, content FROM notes WHERE wiki_processed_at IS NULL AND length(content) > 10 ORDER BY created_at DESC LIMIT 20"
  );
  return rows.map((r) => ({ id: r.id as string, title: r.title as string, content: r.content as string }));
}

function rowToPage(row: Record<string, unknown>): WikiPage {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    entityType: row.entity_type as WikiEntityType,
    tags: JSON.parse((row.tags as string) || "[]"),
    sourceIds: JSON.parse((row.source_ids as string) || "[]"),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
