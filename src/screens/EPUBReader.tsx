// EPUBReader - thin wrapper over the shared WebViewReader (epub.js in a WebView,
// with real rendering, real CFIs, and annotation-based highlights). Replaces the
// former placeholder that never parsed the .epub.

import React, { forwardRef } from 'react';
import WebViewReader, { type WebViewReaderRef } from './readers/WebViewReader';
import type { Book, Highlight } from '../types/models';
import type { SelectionData } from '../services/interfaces';

interface EPUBReaderProps {
  book: Book;
  highlights: Highlight[];
  activeHighlightId?: string;
  onSelection: (data: SelectionData) => void;
  onHighlightTap?: (highlightId: string) => void;
  onPageChange: (currentPage: number, totalPages?: number, rawPct?: number, rawCfi?: string) => void;
  totalPages: number;
}

const EPUBReader = forwardRef<WebViewReaderRef, EPUBReaderProps>(
  (
    {
      book,
      highlights,
      activeHighlightId,
      onSelection,
      onHighlightTap,
      onPageChange,
      totalPages,
    },
    ref
  ) => {
    return (
      <WebViewReader
        ref={ref}
        book={book}
        kind="epub"
        highlights={highlights}
        activeHighlightId={activeHighlightId}
        onSelection={onSelection}
        onHighlightTap={onHighlightTap}
        onProgress={onPageChange}
        totalPages={totalPages}
      />
    );
  }
);

export default EPUBReader;
