// SearchService implementation for full-text search across highlights and books
// Requirements: 7.1-7.10

import type { ISearchService, SearchFilters, SearchResult } from './interfaces';
import type { Book, Highlight } from '../types/models';
import type { IDatabaseManager } from '../types/database';
import {
  RowMapper,
  type HighlightRow,
  type BookRow,
  type BookJoinRow,
} from '../database/rowMapping';

const MAX_RESULTS = 50;
const MAX_RECENT_SEARCHES = 20;
const RECENT_SEARCHES_KEY = 'recent_searches';
// Cache TTL: 60 seconds (Req 11.5)
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  results: SearchResult[];
  timestamp: number;
}

export class SearchService implements ISearchService {
  private db: IDatabaseManager;
  private mapper: RowMapper;
  // In-memory cache for recent search results (Req 11.5)
  private resultCache = new Map<string, CacheEntry>();

  constructor(databaseManager: IDatabaseManager, rowMapper: RowMapper) {
    this.db = databaseManager;
    this.mapper = rowMapper;
  }

  /**
   * Search highlights by text, notes, and tags with optional filters.
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
   */
  async searchHighlights(
    query: string,
    filters?: SearchFilters,
    offset = 0
  ): Promise<SearchResult[]> {
    // Requirement 7.2: Return empty if query < 2 chars
    if (query.length < 2) {
      return [];
    }

    // Check in-memory cache for first page (offset=0) (Req 11.5)
    const cacheKey = `${query}|${JSON.stringify(filters ?? {})}|${offset}`;
    const cached = this.resultCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.results;
    }

    const pattern = `%${query}%`;
    const params: any[] = [];
    const conditions: string[] = [];

    // Base: search text and note (case-insensitive via LIKE in SQLite)
    // Requirement 7.3: case-insensitive matching
    conditions.push('(h.text LIKE ? OR h.note LIKE ?)');
    params.push(pattern, pattern);

    // Requirement 7.5: filter by book
    if (filters?.bookId) {
      conditions.push('h.book_id = ?');
      params.push(filters.bookId);
    }

    // Requirement 7.6: filter by date range
    if (filters?.dateRange) {
      conditions.push('h.created_at >= ? AND h.created_at <= ?');
      params.push(filters.dateRange.start.getTime(), filters.dateRange.end.getTime());
    }

    // Requirement 7.5: filter by tags (highlight must have ALL specified tags)
    let tagJoin = '';
    if (filters?.tags && filters.tags.length > 0) {
      tagJoin = `
        INNER JOIN highlight_tags ht_filter ON h.id = ht_filter.highlight_id
        INNER JOIN tags t_filter ON ht_filter.tag_id = t_filter.id
          AND LOWER(t_filter.name) IN (${filters.tags.map(() => '?').join(',')})`;
      params.push(...filters.tags.map(t => t.toLowerCase()));
      // Ensure highlight matches ALL tags
      conditions.push(`(
        SELECT COUNT(DISTINCT LOWER(t2.name))
        FROM highlight_tags ht2
        INNER JOIN tags t2 ON ht2.tag_id = t2.id
        WHERE ht2.highlight_id = h.id
          AND LOWER(t2.name) IN (${filters.tags.map(() => '?').join(',')})
      ) = ?`);
      params.push(...filters.tags.map(t => t.toLowerCase()), filters.tags.length);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Requirement 7.8: limit to MAX_RESULTS (50) per page
    params.push(MAX_RESULTS, offset);

    const sql = `
      SELECT DISTINCT h.*, b.id as b_id, b.title as b_title, b.author as b_author,
        b.file_path as b_file_path, b.file_type as b_file_type,
        b.cover_image_path as b_cover_image_path, b.total_pages as b_total_pages,
        b.current_page as b_current_page, b.last_read_at as b_last_read_at,
        b.created_at as b_created_at, b.updated_at as b_updated_at
      FROM highlights h
      INNER JOIN books b ON h.book_id = b.id
      ${tagJoin}
      ${whereClause}
      ORDER BY h.created_at DESC
      LIMIT ? OFFSET ?`;

    const rows = await this.db.executeQuery<HighlightRow & BookJoinRow>(sql, params);

    const highlights = await this.mapper.toHighlights(rows);
    const results: SearchResult[] = rows.map((row, i) => {
      const highlight = highlights[i];
      const book = this.mapper.toBookFromJoin(row);
      // Requirement 7.4: determine match type and matched text
      const { matchType, matchedText } = this.determineMatch(highlight, query);
      return { highlight, book, matchedText, matchType };
    });

    // Also search by tag name and include those results
    const tagResults = await this.searchByTag(query, filters, offset, pattern);
    // Merge, deduplicating by highlight id
    const seen = new Set(results.map(r => r.highlight.id));
    for (const r of tagResults) {
      if (!seen.has(r.highlight.id)) {
        results.push(r);
        seen.add(r.highlight.id);
      }
    }

    const finalResults = results.slice(0, MAX_RESULTS);

    // Store in cache (Req 11.5)
    this.resultCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });
    // Evict stale entries to prevent unbounded growth
    if (this.resultCache.size > 50) {
      const now = Date.now();
      for (const [key, entry] of this.resultCache) {
        if (now - entry.timestamp > CACHE_TTL_MS) {
          this.resultCache.delete(key);
        }
      }
    }

    return finalResults;
  }

  /**
   * Search books by title or author.
   * Requirements: 7.1, 7.3
   */
  async searchBooks(query: string): Promise<Book[]> {
    if (query.length < 2) {
      return [];
    }

    const pattern = `%${query}%`;
    const rows = await this.db.executeQuery<BookRow>(
      `SELECT * FROM books WHERE title LIKE ? OR author LIKE ? ORDER BY title ASC LIMIT ?`,
      [pattern, pattern, MAX_RESULTS]
    );

    return rows.map(row => this.mapper.toBook(row));
  }

  /**
   * Load more search results (pagination).
   * Requirements: 7.8, 7.9
   */
  async loadMore(query: string, filters?: SearchFilters, offset = 0): Promise<SearchResult[]> {
    return this.searchHighlights(query, filters, offset);
  }

  /**
   * Get recent search queries.
   * Requirement: 7.10
   */
  async getRecentSearches(): Promise<string[]> {
    const rows = await this.db.executeQuery<{ value: string }>(
      `SELECT value FROM settings WHERE key = ? LIMIT 1`,
      [RECENT_SEARCHES_KEY]
    );

    if (rows.length === 0) {
      return [];
    }

    try {
      return JSON.parse(rows[0].value) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Save a search query to recent history.
   * Requirement: 7.10
   */
  async saveSearch(query: string): Promise<void> {
    if (!query || query.trim().length < 2) {
      return;
    }

    const trimmed = query.trim();
    const existing = await this.getRecentSearches();

    // Remove duplicate if present, then prepend
    const updated = [trimmed, ...existing.filter(s => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);

    const now = Date.now();
    await this.db.executeUpdate(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [RECENT_SEARCHES_KEY, JSON.stringify(updated), now]
    );
  }

  /**
   * Clear all recent search history.
   * Requirement: 7.10
   */
  async clearSearchHistory(): Promise<void> {
    await this.db.executeUpdate(`DELETE FROM settings WHERE key = ?`, [RECENT_SEARCHES_KEY]);
    // Also clear result cache
    this.resultCache.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Search highlights that have a tag matching the query.
   */
  private async searchByTag(
    query: string,
    filters: SearchFilters | undefined,
    offset: number,
    pattern: string
  ): Promise<SearchResult[]> {
    const params: any[] = [pattern];
    const conditions: string[] = ['LOWER(t.name) LIKE LOWER(?)'];

    if (filters?.bookId) {
      conditions.push('h.book_id = ?');
      params.push(filters.bookId);
    }
    if (filters?.dateRange) {
      conditions.push('h.created_at >= ? AND h.created_at <= ?');
      params.push(filters.dateRange.start.getTime(), filters.dateRange.end.getTime());
    }

    params.push(MAX_RESULTS, offset);

    const sql = `
      SELECT DISTINCT h.*, b.id as b_id, b.title as b_title, b.author as b_author,
        b.file_path as b_file_path, b.file_type as b_file_type,
        b.cover_image_path as b_cover_image_path, b.total_pages as b_total_pages,
        b.current_page as b_current_page, b.last_read_at as b_last_read_at,
        b.created_at as b_created_at, b.updated_at as b_updated_at
      FROM highlights h
      INNER JOIN books b ON h.book_id = b.id
      INNER JOIN highlight_tags ht ON h.id = ht.highlight_id
      INNER JOIN tags t ON ht.tag_id = t.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY h.created_at DESC
      LIMIT ? OFFSET ?`;

    const rows = await this.db.executeQuery<HighlightRow & BookJoinRow>(sql, params);

    const highlights = await this.mapper.toHighlights(rows);
    return rows.map((row, i) => ({
      highlight: highlights[i],
      book: this.mapper.toBookFromJoin(row),
      matchedText: query,
      matchType: 'tag' as const,
    }));
  }

  /** Determine which field matched and extract the matched snippet. */
  private determineMatch(
    highlight: Highlight,
    query: string
  ): { matchType: 'text' | 'note' | 'tag'; matchedText: string } {
    const lower = query.toLowerCase();

    if (highlight.text.toLowerCase().includes(lower)) {
      return { matchType: 'text', matchedText: this.extractSnippet(highlight.text, query) };
    }
    if (highlight.note && highlight.note.toLowerCase().includes(lower)) {
      return { matchType: 'note', matchedText: this.extractSnippet(highlight.note, query) };
    }
    const matchingTag = highlight.tags.find(t => t.name.toLowerCase().includes(lower));
    if (matchingTag) {
      return { matchType: 'tag', matchedText: matchingTag.name };
    }

    // Fallback
    return { matchType: 'text', matchedText: this.extractSnippet(highlight.text, query) };
  }

  /** Extract a short snippet around the matched text (±60 chars). */
  private extractSnippet(text: string, query: string): string {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, 120);
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + query.length + 60);
    const snippet = text.slice(start, end);
    return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '');
  }
}
