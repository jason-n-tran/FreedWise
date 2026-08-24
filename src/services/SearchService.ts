// SearchService implementation for full-text search across highlights and books
// Requirements: 7.1-7.10

import type { ISearchService, SearchFilters, SearchResult } from './interfaces';
import type { Book, Highlight } from '../types/models';
import type { IDatabaseManager } from '../types/database';
import {
  RowMapper,
  type HighlightRow,
  type BookRow,
  type BookJoinRow,
} from '../database/rowMapping';

const MAX_RESULTS = 50;
const MAX_RECENT_SEARCHES = 20;
