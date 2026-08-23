// BookService implementation for book import and library management

import * as DocumentPicker from 'expo-document-picker';
import { Paths, File, Directory } from 'expo-file-system';
import { IBookService, type IExtractionService } from './interfaces';
import type { Book, ReadingProgress, FileType } from '../types/models';
import type { IDatabaseManager } from '../types/database';
import { RowMapper, type BookRow } from '../database/rowMapping';
import { validateBook } from '../utils/validation';
import { base64ToBytes } from '../utils/base64';

// Magic byte signatures for supported file types (Requirement 12.3)
const MAGIC_BYTES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  epub: [0x50, 0x4b, 0x03, 0x04], // PK\x03\x04 (ZIP/EPUB)
} as const;

export class BookService implements IBookService {
  private db: IDatabaseManager;
  private mapper: RowMapper;
  private booksDir: Directory;
  private coversDir: Directory;
  // Optional: when present, real metadata/cover extraction runs via the hidden
  // ExtractionWebView. Absent in unit tests, where extraction is skipped.
  private extraction?: IExtractionService;

  constructor(
    databaseManager: IDatabaseManager,
    rowMapper: RowMapper,
    extractionService?: IExtractionService
  ) {
    this.db = databaseManager;
    this.mapper = rowMapper;
    this.extraction = extractionService;
    this.booksDir = new Directory(Paths.document, 'books');
    this.coversDir = new Directory(Paths.document, 'covers');
  }

  /**
   * Import a book from device storage
   * Implements Algorithm 1 from design document
   */
  async importBook(uri: string): Promise<Book> {
    // Step 1: Validate file type by extension
    const fileExtension = this.extractExtension(uri);
    if (!['pdf', 'epub'].includes(fileExtension)) {
      throw new Error('Unsupported file type. Only PDF and EPUB are supported.');
    }

    // Step 1b: Validate file type by magic bytes (Requirement 12.3)
    await this.validateMagicBytes(uri, fileExtension as FileType);

    // Step 2: Generate book ID and prepare directories
    const bookId = this.generateUUID();
    await this.ensureDirectoriesExist();

    const targetFile = new File(this.booksDir, `${bookId}.${fileExtension}`);
    let coverFile: File | null = null;

    // Step 3: Copy file to app directory
    try {
      const sourceFile = new File(uri);
      await sourceFile.copy(targetFile);
    } catch (copyError) {
      console.error('File copy failed during book import:', copyError);
      await this.cleanupFailedImport(targetFile, null);
      throw new Error(
        'Failed to import book. Please check that the file is accessible and try again.'
      );
    }

    // Step 4+5: Extract real metadata AND cover in one pass via the hidden
    // ExtractionWebView (PDF.js / epub.js). All failures degrade gracefully:
    // title falls back to filename, author to "Unknown", cover to none.
    let metadata: { title?: string; author?: string; pageCount?: number } = {};
    try {
      const extracted = await this.extractWithCover(targetFile.uri, fileExtension as FileType);
      metadata = {
        title: extracted.title,
        author: extracted.author,
        pageCount: extracted.pageCount,
      };
      if (extracted.coverPngBase64) {
        coverFile = await this.writeCover(bookId, extracted.coverPngBase64);
      }
    } catch (extractError) {
      console.warn('Metadata/cover extraction failed, using fallbacks:', extractError);
      metadata = {};
      coverFile = null;
    }

    // Step 6: Create book record
    const now = Date.now();
    const book: Book = {
      id: bookId,
      title: metadata.title || this.extractFilename(uri),
      author: metadata.author || 'Unknown',
      filePath: targetFile.uri,
      fileType: fileExtension as FileType,
      coverImagePath: coverFile?.uri,
      totalPages: metadata.pageCount,
      currentPage: 0,
      lastReadAt: undefined,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    // Validate book data
    validateBook(book);

    // Step 7: Insert into database
    try {
      await this.db.executeUpdate(
        `INSERT INTO books (id, title, author, file_path, file_type, cover_image_path, 
         total_pages, current_page, last_read_at, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          book.id,
          book.title,
          book.author,
          book.filePath,
          book.fileType,
          book.coverImagePath || null,
          book.totalPages || null,
          book.currentPage,
          book.lastReadAt ? book.lastReadAt.getTime() : null,
          book.createdAt.getTime(),
          book.updatedAt.getTime(),
        ]
      );
    } catch (dbError) {
      console.error('Database insertion failed during book import:', dbError);
      await this.cleanupFailedImport(targetFile, coverFile);
      throw new Error('Failed to save book to library. Please try again.');
    }

    return book;
  }

  /**
   * Get all books from the library
   */
  async getBooks(): Promise<Book[]> {
    const rows = await this.db.executeQuery<BookRow>(
      'SELECT * FROM books ORDER BY created_at DESC'
    );

    return rows.map(row => this.mapper.toBook(row));
  }

  /**
   * Get a specific book by ID
   */
  async getBookById(id: string): Promise<Book | null> {
    const rows = await this.db.executeQuery<BookRow>('SELECT * FROM books WHERE id = ?', [id]);

    if (rows.length === 0) {
      return null;
    }

    return this.mapper.toBook(rows[0]);
  }

  /**
   * Check if the book's file exists on disk
   * Implements Requirement 13.7
   */
  async checkBookFileExists(bookId: string): Promise<boolean> {
    const book = await this.getBookById(bookId);
    if (!book) {
      return false;
    }
    try {
      const file = new File(book.filePath);
      return file.exists;
    } catch {
      return false;
    }
  }

  /**
   * Delete a book and all associated data
   */
  async deleteBook(id: string): Promise<void> {
    const book = await this.getBookById(id);
    if (!book) {
      throw new Error('Book not found');
    }

    await this.db.transaction(async tx => {
      // Delete book record (cascades to highlights and tags)
      await tx.executeUpdate('DELETE FROM books WHERE id = ?', [id]);
    });

    // Delete physical files
    try {
      const bookFile = new File(book.filePath);
      if (bookFile.exists) {
        bookFile.delete();
      }
      if (book.coverImagePath) {
        const coverFile = new File(book.coverImagePath);
        if (coverFile.exists) {
          coverFile.delete();
        }
      }
    } catch (error) {
      console.warn('Failed to delete book files:', error);
      // Continue - database record is already deleted
    }
  }

  /**
   * Update reading progress for a book
   */
  async updateReadingProgress(bookId: string, progress: ReadingProgress): Promise<void> {
    const book = await this.getBookById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }

    const now = Date.now();
    await this.db.executeUpdate(
      'UPDATE books SET current_page = ?, last_cfi = ?, last_read_at = ?, updated_at = ? WHERE id = ?',
      [progress.currentPage, progress.lastCfi || null, now, now, bookId]
    );
  }

  /**
   * Update editable book metadata (title/author). File paths are immutable, so
   * only these user-facing fields can change — useful when a file had no
   * embedded metadata and imported as a random id / "Unknown".
   */
  async updateBook(id: string, updates: { title?: string; author?: string }): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.author !== undefined) {
      fields.push('author = ?');
      values.push(updates.author);
    }
    if (fields.length === 0) return;

    const now = Date.now();
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const changes = await this.db.executeUpdate(
      `UPDATE books SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    if (changes === 0) {
      throw new Error('Book not found');
    }
  }

  /**
   * Get reading progress for a book
   */
  async getReadingProgress(bookId: string): Promise<ReadingProgress | null> {
    const book = await this.getBookById(bookId);
    if (!book) {
      return null;
    }

    const totalPages = book.totalPages || 0;
    const percentage = totalPages > 0 ? (book.currentPage / totalPages) * 100 : 0;

    return {
      bookId: book.id,
      currentPage: book.currentPage,
      totalPages,
      percentage,
      lastPosition: book.lastCfi,
      lastCfi: book.lastCfi,
    };
  }

  // Private helper methods

  /**
   * Validate file type by reading magic bytes from the file header.
   * Rejects files whose content doesn't match the declared extension.
   * Requirement 12.3
   */
  private async validateMagicBytes(uri: string, expectedType: FileType): Promise<void> {
    try {
      const file = new File(uri);
      // Read first 4 bytes as a Uint8Array
      const bytes = await file.bytes();
      const header = bytes.slice(0, 4);

      const expected = MAGIC_BYTES[expectedType];
      const matches = expected.every((byte, i) => header[i] === byte);

      if (!matches) {
        throw new Error(
          `File content does not match the declared type (${expectedType.toUpperCase()}). ` +
            'The file may be corrupted or have an incorrect extension.'
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not match')) {
        throw error;
      }
      // If we can't read the file for magic bytes, fall through — the copy step will catch it
      console.warn('Magic byte validation skipped (could not read file header):', error);
    }
  }

  private extractExtension(uri: string): string {
    const parts = uri.split('.');
    return parts[parts.length - 1].toLowerCase();
  }

  private extractFilename(uri: string): string {
    const parts = uri.split('/');
    const filename = parts[parts.length - 1];
    // Remove extension
    return filename.replace(/\.[^/.]+$/, '');
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async ensureDirectoriesExist(): Promise<void> {
    if (!this.booksDir.exists) {
      this.booksDir.create({ intermediates: true, idempotent: true });
    }

    if (!this.coversDir.exists) {
      this.coversDir.create({ intermediates: true, idempotent: true });
    }
  }

  /**
   * Extract real metadata + cover via the injected ExtractionService (hidden
   * WebView running PDF.js / epub.js). Returns empty when no extractor is
   * available (e.g. in tests), so import proceeds with fallback values.
   */
  private async extractWithCover(
    filePath: string,
    fileType: FileType
  ): Promise<{
    title?: string;
    author?: string;
    pageCount?: number;
    coverPngBase64?: string;
  }> {
    if (!this.extraction) {
      return {};
    }
    return this.extraction.extract(filePath, fileType);
  }

  /**
   * Decode a base64 PNG cover and write it to the covers directory.
   */
  private async writeCover(bookId: string, coverPngBase64: string): Promise<File | null> {
    try {
      await this.ensureDirectoriesExist();
      const coverFile = new File(this.coversDir, `${bookId}.png`);
      if (coverFile.exists) {
        coverFile.delete();
      }
      coverFile.create();
      coverFile.write(base64ToBytes(coverPngBase64));
      return coverFile;
    } catch (err) {
      console.warn('Failed to write cover image:', err);
      return null;
    }
  }

  private async cleanupFailedImport(targetFile: File, coverFile: File | null): Promise<void> {
    try {
      if (targetFile.exists) {
        targetFile.delete();
      }
      if (coverFile && coverFile.exists) {
        coverFile.delete();
      }
    } catch (error) {
      console.warn('Failed to cleanup files after import failure:', error);
    }
  }
}
