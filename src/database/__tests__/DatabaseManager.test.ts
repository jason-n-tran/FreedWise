// Basic tests for DatabaseManager
// Note: These are minimal tests to verify the implementation works

import { DatabaseManager } from '../DatabaseManager';
import { DatabaseError } from '../../types/database';

describe('DatabaseManager', () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager();
  });

  afterEach(async () => {
    await db.close();
  });

  it('should initialize database successfully', async () => {
    await expect(db.initialize()).resolves.not.toThrow();
  });

  it('should throw error when executing query before initialization', async () => {
    await expect(db.executeQuery('SELECT * FROM books')).rejects.toThrow(DatabaseError);
  });

  it('should execute queries after initialization', async () => {
    await db.initialize();
    const result = await db.executeQuery<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['schema_version']
    );
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should support transactions with rollback on error', async () => {
    await db.initialize();

    // Insert a test book
    const bookId = 'test-book-1';
    await db.executeUpdate(
      'INSERT INTO books (id, title, file_path, file_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [bookId, 'Test Book', '/path/to/book.pdf', 'pdf', Date.now(), Date.now()]
    );

    // Verify book exists
    let books = await db.executeQuery<{ id: string }>('SELECT id FROM books WHERE id = ?', [
      bookId,
    ]);
    expect(books.length).toBe(1);

    // Try a transaction that should fail
    await expect(
      db.transaction(async tx => {
        // Delete the book
        await tx.executeUpdate('DELETE FROM books WHERE id = ?', [bookId]);

        // This should cause an error (invalid SQL)
        await tx.executeUpdate('INVALID SQL STATEMENT', []);
      })
    ).rejects.toThrow();

    // Verify book still exists (transaction was rolled back)
    books = await db.executeQuery<{ id: string }>('SELECT id FROM books WHERE id = ?', [bookId]);
    expect(books.length).toBe(1);

    // Cleanup
    await db.executeUpdate('DELETE FROM books WHERE id = ?', [bookId]);
  });

  it('should create all required tables', async () => {
    await db.initialize();

    const tables = await db.executeQuery<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('books');
    expect(tableNames).toContain('highlights');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('highlight_tags');
    expect(tableNames).toContain('review_logs');
    expect(tableNames).toContain('settings');
  });

  it('should create all required indexes', async () => {
    await db.initialize();

    const indexes = await db.executeQuery<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    );

    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_highlights_book_id');
    expect(indexNames).toContain('idx_highlights_due_date');
    expect(indexNames).toContain('idx_highlights_is_discarded');
    expect(indexNames).toContain('idx_highlight_tags_highlight_id');
    expect(indexNames).toContain('idx_highlight_tags_tag_id');
  });

  it('should enforce foreign key constraints', async () => {
    await db.initialize();

    // Try to insert a highlight with non-existent book_id
    await expect(
      db.executeUpdate(
        'INSERT INTO highlights (id, book_id, text, position_data, created_at, updated_at, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['h1', 'non-existent-book', 'test', '{}', Date.now(), Date.now(), Date.now()]
      )
    ).rejects.toThrow();
  });

  it('should cascade delete highlights when book is deleted', async () => {
    await db.initialize();

    const bookId = 'test-book-cascade';
    const highlightId = 'test-highlight-cascade';
    const now = Date.now();

    // Insert book
    await db.executeUpdate(
      'INSERT INTO books (id, title, file_path, file_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [bookId, 'Test Book', '/path/to/book.pdf', 'pdf', now, now]
    );

    // Insert highlight
    await db.executeUpdate(
      'INSERT INTO highlights (id, book_id, text, position_data, created_at, updated_at, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [highlightId, bookId, 'test highlight', '{"pageNumber": 1}', now, now, now]
    );

    // Verify highlight exists
    let highlights = await db.executeQuery<{ id: string }>(
      'SELECT id FROM highlights WHERE id = ?',
      [highlightId]
    );
    expect(highlights.length).toBe(1);

    // Delete book
    await db.executeUpdate('DELETE FROM books WHERE id = ?', [bookId]);

    // Verify highlight was cascade deleted
    highlights = await db.executeQuery<{ id: string }>('SELECT id FROM highlights WHERE id = ?', [
      highlightId,
    ]);
    expect(highlights.length).toBe(0);
  });
});
