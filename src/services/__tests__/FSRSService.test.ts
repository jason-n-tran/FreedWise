// FSRSService unit tests - focused on getReviewStats used by ReviewDashboard
// Requirements: 15.1, 15.2, 15.3, 15.4, 15.5

import { FSRSService } from '../FSRSService';
import type { IDatabaseManager } from '../../types/database';

describe('FSRSService.getReviewStats', () => {
  let service: FSRSService;
  let mockDb: jest.Mocked<IDatabaseManager>;

  beforeEach(() => {
    mockDb = {
      executeQuery: jest.fn(),
      executeUpdate: jest.fn(),
      transaction: jest.fn(),
      batchUpdate: jest.fn(),
      initialize: jest.fn(),
      close: jest.fn(),
    } as jest.Mocked<IDatabaseManager>;

    service = new FSRSService(mockDb);
  });

  it('returns zero stats when no highlights exist', async () => {
    mockDb.executeQuery.mockResolvedValue([]);

    const stats = await service.getReviewStats();

    expect(stats.totalCards).toBe(0);
    expect(stats.dueToday).toBe(0);
    expect(stats.newCards).toBe(0);
    expect(stats.learningCards).toBe(0);
    expect(stats.reviewCards).toBe(0);
    expect(stats.averageRetention).toBe(0);
  });

  it('counts totalCards correctly', async () => {
    mockDb.executeQuery.mockResolvedValue([
      { state: 'new', due_date: Date.now() - 1000, stability: 0 },
      { state: 'review', due_date: Date.now() - 1000, stability: 5 },
      { state: 'learning', due_date: Date.now() + 86400000, stability: 0 },
    ]);

    const stats = await service.getReviewStats();
    expect(stats.totalCards).toBe(3);
  });

  it('counts dueToday for cards with due_date <= end of today', async () => {
    const now = Date.now();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    mockDb.executeQuery.mockResolvedValue([
      { state: 'new', due_date: now - 1000, stability: 0 }, // overdue - due
      { state: 'review', due_date: todayEnd.getTime(), stability: 5 }, // end of today - due
      { state: 'learning', due_date: todayEnd.getTime() + 1, stability: 0 }, // tomorrow - not due
    ]);

    const stats = await service.getReviewStats();
    expect(stats.dueToday).toBe(2);
  });

  it('categorises new/learning/review cards correctly', async () => {
    mockDb.executeQuery.mockResolvedValue([
      { state: 'new', due_date: Date.now(), stability: 0 },
      { state: 'new', due_date: Date.now(), stability: 0 },
      { state: 'learning', due_date: Date.now(), stability: 0 },
      { state: 'relearning', due_date: Date.now(), stability: 0 },
      { state: 'review', due_date: Date.now(), stability: 3 },
    ]);

    const stats = await service.getReviewStats();
    expect(stats.newCards).toBe(2);
    expect(stats.learningCards).toBe(2); // learning + relearning
    expect(stats.reviewCards).toBe(1);
  });

  it('computes averageRetention as 0 when no cards have stability > 0', async () => {
    mockDb.executeQuery.mockResolvedValue([{ state: 'new', due_date: Date.now(), stability: 0 }]);

    const stats = await service.getReviewStats();
    expect(stats.averageRetention).toBe(0);
  });

  it('computes averageRetention between 0 and 1 for reviewed cards', async () => {
    mockDb.executeQuery.mockResolvedValue([
      { state: 'review', due_date: Date.now(), stability: 10 },
      { state: 'review', due_date: Date.now(), stability: 20 },
    ]);

    const stats = await service.getReviewStats();
    expect(stats.averageRetention).toBeGreaterThan(0);
    expect(stats.averageRetention).toBeLessThanOrEqual(1);
  });

  it('filters by bookId when provided', async () => {
    mockDb.executeQuery.mockResolvedValue([{ state: 'new', due_date: Date.now(), stability: 0 }]);

    await service.getReviewStats('book-123');

    expect(mockDb.executeQuery).toHaveBeenCalledWith(expect.stringContaining('book_id = ?'), [
      'book-123',
    ]);
  });

  it('does not filter by bookId when not provided', async () => {
    mockDb.executeQuery.mockResolvedValue([]);

    await service.getReviewStats();

    const [query, params] = mockDb.executeQuery.mock.calls[0];
    expect(query).not.toContain('book_id = ?');
    expect(params).toEqual([]);
  });
});

// Error handling tests - Requirements: 13.6
describe('FSRSService error handling (Req 13.6)', () => {
  let service: FSRSService;
  let mockDb: jest.Mocked<IDatabaseManager>;

  const highlightRow = {
    id: 'h1',
    book_id: 'b1',
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    last_reviewed_at: null,
    due_date: Date.now(),
  };

  beforeEach(() => {
    mockDb = {
      executeQuery: jest.fn(),
      executeUpdate: jest.fn(),
      transaction: jest.fn(),
      batchUpdate: jest.fn(),
      initialize: jest.fn(),
      close: jest.fn(),
    } as jest.Mocked<IDatabaseManager>;

    service = new FSRSService(mockDb);
  });

  describe('gradeCard fallback', () => {
    const fallbackDays: Record<string, number> = {
      again: 1,
      hard: 3,
      good: 7,
      easy: 14,
    };

    beforeEach(() => {
      mockDb.executeQuery.mockResolvedValue([highlightRow]);
      // Make the transaction succeed (review log still written)
      mockDb.transaction.mockImplementation(async fn => {
        await fn({
          executeUpdate: jest.fn().mockResolvedValue(1),
          executeQuery: jest.fn().mockResolvedValue([]),
        });
      });
      // Force FSRS scheduler to throw
      jest.spyOn(service['scheduler'], 'repeat').mockImplementation(() => {
        throw new Error('FSRS internal error');
      });
    });

    it.each(['again', 'hard', 'good', 'easy'] as const)(
      'uses fallback scheduling for grade "%s" and returns usedFallback=true',
      async grade => {
        // The grade persists; fallback is signalled via the result flag, not a throw.
        const result = await service.gradeCard('h1', grade);

        expect(result.usedFallback).toBe(true);
        expect(result.reviewLog.scheduledDays).toBe(fallbackDays[grade]);

        // due date should be ~fallbackDays from now
        const expectedMs = fallbackDays[grade] * 24 * 60 * 60 * 1000;
        expect(result.dueDate.getTime()).toBeGreaterThanOrEqual(Date.now() + expectedMs - 5000);
      }
    );

    it('still writes the review log to the database on fallback', async () => {
      await service.gradeCard('h1', 'good');
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('logs the error with console.error on fallback', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await service.gradeCard('h1', 'good');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[FSRSService]'), expect.any(Error));
      spy.mockRestore();
    });
  });

  describe('calculateNextReview fallback', () => {
    const fallbackDays: Record<string, number> = {
      again: 1,
      hard: 3,
      good: 7,
      easy: 14,
    };

    const card = {
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 'new' as const,
    };

    beforeEach(() => {
      jest.spyOn(service['scheduler'], 'repeat').mockImplementation(() => {
        throw new Error('FSRS internal error');
      });
    });

    it.each(['again', 'hard', 'good', 'easy'] as const)(
      'returns fallback result for grade "%s" without throwing',
      grade => {
        const result = service.calculateNextReview(card, grade);
        expect(result.reviewLog.scheduledDays).toBe(fallbackDays[grade]);
        const expectedMs = fallbackDays[grade] * 24 * 60 * 60 * 1000;
        expect(result.dueDate.getTime()).toBeGreaterThanOrEqual(Date.now() + expectedMs - 5000);
      }
    );

    it('logs the error with console.error on fallback', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      service.calculateNextReview(card, 'good');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[FSRSService]'), expect.any(Error));
      spy.mockRestore();
    });
  });
});
