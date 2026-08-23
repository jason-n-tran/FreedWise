/**
 * Store tests for cross-screen propagation (Gap 2).
 *
 * These verify the granular mutators that let a change in one screen show up in
 * the others without each re-querying the database.
 */

import { useAppStore } from '../appStore';
import type { Book, Highlight } from '../../types/models';

function makeBook(id: string): Book {
  const now = new Date();
  return {
    id,
    title: `Book ${id}`,
    author: 'Author',
    filePath: `file:///books/${id}.pdf`,
    fileType: 'pdf',
    currentPage: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function makeHighlight(id: string, bookId: string): Highlight {
  const now = new Date();
  return {
    id,
    bookId,
    text: `Highlight ${id}`,
    tags: [],
    position: { pageNumber: 1 },
    color: '#FFEB3B',
    createdAt: now,
    updatedAt: now,
    dueDate: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    isFlashcard: false,
    isDiscarded: false,
  };
}

describe('appStore cross-screen mutators', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  describe('addBook', () => {
    it('prepends the book', () => {
      useAppStore.getState().setBooks([makeBook('1')]);
      useAppStore.getState().addBook(makeBook('2'));
      expect(useAppStore.getState().books.map(b => b.id)).toEqual(['2', '1']);
    });

    it('replaces an existing book with the same id (no duplicates)', () => {
      useAppStore.getState().setBooks([makeBook('1')]);
      useAppStore.getState().addBook(makeBook('1'));
      expect(useAppStore.getState().books).toHaveLength(1);
    });
  });

  describe('removeBook', () => {
    it('removes the book and cascades its highlights', () => {
      useAppStore.getState().setBooks([makeBook('1'), makeBook('2')]);
      useAppStore
        .getState()
        .setHighlights([
          makeHighlight('h1', '1'),
          makeHighlight('h2', '1'),
          makeHighlight('h3', '2'),
        ]);

      useAppStore.getState().removeBook('1');

      expect(useAppStore.getState().books.map(b => b.id)).toEqual(['2']);
      // highlights belonging to book 1 are gone; book 2's remain
      expect(useAppStore.getState().highlights.map(h => h.id)).toEqual(['h3']);
    });
  });

  describe('updateBook', () => {
    it('patches title/author of the matching book only', () => {
      useAppStore.getState().setBooks([makeBook('1'), makeBook('2')]);
      useAppStore.getState().updateBook('1', { title: 'New Title', author: 'New Author' });
      const books = useAppStore.getState().books;
      const b1 = books.find(b => b.id === '1')!;
      const b2 = books.find(b => b.id === '2')!;
      expect(b1.title).toBe('New Title');
      expect(b1.author).toBe('New Author');
      expect(b2.title).toBe('Book 2'); // untouched
    });
  });

  describe('highlight mutators', () => {
    it('addHighlight prepends', () => {
      useAppStore.getState().setHighlights([makeHighlight('h1', '1')]);
      useAppStore.getState().addHighlight(makeHighlight('h2', '1'));
      expect(useAppStore.getState().highlights.map(h => h.id)).toEqual(['h2', 'h1']);
    });

    it('updateHighlightInStore patches fields by id', () => {
      useAppStore.getState().setHighlights([makeHighlight('h1', '1')]);
      useAppStore.getState().updateHighlightInStore('h1', { note: 'edited', color: '#BBDEFB' });
      const h = useAppStore.getState().highlights[0];
      expect(h.note).toBe('edited');
      expect(h.color).toBe('#BBDEFB');
    });

    it('removeHighlight drops only the matching id', () => {
      useAppStore.getState().setHighlights([makeHighlight('h1', '1'), makeHighlight('h2', '1')]);
      useAppStore.getState().removeHighlight('h1');
      expect(useAppStore.getState().highlights.map(h => h.id)).toEqual(['h2']);
    });
  });
});
