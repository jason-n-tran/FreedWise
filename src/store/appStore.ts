// Global application state using Zustand

import { create } from 'zustand';
import type { Book, Highlight } from '../types/models';

interface AppState {
  // Current user session
  currentBook: Book | null;
  currentPage: number;

  // Library state
  books: Book[];
  isLoadingBooks: boolean;

  // Highlights state
  highlights: Highlight[];
  isLoadingHighlights: boolean;

  // Review state
  dueCount: number;
  reviewSessionActive: boolean;

  // UI state
  isInitialized: boolean;
  error: string | null;

  // Actions
  setCurrentBook: (book: Book | null) => void;
  setCurrentPage: (page: number) => void;
  setBooks: (books: Book[]) => void;
  setIsLoadingBooks: (loading: boolean) => void;
  setHighlights: (highlights: Highlight[]) => void;
  setIsLoadingHighlights: (loading: boolean) => void;
  setDueCount: (count: number) => void;
  setReviewSessionActive: (active: boolean) => void;
  setIsInitialized: (initialized: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // Granular mutations so a change in one screen propagates to all others
  // that subscribe to the store (fixes cross-screen state drift).
  addBook: (book: Book) => void;
  removeBook: (bookId: string) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  addHighlight: (highlight: Highlight) => void;
  updateHighlightInStore: (id: string, updates: Partial<Highlight>) => void;
  removeHighlight: (id: string) => void;
}

const initialState = {
  currentBook: null,
  currentPage: 0,
  books: [],
  isLoadingBooks: false,
  highlights: [],
  isLoadingHighlights: false,
  dueCount: 0,
  reviewSessionActive: false,
  isInitialized: false,
  error: null,
};

export const useAppStore = create<AppState>(set => ({
  ...initialState,

  setCurrentBook: book => set({ currentBook: book }),
  setCurrentPage: page => set({ currentPage: page }),
  setBooks: books => set({ books }),
  setIsLoadingBooks: loading => set({ isLoadingBooks: loading }),
  setHighlights: highlights => set({ highlights }),
  setIsLoadingHighlights: loading => set({ isLoadingHighlights: loading }),
  setDueCount: count => set({ dueCount: count }),
  setReviewSessionActive: active => set({ reviewSessionActive: active }),
  setIsInitialized: initialized => set({ isInitialized: initialized }),
  setError: error => set({ error }),
  reset: () => set(initialState),

  addBook: book => set(state => ({ books: [book, ...state.books.filter(b => b.id !== book.id)] })),

  removeBook: bookId =>
    set(state => ({
      books: state.books.filter(b => b.id !== bookId),
      // Cascade: drop the deleted book's highlights from shared state too.
      highlights: state.highlights.filter(h => h.bookId !== bookId),
    })),

  updateBook: (id, updates) =>
    set(state => ({
      books: state.books.map(b => (b.id === id ? { ...b, ...updates } : b)),
    })),

  addHighlight: highlight => set(state => ({ highlights: [highlight, ...state.highlights] })),

  updateHighlightInStore: (id, updates) =>
    set(state => ({
      highlights: state.highlights.map(h => (h.id === id ? { ...h, ...updates } : h)),
    })),

  removeHighlight: id => set(state => ({ highlights: state.highlights.filter(h => h.id !== id) })),
}));
