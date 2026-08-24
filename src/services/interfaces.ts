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

// Settings Service Interface
//
// General-purpose typed persistence over the `settings` table (key/value/
// updated_at). Replaces ad-hoc per-feature settings access. Values are stored
// as JSON strings.
export type ThemeMode = 'light' | 'dark' | 'system';
export type EpubFlow = 'paginated' | 'scrolled';

export interface ISettingsService {
  get<T>(key: string, defaultValue: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  // Typed convenience accessors for app-wide preferences.
  getThemeMode(): Promise<ThemeMode>;
  setThemeMode(mode: ThemeMode): Promise<void>;
  getReaderFontScale(): Promise<number>;
  setReaderFontScale(scale: number): Promise<void>;
  getEpubFlow(): Promise<EpubFlow>;
  setEpubFlow(flow: EpubFlow): Promise<void>;
}

// Data Service Interface — export, import, and wipe of all user data.
export type DataImportMode = 'merge' | 'replace';

export interface DataImportSummary {
  mode: DataImportMode;
  books: { added: number; updated: number; unchanged: number };
  highlights: { added: number; updated: number; unchanged: number };
  tags: { added: number; reused: number; unchanged: number };
  reviewLogs: { added: number; unchanged: number };
  settings: { imported: number; skipped: number };
  files: { restored: number; missing: number };
  warnings: string[];
}

export interface IDataService {
  /** Build a JSON snapshot of all books, settings, review data, and restorable files. */
  buildExport(): Promise<string>;
  /** Save the export JSON to a user-chosen location and return a display path/URI. */
  saveExportToDevice(): Promise<string>;
  /** Write the export to a file and open the OS share sheet. */
  exportAndShare(): Promise<void>;
  /** Pick a JSON export file and import it. */
  importFromPicker(mode: DataImportMode): Promise<DataImportSummary>;
  /** Import a JSON export string. Exposed for tests and non-picker callers. */
  importFromJson(json: string, mode: DataImportMode): Promise<DataImportSummary>;
  /** Delete all books, highlights, tags, review logs + their files. */
  clearAllData(): Promise<void>;
}

// Notification Service Interface
export interface NotificationSettings {
  enabled: boolean;
  dailyTime: string; // HH:MM format
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface INotificationService {
  scheduleDailyReviewNotification(time: Date): Promise<void>;
  cancelDailyNotification(): Promise<void>;
  requestPermissions(): Promise<boolean>;
  getNotificationSettings(): Promise<NotificationSettings>;
  updateNotificationSettings(settings: NotificationSettings): Promise<void>;
  sendImmediateNotification(title: string, body: string): Promise<void>;
}

// Search Service Interface
export interface SearchFilters {
  bookId?: string;
  tags?: string[];
  dateRange?: { start: Date; end: Date };
  includeNotes?: boolean;
}

export interface SearchResult {
  highlight: Highlight;
  book: Book;
  matchedText: string;
  matchType: 'text' | 'note' | 'tag';
}

export interface ISearchService {
  searchHighlights(
    query: string,
    filters?: SearchFilters,
    offset?: number
  ): Promise<SearchResult[]>;
  loadMore(query: string, filters?: SearchFilters, offset?: number): Promise<SearchResult[]>;
  searchBooks(query: string): Promise<Book[]>;
  getRecentSearches(): Promise<string[]>;
  saveSearch(query: string): Promise<void>;
  clearSearchHistory(): Promise<void>;
}

// Text Selection Bridge Interface
//
// The bridge now only carries the *current* selection between a reader and
// ReaderScreen. Highlight rendering lives inside each WebView reader and is
// keyed by the highlight's DB id; the bridge no longer stores highlight markers
// (that in-memory map both collided on page/cfi and was never hydrated from the
// DB). See WebViewReader for the apply/remove/rehydrate highlight messaging.
export interface SelectionData {
  text: string;
  position: HighlightPosition;
  boundingRect: { x: number; y: number; width: number; height: number };
}

export interface ITextSelectionBridge {
  captureSelection(source: 'pdf' | 'epub'): Promise<SelectionData | null>;
  clearSelection(): void;
}
