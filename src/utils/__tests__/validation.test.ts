// Unit tests for validation utilities

import {
  validateBook,
  validateHighlight,
  validateTag,
  validateReviewLog,
  validateFSRSCard,
  validateHighlightPosition,
  validateGrade,
  validateCardState,
  validateFileType,
  ValidationError,
} from '../validation';
import type { Book, Highlight, Tag, ReviewLog, FSRSCard } from '../../types/models';

describe('validateBook', () => {
  const validBook: Partial<Book> = {
    title: 'Test Book',
    filePath: '/path/to/book.pdf',
    fileType: 'pdf',
    currentPage: 0,
    totalPages: 100,
  };

  it('should pass validation for valid book', () => {
    expect(() => validateBook(validBook)).not.toThrow();
  });

  it('should throw error for empty title', () => {
    expect(() => validateBook({ ...validBook, title: '' })).toThrow(ValidationError);
    expect(() => validateBook({ ...validBook, title: '   ' })).toThrow('title must be non-empty');
  });

  it('should throw error for title exceeding 500 characters', () => {
    const longTitle = 'a'.repeat(501);
    expect(() => validateBook({ ...validBook, title: longTitle })).toThrow(
      'less than 500 characters'
    );
  });

  it('should throw error for empty file path', () => {
    expect(() => validateBook({ ...validBook, filePath: '' })).toThrow(
      'file path must be non-empty'
    );
  });

  it('should throw error for invalid file type', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateBook({ ...validBook, fileType: 'doc' as any })).toThrow(
      'file type must be one of'
    );
  });

  it('should throw error for negative current page', () => {
    expect(() => validateBook({ ...validBook, currentPage: -1 })).toThrow(
      'current page must be greater than or equal to 0'
    );
  });

  it('should throw error for current page exceeding total pages', () => {
    expect(() => validateBook({ ...validBook, currentPage: 101, totalPages: 100 })).toThrow(
      'current page must be less than or equal to total pages'
    );
  });

  it('should throw error for total pages less than or equal to 0', () => {
    expect(() => validateBook({ ...validBook, totalPages: 0 })).toThrow(
      'total pages must be greater than 0'
    );
    expect(() => validateBook({ ...validBook, totalPages: -1 })).toThrow(
      'total pages must be greater than 0'
    );
  });

  it('should accept valid epub file type', () => {
    expect(() => validateBook({ ...validBook, fileType: 'epub' })).not.toThrow();
  });
});

describe('validateHighlight', () => {
  const validHighlight: Partial<Highlight> = {
    text: 'This is a highlight',
    note: 'This is a note',
    color: '#FFEB3B',
    position: { pageNumber: 1 },
    stability: 0,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: 'new',
  };

  it('should pass validation for valid highlight', () => {
    expect(() => validateHighlight(validHighlight)).not.toThrow();
  });

  it('should throw error for empty text', () => {
    expect(() => validateHighlight({ ...validHighlight, text: '' })).toThrow(
      'text must be non-empty'
    );
    expect(() => validateHighlight({ ...validHighlight, text: '   ' })).toThrow(
      'text must be non-empty'
    );
  });

  it('should throw error for text exceeding 10,000 characters', () => {
    const longText = 'a'.repeat(10001);
    expect(() => validateHighlight({ ...validHighlight, text: longText })).toThrow(
      'less than 10000 characters'
    );
  });

  it('should throw error for note exceeding 5,000 characters', () => {
    const longNote = 'a'.repeat(5001);
    expect(() => validateHighlight({ ...validHighlight, note: longNote })).toThrow(
      'less than 5000 characters'
    );
  });

  it('should throw error for invalid color format', () => {
    expect(() => validateHighlight({ ...validHighlight, color: 'red' })).toThrow(
      'valid hexadecimal color code'
    );
    expect(() => validateHighlight({ ...validHighlight, color: '#FFF' })).toThrow(
      'valid hexadecimal color code'
    );
    expect(() => validateHighlight({ ...validHighlight, color: 'FFEB3B' })).toThrow(
      'valid hexadecimal color code'
    );
  });

  it('should accept valid hex color codes', () => {
    expect(() => validateHighlight({ ...validHighlight, color: '#FFEB3B' })).not.toThrow();
    expect(() => validateHighlight({ ...validHighlight, color: '#000000' })).not.toThrow();
    expect(() => validateHighlight({ ...validHighlight, color: '#ffffff' })).not.toThrow();
  });

  it('should throw error for negative stability', () => {
    expect(() => validateHighlight({ ...validHighlight, stability: -1 })).toThrow(
      'stability must be greater than or equal to 0'
    );
  });

  it('should throw error for difficulty outside 0-10 range', () => {
    expect(() => validateHighlight({ ...validHighlight, difficulty: -1 })).toThrow(
      'difficulty must be between 0 and 10'
    );
    expect(() => validateHighlight({ ...validHighlight, difficulty: 11 })).toThrow(
      'difficulty must be between 0 and 10'
    );
  });

  it('should throw error for negative reps', () => {
    expect(() => validateHighlight({ ...validHighlight, reps: -1 })).toThrow(
      'reps must be greater than or equal to 0'
    );
  });

  it('should throw error for negative lapses', () => {
    expect(() => validateHighlight({ ...validHighlight, lapses: -1 })).toThrow(
      'lapses must be greater than or equal to 0'
    );
  });

  it('should throw error for invalid state', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateHighlight({ ...validHighlight, state: 'invalid' as any })).toThrow(
      'state must be one of'
    );
  });

  it('should throw error for invalid header level', () => {
    expect(() => validateHighlight({ ...validHighlight, headerLevel: 0 })).toThrow(
      'header level must be between 1 and 6'
    );
    expect(() => validateHighlight({ ...validHighlight, headerLevel: 7 })).toThrow(
      'header level must be between 1 and 6'
    );
  });

  it('should accept valid header levels', () => {
    for (let level = 1; level <= 6; level++) {
      expect(() => validateHighlight({ ...validHighlight, headerLevel: level })).not.toThrow();
    }
  });
});

describe('validateHighlightPosition', () => {
  it('should pass validation for position with pageNumber', () => {
    expect(() => validateHighlightPosition({ pageNumber: 1 })).not.toThrow();
  });

  it('should pass validation for position with cfi', () => {
    expect(() =>
      validateHighlightPosition({ cfi: 'epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)' })
    ).not.toThrow();
  });

  it('should pass validation for position with both pageNumber and cfi', () => {
    expect(() => validateHighlightPosition({ pageNumber: 1, cfi: 'epubcfi(/6/4)' })).not.toThrow();
  });

  it('should throw error for position without pageNumber or cfi', () => {
    expect(() => validateHighlightPosition({})).toThrow('must contain either pageNumber or cfi');
  });

  it('should throw error for negative page number', () => {
    expect(() => validateHighlightPosition({ pageNumber: -1 })).toThrow(
      'page number must be greater than or equal to 0'
    );
  });

  it('should throw error for empty cfi', () => {
    expect(() => validateHighlightPosition({ cfi: '   ' })).toThrow('CFI must be non-empty');
  });
});

describe('validateTag', () => {
  const validTag: Partial<Tag> = {
    name: 'test-tag_123',
  };

  it('should pass validation for valid tag', () => {
    expect(() => validateTag(validTag)).not.toThrow();
  });

  it('should throw error for empty name', () => {
    expect(() => validateTag({ name: '' })).toThrow('name must be non-empty');
    expect(() => validateTag({ name: '   ' })).toThrow('name must be non-empty');
  });

  it('should throw error for name exceeding 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(() => validateTag({ name: longName })).toThrow('less than 100 characters');
  });

  it('should throw error for invalid characters in name', () => {
    expect(() => validateTag({ name: 'tag with spaces' })).toThrow(
      'only alphanumeric characters, underscores, and hyphens'
    );
    expect(() => validateTag({ name: 'tag@special' })).toThrow(
      'only alphanumeric characters, underscores, and hyphens'
    );
    expect(() => validateTag({ name: 'tag.dot' })).toThrow(
      'only alphanumeric characters, underscores, and hyphens'
    );
  });

  it('should accept valid tag names', () => {
    expect(() => validateTag({ name: 'tag' })).not.toThrow();
    expect(() => validateTag({ name: 'tag-name' })).not.toThrow();
    expect(() => validateTag({ name: 'tag_name' })).not.toThrow();
    expect(() => validateTag({ name: 'tag123' })).not.toThrow();
    expect(() => validateTag({ name: 'TAG' })).not.toThrow();
  });
});

describe('validateReviewLog', () => {
  const validLog: Partial<ReviewLog> = {
    grade: 'good',
    elapsedDays: 1,
    scheduledDays: 3,
    state: 'review',
  };

  it('should pass validation for valid review log', () => {
    expect(() => validateReviewLog(validLog)).not.toThrow();
  });

  it('should throw error for invalid grade', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateReviewLog({ ...validLog, grade: 'invalid' as any })).toThrow(
      'grade must be one of'
    );
  });

  it('should accept all valid grades', () => {
    expect(() => validateReviewLog({ ...validLog, grade: 'again' })).not.toThrow();
    expect(() => validateReviewLog({ ...validLog, grade: 'hard' })).not.toThrow();
    expect(() => validateReviewLog({ ...validLog, grade: 'good' })).not.toThrow();
    expect(() => validateReviewLog({ ...validLog, grade: 'easy' })).not.toThrow();
  });

  it('should throw error for negative elapsed days', () => {
    expect(() => validateReviewLog({ ...validLog, elapsedDays: -1 })).toThrow(
      'elapsed days must be greater than or equal to 0'
    );
  });

  it('should throw error for negative scheduled days', () => {
    expect(() => validateReviewLog({ ...validLog, scheduledDays: -1 })).toThrow(
      'scheduled days must be greater than or equal to 0'
    );
  });

  it('should throw error for invalid state', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateReviewLog({ ...validLog, state: 'invalid' as any })).toThrow(
      'state must be one of'
    );
  });
});

describe('validateFSRSCard', () => {
  const validCard: Partial<FSRSCard> = {
    stability: 1.5,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 3,
    reps: 5,
    lapses: 1,
    state: 'review',
  };

  it('should pass validation for valid FSRS card', () => {
    expect(() => validateFSRSCard(validCard)).not.toThrow();
  });

  it('should throw error for negative stability', () => {
    expect(() => validateFSRSCard({ ...validCard, stability: -1 })).toThrow(
      'stability must be greater than or equal to 0'
    );
  });

  it('should throw error for difficulty outside 0-10 range', () => {
    expect(() => validateFSRSCard({ ...validCard, difficulty: -1 })).toThrow(
      'difficulty must be between 0 and 10'
    );
    expect(() => validateFSRSCard({ ...validCard, difficulty: 11 })).toThrow(
      'difficulty must be between 0 and 10'
    );
  });

  it('should throw error for negative elapsed days', () => {
    expect(() => validateFSRSCard({ ...validCard, elapsedDays: -1 })).toThrow(
      'elapsed days must be greater than or equal to 0'
    );
  });

  it('should throw error for negative scheduled days', () => {
    expect(() => validateFSRSCard({ ...validCard, scheduledDays: -1 })).toThrow(
      'scheduled days must be greater than or equal to 0'
    );
  });

  it('should throw error for negative reps', () => {
    expect(() => validateFSRSCard({ ...validCard, reps: -1 })).toThrow(
      'reps must be greater than or equal to 0'
    );
  });

  it('should throw error for negative lapses', () => {
    expect(() => validateFSRSCard({ ...validCard, lapses: -1 })).toThrow(
      'lapses must be greater than or equal to 0'
    );
  });

  it('should throw error for invalid state', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateFSRSCard({ ...validCard, state: 'invalid' as any })).toThrow(
      'state must be one of'
    );
  });
});

describe('Helper validation functions', () => {
  describe('validateGrade', () => {
    it('should return true for valid grades', () => {
      expect(validateGrade('again')).toBe(true);
      expect(validateGrade('hard')).toBe(true);
      expect(validateGrade('good')).toBe(true);
      expect(validateGrade('easy')).toBe(true);
    });

    it('should return false for invalid grades', () => {
      expect(validateGrade('invalid')).toBe(false);
      expect(validateGrade('medium')).toBe(false);
      expect(validateGrade('')).toBe(false);
    });
  });

  describe('validateCardState', () => {
    it('should return true for valid card states', () => {
      expect(validateCardState('new')).toBe(true);
      expect(validateCardState('learning')).toBe(true);
      expect(validateCardState('review')).toBe(true);
      expect(validateCardState('relearning')).toBe(true);
    });

    it('should return false for invalid card states', () => {
      expect(validateCardState('invalid')).toBe(false);
      expect(validateCardState('completed')).toBe(false);
      expect(validateCardState('')).toBe(false);
    });
  });

  describe('validateFileType', () => {
    it('should return true for valid file types', () => {
      expect(validateFileType('pdf')).toBe(true);
      expect(validateFileType('epub')).toBe(true);
    });

    it('should return false for invalid file types', () => {
      expect(validateFileType('doc')).toBe(false);
      expect(validateFileType('txt')).toBe(false);
      expect(validateFileType('')).toBe(false);
    });
  });
});
