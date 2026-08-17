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
