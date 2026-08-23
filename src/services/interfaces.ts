// Service interfaces for dependency injection

import type {
  Book,
  Highlight,
  Tag,
  Grade,
  FSRSCard,
  ReadingProgress,
  HighlightPosition,
} from '../types/models';

// Book Service Interface
export interface CreateHighlightInput {
  bookId: string;
  text: string;
  note?: string;
  tags: string[];
  position: { pageNumber?: number; cfi?: string; chapterTitle?: string };
  color?: string;
}

export interface IBookService {
  importBook(uri: string): Promise<Book>;
  getBooks(): Promise<Book[]>;
  getBookById(id: string): Promise<Book | null>;
  deleteBook(id: string): Promise<void>;
  updateBook(id: string, updates: { title?: string; author?: string }): Promise<void>;
  checkBookFileExists(bookId: string): Promise<boolean>;
  updateReadingProgress(bookId: string, progress: ReadingProgress): Promise<void>;
  getReadingProgress(bookId: string): Promise<ReadingProgress | null>;
}

// Highlight Service Interface
export interface IHighlightService {
  createHighlight(data: CreateHighlightInput): Promise<Highlight>;
  getHighlightsByBook(bookId: string, limit?: number, offset?: number): Promise<Highlight[]>;
  getHighlightById(id: string): Promise<Highlight | null>;
  updateHighlight(id: string, updates: Partial<Highlight>): Promise<void>;
  deleteHighlight(id: string): Promise<void>;
  searchHighlights(query: string): Promise<Highlight[]>;
  getDueHighlights(date?: Date): Promise<Highlight[]>;
  getHighlightsByTag(tag: string): Promise<Highlight[]>;
}

// FSRS Service Interface
export interface SchedulingResult {
  card: FSRSCard;
  dueDate: Date;
  reviewLog: {
    id: string;
    highlightId: string;
    grade: Grade;
    reviewedAt: Date;
    elapsedDays: number;
    scheduledDays: number;
    state: string;
  };
  // True when FSRS calculation failed and simplified fallback scheduling was
  // used. The grade still persisted successfully; callers may surface a soft
  // warning rather than treating it as an error.
  usedFallback?: boolean;
}

export interface ReviewStats {
  totalCards: number;
  dueToday: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  averageRetention: number;
}

export interface IFSRSService {
  gradeCard(highlightId: string, grade: Grade): Promise<SchedulingResult>;
  batchGradeCards(grades: { highlightId: string; grade: Grade }[]): Promise<SchedulingResult[]>;
  calculateNextReview(card: FSRSCard, grade: Grade): SchedulingResult;
  resetCard(highlightId: string): Promise<void>;
  getReviewStats(bookId?: string): Promise<ReviewStats>;
  preloadNextCards(date?: Date): Promise<void>;
  clearCache(): void;
}

// Extraction Service Interface
//
// Pulls real metadata + a cover image out of a PDF/EPUB. The actual parsing
// runs in a hidden WebView (PDF.js / epub.js need a DOM); the service is the
// non-React seam that BookService depends on, and the WebView registers itself
// as the backing "extractor" at app start.
export interface ExtractionResult {
  title?: string;
  author?: string;
  pageCount?: number;
  coverPngBase64?: string;
}

export type Extractor = (uri: string, kind: 'pdf' | 'epub') => Promise<ExtractionResult>;

export interface IExtractionService {
  /** Register the backing extractor (called by the mounted ExtractionWebView). */
  setExtractor(extractor: Extractor | null): void;
  /** True once an extractor is available. */
  isReady(): boolean;
  /** Extract metadata + cover; resolves to {} if no extractor or on failure. */
  extract(uri: string, kind: 'pdf' | 'epub'): Promise<ExtractionResult>;
}
