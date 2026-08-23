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

export class RowMapper {
  constructor(private db: IDatabaseManager) {}

  /** Map a books-table row to a Book. */
  toBook(row: BookRow): Book {
    return this.mapBook(row);
  }

  /**
   * Map a Book out of a joined row whose book columns are aliased with a `b_`
   * prefix (SELECT b.title AS b_title …). Used by the search joins that carry
   * book columns alongside highlight columns in a single result row.
   */
  toBookFromJoin(row: BookJoinRow): Book {
    return this.mapBook({
      id: row.b_id,
      title: row.b_title,
      author: row.b_author,
      file_path: row.b_file_path,
      file_type: row.b_file_type,
      cover_image_path: row.b_cover_image_path,
      total_pages: row.b_total_pages,
      current_page: row.b_current_page,
      last_cfi: row.b_last_cfi,
      last_read_at: row.b_last_read_at,
      created_at: row.b_created_at,
      updated_at: row.b_updated_at,
    });
  }

  /** Map a single highlight row to a Highlight (with its tags). */
  async toHighlight(row: HighlightRow): Promise<Highlight> {
    const [highlight] = await this.toHighlights([row]);
    return highlight;
  }

  /**
   * Map highlight rows to Highlight models, fetching all tags in ONE query.
   * Replaces the previous per-row tag fetch (N+1) with a single batched join.
   */
  async toHighlights(rows: HighlightRow[]): Promise<Highlight[]> {
    if (rows.length === 0) return [];

    const tagsByHighlight = await this.fetchTagsForHighlights(rows.map(r => r.id));
    return rows.map(row => this.mapHighlight(row, tagsByHighlight.get(row.id) ?? []));
  }

  // --- internal seam: batched tag fetch -------------------------------------

  private async fetchTagsForHighlights(highlightIds: string[]): Promise<Map<string, Tag[]>> {
    const placeholders = highlightIds.map(() => '?').join(',');
    const rows = await this.db.executeQuery<TagRow & { highlight_id: string }>(
      `SELECT t.*, ht.highlight_id AS highlight_id FROM tags t
       INNER JOIN highlight_tags ht ON t.id = ht.tag_id
       WHERE ht.highlight_id IN (${placeholders})
       ORDER BY t.name ASC`,
      highlightIds
    );

    const byHighlight = new Map<string, Tag[]>();
    for (const row of rows) {
      const tag: Tag = { id: row.id, name: row.name, createdAt: new Date(row.created_at) };
      const list = byHighlight.get(row.highlight_id);
      if (list) list.push(tag);
      else byHighlight.set(row.highlight_id, [tag]);
    }
    return byHighlight;
  }

  // --- internal seam: pure mapping core (no DB, synchronous, unit-testable) --

  private mapBook(row: BookRow): Book {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      filePath: row.file_path,
      fileType: row.file_type as 'pdf' | 'epub',
      coverImagePath: row.cover_image_path || undefined,
      totalPages: row.total_pages || undefined,
      currentPage: row.current_page,
      lastCfi: row.last_cfi || undefined,
      lastReadAt: row.last_read_at ? new Date(row.last_read_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapHighlight(row: HighlightRow, tags: Tag[]): Highlight {
    const position: HighlightPosition = JSON.parse(row.position_data);
    return {
      id: row.id,
      bookId: row.book_id,
      text: row.text,
      note: row.note || undefined,
      tags,
      position,
      color: row.color,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      dueDate: new Date(row.due_date),
      stability: row.stability,
      difficulty: row.difficulty,
      elapsedDays: row.elapsed_days,
      scheduledDays: row.scheduled_days,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state as CardState,
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
      isFlashcard: row.is_flashcard === 1,
      flashcardQuestion: row.flashcard_question || undefined,
      isDiscarded: row.is_discarded === 1,
      headerLevel: row.header_level || undefined,
    };
  }
}
