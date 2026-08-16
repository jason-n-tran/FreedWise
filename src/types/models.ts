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
