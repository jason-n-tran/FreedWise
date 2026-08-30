// FSRSService implementation using ts-fsrs library

import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';
import type { Card as TSFSRSCard, Grade as TSFSRSGrade } from 'ts-fsrs';
import type { IFSRSService, SchedulingResult, ReviewStats } from './interfaces';
import type { Grade, FSRSCard, CardState } from '../types/models';
import type { IDatabaseManager } from '../types/database';
import type { HighlightRow } from '../database/rowMapping';

// Map our Grade type to ts-fsrs Rating enum
const gradeToRating: Record<Grade, TSFSRSGrade> = {
  again: Rating.Again as TSFSRSGrade,
  hard: Rating.Hard as TSFSRSGrade,
  good: Rating.Good as TSFSRSGrade,
  easy: Rating.Easy as TSFSRSGrade,
};

// Map ts-fsrs State enum to our CardState type
const stateToCardState: Record<number, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

// Map our CardState to ts-fsrs State enum
const cardStateToState: Record<CardState, number> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

export class FSRSService implements IFSRSService {
  private db: IDatabaseManager;
  private scheduler = fsrs();

  // In-memory cache for FSRS card parameters during a review session (Req 11.4)
  private cardCache = new Map<string, HighlightRow>();
  // Preloaded queue of upcoming card IDs (Req 11.4)
  private preloadQueue: string[] = [];
  private static readonly PRELOAD_SIZE = 5;

  constructor(databaseManager: IDatabaseManager) {
    this.db = databaseManager;
  }

  /**
   * Fallback scheduling days when FSRS calculation fails.
   * Requirements: 13.6
   */
  private readonly fallbackDays: Record<Grade, number> = {
    again: 1,
    hard: 3,
    good: 7,
    easy: 14,
  };

  /**
   * Build a fallback SchedulingResult when FSRS calculation fails.
   * Requirements: 13.6
   */
  private buildFallbackResult(
    highlightId: string,
    grade: Grade,
    now: Date,
    elapsedDays: number
  ): { card: FSRSCard; dueDate: Date; scheduledDays: number; logId: string } {
    const scheduledDays = this.fallbackDays[grade];
    const dueDate = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);
    return {
      card: {
        stability: 0,
        difficulty: 0,
        elapsedDays,
        scheduledDays,
        reps: 0,
        lapses: 0,
        state: 'new',
        lastReview: now,
      },
      dueDate,
      scheduledDays,
      logId: this.generateUUID(),
    };
  }

  /**
   * Preload the next N card IDs into the in-memory queue for fast access.
   * Call this at the start of a review session. (Req 11.4)
   */
  async preloadNextCards(date?: Date): Promise<void> {
    const targetDate = date ? date.getTime() : Date.now();
    const rows = await this.db.executeQuery<HighlightRow>(
      `SELECT * FROM highlights
       WHERE due_date <= ? AND is_discarded = 0
       ORDER BY due_date ASC
       LIMIT ?`,
      [targetDate, FSRSService.PRELOAD_SIZE]
    );
    this.cardCache.clear();
    this.preloadQueue = [];
    for (const row of rows) {
      this.cardCache.set(row.id, row);
      this.preloadQueue.push(row.id);
    }
  }

  /**
   * Clear the in-memory card cache (call when session ends). (Req 11.4)
   */
  clearCache(): void {
    this.cardCache.clear();
    this.preloadQueue = [];
  }

  /**
   * Grade a card and update FSRS parameters in the database.
   * Implements Algorithm 4 from design document.
   * Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 13.6
   */
  async gradeCard(highlightId: string, grade: Grade): Promise<SchedulingResult> {
    // Step 1: Fetch current highlight — use cache if available (Req 11.4)
    let highlight = this.cardCache.get(highlightId);
    if (!highlight) {
      const rows = await this.db.executeQuery<HighlightRow>(
        'SELECT * FROM highlights WHERE id = ?',
        [highlightId]
      );
      if (rows.length === 0) {
        throw new Error('Highlight not found');
      }
      highlight = rows[0];
    }

    // Evict from cache after reading (card will be rescheduled)
    this.cardCache.delete(highlightId);
    this.preloadQueue = this.preloadQueue.filter(id => id !== highlightId);

    // Step 2: Build FSRS card from highlight fields
    const fsrsCard = this.buildTSFSRSCard(highlight);

    // Step 3: Calculate elapsed days since last review
    const now = new Date();
    const elapsedDays = highlight.last_reviewed_at
      ? Math.floor((now.getTime() - highlight.last_reviewed_at) / (1000 * 60 * 60 * 24))
      : 0;

    // Step 4: Use ts-fsrs to calculate next review, with fallback on error
    let nextCard: TSFSRSCard;
    let nextDueDate: Date;
    let nextCardState: CardState;
    let scheduledDays: number;
    let usedFallback = false;

    try {
      const schedulingCards = this.scheduler.repeat(fsrsCard, now);
      const rating = gradeToRating[grade];
      const scheduled = schedulingCards[rating];
      nextCard = scheduled.card;
      nextDueDate = nextCard.due;
      nextCardState = stateToCardState[nextCard.state] ?? 'new';
      scheduledDays = nextCard.scheduled_days;
    } catch (err) {
      console.error('[FSRSService] FSRS calculation failed in gradeCard, using fallback:', err);
      usedFallback = true;
      const fallback = this.buildFallbackResult(highlightId, grade, now, elapsedDays);
      nextCard = {
        stability: 0,
        difficulty: 0,
        elapsed_days: elapsedDays,
        scheduled_days: fallback.scheduledDays,
        reps: 0,
        lapses: 0,
        state: State.New,
        last_review: now,
        due: fallback.dueDate,
      } as TSFSRSCard;
      nextDueDate = fallback.dueDate;
      nextCardState = 'new';
      scheduledDays = fallback.scheduledDays;
    }

    // Step 5: Update highlight and create review log in transaction
    const logId = this.generateUUID();
    const nowMs = now.getTime();

    await this.db.transaction(async tx => {
      // Update highlight FSRS parameters
      await tx.executeUpdate(
        `UPDATE highlights SET
          stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
          reps = ?, lapses = ?, state = ?, last_reviewed_at = ?, due_date = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          nextCard.stability,
          nextCard.difficulty,
          elapsedDays,
          scheduledDays,
          nextCard.reps,
          nextCard.lapses,
          nextCardState,
          nowMs,
          nextDueDate.getTime(),
          nowMs,
          highlightId,
        ]
      );

      // Insert review log
      await tx.executeUpdate(
        'INSERT INTO review_logs (id, highlight_id, grade, reviewed_at, elapsed_days, scheduled_days, state) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [logId, highlightId, grade, nowMs, elapsedDays, scheduledDays, nextCardState]
      );
    });

    // Step 6: Build and return result. When fallback scheduling was used the
    // grade still persisted; we flag it via usedFallback rather than throwing,
    // so callers can show a soft warning instead of an error. (Req 13.6)
    const result: SchedulingResult = {
      card: {
        stability: nextCard.stability,
        difficulty: nextCard.difficulty,
        elapsedDays,
        scheduledDays,
        reps: nextCard.reps,
        lapses: nextCard.lapses,
        state: nextCardState,
        lastReview: now,
      },
      dueDate: nextDueDate,
      reviewLog: {
        id: logId,
        highlightId,
        grade,
        reviewedAt: now,
        elapsedDays,
        scheduledDays,
        state: nextCardState,
      },
      usedFallback,
    };

    return result;
  }

  /**
   * Batch grade multiple cards and persist all updates in a single transaction.
   * More efficient than calling gradeCard() repeatedly. (Req 11.4)
   */
  async batchGradeCards(
    grades: { highlightId: string; grade: Grade }[]
  ): Promise<SchedulingResult[]> {
    if (grades.length === 0) return [];

    const results: SchedulingResult[] = [];
    const dbOps: { sql: string; params: any[] }[] = [];
    const now = new Date();
    const nowMs = now.getTime();

    for (const { highlightId, grade } of grades) {
      let highlight = this.cardCache.get(highlightId);
      if (!highlight) {
        const rows = await this.db.executeQuery<HighlightRow>(
          'SELECT * FROM highlights WHERE id = ?',
          [highlightId]
        );
        if (rows.length === 0) continue;
        highlight = rows[0];
      }
      this.cardCache.delete(highlightId);

      const fsrsCard = this.buildTSFSRSCard(highlight);
      const elapsedDays = highlight.last_reviewed_at
        ? Math.floor((nowMs - highlight.last_reviewed_at) / (1000 * 60 * 60 * 24))
        : 0;

      let nextCard: TSFSRSCard;
      let nextDueDate: Date;
      let nextCardState: CardState;
      let scheduledDays: number;

      try {
        const schedulingCards = this.scheduler.repeat(fsrsCard, now);
        const rating = gradeToRating[grade];
        const scheduled = schedulingCards[rating];
        nextCard = scheduled.card;
        nextDueDate = nextCard.due;
        nextCardState = stateToCardState[nextCard.state] ?? 'new';
        scheduledDays = nextCard.scheduled_days;
      } catch {
        scheduledDays = this.fallbackDays[grade];
        nextDueDate = new Date(nowMs + scheduledDays * 24 * 60 * 60 * 1000);
        nextCardState = 'new';
        nextCard = {
          stability: 0,
          difficulty: 0,
          elapsed_days: elapsedDays,
          scheduled_days: scheduledDays,
          reps: 0,
          lapses: 0,
          state: State.New,
          last_review: now,
          due: nextDueDate,
        } as TSFSRSCard;
      }

      const logId = this.generateUUID();

      dbOps.push({
        sql: `UPDATE highlights SET stability=?,difficulty=?,elapsed_days=?,scheduled_days=?,reps=?,lapses=?,state=?,last_reviewed_at=?,due_date=?,updated_at=? WHERE id=?`,
        params: [
          nextCard.stability,
          nextCard.difficulty,
          elapsedDays,
          scheduledDays,
          nextCard.reps,
          nextCard.lapses,
          nextCardState,
          nowMs,
          nextDueDate.getTime(),
          nowMs,
          highlightId,
        ],
      });
      dbOps.push({
        sql: `INSERT INTO review_logs (id,highlight_id,grade,reviewed_at,elapsed_days,scheduled_days,state) VALUES (?,?,?,?,?,?,?)`,
        params: [logId, highlightId, grade, nowMs, elapsedDays, scheduledDays, nextCardState],
      });

      results.push({
        card: {
          stability: nextCard.stability,
          difficulty: nextCard.difficulty,
          elapsedDays,
          scheduledDays,
          reps: nextCard.reps,
          lapses: nextCard.lapses,
          state: nextCardState,
          lastReview: now,
        },
        dueDate: nextDueDate,
        reviewLog: {
          id: logId,
          highlightId,
          grade,
          reviewedAt: now,
          elapsedDays,
          scheduledDays,
          state: nextCardState,
        },
      });
    }

    // Persist all updates in one transaction (Req 11.4)
    await this.db.batchUpdate(dbOps);
    return results;
  }

  /**
   * Calculate the next review schedule for a card without persisting.
   * Requirements: 5.5, 5.6, 13.6
   */
  calculateNextReview(card: FSRSCard, grade: Grade): SchedulingResult {
    const now = new Date();
    const elapsedDays = card.lastReview
      ? Math.floor((now.getTime() - card.lastReview.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    try {
      const tsCard = this.fsrsCardToTSFSRS(card);
      const schedulingCards = this.scheduler.repeat(tsCard, now);

      const rating = gradeToRating[grade];
      const scheduled = schedulingCards[rating];
      const nextCard = scheduled.card;
      const nextDueDate = nextCard.due;
      const nextCardState = stateToCardState[nextCard.state] ?? 'new';

      return {
        card: {
          stability: nextCard.stability,
          difficulty: nextCard.difficulty,
          elapsedDays,
          scheduledDays: nextCard.scheduled_days,
          reps: nextCard.reps,
          lapses: nextCard.lapses,
          state: nextCardState,
          lastReview: now,
        },
        dueDate: nextDueDate,
        reviewLog: {
          id: this.generateUUID(),
          highlightId: '',
          grade,
          reviewedAt: now,
          elapsedDays,
          scheduledDays: nextCard.scheduled_days,
          state: nextCardState,
        },
      };
    } catch (err) {
      console.error(
        '[FSRSService] FSRS calculation failed in calculateNextReview, using fallback:',
        err
      );
      const scheduledDays = this.fallbackDays[grade];
      const dueDate = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);

      return {
        card: {
          stability: 0,
          difficulty: 0,
          elapsedDays,
          scheduledDays,
          reps: 0,
          lapses: 0,
          state: 'new',
          lastReview: now,
        },
        dueDate,
        reviewLog: {
          id: this.generateUUID(),
          highlightId: '',
          grade,
          reviewedAt: now,
          elapsedDays,
          scheduledDays,
          state: 'new',
        },
      };
    }
  }

  /**
   * Reset all FSRS parameters for a highlight back to defaults.
   * Requirements: 5.10
   */
  async resetCard(highlightId: string): Promise<void> {
    const now = Date.now();

    const changes = await this.db.executeUpdate(
      `UPDATE highlights SET
        stability = 0, difficulty = 0, elapsed_days = 0, scheduled_days = 0,
        reps = 0, lapses = 0, state = 'new', last_reviewed_at = NULL,
        due_date = ?, updated_at = ?
      WHERE id = ?`,
      [now, now, highlightId]
    );

    if (changes === 0) {
      throw new Error('Highlight not found');
    }
  }

  /**
   * Get review statistics, optionally filtered by book.
   * Requirements: 5.11
   */
  async getReviewStats(bookId?: string): Promise<ReviewStats> {
    const now = Date.now();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const whereClause = bookId
      ? 'WHERE book_id = ? AND is_discarded = 0'
      : 'WHERE is_discarded = 0';
    const params = bookId ? [bookId] : [];

    const rows = await this.db.executeQuery<{
      state: string;
      due_date: number;
      stability: number;
    }>(`SELECT state, due_date, stability FROM highlights ${whereClause}`, params);

    let totalCards = rows.length;
    let dueToday = 0;
    let newCards = 0;
    let learningCards = 0;
    let reviewCards = 0;
    let totalStability = 0;
    let reviewedCount = 0;

    for (const row of rows) {
      if (row.due_date <= todayEnd.getTime()) {
        dueToday++;
      }
      if (row.state === 'new') newCards++;
      else if (row.state === 'learning' || row.state === 'relearning') learningCards++;
      else if (row.state === 'review') reviewCards++;

      if (row.stability > 0) {
        // Approximate retention using forgetting curve: R = e^(-t/S)
        const daysSinceReview = Math.max(0, (now - row.due_date) / (1000 * 60 * 60 * 24));
        const retention = Math.exp(-daysSinceReview / row.stability);
        totalStability += retention;
        reviewedCount++;
      }
    }

    const averageRetention = reviewedCount > 0 ? totalStability / reviewedCount : 0;

    return {
      totalCards,
      dueToday,
      newCards,
      learningCards,
      reviewCards,
      averageRetention,
    };
  }

  /**
   * Build a ts-fsrs Card from a highlight database row.
   */
  private buildTSFSRSCard(row: HighlightRow): TSFSRSCard {
    const empty = createEmptyCard();
    return {
      ...empty,
      stability: row.stability,
      difficulty: row.difficulty,
      elapsed_days: row.elapsed_days,
      scheduled_days: row.scheduled_days,
      reps: row.reps,
      lapses: row.lapses,
      state: cardStateToState[row.state as CardState] ?? State.New,
      last_review: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
      due: row.due_date ? new Date(row.due_date) : new Date(),
    };
  }

  /**
   * Convert our FSRSCard model to a ts-fsrs Card.
   */
  private fsrsCardToTSFSRS(card: FSRSCard): TSFSRSCard {
    const empty = createEmptyCard();
    return {
      ...empty,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      state: cardStateToState[card.state] ?? State.New,
      last_review: card.lastReview,
      due: card.lastReview ?? new Date(),
    };
  }

  /**
   * Generate a UUID v4.
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
