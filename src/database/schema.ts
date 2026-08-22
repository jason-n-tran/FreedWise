// Database schema SQL statements

export const SCHEMA_VERSION = 2;

export const CREATE_BOOKS_TABLE = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'epub')),
  cover_image_path TEXT,
  total_pages INTEGER,
  current_page INTEGER DEFAULT 0,
  last_cfi TEXT,
  last_read_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const CREATE_HIGHLIGHTS_TABLE = `
CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  text TEXT NOT NULL,
  note TEXT,
  color TEXT DEFAULT '#FFEB3B',
  position_data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  due_date INTEGER NOT NULL,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'new' CHECK(state IN ('new', 'learning', 'review', 'relearning')),
  last_reviewed_at INTEGER,
  is_flashcard INTEGER DEFAULT 0,
  flashcard_question TEXT,
  is_discarded INTEGER DEFAULT 0,
  header_level INTEGER,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
`;

export const CREATE_TAGS_TABLE = `
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
`;
