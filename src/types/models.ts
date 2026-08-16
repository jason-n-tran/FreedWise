// Core data models for Freedwise Reader

export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type FileType = 'pdf' | 'epub';

export interface Book {
  id: string;
  title: string;
  author: string;
  filePath: string;
  fileType: FileType;
  coverImagePath?: string;
  totalPages?: number;
  currentPage: number;
  lastCfi?: string;
  lastReadAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Precise re-anchoring locator for PDF highlights. Page number alone can't
// disambiguate repeated text or redraw an exact rectangle, so we also store
// normalized (0..1) quad rectangles within the page plus a hash of the selected
// text for validation. Optional + additive: older highlights without a locator
// fall back to text-search re-anchoring, so no migration is needed.
export interface PDFLocator {
  pageNumber: number;
  quads: { x: number; y: number; width: number; height: number }[];
  textHash: string;
  startCharOffset?: number;
  endCharOffset?: number;
}

export interface HighlightPosition {
  pageNumber?: number; // For PDF
  cfi?: string; // For EPUB (Canonical Fragment Identifier)
  chapterTitle?: string;
  locator?: PDFLocator; // For PDF precise re-anchoring (additive, optional)
}

export interface Tag {
  id: string;
  name: string;
  createdAt: Date;
}

export interface Highlight {
  id: string;
  bookId: string;
  text: string;
  note?: string;
  tags: Tag[];
  position: HighlightPosition;
  color: string;
  createdAt: Date;
  updatedAt: Date;

  // FSRS parameters
  dueDate: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReviewedAt?: Date;

  // Action tags
  isFlashcard: boolean; // .q tag
  flashcardQuestion?: string;
  isDiscarded: boolean; // .discard tag
  headerLevel?: number; // .h1, .h2, etc.
}

export interface ReviewLog {
  id: string;
  highlightId: string;
  grade: Grade;
  reviewedAt: Date;
  elapsedDays: number;
  scheduledDays: number;
  state: CardState;
}

export interface FSRSCard {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview?: Date;
}

export interface ReadingProgress {
  bookId: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastPosition?: string; // For EPUB CFI
  lastCfi?: string; // For EPUB CFI restore
}
