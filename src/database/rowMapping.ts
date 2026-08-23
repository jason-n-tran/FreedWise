// RowMapper — the single seam between the SQLite row shape (snake_case columns,
// integer epoch timestamps) and the camelCase / Date domain models. Owns the
// canonical row types and the row→model mapping for Book and Highlight.
//
// Deep by design: callers learn one async method (toHighlights) and get fully
// formed Highlight models with tags attached. Behind the interface sit (a) the
// batched tag join — one `WHERE highlight_id IN (...)` query for the whole page
// instead of one query per row — and (b) a pure, synchronous mapping core
// (mapBook / mapHighlight) that is unit-testable without a database.
//
// FSRSService imports HighlightRow from here but keeps its own row→FSRSCard
// logic; that is a different target, not row→model mapping.

import type { Book, Highlight, Tag, HighlightPosition, CardState } from '../types/models';
import type { IDatabaseManager } from '../types/database';

export interface BookRow {
  id: string;
  title: string;
  author: string;
  file_path: string;
  file_type: string;
  cover_image_path: string | null;
  total_pages: number | null;
  current_page: number;
  last_cfi: string | null;
  last_read_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface HighlightRow {
  id: string;
  book_id: string;
  text: string;
  note: string | null;
  color: string;
  position_data: string;
  created_at: number;
  updated_at: number;
  due_date: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: string;
  last_reviewed_at: number | null;
  is_flashcard: number;
  flashcard_question: string | null;
  is_discarded: number;
  header_level: number | null;
}

export interface TagRow {
  id: string;
  name: string;
  created_at: number;
}

// A joined result row carrying book columns aliased with a `b_` prefix
// (SELECT b.title AS b_title …), as produced by the search joins.
export interface BookJoinRow {
  b_id: string;
  b_title: string;
  b_author: string;
  b_file_path: string;
  b_file_type: string;
  b_cover_image_path: string | null;
  b_total_pages: number | null;
  b_current_page: number;
  b_last_cfi: string | null;
  b_last_read_at: number | null;
  b_created_at: number;
  b_updated_at: number;
}
