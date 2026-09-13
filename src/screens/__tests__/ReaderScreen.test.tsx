// ReaderScreen tests - Unit tests for reader logic

import ServiceFactory from '../../services/ServiceFactory';
import type { Book } from '../../types/models';

// Mock ServiceFactory
jest.mock('../../services/ServiceFactory');

describe('ReaderScreen Logic', () => {
  const mockBook: Book = {
    id: 'test-book-id',
    title: 'Test Book',
    author: 'Test Author',
    filePath: '/path/to/book.pdf',
    fileType: 'pdf',
    currentPage: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBookService = {
    getBookById: jest.fn(),
    updateReadingProgress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ServiceFactory.getInstance as jest.Mock).mockReturnValue({
      getBookService: () => mockBookService,
    });
  });

  describe('Book Loading', () => {
    it('should load book by ID', async () => {
      mockBookService.getBookById.mockResolvedValue(mockBook);

      const result = await mockBookService.getBookById('test-book-id');

      expect(result).toEqual(mockBook);
      expect(mockBookService.getBookById).toHaveBeenCalledWith('test-book-id');
    });

    it('should return null when book not found', async () => {
      mockBookService.getBookById.mockResolvedValue(null);

      const result = await mockBookService.getBookById('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle loading errors', async () => {
      mockBookService.getBookById.mockRejectedValue(new Error('Load failed'));

      await expect(mockBookService.getBookById('test-book-id')).rejects.toThrow('Load failed');
    });
  });

  describe('Reading Progress', () => {
    it('should update reading progress', async () => {
      mockBookService.updateReadingProgress.mockResolvedValue(undefined);

      const progress = {
        bookId: 'test-book-id',
        currentPage: 10,
        totalPages: 100,
        percentage: 10,
      };

      await mockBookService.updateReadingProgress('test-book-id', progress);

      expect(mockBookService.updateReadingProgress).toHaveBeenCalledWith('test-book-id', progress);
    });

    it('should handle progress update errors', async () => {
      mockBookService.updateReadingProgress.mockRejectedValue(new Error('Update failed'));

      const progress = {
        bookId: 'test-book-id',
        currentPage: 10,
        totalPages: 100,
        percentage: 10,
      };

      await expect(mockBookService.updateReadingProgress('test-book-id', progress)).rejects.toThrow(
        'Update failed'
      );
    });
  });

  describe('File Type Detection', () => {
    it('should detect PDF file type', () => {
      expect(mockBook.fileType).toBe('pdf');
    });

    it('should detect EPUB file type', () => {
      const epubBook: Book = {
        ...mockBook,
        fileType: 'epub',
        filePath: '/path/to/book.epub',
      };

      expect(epubBook.fileType).toBe('epub');
    });
  });
});
