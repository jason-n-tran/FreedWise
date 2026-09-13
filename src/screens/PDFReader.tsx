// PDFReader - thin wrapper over the shared WebViewReader (PDF.js in a WebView,
// with a real selectable text layer). Replaces the former native
// react-native-pdf renderer, which had no text-extraction API.

import React, { forwardRef } from 'react';
import WebViewReader, { type WebViewReaderRef } from './readers/WebViewReader';
import type { Book, Highlight } from '../types/models';
import type { SelectionData } from '../services/interfaces';

interface PDFReaderProps {
  book: Book;
  highlights: Highlight[];
  activeHighlightId?: string;
  onSelection: (data: SelectionData) => void;
  onHighlightTap?: (highlightId: string) => void;
  onPageChange: (currentPage: number, totalPages?: number) => void;
  totalPages: number;
}

const PDFReader = forwardRef<WebViewReaderRef, PDFReaderProps>(
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
        kind="pdf"
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

export default PDFReader;
