// Validation utilities for Freedwise Reader data models

import type {
  Book,
  Highlight,
  Tag,
  ReviewLog,
  FSRSCard,
  CardState,
  Grade,
  FileType,
  HighlightPosition,
} from '../types/models';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Validation constants
const MAX_TITLE_LENGTH = 500;
const MAX_HIGHLIGHT_TEXT_LENGTH = 10000;
const MAX_NOTE_LENGTH = 5000;
const MAX_TAG_NAME_LENGTH = 100;
const TAG_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const VALID_FILE_TYPES: FileType[] = ['pdf', 'epub'];
const VALID_CARD_STATES: CardState[] = ['new', 'learning', 'review', 'relearning'];
const VALID_GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

// Book validation (Requirements 9.1, 9.2, 9.3, 9.4)
export function validateBook(book: Partial<Book>): void {
  // Requirement 9.1: title must be non-empty and less than 500 characters
  if (!book.title || book.title.trim().length === 0) {
    throw new ValidationError('Book title must be non-empty');
  }
  if (book.title.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`Book title must be less than ${MAX_TITLE_LENGTH} characters`);
  }

  // Requirement 9.2: file_path must point to an existing file (path validation only)
  if (!book.filePath || book.filePath.trim().length === 0) {
    throw new ValidationError('Book file path must be non-empty');
  }

  // Requirement 9.3: file_type must be either 'pdf' or 'epub'
  if (!book.fileType || !VALID_FILE_TYPES.includes(book.fileType)) {
    throw new ValidationError(`Book file type must be one of: ${VALID_FILE_TYPES.join(', ')}`);
  }

  // Additional validation: total_pages must be > 0 if present
  if (book.totalPages !== undefined && book.totalPages <= 0) {
    throw new ValidationError('Book total pages must be greater than 0');
  }

  // Requirement 9.4: current_page must be between 0 and total_pages
  if (book.currentPage !== undefined) {
    if (book.currentPage < 0) {
      throw new ValidationError('Book current page must be greater than or equal to 0');
    }
    if (book.totalPages !== undefined && book.currentPage > book.totalPages) {
      throw new ValidationError('Book current page must be less than or equal to total pages');
    }
  }
}

// Highlight validation (Requirements 9.5, 9.6, 9.7, 9.8, 9.9, 9.10)
export function validateHighlight(highlight: Partial<Highlight>): void {
  // Requirement 9.5: text must be non-empty and less than 10,000 characters
  if (!highlight.text || highlight.text.trim().length === 0) {
    throw new ValidationError('Highlight text must be non-empty');
  }
  if (highlight.text.length > MAX_HIGHLIGHT_TEXT_LENGTH) {
    throw new ValidationError(
      `Highlight text must be less than ${MAX_HIGHLIGHT_TEXT_LENGTH} characters`
    );
  }

  // Requirement 9.6: note must be less than 5,000 characters if present
  if (highlight.note !== undefined && highlight.note.length > MAX_NOTE_LENGTH) {
    throw new ValidationError(`Highlight note must be less than ${MAX_NOTE_LENGTH} characters`);
  }

  // Requirement 9.7: color must be a valid hexadecimal color code
  if (highlight.color && !HEX_COLOR_PATTERN.test(highlight.color)) {
    throw new ValidationError(
      'Highlight color must be a valid hexadecimal color code (e.g., #FFEB3B)'
    );
  }

  // Requirement 9.8: position_data must contain either pageNumber or cfi
  if (highlight.position) {
    validateHighlightPosition(highlight.position);
  }

  // Requirement 9.9: stability must be greater than or equal to 0
  if (highlight.stability !== undefined && highlight.stability < 0) {
    throw new ValidationError('Highlight stability must be greater than or equal to 0');
  }

  // Requirement 9.10: difficulty must be between 0 and 10
  if (highlight.difficulty !== undefined) {
    if (highlight.difficulty < 0 || highlight.difficulty > 10) {
      throw new ValidationError('Highlight difficulty must be between 0 and 10');
    }
  }

  // Additional FSRS parameter validations
  if (highlight.reps !== undefined && highlight.reps < 0) {
    throw new ValidationError('Highlight reps must be greater than or equal to 0');
  }

  if (highlight.lapses !== undefined && highlight.lapses < 0) {
    throw new ValidationError('Highlight lapses must be greater than or equal to 0');
  }

  if (highlight.state && !VALID_CARD_STATES.includes(highlight.state)) {
    throw new ValidationError(`Highlight state must be one of: ${VALID_CARD_STATES.join(', ')}`);
  }

  if (highlight.headerLevel !== undefined) {
    if (highlight.headerLevel < 1 || highlight.headerLevel > 6) {
      throw new ValidationError('Highlight header level must be between 1 and 6');
    }
  }
}

// Highlight position validation
export function validateHighlightPosition(position: HighlightPosition): void {
  if (!position.pageNumber && !position.cfi) {
    throw new ValidationError('Highlight position must contain either pageNumber or cfi');
  }

  if (position.pageNumber !== undefined && position.pageNumber < 0) {
    throw new ValidationError('Highlight page number must be greater than or equal to 0');
  }

  if (position.cfi !== undefined && position.cfi.trim().length === 0) {
    throw new ValidationError('Highlight CFI must be non-empty if provided');
  }
}

// Tag validation (Requirements 9.11, 9.12)
export function validateTag(tag: Partial<Tag>): void {
  // Requirement 9.11: name must match pattern: alphanumeric, underscore, hyphen only
  if (!tag.name || tag.name.trim().length === 0) {
    throw new ValidationError('Tag name must be non-empty');
  }

  if (tag.name.length > MAX_TAG_NAME_LENGTH) {
    throw new ValidationError(`Tag name must be less than ${MAX_TAG_NAME_LENGTH} characters`);
  }

  if (!TAG_NAME_PATTERN.test(tag.name)) {
    throw new ValidationError(
      'Tag name must contain only alphanumeric characters, underscores, and hyphens'
    );
  }

  // Requirement 9.12: name must be unique (case-insensitive)
  // Note: Uniqueness check must be performed at the database/service layer
}

// ReviewLog validation (Requirement 9.13)
export function validateReviewLog(log: Partial<ReviewLog>): void {
  // Requirement 9.13: grade must be one of: 'again', 'hard', 'good', 'easy'
  if (!log.grade || !VALID_GRADES.includes(log.grade)) {
    throw new ValidationError(`Review log grade must be one of: ${VALID_GRADES.join(', ')}`);
  }

  if (log.elapsedDays !== undefined && log.elapsedDays < 0) {
    throw new ValidationError('Review log elapsed days must be greater than or equal to 0');
  }

  if (log.scheduledDays !== undefined && log.scheduledDays < 0) {
    throw new ValidationError('Review log scheduled days must be greater than or equal to 0');
  }

  if (log.state && !VALID_CARD_STATES.includes(log.state)) {
    throw new ValidationError(`Review log state must be one of: ${VALID_CARD_STATES.join(', ')}`);
  }
}

// FSRSCard validation
export function validateFSRSCard(card: Partial<FSRSCard>): void {
  if (card.stability !== undefined && card.stability < 0) {
    throw new ValidationError('FSRS card stability must be greater than or equal to 0');
  }

  if (card.difficulty !== undefined) {
    if (card.difficulty < 0 || card.difficulty > 10) {
      throw new ValidationError('FSRS card difficulty must be between 0 and 10');
    }
  }

  if (card.elapsedDays !== undefined && card.elapsedDays < 0) {
    throw new ValidationError('FSRS card elapsed days must be greater than or equal to 0');
  }

  if (card.scheduledDays !== undefined && card.scheduledDays < 0) {
    throw new ValidationError('FSRS card scheduled days must be greater than or equal to 0');
  }

  if (card.reps !== undefined && card.reps < 0) {
    throw new ValidationError('FSRS card reps must be greater than or equal to 0');
  }

  if (card.lapses !== undefined && card.lapses < 0) {
    throw new ValidationError('FSRS card lapses must be greater than or equal to 0');
  }

  if (card.state && !VALID_CARD_STATES.includes(card.state)) {
    throw new ValidationError(`FSRS card state must be one of: ${VALID_CARD_STATES.join(', ')}`);
  }
}

// Helper function to validate grade
export function validateGrade(grade: string): grade is Grade {
  return VALID_GRADES.includes(grade as Grade);
}

// Helper function to validate card state
export function validateCardState(state: string): state is CardState {
  return VALID_CARD_STATES.includes(state as CardState);
}

// Helper function to validate file type
export function validateFileType(fileType: string): fileType is FileType {
  return VALID_FILE_TYPES.includes(fileType as FileType);
}
