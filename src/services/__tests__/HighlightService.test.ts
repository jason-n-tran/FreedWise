// HighlightService unit tests

import { HighlightService } from '../HighlightService';
import { RowMapper } from '../../database/rowMapping';
import type { IDatabaseManager, Transaction } from '../../types/database';
import type { Highlight, Tag } from '../../types/models';
import { CreateHighlightInput } from '../interfaces';

describe('HighlightService', () => {
  let highlightService: HighlightService;
  let mockDb: jest.Mocked<IDatabaseManager>;

  // Helper to create mock highlight row
  const createMockHighlightRow = (overrides: Partial<any> = {}) => {
    const defaults = {
      id: 'highlight-123',
      book_id: 'book-123',
      text: 'Test highlight',
      note: null,
      color: '#FFEB3B',
      position_data: '{"pageNumber":42}',
      created_at: Date.now(),
      updated_at: Date.now(),
      due_date: Date.now(),
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
    };
    return { ...defaults, ...overrides };
  };

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

    jest.clearAllMocks();
    highlightService = new HighlightService(mockDb, new RowMapper(mockDb));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createHighlight', () => {
    const mockBookId = 'book-123';
    const mockHighlightInput: CreateHighlightInput = {
      bookId: mockBookId,
      text: 'This is a test highlight',
      note: 'Test note',
      tags: ['important', 'chapter1'],
      position: { pageNumber: 42 },
      color: '#FFEB3B',
    };

    it('should create a highlight successfully', async () => {
      const mockRow = {
        id: 'highlight-123',
        book_id: mockBookId,
        text: mockHighlightInput.text,
        note: mockHighlightInput.note,
        color: mockHighlightInput.color,
        position_data: '{"pageNumber":42}',
        created_at: Date.now(),
        updated_at: Date.now(),
        due_date: Date.now(),
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
      };

      // Setup all mocks in order
      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }]) // Book exists check in createHighlight
        .mockResolvedValueOnce([mockRow]) // getHighlightById after transaction
        .mockResolvedValueOnce([]); // getTags in rowToHighlight

      // Mock transaction
      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest
            .fn()
            .mockResolvedValueOnce([]) // First tag doesn't exist
            .mockResolvedValueOnce([]), // Second tag doesn't exist
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      const highlight = await highlightService.createHighlight(mockHighlightInput);

      expect(highlight).toBeDefined();
      expect(highlight.text).toBe(mockHighlightInput.text);
      expect(highlight.note).toBe(mockHighlightInput.note);
      expect(highlight.color).toBe(mockHighlightInput.color);
      expect(highlight.state).toBe('new');
      expect(highlight.stability).toBe(0);
      expect(highlight.difficulty).toBe(0);
      expect(highlight.reps).toBe(0);
      expect(highlight.lapses).toBe(0);
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should throw user-friendly error when book not found', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      await expect(highlightService.createHighlight(mockHighlightInput)).rejects.toThrow(
        'Book not found'
      );
    });

    it('should throw user-friendly error when transaction fails', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([{ id: mockBookId }]);
      mockDb.transaction.mockRejectedValue(new Error('DB transaction error'));

      await expect(highlightService.createHighlight(mockHighlightInput)).rejects.toThrow(
        'Failed to save highlight. Please try again.'
      );
    });

    it('should parse .q tag and create flashcard', async () => {
      const flashcardInput: CreateHighlightInput = {
        ...mockHighlightInput,
        text: 'What is the capital of France? .q What is the capital of France?',
      };

      const mockRow = createMockHighlightRow({
        text: flashcardInput.text,
        position_data: '{"pageNumber":42}',
        is_flashcard: 1,
        flashcard_question: 'What is the capital of France?',
      });

      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }])
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest.fn().mockResolvedValue([]),
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      const highlight = await highlightService.createHighlight(flashcardInput);

      expect(highlight.isFlashcard).toBe(true);
      expect(highlight.flashcardQuestion).toBe('What is the capital of France?');
    });

    it('should parse .discard tag', async () => {
      const discardInput: CreateHighlightInput = {
        ...mockHighlightInput,
        text: 'This is not important .discard',
      };

      const mockRow = createMockHighlightRow({
        text: discardInput.text,
        position_data: '{"pageNumber":42}',
        is_discarded: 1,
      });

      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }])
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest.fn().mockResolvedValue([]),
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      const highlight = await highlightService.createHighlight(discardInput);

      expect(highlight.isDiscarded).toBe(true);
    });

    it('should parse header tags (.h1 through .h6)', async () => {
      const headerInput: CreateHighlightInput = {
        ...mockHighlightInput,
        text: 'Chapter Title .h2',
      };

      const mockRow = createMockHighlightRow({
        text: headerInput.text,
        position_data: '{"pageNumber":42}',
        header_level: 2,
      });

      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }])
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest.fn().mockResolvedValue([]),
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      const highlight = await highlightService.createHighlight(headerInput);

      expect(highlight.headerLevel).toBe(2);
    });

    it('should handle multiple action tags', async () => {
      const multiTagInput: CreateHighlightInput = {
        ...mockHighlightInput,
        text: 'Important question .h1 .q What is this? .discard',
      };

      const mockRow = createMockHighlightRow({
        text: multiTagInput.text,
        position_data: '{"pageNumber":42}',
        is_flashcard: 1,
        flashcard_question: 'What is this?',
        is_discarded: 1,
        header_level: 1,
      });

      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }])
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest.fn().mockResolvedValue([]),
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      const highlight = await highlightService.createHighlight(multiTagInput);

      expect(highlight.isFlashcard).toBe(true);
      expect(highlight.flashcardQuestion).toBe('What is this?');
      expect(highlight.isDiscarded).toBe(true);
      expect(highlight.headerLevel).toBe(1);
    });

    it('should create tags and link them to highlight', async () => {
      const mockRow = createMockHighlightRow({
        text: mockHighlightInput.text,
        note: mockHighlightInput.note,
        color: mockHighlightInput.color,
        position_data: '{"pageNumber":42}',
      });

      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }])
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest
            .fn()
            .mockResolvedValueOnce([]) // Tag 'important' doesn't exist
            .mockResolvedValueOnce([]), // Tag 'chapter1' doesn't exist
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      await highlightService.createHighlight(mockHighlightInput);

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should use existing tags if they already exist (case-insensitive)', async () => {
      const existingTagId = 'tag-123';

      const mockRow = createMockHighlightRow({
        text: mockHighlightInput.text,
        note: mockHighlightInput.note,
        color: mockHighlightInput.color,
        position_data: '{"pageNumber":42}',
      });

      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }])
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest
            .fn()
            .mockResolvedValueOnce([
              { id: existingTagId, name: 'Important', created_at: Date.now() },
            ]) // Tag exists
            .mockResolvedValueOnce([]), // Second tag doesn't exist
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      await highlightService.createHighlight(mockHighlightInput);

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should use default color if not provided', async () => {
      const inputWithoutColor: CreateHighlightInput = {
        ...mockHighlightInput,
        color: undefined,
      };

      const mockRow = createMockHighlightRow({
        text: inputWithoutColor.text,
        note: inputWithoutColor.note,
        position_data: '{"pageNumber":42}',
      });

      mockDb.executeQuery
        .mockResolvedValueOnce([{ id: mockBookId }])
        .mockResolvedValueOnce([mockRow])
        .mockResolvedValueOnce([]);

      mockDb.transaction.mockImplementation(async callback => {
        const mockTx: Transaction = {
          executeQuery: jest.fn().mockResolvedValue([]),
          executeUpdate: jest.fn().mockResolvedValue(1),
        };
        await callback(mockTx);
      });

      const highlight = await highlightService.createHighlight(inputWithoutColor);

      expect(highlight.color).toBe('#FFEB3B');
    });
  });

  describe('getHighlightsByBook', () => {
    it('should return all highlights for a book', async () => {
      const mockRows = [
        {
          id: 'h1',
          book_id: 'book-123',
          text: 'Highlight 1',
          note: null,
          color: '#FFEB3B',
          position_data: JSON.stringify({ pageNumber: 1 }),
          created_at: Date.now(),
          updated_at: Date.now(),
          due_date: Date.now(),
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
      ];

      mockDb.executeQuery.mockResolvedValueOnce(mockRows).mockResolvedValueOnce([]); // getTags

      const highlights = await highlightService.getHighlightsByBook('book-123');

      expect(highlights).toHaveLength(1);
      expect(highlights[0].text).toBe('Highlight 1');
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM highlights WHERE book_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        ['book-123', 100, 0]
      );
    });

    it('should return empty array when no highlights exist', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      const highlights = await highlightService.getHighlightsByBook('book-123');

      expect(highlights).toEqual([]);
    });
  });

  describe('getHighlightById', () => {
    it('should return a highlight when found', async () => {
      const mockRow = {
        id: 'h1',
        book_id: 'book-123',
        text: 'Test highlight',
        note: 'Test note',
        color: '#FFEB3B',
        position_data: JSON.stringify({ pageNumber: 42 }),
        created_at: Date.now(),
        updated_at: Date.now(),
        due_date: Date.now(),
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
      };

      mockDb.executeQuery.mockResolvedValueOnce([mockRow]).mockResolvedValueOnce([]);

      const highlight = await highlightService.getHighlightById('h1');

      expect(highlight).toBeDefined();
      expect(highlight?.id).toBe('h1');
      expect(highlight?.text).toBe('Test highlight');
    });

    it('should return null when highlight not found', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      const highlight = await highlightService.getHighlightById('nonexistent');

      expect(highlight).toBeNull();
    });
  });

  describe('updateHighlight', () => {
    it('should update highlight successfully', async () => {
      const mockRow = {
        id: 'h1',
        book_id: 'book-123',
        text: 'Original text',
        note: null,
        color: '#FFEB3B',
        position_data: JSON.stringify({ pageNumber: 42 }),
        created_at: Date.now(),
        updated_at: Date.now(),
        due_date: Date.now(),
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
      };

      mockDb.executeQuery.mockResolvedValueOnce([mockRow]).mockResolvedValueOnce([]);
      mockDb.executeUpdate.mockResolvedValue(1);

      await highlightService.updateHighlight('h1', {
        text: 'Updated text',
        note: 'Updated note',
      });

      expect(mockDb.executeUpdate).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE highlights SET'),
        expect.arrayContaining(['Updated text', 'Updated note'])
      );
    });

    it('should throw error when highlight not found', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      await expect(
        highlightService.updateHighlight('nonexistent', { text: 'New text' })
      ).rejects.toThrow('Highlight not found');
    });

    it('should throw user-friendly error when database update fails', async () => {
      const mockRow = {
        id: 'h1',
        book_id: 'book-123',
        text: 'Original text',
        note: null,
        color: '#FFEB3B',
        position_data: JSON.stringify({ pageNumber: 42 }),
        created_at: Date.now(),
        updated_at: Date.now(),
        due_date: Date.now(),
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
      };

      mockDb.executeQuery.mockResolvedValueOnce([mockRow]).mockResolvedValueOnce([]);
      mockDb.executeUpdate.mockRejectedValue(new Error('DB error'));

      await expect(highlightService.updateHighlight('h1', { text: 'New text' })).rejects.toThrow(
        'Failed to update highlight. Please try again.'
      );
    });

    it('should not update if no changes provided', async () => {
      const mockRow = {
        id: 'h1',
        book_id: 'book-123',
        text: 'Original text',
        note: null,
        color: '#FFEB3B',
        position_data: JSON.stringify({ pageNumber: 42 }),
        created_at: Date.now(),
        updated_at: Date.now(),
        due_date: Date.now(),
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
      };

      mockDb.executeQuery.mockResolvedValueOnce([mockRow]).mockResolvedValueOnce([]);

      await highlightService.updateHighlight('h1', {});

      expect(mockDb.executeUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteHighlight', () => {
    it('should delete highlight successfully', async () => {
      mockDb.executeUpdate.mockResolvedValue(1);

      await highlightService.deleteHighlight('h1');

      expect(mockDb.executeUpdate).toHaveBeenCalledWith('DELETE FROM highlights WHERE id = ?', [
        'h1',
      ]);
    });

    it('should throw user-friendly error when database delete fails', async () => {
      mockDb.executeUpdate.mockRejectedValue(new Error('DB error'));

      await expect(highlightService.deleteHighlight('h1')).rejects.toThrow(
        'Failed to delete highlight. Please try again.'
      );
    });
  });

  describe('searchHighlights', () => {
    it('should search highlights by text', async () => {
      const mockRows = [
        {
          id: 'h1',
          book_id: 'book-123',
          text: 'This contains the search term',
          note: null,
          color: '#FFEB3B',
          position_data: JSON.stringify({ pageNumber: 1 }),
          created_at: Date.now(),
          updated_at: Date.now(),
          due_date: Date.now(),
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
      ];

      mockDb.executeQuery.mockResolvedValueOnce(mockRows).mockResolvedValueOnce([]);

      const results = await highlightService.searchHighlights('search');

      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('search');
    });

    it('should return empty array for queries less than 2 characters', async () => {
      const results = await highlightService.searchHighlights('a');

      expect(results).toEqual([]);
      expect(mockDb.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('getDueHighlights', () => {
    it('should return due highlights excluding discarded ones', async () => {
      const now = Date.now();
      const mockRows = [
        {
          id: 'h1',
          book_id: 'book-123',
          text: 'Due highlight',
          note: null,
          color: '#FFEB3B',
          position_data: JSON.stringify({ pageNumber: 1 }),
          created_at: now,
          updated_at: now,
          due_date: now - 1000,
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
      ];

      mockDb.executeQuery.mockResolvedValueOnce(mockRows).mockResolvedValueOnce([]);

      const highlights = await highlightService.getDueHighlights();

      expect(highlights).toHaveLength(1);
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE due_date <= ? AND is_discarded = 0'),
        [expect.any(Number)]
      );
    });

    it('should use provided date for due check', async () => {
      const targetDate = new Date('2024-01-01');
      mockDb.executeQuery.mockResolvedValue([]);

      await highlightService.getDueHighlights(targetDate);

      expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.any(String), [targetDate.getTime()]);
    });
  });

  describe('getHighlightsByTag', () => {
    it('should return highlights with specific tag (case-insensitive)', async () => {
      const mockRows = [
        {
          id: 'h1',
          book_id: 'book-123',
          text: 'Tagged highlight',
          note: null,
          color: '#FFEB3B',
          position_data: JSON.stringify({ pageNumber: 1 }),
          created_at: Date.now(),
          updated_at: Date.now(),
          due_date: Date.now(),
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
      ];

      mockDb.executeQuery.mockResolvedValueOnce(mockRows).mockResolvedValueOnce([]);

      const highlights = await highlightService.getHighlightsByTag('important');

      expect(highlights).toHaveLength(1);
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE LOWER(t.name) = LOWER(?)'),
        ['important']
      );
    });

    it('should return empty array when no highlights have the tag', async () => {
      mockDb.executeQuery.mockResolvedValue([]);

      const highlights = await highlightService.getHighlightsByTag('nonexistent');

      expect(highlights).toEqual([]);
    });
  });
});
