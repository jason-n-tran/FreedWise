// HighlightService implementation for highlight management

import { IHighlightService, CreateHighlightInput } from './interfaces';
import type { Highlight, CardState } from '../types/models';
import type { IDatabaseManager } from '../types/database';
import { RowMapper, type HighlightRow, type TagRow } from '../database/rowMapping';
import { validateHighlight, validateTag, ValidationError } from '../utils/validation';

interface ActionTagResult {
  isFlashcard: boolean;
  question: string | null;
  isDiscarded: boolean;
  headerLevel: number | null;
}

export class HighlightService implements IHighlightService {
  private db: IDatabaseManager;
  private mapper: RowMapper;

  constructor(databaseManager: IDatabaseManager, rowMapper: RowMapper) {
    this.db = databaseManager;
    this.mapper = rowMapper;
  }

  /**
   * Create a new highlight with action tag parsing and FSRS initialization
   * Implements Algorithm 2 from design document
   * Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 5.1
   */
  async createHighlight(data: CreateHighlightInput): Promise<Highlight> {
    // Step 1: Verify book exists
    const bookRows = await this.db.executeQuery<{ id: string }>(
      'SELECT id FROM books WHERE id = ?',
      [data.bookId]
    );

    if (bookRows.length === 0) {
      throw new Error('Book not found');
    }

    // Step 2: Parse action tags from text
    const actionTags = this.parseActionTags(data.text);

    // Step 3: Initialize FSRS parameters
    const now = Date.now();
    const fsrsParams = {
      dueDate: new Date(now),
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 'new' as CardState,
      lastReviewedAt: undefined,
    };

    // Step 4: Create highlight record
    const highlightId = this.generateUUID();
    const color = data.color || '#FFEB3B';
    const positionJson = JSON.stringify(data.position);

    // Validate highlight data
    const highlightToValidate: Partial<Highlight> = {
      text: data.text,
      note: data.note,
      color,
      position: data.position,
      ...fsrsParams,
      isFlashcard: actionTags.isFlashcard,
      isDiscarded: actionTags.isDiscarded,
      headerLevel: actionTags.headerLevel ?? undefined,
    };
    validateHighlight(highlightToValidate);

    // Step 5: Insert highlight and tags in transaction
    try {
      await this.db.transaction(async tx => {
        // Insert highlight
        await tx.executeUpdate(
          `INSERT INTO highlights (
            id, book_id, text, note, color, position_data, created_at, updated_at,
            due_date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses,
            state, last_reviewed_at, is_flashcard, flashcard_question, is_discarded, header_level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            highlightId,
            data.bookId,
            data.text,
            data.note || null,
            color,
            positionJson,
            now,
            now,
            now, // due_date
            fsrsParams.stability,
            fsrsParams.difficulty,
            fsrsParams.elapsedDays,
            fsrsParams.scheduledDays,
            fsrsParams.reps,
            fsrsParams.lapses,
            fsrsParams.state,
            null, // last_reviewed_at
            actionTags.isFlashcard ? 1 : 0,
            actionTags.question,
            actionTags.isDiscarded ? 1 : 0,
            actionTags.headerLevel,
          ]
        );

        // Insert tags
        for (const tagName of data.tags) {
          // Validate tag name
          validateTag({ name: tagName });

          // Get or create tag (case-insensitive)
          const tagId = await this.getOrCreateTag(tx, tagName);

          // Link highlight to tag
          await tx.executeUpdate(
            'INSERT INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)',
            [highlightId, tagId]
          );
        }
      });
    } catch (error) {
      console.error('HighlightService.createHighlight: transaction failed', error);
      throw new Error('Failed to save highlight. Please try again.');
    }

    // Fetch and return the created highlight
    const highlight = await this.getHighlightById(highlightId);
    if (!highlight) {
      throw new Error('Failed to retrieve created highlight');
    }

    return highlight;
  }

  /**
   * Get all highlights for a specific book with optional pagination
   * Requirement: 3.4, 11.7
   */
  async getHighlightsByBook(bookId: string, limit = 100, offset = 0): Promise<Highlight[]> {
    const rows = await this.db.executeQuery<HighlightRow>(
      'SELECT * FROM highlights WHERE book_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [bookId, limit, offset]
    );

    return this.mapper.toHighlights(rows);
  }

  /**
   * Get a specific highlight by ID
   * Requirement: 3.5
   */
  async getHighlightById(id: string): Promise<Highlight | null> {
    const rows = await this.db.executeQuery<HighlightRow>('SELECT * FROM highlights WHERE id = ?', [
      id,
    ]);

    if (rows.length === 0) {
      return null;
    }

    return this.mapper.toHighlight(rows[0]);
  }

  /**
   * Update an existing highlight
   * Requirement: 3.5
   */
  async updateHighlight(id: string, updates: Partial<Highlight>): Promise<void> {
    const existing = await this.getHighlightById(id);
    if (!existing) {
      throw new Error('Highlight not found');
    }

    const now = Date.now();
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (updates.text !== undefined) {
      updateFields.push('text = ?');
      updateValues.push(updates.text);
    }
    if (updates.note !== undefined) {
      updateFields.push('note = ?');
      updateValues.push(updates.note);
    }
    if (updates.color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(updates.color);
    }
    if (updates.position !== undefined) {
      updateFields.push('position_data = ?');
      updateValues.push(JSON.stringify(updates.position));
    }

    if (updateFields.length === 0) {
      return; // No updates to perform
    }

    // Validate updates
    validateHighlight(updates);

    updateFields.push('updated_at = ?');
    updateValues.push(now);
    updateValues.push(id);

    try {
      await this.db.executeUpdate(
        `UPDATE highlights SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    } catch (error) {
      console.error('HighlightService.updateHighlight: database update failed', error);
      throw new Error('Failed to update highlight. Please try again.');
    }
  }

  /**
   * Delete a highlight
   * Requirement: 3.5
   */
  async deleteHighlight(id: string): Promise<void> {
    try {
      await this.db.executeUpdate('DELETE FROM highlights WHERE id = ?', [id]);
    } catch (error) {
      console.error('HighlightService.deleteHighlight: database delete failed', error);
      throw new Error('Failed to delete highlight. Please try again.');
    }
  }

  /**
   * Search highlights by text content
   * Requirement: 7.1, 7.2, 7.3
   */
  async searchHighlights(query: string): Promise<Highlight[]> {
    // Requirement 7.2: Return empty if query is less than 2 characters
    if (query.length < 2) {
      return [];
    }

    // Requirement 7.3: Case-insensitive search
    const searchPattern = `%${query}%`;
    const rows = await this.db.executeQuery<HighlightRow>(
      `SELECT * FROM highlights 
       WHERE text LIKE ? OR note LIKE ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [searchPattern, searchPattern]
    );

    return this.mapper.toHighlights(rows);
  }

  /**
   * Get highlights due for review
   * Implements Algorithm 5 from design document
   * Requirements: 5.12, 5.13
   */
  async getDueHighlights(date?: Date): Promise<Highlight[]> {
    const targetDate = date ? date.getTime() : Date.now();

    // Requirement 5.13: Exclude discarded highlights
    const rows = await this.db.executeQuery<HighlightRow>(
      `SELECT * FROM highlights 
       WHERE due_date <= ? AND is_discarded = 0
       ORDER BY due_date ASC`,
      [targetDate]
    );

    return this.mapper.toHighlights(rows);
  }

  /**
   * Get highlights by tag name
   * Requirements: 4.7
   */
  async getHighlightsByTag(tagName: string): Promise<Highlight[]> {
    const rows = await this.db.executeQuery<HighlightRow>(
      `SELECT h.* FROM highlights h
       INNER JOIN highlight_tags ht ON h.id = ht.highlight_id
       INNER JOIN tags t ON ht.tag_id = t.id
       WHERE LOWER(t.name) = LOWER(?)
       ORDER BY h.created_at DESC`,
      [tagName]
    );

    return this.mapper.toHighlights(rows);
  }

  /**
   * Parse action tags from highlight text
   * Implements Algorithm 3 from design document
   * Requirements: 3.7, 3.8, 3.9, 14.1-14.7
   */
  private parseActionTags(text: string): ActionTagResult {
    const result: ActionTagResult = {
      isFlashcard: false,
      question: null,
      isDiscarded: false,
      headerLevel: null,
    };

    // Requirement 14.3: Check for .discard tag
    if (text.includes('.discard')) {
      result.isDiscarded = true;
    }

    // Requirements 14.1, 14.2: Check for .q tag (flashcard)
    // Pattern: .q followed by whitespace and text, ending at next period or end of string
    const qTagPattern = /\.q\s+(.+?)(?=\.|$)/s;
    const qMatch = text.match(qTagPattern);
    if (qMatch) {
      result.isFlashcard = true;
      result.question = qMatch[1].trim();
    }

    // Requirements 14.4, 14.5: Check for header tags (.h1 through .h6)
    for (let level = 1; level <= 6; level++) {
      const headerPattern = `.h${level}`;
      if (text.includes(headerPattern)) {
        result.headerLevel = level;
        break; // First match wins
      }
    }

    return result;
  }

  /**
   * Get or create a tag by name (case-insensitive)
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  private async getOrCreateTag(
    tx: {
      executeQuery: <T>(sql: string, params?: any[]) => Promise<T[]>;
      executeUpdate: (sql: string, params?: any[]) => Promise<number>;
    },
    tagName: string
  ): Promise<string> {
    // Requirement 4.2: Case-insensitive uniqueness
    const existingTags = await tx.executeQuery<TagRow>(
      'SELECT * FROM tags WHERE LOWER(name) = LOWER(?)',
      [tagName]
    );

    if (existingTags.length > 0) {
      return existingTags[0].id;
    }

    // Create new tag
    const tagId = this.generateUUID();
    const now = Date.now();
    await tx.executeUpdate('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)', [
      tagId,
      tagName,
      now,
    ]);

    return tagId;
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
