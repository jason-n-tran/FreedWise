// Mock the native modules DataService depends on.
const mockFile = {
  exists: false,
  create: jest.fn(),
  write: jest.fn(),
  delete: jest.fn(),
  bytes: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  text: jest.fn().mockResolvedValue('{}'),
  name: 'export.json',
  uri: 'file:///cache/export.json',
};
const mockDir = { exists: true, delete: jest.fn() };
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => mockFile),
  Directory: jest.fn().mockImplementation(() => mockDir),
  Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///doc/' } },
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'test' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

import { DataService } from '../DataService';
import * as Sharing from 'expo-sharing';
import type { IDatabaseManager } from '../../types/database';

describe('DataService', () => {
  let service: DataService;
  let mockDb: jest.Mocked<IDatabaseManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFile.exists = false;
    mockDb = {
      initialize: jest.fn(),
      executeQuery: jest.fn().mockResolvedValue([]),
      executeUpdate: jest.fn().mockResolvedValue(1),
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        await cb({
          executeUpdate: jest.fn().mockResolvedValue(1),
          executeQuery: jest.fn().mockResolvedValue([]),
        });
      }),
      batchUpdate: jest.fn(),
      close: jest.fn(),
    } as jest.Mocked<IDatabaseManager>;
    service = new DataService(mockDb);
  });

  describe('buildExport', () => {
    it('produces a JSON snapshot with all collections, settings, and restorable assets', async () => {
      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: 'b1', file_path: 'file:///book.pdf', file_type: 'pdf' }]) // books
        .mockResolvedValueOnce([{ id: 'h1' }]) // highlights
        .mockResolvedValueOnce([{ id: 't1' }]) // tags
        .mockResolvedValueOnce([{ highlight_id: 'h1', tag_id: 't1' }]) // highlight_tags
        .mockResolvedValueOnce([{ id: 'r1' }]) // review_logs
        .mockResolvedValueOnce([
          { key: 'pref_theme_mode', value: '"dark"', updated_at: 1 },
          { key: 'notification_daily_id', value: 'device-only', updated_at: 1 },
        ]); // settings
      mockFile.exists = true;

      const json = await service.buildExport();
      const parsed = JSON.parse(json);
      expect(parsed.app).toBe('Freedwise Reader');
      expect(parsed.exportFormatVersion).toBe(2);
      expect(parsed.books[0]).toEqual(
        expect.objectContaining({ id: 'b1', file_path: 'file:///book.pdf' })
      );
      expect(parsed.highlights).toEqual([{ id: 'h1' }]);
      expect(parsed.tags).toEqual([{ id: 't1' }]);
      expect(parsed.reviewLogs).toEqual([{ id: 'r1' }]);
      expect(parsed.settings).toEqual([{ key: 'pref_theme_mode', value: '"dark"', updated_at: 1 }]);
      expect(parsed.assets.books.b1.base64).toBe('AQID');
      expect(typeof parsed.exportedAt).toBe('string');
    });
  });

  describe('exportAndShare', () => {
    it('writes a file and opens the share sheet', async () => {
      await service.exportAndShare();
      expect(mockFile.create).toHaveBeenCalled();
      expect(mockFile.write).toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        mockFile.uri,
        expect.objectContaining({ mimeType: 'application/json' })
      );
    });

    it('throws when sharing is unavailable', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
      await expect(service.exportAndShare()).rejects.toThrow('Sharing is not available');
    });
  });

  describe('clearAllData', () => {
    it('deletes all content tables in a transaction', async () => {
      const deletes: string[] = [];
      mockDb.transaction.mockImplementation(async (cb: any) => {
        await cb({
          executeUpdate: jest.fn().mockImplementation((sql: string) => {
            deletes.push(sql);
            return Promise.resolve(1);
          }),
          executeQuery: jest.fn().mockResolvedValue([]),
        });
      });

      await service.clearAllData();

      const joined = deletes.join(' | ');
      expect(joined).toContain('DELETE FROM review_logs');
      expect(joined).toContain('DELETE FROM highlight_tags');
      expect(joined).toContain('DELETE FROM highlights');
      expect(joined).toContain('DELETE FROM tags');
      expect(joined).toContain('DELETE FROM books');
    });

    it('deletes the books and covers directories', async () => {
      await service.clearAllData();
      // Directory(...).delete() called for each existing dir
      expect(mockDir.delete).toHaveBeenCalled();
    });
  });

  describe('importFromJson', () => {
    const snapshot = {
      app: 'Freedwise Reader',
      exportFormatVersion: 2,
      schemaVersion: 2,
      books: [
        {
          id: 'b1',
          title: 'Book',
          author: 'Author',
          file_path: 'old',
          file_type: 'pdf',
          cover_image_path: null,
          total_pages: 10,
          current_page: 2,
          last_cfi: null,
          last_read_at: null,
          created_at: 1,
          updated_at: 2,
        },
      ],
      highlights: [
        {
          id: 'h1',
          book_id: 'b1',
          text: 'Quote',
          note: null,
          color: '#FFEB3B',
          position_data: '{}',
          created_at: 1,
          updated_at: 2,
          due_date: 3,
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
        },
      ],
      tags: [{ id: 't1', name: 'tag', created_at: 1 }],
      highlightTags: [{ highlight_id: 'h1', tag_id: 't1' }],
      reviewLogs: [
        {
          id: 'r1',
          highlight_id: 'h1',
          grade: 'good',
          reviewed_at: 4,
          elapsed_days: 0,
          scheduled_days: 1,
          state: 'review',
        },
      ],
      settings: [{ key: 'pref_theme_mode', value: '"dark"', updated_at: 5 }],
      assets: { books: { b1: { fileName: 'b1.pdf', base64: 'AQID' } }, covers: {} },
    };

    it('merges content but skips settings', async () => {
      const queries: string[] = [];
      const updates: string[] = [];
      const inserted = { book: false, tag: false, highlight: false };
      mockDb.transaction.mockImplementation(async (cb: any) => {
        await cb({
          executeQuery: jest.fn().mockImplementation((sql: string) => {
            queries.push(sql);
            if (sql.includes('FROM books WHERE id') && inserted.book) {
              return Promise.resolve([snapshot.books[0]]);
            }
            if (sql.includes('FROM tags WHERE id') && inserted.tag) {
              return Promise.resolve([snapshot.tags[0]]);
            }
            if (sql.includes('FROM tags WHERE name')) {
              return Promise.resolve([]);
            }
            if (sql.includes('FROM highlights WHERE id') && inserted.highlight) {
              return Promise.resolve([snapshot.highlights[0]]);
            }
            return Promise.resolve([]);
          }),
          executeUpdate: jest.fn().mockImplementation((sql: string) => {
            updates.push(sql);
            if (sql.includes('INSERT INTO books')) inserted.book = true;
            if (sql.includes('INSERT INTO tags')) inserted.tag = true;
            if (sql.includes('INSERT INTO highlights')) inserted.highlight = true;
            return Promise.resolve(1);
          }),
        });
      });

      const summary = await service.importFromJson(JSON.stringify(snapshot), 'merge');

      expect(summary.books.added).toBe(1);
      expect(summary.highlights.added).toBe(1);
      expect(summary.settings.skipped).toBe(1);
      expect(updates.some(sql => sql.includes('DELETE FROM books'))).toBe(false);
      expect(updates.some(sql => sql.includes('INSERT INTO books'))).toBe(true);
      expect(queries.some(sql => sql.includes('SELECT * FROM books'))).toBe(true);
    });

    it('replace clears content tables and imports settings', async () => {
      const updates: string[] = [];
      mockDb.transaction.mockImplementation(async (cb: any) => {
        await cb({
          executeQuery: jest.fn().mockResolvedValue([]),
          executeUpdate: jest.fn().mockImplementation((sql: string) => {
            updates.push(sql);
            return Promise.resolve(1);
          }),
        });
      });

      const summary = await service.importFromJson(JSON.stringify(snapshot), 'replace');

      expect(summary.settings.imported).toBe(1);
      expect(updates.join(' | ')).toContain('DELETE FROM books');
      expect(updates.join(' | ')).toContain('INSERT INTO settings');
    });

    it('rejects JSON that is not a Freedwise export', async () => {
      await expect(service.importFromJson('{"app":"Other"}', 'merge')).rejects.toThrow(
        'does not look like a Freedwise'
      );
    });
  });
});
