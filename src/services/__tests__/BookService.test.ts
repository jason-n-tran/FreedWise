// BookService unit tests

import { BookService } from '../BookService';
import { RowMapper } from '../../database/rowMapping';
import type { IDatabaseManager, Transaction } from '../../types/database';
import type { Book, ReadingProgress } from '../../types/models';
import { File, Directory } from 'expo-file-system';

// Mock expo-file-system
jest.mock('expo-file-system', () => {
  const mockFile = {
    uri: 'file:///mock/path',
    exists: true,
    delete: jest.fn(),
    copy: jest.fn(),
    create: jest.fn(),
    write: jest.fn(),
    bytes: jest.fn(),
  };

  const mockDirectory = {
    uri: 'file:///mock/directory',
    exists: true,
    create: jest.fn(),
  };

  return {
    File: jest.fn().mockImplementation(() => mockFile),
    Directory: jest.fn().mockImplementation(() => mockDirectory),
    Paths: {
      document: { uri: 'file:///mock/documents/' },
    },
  };
});

describe('BookService', () => {
  let bookService: BookService;
  let mockDb: jest.Mocked<IDatabaseManager>;
  let mockFile: any;
  let mockDirectory: any;

  beforeEach(() => {
    // Create mock database manager
    mockDb = {
      initialize: jest.fn(),
      executeQuery: jest.fn(),
      executeUpdate: jest.fn(),
      transaction: jest.fn(),
      batchUpdate: jest.fn(),
      close: jest.fn(),
    } as jest.Mocked<IDatabaseManager>;

    // Reset mocks
    jest.clearAllMocks();

    // Setup mock file and directory
    mockFile = {
      uri: 'file:///mock/path',
      exists: true,
      delete: jest.fn(),
      copy: jest.fn(),
      create: jest.fn(),
      write: jest.fn(),
      bytes: jest.fn(),
    };

    mockDirectory = {
      uri: 'file:///mock/directory',
      exists: true,
      create: jest.fn(),
    };

    (File as unknown as jest.Mock).mockImplementation(() => mockFile);
    (Directory as unknown as jest.Mock).mockImplementation(() => mockDirectory);

    bookService = new BookService(mockDb, new RowMapper(mockDb));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('importBook', () => {
    it('should import a PDF book successfully', async () => {
      const mockUri = 'file:///storage/test.pdf';
      mockFile.copy.mockResolvedValue(undefined);
      mockDb.executeUpdate.mockResolvedValue(1);

      const book = await bookService.importBook(mockUri);

      expect(book).toBeDefined();
      expect(book.title).toBe('test');
      expect(book.author).toBe('Unknown');
      expect(book.fileType).toBe('pdf');
      expect(book.currentPage).toBe(0);
      expect(mockFile.copy).toHaveBeenCalled();
      expect(mockDb.executeUpdate).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO books'),
        expect.arrayContaining([
          expect.any(String), // id
          'test', // title
          'Unknown', // author
          expect.any(String), // filePath
          'pdf', // fileType
          null, // coverImagePath
          null, // totalPages
          0, // currentPage
          null, // lastReadAt
          expect.any(Number), // createdAt
          expect.any(Number), // updatedAt
        ])
      );
    });

    it('should import an EPUB book successfully', async () => {
      const mockUri = 'file:///storage/mybook.epub';
      mockFile.copy.mockResolvedValue(undefined);
      mockDb.executeUpdate.mockResolvedValue(1);

      const book = await bookService.importBook(mockUri);

      expect(book).toBeDefined();
      expect(book.title).toBe('mybook');
      expect(book.fileType).toBe('epub');
    });

    it('should reject unsupported file types', async () => {
      const mockUri = 'file:///storage/document.txt';

      await expect(bookService.importBook(mockUri)).rejects.toThrow('Unsupported file type');
      expect(mockFile.copy).not.toHaveBeenCalled();
      expect(mockDb.executeUpdate).not.toHaveBeenCalled();
    });

    it('should cleanup files on database insertion failure', async () => {
      const mockUri = 'file:///storage/test.pdf';
      mockFile.copy.mockReturnValue(undefined);
      mockFile.delete.mockReturnValue(undefined);
      mockDb.executeUpdate.mockRejectedValue(new Error('Database error'));

      await expect(bookService.importBook(mockUri)).rejects.toThrow(
        'Failed to save book to library. Please try again.'
      );
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should handle file copy failure with user-friendly message', async () => {
      const mockUri = 'file:///storage/test.pdf';
      mockFile.copy.mockRejectedValue(new Error('Copy failed'));

      await expect(bookService.importBook(mockUri)).rejects.toThrow(
        'Failed to import book. Please check that the file is accessible and try again.'
      );
      expect(mockDb.executeUpdate).not.toHaveBeenCalled();
    });

    it('should not create DB record when file copy fails', async () => {
      const mockUri = 'file:///storage/test.pdf';
      mockFile.copy.mockRejectedValue(new Error('Permission denied'));

      await expect(bookService.importBook(mockUri)).rejects.toThrow();
      expect(mockDb.executeUpdate).not.toHaveBeenCalled();
    });

    it('should use fallback values when extraction fails', async () => {
      const mockUri = 'file:///storage/my-book.pdf';
      mockFile.copy.mockResolvedValue(undefined);
      mockDb.executeUpdate.mockResolvedValue(1);

      // Extraction throwing must not fail the import; title/author fall back.
      const extractSpy = jest
        .spyOn(bookService as any, 'extractWithCover')
        .mockRejectedValue(new Error('Extraction error'));

      const book = await bookService.importBook(mockUri);

      expect(book.title).toBe('my-book');
      expect(book.author).toBe('Unknown');
      extractSpy.mockRestore();
    });

    it('should continue import without a cover when none is extracted', async () => {
      const mockUri = 'file:///storage/test.pdf';
      mockFile.copy.mockResolvedValue(undefined);
      mockDb.executeUpdate.mockResolvedValue(1);

      // No extractor wired in tests -> extractWithCover returns {} -> no cover.
      const book = await bookService.importBook(mockUri);

      expect(book).toBeDefined();
      expect(book.coverImagePath).toBeUndefined();
    });

    it('uses extracted metadata + cover when an ExtractionService is provided', async () => {
      const mockUri = 'file:///storage/whatever.pdf';
      mockFile.copy.mockResolvedValue(undefined);
      mockFile.create.mockReturnValue(undefined);
      mockFile.write.mockReturnValue(undefined);
      mockDb.executeUpdate.mockResolvedValue(1);

      const extraction = {
        setExtractor: jest.fn(),
        isReady: jest.fn().mockReturnValue(true),
        extract: jest.fn().mockResolvedValue({
          title: 'Extracted Title',
          author: 'Extracted Author',
          pageCount: 123,
          coverPngBase64: 'AAAA',
        }),
      };
      const svc = new BookService(mockDb, new RowMapper(mockDb), extraction);

      const book = await svc.importBook(mockUri);

      expect(extraction.extract).toHaveBeenCalledWith(expect.any(String), 'pdf');
      expect(book.title).toBe('Extracted Title');
      expect(book.author).toBe('Extracted Author');
      expect(book.totalPages).toBe(123);
      // a cover file was written
      expect(mockFile.write).toHaveBeenCalled();
    });
  });

  describe('getBooks', () => {
    it('should return all books ordered by creation date', async () => {
      const mockRows = [
        {
          id: '1',
          title: 'Book 1',
          author: 'Author 1',
          file_path: '/path/1.pdf',
          file_type: 'pdf',
          cover_image_path: null,
          total_pages: 100,
          current_page: 0,
          last_read_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          id: '2',
          title: 'Book 2',
          author: 'Author 2',
          file_path: '/path/2.epub',
          file_type: 'epub',
          cover_image_path: null,
          total_pages: 200,
          current_page: 50,
          last_read_at: Date.now(),
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ];

      mockDb.executeQuery.mockResolvedValue(mockRows);

      const books = await bookService.getBooks();

      expect(books).toHaveLength(2);
      expect(books[0].title).toBe('Book 1');
      expect(books[1].title).toBe('Book 2');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM books ORDER BY created_at DESC')
      );
    });

    it('should return empty array when no books exist', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      const books = await bookService.getBooks();

      expect(books).toEqual([]);
    });
  });

  describe('getBookById', () => {
    it('should return a book when found', async () => {
      const mockRow = {
        id: '123',
        title: 'Test Book',
        author: 'Test Author',
        file_path: '/path/test.pdf',
        file_type: 'pdf',
        cover_image_path: '/path/cover.jpg',
        total_pages: 150,
        current_page: 25,
        last_read_at: Date.now(),
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      mockDb.executeQuery.mockResolvedValue([mockRow]);

      const book = await bookService.getBookById('123');

      expect(book).toBeDefined();
      expect(book?.id).toBe('123');
      expect(book?.title).toBe('Test Book');
      expect(book?.author).toBe('Test Author');
      expect(mockDb.executeQuery).toHaveBeenCalledWith('SELECT * FROM books WHERE id = ?', ['123']);
    });

    it('should return null when book not found', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      const book = await bookService.getBookById('nonexistent');

      expect(book).toBeNull();
    });
  });

  describe('updateBook', () => {
    it('updates title and author with a parameterized UPDATE', async () => {
      mockDb.executeUpdate.mockResolvedValue(1);
      await bookService.updateBook('book-1', { title: 'New', author: 'Auth' });
      const call = mockDb.executeUpdate.mock.calls[0]!;
      expect(call[0]).toContain('UPDATE books SET');
      expect(call[0]).toContain('title = ?');
      expect(call[0]).toContain('author = ?');
      expect(call[0]).toContain('updated_at = ?');
      // params: title, author, updated_at, id
      expect(call[1]![0]).toBe('New');
      expect(call[1]![1]).toBe('Auth');
      expect(call[1]![call[1]!.length - 1]).toBe('book-1');
    });

    it('throws when the book does not exist (0 rows changed)', async () => {
      mockDb.executeUpdate.mockResolvedValue(0);
      await expect(bookService.updateBook('missing', { title: 'X' })).rejects.toThrow(
        'Book not found'
      );
    });

    it('no-ops when there are no fields to update', async () => {
      await bookService.updateBook('book-1', {});
      expect(mockDb.executeUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteBook', () => {
    it('should delete book and associated files', async () => {
      const mockBook: Book = {
        id: '123',
        title: 'Test Book',
        author: 'Test Author',
        filePath: '/path/test.pdf',
        fileType: 'pdf',
        coverImagePath: '/path/cover.jpg',
        totalPages: 100,
        currentPage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.executeQuery.mockResolvedValue([
        {
          id: mockBook.id,
          title: mockBook.title,
          author: mockBook.author,
          file_path: mockBook.filePath,
          file_type: mockBook.fileType,
          cover_image_path: mockBook.coverImagePath,
          total_pages: mockBook.totalPages,
          current_page: mockBook.currentPage,
          last_read_at: null,
          created_at: mockBook.createdAt.getTime(),
          updated_at: mockBook.updatedAt.getTime(),
        },
      ]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest.fn(),
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      mockFile.exists = true;
      mockFile.delete.mockReturnValue(undefined);

      await bookService.deleteBook('123');

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockFile.delete).toHaveBeenCalled();
    });

    it('should throw error when book not found', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      await expect(bookService.deleteBook('nonexistent')).rejects.toThrow('Book not found');
    });

    it('should continue even if file deletion fails', async () => {
      const mockBook: Book = {
        id: '123',
        title: 'Test Book',
        author: 'Test Author',
        filePath: '/path/test.pdf',
        fileType: 'pdf',
        currentPage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.executeQuery.mockResolvedValue([
        {
          id: mockBook.id,
          title: mockBook.title,
          author: mockBook.author,
          file_path: mockBook.filePath,
          file_type: mockBook.fileType,
          cover_image_path: null,
          total_pages: null,
          current_page: mockBook.currentPage,
          last_read_at: null,
          created_at: mockBook.createdAt.getTime(),
          updated_at: mockBook.updatedAt.getTime(),
        },
      ]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest.fn(),
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      mockFile.exists = true;
      mockFile.delete.mockImplementation(() => {
        throw new Error('File not found');
      });

      // Should not throw - file deletion failure is logged but not fatal
      await expect(bookService.deleteBook('123')).resolves.not.toThrow();
    });
  });

  describe('updateReadingProgress', () => {
    it('should update reading progress successfully', async () => {
      const mockBook = {
        id: '123',
        title: 'Test Book',
        author: 'Test Author',
        file_path: '/path/test.pdf',
        file_type: 'pdf',
        cover_image_path: null,
        total_pages: 100,
        current_page: 0,
        last_read_at: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      mockDb.executeQuery.mockResolvedValue([mockBook]);
      mockDb.executeUpdate.mockResolvedValue(1);

      const progress: ReadingProgress = {
        bookId: '123',
        currentPage: 50,
        totalPages: 100,
        percentage: 50,
      };

      await bookService.updateReadingProgress('123', progress);

      expect(mockDb.executeUpdate).toHaveBeenCalledWith(
        'UPDATE books SET current_page = ?, last_cfi = ?, last_read_at = ?, updated_at = ? WHERE id = ?',
        [50, null, expect.any(Number), expect.any(Number), '123']
      );
    });

    it('should throw error when book not found', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      const progress: ReadingProgress = {
        bookId: 'nonexistent',
        currentPage: 50,
        totalPages: 100,
        percentage: 50,
      };

      await expect(bookService.updateReadingProgress('nonexistent', progress)).rejects.toThrow(
        'Book not found'
      );
    });
  });

  describe('getReadingProgress', () => {
    it('should return reading progress for a book', async () => {
      const mockBook = {
        id: '123',
        title: 'Test Book',
        author: 'Test Author',
        file_path: '/path/test.pdf',
        file_type: 'pdf',
        cover_image_path: null,
        total_pages: 100,
        current_page: 25,
        last_read_at: Date.now(),
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      mockDb.executeQuery.mockResolvedValue([mockBook]);

      const progress = await bookService.getReadingProgress('123');

      expect(progress).toBeDefined();
      expect(progress?.bookId).toBe('123');
      expect(progress?.currentPage).toBe(25);
      expect(progress?.totalPages).toBe(100);
      expect(progress?.percentage).toBe(25);
    });

    it('should return null when book not found', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      const progress = await bookService.getReadingProgress('nonexistent');

      expect(progress).toBeNull();
    });

    it('should handle books without total pages', async () => {
      const mockBook = {
        id: '123',
        title: 'Test Book',
        author: 'Test Author',
        file_path: '/path/test.pdf',
        file_type: 'pdf',
        cover_image_path: null,
        total_pages: null,
        current_page: 25,
        last_read_at: Date.now(),
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      mockDb.executeQuery.mockResolvedValue([mockBook]);

      const progress = await bookService.getReadingProgress('123');

      expect(progress).toBeDefined();
      expect(progress?.totalPages).toBe(0);
      expect(progress?.percentage).toBe(0);
    });
  });
});
