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

export const CREATE_HIGHLIGHT_TAGS_TABLE = `
CREATE TABLE IF NOT EXISTS highlight_tags (
  highlight_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (highlight_id, tag_id),
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
`;

export const CREATE_REVIEW_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY,
  highlight_id TEXT NOT NULL,
  grade TEXT NOT NULL CHECK(grade IN ('again', 'hard', 'good', 'easy')),
  reviewed_at INTEGER NOT NULL,
  elapsed_days INTEGER NOT NULL,
  scheduled_days INTEGER NOT NULL,
  state TEXT NOT NULL,
  FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE
);
`;

export const CREATE_SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

// Indexes for performance optimization
export const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_highlights_book_id ON highlights(book_id);',
  'CREATE INDEX IF NOT EXISTS idx_highlights_due_date ON highlights(due_date);',
  'CREATE INDEX IF NOT EXISTS idx_highlights_state ON highlights(state);',
  'CREATE INDEX IF NOT EXISTS idx_highlights_is_discarded ON highlights(is_discarded);',
  'CREATE INDEX IF NOT EXISTS idx_highlight_tags_highlight_id ON highlight_tags(highlight_id);',
  'CREATE INDEX IF NOT EXISTS idx_highlight_tags_tag_id ON highlight_tags(tag_id);',
  'CREATE INDEX IF NOT EXISTS idx_review_logs_highlight_id ON review_logs(highlight_id);',
  'CREATE INDEX IF NOT EXISTS idx_review_logs_reviewed_at ON review_logs(reviewed_at);',
];

export const ALL_TABLES = [
  CREATE_BOOKS_TABLE,
  CREATE_HIGHLIGHTS_TABLE,
  CREATE_TAGS_TABLE,
  CREATE_HIGHLIGHT_TAGS_TABLE,
  CREATE_REVIEW_LOGS_TABLE,
  CREATE_SETTINGS_TABLE,
];
