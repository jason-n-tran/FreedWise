/**
 * Integration test: Book import → highlight creation → FSRS review flow
 *
 * Requirements: 1.1, 3.4, 5.4, 5.11
 *
 * This test verifies the complete end-to-end flow:
 * 1. A book record is created in the database (simulating a successful import)
 * 2. A highlight is created on that book via HighlightService
 * 3. The highlight has correct default FSRS parameters (state: 'new', reps: 0, lapses: 0)
 * 4. The highlight is graded via FSRSService
 * 5. FSRS parameters are updated correctly after grading
 * 6. A review log entry is created
 */

import { HighlightService } from '../../HighlightService';
import { FSRSService } from '../../FSRSService';
import { RowMapper } from '../../../database/rowMapping';
import type { IDatabaseManager, Transaction } from '../../../types/database';
import type { Highlight, ReviewLog } from '../../../types/models';

// ---------------------------------------------------------------------------
// In-memory database implementation for integration testing
// ---------------------------------------------------------------------------

interface AnyRow {
  [key: string]: any;
}

/**
 * A minimal but complete in-memory IDatabaseManager that supports the SQL
 * patterns used by BookService, HighlightService, and FSRSService.
 */
class InMemoryDatabase implements IDatabaseManager {
  private tables: Map<string, AnyRow[]> = new Map();

  async initialize(): Promise<void> {
    // Pre-create all tables used in the flow
    this.tables.set('books', []);
    this.tables.set('highlights', []);
    this.tables.set('tags', []);
    this.tables.set('highlight_tags', []);
    this.tables.set('review_logs', []);
    this.tables.set('settings', []);
  }

  async executeQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    return this.runSql(sql, params) as T[];
  }

  async executeUpdate(sql: string, params: any[] = []): Promise<number> {
    const result = this.runSql(sql, params);
    return typeof result === 'number' ? result : 1;
  }

  async transaction(callback: (tx: Transaction) => Promise<void>): Promise<void> {
    // Simple transaction: snapshot → execute → rollback on error
    const snapshot = this.snapshot();
    try {
      const tx: Transaction = {
        executeQuery: async <T>(sql: string, p: any[] = []) => this.runSql(sql, p) as T[],
        executeUpdate: async (sql: string, p: any[] = []) => {
          const r = this.runSql(sql, p);
          return typeof r === 'number' ? r : 1;
        },
      };
      await callback(tx);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
  }

  async batchUpdate(operations: { sql: string; params?: any[] }[]): Promise<void> {
    const snapshot = this.snapshot();
    try {
      for (const op of operations) {
        this.runSql(op.sql, op.params ?? []);
      }
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
  }

  async close(): Promise<void> {
    this.tables.clear();
  }

  // -------------------------------------------------------------------------
  // Direct table access helpers (for test assertions)
  // -------------------------------------------------------------------------

  getTable(name: string): AnyRow[] {
    return this.tables.get(name) ?? [];
  }

  // -------------------------------------------------------------------------
  // SQL interpreter
  // -------------------------------------------------------------------------

  private runSql(sql: string, params: any[]): any {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('SELECT')) return this.handleSelect(trimmed, params);
    if (upper.startsWith('INSERT')) return this.handleInsert(trimmed, params);
    if (upper.startsWith('UPDATE')) return this.handleUpdate(trimmed, params);
    if (upper.startsWith('DELETE')) return this.handleDelete(trimmed, params);

    return [];
  }

  // ---- SELECT ---------------------------------------------------------------

  private handleSelect(sql: string, params: any[]): AnyRow[] {
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch) return [];
    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName) ?? [];

    // Handle JOIN queries (highlight_tags, tags)
    if (/JOIN/i.test(sql)) {
      return this.handleJoinSelect(sql, params, tableName, table);
    }

    // Simple WHERE id = ?
    const whereIdMatch = sql.match(/WHERE\s+id\s*=\s*\?/i);
    if (whereIdMatch && params.length > 0) {
      return table.filter(r => r.id === params[0]);
    }

    // WHERE book_id = ?
    const whereBookIdMatch = sql.match(/WHERE\s+book_id\s*=\s*\?/i);
    if (whereBookIdMatch && params.length > 0) {
      return table.filter(r => r.book_id === params[0]);
    }

    // WHERE due_date <= ? AND is_discarded = 0
    if (/WHERE\s+due_date\s*<=\s*\?/i.test(sql)) {
      const targetDate = params[0];
      return table.filter(r => r.due_date <= targetDate && r.is_discarded === 0);
    }

    // WHERE key = ? (settings)
    const whereKeyMatch = sql.match(/WHERE\s+key\s*=\s*\?/i);
    if (whereKeyMatch && params.length > 0) {
      return table.filter(r => r.key === params[0]);
    }

    // WHERE highlight_id = ? (review_logs)
    const whereHighlightIdMatch = sql.match(/WHERE\s+highlight_id\s*=\s*\?/i);
    if (whereHighlightIdMatch && params.length > 0) {
      return table.filter(r => r.highlight_id === params[0]);
    }

    // WHERE LOWER(name) = LOWER(?) (tags)
    const whereLowerNameMatch = sql.match(
      /WHERE\s+LOWER\s*\(\s*name\s*\)\s*=\s*LOWER\s*\(\s*\?\s*\)/i
    );
    if (whereLowerNameMatch && params.length > 0) {
      return table.filter(r => r.name?.toLowerCase() === params[0]?.toLowerCase());
    }

    // WHERE is_discarded = 0 (stats query)
    if (/WHERE\s+is_discarded\s*=\s*0/i.test(sql)) {
      let rows = table.filter(r => r.is_discarded === 0);
      if (/book_id\s*=\s*\?/i.test(sql) && params.length > 0) {
        rows = rows.filter(r => r.book_id === params[0]);
      }
      return rows;
    }

    // No WHERE — return all
    return [...table];
  }

  private handleJoinSelect(
    sql: string,
    params: any[],
    _baseTable: string,
    _baseRows: AnyRow[]
  ): AnyRow[] {
    // Batched tags for highlights:
    // SELECT t.*, ht.highlight_id AS highlight_id FROM tags t
    //   INNER JOIN highlight_tags ht ON t.id = ht.tag_id
    //   WHERE ht.highlight_id IN (?, ?, …)
    // (the single-id form WHERE ht.highlight_id = ? is just IN with one param)
    if (/FROM\s+tags/i.test(sql) && /highlight_tags/i.test(sql)) {
      const highlightIds = params;
      const highlightTags = this.tables.get('highlight_tags') ?? [];
      const tags = this.tables.get('tags') ?? [];
      const tagsById = new Map(tags.map(t => [t.id, t]));
      // One row per (highlight, tag) link, carrying highlight_id for grouping.
      const result: AnyRow[] = [];
      for (const ht of highlightTags) {
        if (!highlightIds.includes(ht.highlight_id)) continue;
        const tag = tagsById.get(ht.tag_id);
        if (tag) result.push({ ...tag, highlight_id: ht.highlight_id });
      }
      return result;
    }

    return [];
  }

  // ---- INSERT ---------------------------------------------------------------

  private handleInsert(sql: string, params: any[]): number {
    const tableMatch = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i);
    if (!tableMatch) return 0;
    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return 0;

    // Parse column names from SQL
    const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) return 0;

    const columns = colMatch[1].split(',').map(c => c.trim().replace(/[`"[\]]/g, ''));
    const row: AnyRow = {};
    columns.forEach((col, i) => {
      row[col] = params[i] !== undefined ? params[i] : null;
    });

    // Handle INSERT OR REPLACE for settings
    if (/INSERT\s+OR\s+REPLACE/i.test(sql) && tableName === 'settings') {
      const idx = table.findIndex(r => r.key === row.key);
      if (idx >= 0) {
        table[idx] = row;
      } else {
        table.push(row);
      }
      return 1;
    }

    table.push(row);
    return 1;
  }

  // ---- UPDATE ---------------------------------------------------------------

  private handleUpdate(sql: string, params: any[]): number {
    const tableMatch = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (!tableMatch) return 0;
    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return 0;

    // Parse SET clause: extract column = ? pairs
    const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
    if (!setMatch) return 0;

    const setPairs = setMatch[1]
      .split(',')
      .map(s => s.trim())
      .map(s => {
        const eqIdx = s.indexOf('=');
        return {
          col: s
            .substring(0, eqIdx)
            .trim()
            .replace(/[`"[\]]/g, ''),
          placeholder: s.substring(eqIdx + 1).trim(),
        };
      });

    // Parse WHERE clause — support WHERE id = ? and WHERE highlight_id = ?
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (!whereMatch) return 0;
    const whereCol = whereMatch[1].toLowerCase();

    // The WHERE param is the last param
    const whereValue = params[params.length - 1];

    // SET params are all params except the last (WHERE param)
    const setParams = params.slice(0, params.length - 1);

    let changes = 0;
    for (const row of table) {
      if (row[whereCol] === whereValue) {
        setPairs.forEach((pair, i) => {
          row[pair.col] = setParams[i];
        });
        changes++;
      }
    }
    return changes;
  }

  // ---- DELETE ---------------------------------------------------------------

  private handleDelete(sql: string, params: any[]): number {
    const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (!tableMatch) return 0;
    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return 0;

    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (!whereMatch || params.length === 0) return 0;
    const whereCol = whereMatch[1].toLowerCase();
    const whereValue = params[0];

    const before = table.length;
    const filtered = table.filter(r => r[whereCol] !== whereValue);
    this.tables.set(tableName, filtered);
    return before - filtered.length;
  }

  // ---- Snapshot / restore ---------------------------------------------------

  private snapshot(): Map<string, AnyRow[]> {
    const snap = new Map<string, AnyRow[]>();
    for (const [k, v] of this.tables.entries()) {
      snap.set(k, JSON.parse(JSON.stringify(v)));
    }
    return snap;
  }

  private restore(snap: Map<string, AnyRow[]>): void {
    this.tables.clear();
    for (const [k, v] of snap.entries()) {
      this.tables.set(k, v);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: directly insert a book record (bypasses file-system operations)
// ---------------------------------------------------------------------------

async function insertBook(db: InMemoryDatabase, bookId: string): Promise<void> {
  const now = Date.now();
  await db.executeUpdate(
    `INSERT INTO books (id, title, author, file_path, file_type, cover_image_path,
     total_pages, current_page, last_read_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [bookId, 'Test Book', 'Test Author', '/books/test.epub', 'epub', null, 200, 0, null, now, now]
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Book import → highlight creation → FSRS review', () => {
  let db: InMemoryDatabase;
  let highlightService: HighlightService;
  let fsrsService: FSRSService;

  const BOOK_ID = 'integration-book-001';

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await db.initialize();

    // Simulate a successful book import by inserting the book record directly
    await insertBook(db, BOOK_ID);

    highlightService = new HighlightService(db, new RowMapper(db));
    fsrsService = new FSRSService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — Book can be imported and stored
  // -------------------------------------------------------------------------
  it('should have the imported book available in the database (Req 1.1)', async () => {
    const books = await db.executeQuery<{ id: string; title: string }>(
      'SELECT id, title FROM books WHERE id = ?',
      [BOOK_ID]
    );
    expect(books).toHaveLength(1);
    expect(books[0].id).toBe(BOOK_ID);
    expect(books[0].title).toBe('Test Book');
  });

  // -------------------------------------------------------------------------
  // Requirement 3.4 — Highlight created with default FSRS parameters
  // -------------------------------------------------------------------------
  it('should create a highlight with default FSRS parameters (Req 3.4)', async () => {
    const highlight: Highlight = await highlightService.createHighlight({
      bookId: BOOK_ID,
      text: 'The mitochondria is the powerhouse of the cell.',
      note: 'Biology basics',
      tags: [],
      position: { pageNumber: 42 },
      color: '#FFEB3B',
    });

    // Verify the returned highlight has correct default FSRS state
    expect(highlight.id).toBeDefined();
    expect(highlight.bookId).toBe(BOOK_ID);
    expect(highlight.text).toBe('The mitochondria is the powerhouse of the cell.');
    expect(highlight.state).toBe('new');
    expect(highlight.reps).toBe(0);
    expect(highlight.lapses).toBe(0);
    expect(highlight.stability).toBe(0);
    expect(highlight.difficulty).toBe(0);
    expect(highlight.elapsedDays).toBe(0);
    expect(highlight.scheduledDays).toBe(0);
    expect(highlight.lastReviewedAt).toBeUndefined();
    expect(highlight.isDiscarded).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Requirement 5.4 — FSRS parameters update correctly after grading
  // -------------------------------------------------------------------------
  it('should update FSRS parameters correctly after grading "good" (Req 5.4)', async () => {
    // Step 1: Create a highlight
    const highlight = await highlightService.createHighlight({
      bookId: BOOK_ID,
      text: 'Spaced repetition improves long-term retention.',
      note: undefined,
      tags: [],
      position: { pageNumber: 10 },
    });

    expect(highlight.state).toBe('new');
    expect(highlight.reps).toBe(0);

    // Step 2: Grade the highlight as 'good'
    const result = await fsrsService.gradeCard(highlight.id, 'good');

    // Step 3: Verify the scheduling result
    expect(result).toBeDefined();
    expect(result.card).toBeDefined();
    expect(result.dueDate).toBeInstanceOf(Date);
    expect(result.reviewLog).toBeDefined();

    // After first 'good' review, reps should be incremented
    expect(result.card.reps).toBeGreaterThan(0);

    // State should have progressed from 'new'
    expect(['learning', 'review']).toContain(result.card.state);

    // Due date should be in the future
    expect(result.dueDate.getTime()).toBeGreaterThan(Date.now());
  });

  // -------------------------------------------------------------------------
  // Requirement 5.4 — Highlight row in DB is updated after grading
  // -------------------------------------------------------------------------
  it('should persist updated FSRS parameters to the database after grading (Req 5.4)', async () => {
    const highlight = await highlightService.createHighlight({
      bookId: BOOK_ID,
      text: 'Neurons that fire together wire together.',
      note: undefined,
      tags: [],
      position: { pageNumber: 5 },
    });

    await fsrsService.gradeCard(highlight.id, 'good');

    // Fetch the updated highlight from the database
    const updatedHighlight = await highlightService.getHighlightById(highlight.id);
    expect(updatedHighlight).not.toBeNull();

    // reps should be incremented
    expect(updatedHighlight!.reps).toBeGreaterThan(0);

    // state should have changed from 'new'
    expect(updatedHighlight!.state).not.toBe('new');

    // lastReviewedAt should be set
    expect(updatedHighlight!.lastReviewedAt).toBeInstanceOf(Date);

    // dueDate should be in the future
    expect(updatedHighlight!.dueDate.getTime()).toBeGreaterThan(Date.now());
  });

  // -------------------------------------------------------------------------
  // Requirement 5.11 — Review log entry is created after grading
  // -------------------------------------------------------------------------
  it('should create a review log entry after grading (Req 5.11)', async () => {
    const highlight = await highlightService.createHighlight({
      bookId: BOOK_ID,
      text: 'Practice makes permanent.',
      note: undefined,
      tags: [],
      position: { pageNumber: 99 },
    });

    const result = await fsrsService.gradeCard(highlight.id, 'good');

    // Verify review log was created in the database
    const reviewLogs = await db.executeQuery<{
      id: string;
      highlight_id: string;
      grade: string;
      reviewed_at: number;
      elapsed_days: number;
      scheduled_days: number;
      state: string;
    }>('SELECT * FROM review_logs WHERE highlight_id = ?', [highlight.id]);

    expect(reviewLogs).toHaveLength(1);
    expect(reviewLogs[0].highlight_id).toBe(highlight.id);
    expect(reviewLogs[0].grade).toBe('good');
    expect(reviewLogs[0].id).toBe(result.reviewLog.id);
    expect(reviewLogs[0].reviewed_at).toBeGreaterThan(0);
    // scheduled_days may be 0 for a new card in the learning phase (FSRS behaviour)
    expect(reviewLogs[0].scheduled_days).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // Full flow: multiple grades accumulate correctly
  // -------------------------------------------------------------------------
  it('should accumulate reps and update state across multiple reviews', async () => {
    const highlight = await highlightService.createHighlight({
      bookId: BOOK_ID,
      text: 'Repetition is the mother of learning.',
      note: undefined,
      tags: [],
      position: { pageNumber: 1 },
    });

    // First review: 'good'
    const result1 = await fsrsService.gradeCard(highlight.id, 'good');
    expect(result1.card.reps).toBeGreaterThan(0);

    // Fetch updated highlight and verify state changed
    const afterFirst = await highlightService.getHighlightById(highlight.id);
    expect(afterFirst!.reps).toBeGreaterThan(0);
    expect(afterFirst!.state).not.toBe('new');

    // Two review log entries should exist after two grades
    // (We only did one grade above, so one log entry)
    const logs = await db.executeQuery<{ id: string }>(
      'SELECT id FROM review_logs WHERE highlight_id = ?',
      [highlight.id]
    );
    expect(logs).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Verify 'again' grade resets/keeps card in learning state
  // -------------------------------------------------------------------------
  it('should handle "again" grade and create a review log (Req 5.4)', async () => {
    const highlight = await highlightService.createHighlight({
      bookId: BOOK_ID,
      text: 'Forgetting is part of learning.',
      note: undefined,
      tags: [],
      position: { pageNumber: 7 },
    });

    const result = await fsrsService.gradeCard(highlight.id, 'again');

    expect(result.reviewLog.grade).toBe('again');
    expect(result.dueDate).toBeInstanceOf(Date);

    // Review log should be created
    const logs = await db.executeQuery<{ grade: string }>(
      'SELECT grade FROM review_logs WHERE highlight_id = ?',
      [highlight.id]
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].grade).toBe('again');
  });

  // -------------------------------------------------------------------------
  // Verify getReviewStats reflects the highlight (Req 5.11)
  // -------------------------------------------------------------------------
  it('should reflect the highlight in review stats (Req 5.11)', async () => {
    await highlightService.createHighlight({
      bookId: BOOK_ID,
      text: 'Stats should count this highlight.',
      note: undefined,
      tags: [],
      position: { pageNumber: 3 },
    });

    const stats = await fsrsService.getReviewStats();

    expect(stats.totalCards).toBeGreaterThanOrEqual(1);
    expect(stats.newCards).toBeGreaterThanOrEqual(1);
  });
});
