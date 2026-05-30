CREATE TABLE IF NOT EXISTS wiki_pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT 'general',
  tags TEXT NOT NULL DEFAULT '[]',
  source_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wiki_links (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  from_type TEXT NOT NULL,
  to_type TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

ALTER TABLE notes ADD COLUMN wiki_processed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_wiki_title ON wiki_pages(title COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_wiki_entity_type ON wiki_pages(entity_type);
CREATE INDEX IF NOT EXISTS idx_notes_wiki_processed ON notes(wiki_processed_at);
