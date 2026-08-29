/**
 * Integration test: Search and filter functionality (Task 25.3)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.10
 *
 * SearchService issues SQL too complex for the naive in-memory test DB
 * (DISTINCT, correlated subqueries, multi-JOIN), so this test drives it through
 * a mock IDatabaseManager: we assert the SQL/params it builds for each filter
 * combination, that it maps rows to SearchResult with the correct matchType,
 * and that recent-search history round-trips.
 */

import { SearchService } from '../../SearchService';
import { RowMapper } from '../../../database/rowMapping';
import type { IDatabaseManager } from '../../../types/database';

function makeHighlightJoinRow(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'hl-1',
    book_id: 'book-1',
    text: 'The mitochondria is the powerhouse of the cell',
    note: null,
    color: '#FFEB3B',
    position_data: '{"pageNumber":1}',
    created_at: now,
    updated_at: now,
    due_date: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    last_reviewed_at: null,
    is_flashcard: 0,
    flashcard_question: null,
    is_discarded: 0,
    header_level: null,
    // joined book columns
    b_id: 'book-1',
    b_title: 'Biology 101',
    b_author: 'Jane Smith',
    b_file_path: 'file:///books/book-1.pdf',
    b_file_type: 'pdf',
    b_cover_image_path: null,
    b_total_pages: 100,
    b_current_page: 0,
    b_last_read_at: null,
    b_created_at: now,
    b_updated_at: now,
    ...overrides,
  };
}

// Extract the first call's (sql, params) as non-optional tuples for assertions.
function firstCall(fn: { mock: { calls: unknown[][] } }): {
  sql: string;
  params: unknown[];
} {
  const call = fn.mock.calls[0];
  if (!call) {
    throw new Error('expected the mock to have been called at least once');
  }
  return { sql: call[0] as string, params: (call[1] ?? []) as unknown[] };
}

describe('Search and filter integration', () => {
  let service: SearchService;
  let mockDb: jest.Mocked<IDatabaseManager>;

  beforeEach(() => {
    mockDb = {
      initialize: jest.fn(),
      executeQuery: jest.fn().mockResolvedValue([]),
      executeUpdate: jest.fn().mockResolvedValue(1),
      transaction: jest.fn(),
      batchUpdate: jest.fn(),
      close: jest.fn(),
    } as jest.Mocked<IDatabaseManager>;
    service = new SearchService(mockDb, new RowMapper(mockDb));
  });

  describe('query validation', () => {
    it('returns empty for queries shorter than 2 chars (Req 7.2)', async () => {
      const results = await service.searchHighlights('a');
      expect(results).toEqual([]);
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('searchHighlights', () => {
    it('matches text and notes, returning mapped SearchResults (Req 7.1, 7.4)', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce([makeHighlightJoinRow()]) // main highlight query
        .mockResolvedValueOnce([]) // getTagsForHighlight
        .mockResolvedValueOnce([]); // searchByTag

      const results = await service.searchHighlights('mitochondria');

      expect(results).toHaveLength(1);
      expect(results[0].highlight.id).toBe('hl-1');
      expect(results[0].book.title).toBe('Biology 101');
      expect(results[0].matchType).toBe('text');
      expect(results[0].matchedText.toLowerCase()).toContain('mitochondria');

      // First call is the main search; verify LIKE pattern + pagination params.
      const { sql, params } = firstCall(mockDb.executeQuery);
      expect(sql).toContain('h.text LIKE ? OR h.note LIKE ?');
      expect(params[0]).toBe('%mitochondria%');
      expect(params[1]).toBe('%mitochondria%');
      // last two params are LIMIT, OFFSET
      expect(params[params.length - 2]).toBe(50);
      expect(params[params.length - 1]).toBe(0);
    });

    it('classifies a note match as matchType "note"', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce([
          makeHighlightJoinRow({
            text: 'Some unrelated body text',
            note: 'remember the krebs cycle',
          }),
        ])
        .mockResolvedValueOnce([]) // tags
        .mockResolvedValueOnce([]); // searchByTag

      const results = await service.searchHighlights('krebs');
      expect(results[0].matchType).toBe('note');
      expect(results[0].matchedText.toLowerCase()).toContain('krebs');
    });

    it('adds a book filter condition and param (Req 7.5)', async () => {
      await service.searchHighlights('cell', { bookId: 'book-1' });
      const { sql, params } = firstCall(mockDb.executeQuery);
      expect(sql).toContain('h.book_id = ?');
      expect(params).toContain('book-1');
    });

    it('adds a date-range condition with epoch params (Req 7.6)', async () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const end = new Date('2026-02-01T00:00:00Z');
      await service.searchHighlights('cell', { dateRange: { start, end } });
      const { sql, params } = firstCall(mockDb.executeQuery);
      expect(sql).toContain('h.created_at >= ? AND h.created_at <= ?');
      expect(params).toContain(start.getTime());
      expect(params).toContain(end.getTime());
    });

    it('adds tag-filter joins and lowercased tag params (Req 7.5)', async () => {
      await service.searchHighlights('cell', { tags: ['Biology', 'Science'] });
      const { sql, params } = firstCall(mockDb.executeQuery);
      expect(sql).toContain('INNER JOIN highlight_tags ht_filter');
      expect(params).toContain('biology');
      expect(params).toContain('science');
    });

    it('deduplicates highlights that match both by text and by tag', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce([makeHighlightJoinRow()]) // main
        .mockResolvedValueOnce([]) // tags for main row
        .mockResolvedValueOnce([makeHighlightJoinRow()]) // searchByTag returns same hl
        .mockResolvedValueOnce([]); // tags for tag row

      const results = await service.searchHighlights('cell');
      expect(results.filter(r => r.highlight.id === 'hl-1')).toHaveLength(1);
    });
  });

  describe('searchBooks', () => {
    it('searches title and author with LIKE (Req 7.1, 7.3)', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([
        {
          id: 'book-1',
          title: 'Biology 101',
          author: 'Jane Smith',
          file_path: 'file:///books/book-1.pdf',
          file_type: 'pdf',
          cover_image_path: null,
          total_pages: 100,
          current_page: 0,
          last_read_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ]);

      const books = await service.searchBooks('biology');
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Biology 101');
      const { sql, params } = firstCall(mockDb.executeQuery);
      expect(sql).toContain('title LIKE ? OR author LIKE ?');
      expect(params[0]).toBe('%biology%');
    });
  });

  describe('recent search history (Req 7.10)', () => {
    it('saves a search, prepending and de-duplicating', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([{ value: JSON.stringify(['old query', 'cell']) }]);

      await service.saveSearch('cell');

      const { sql, params } = firstCall(mockDb.executeUpdate);
      expect(sql).toContain('INSERT INTO settings');
      const saved = JSON.parse(params[1] as string) as string[];
      expect(saved[0]).toBe('cell'); // moved to front
      expect(saved.filter(s => s === 'cell')).toHaveLength(1); // de-duped
    });

    it('ignores too-short queries', async () => {
      await service.saveSearch('a');
      expect(mockDb.executeUpdate).not.toHaveBeenCalled();
    });

    it('reads recent searches from settings', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([{ value: JSON.stringify(['cell', 'krebs']) }]);
      const recents = await service.getRecentSearches();
      expect(recents).toEqual(['cell', 'krebs']);
    });

    it('clears recent search history', async () => {
      await service.clearSearchHistory();
      const { sql, params } = firstCall(mockDb.executeUpdate);
      expect(sql).toContain('DELETE FROM settings');
      expect(params[0]).toBe('recent_searches');
    });
  });
});
