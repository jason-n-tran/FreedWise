// Database module exports

export { DatabaseManager, getDatabaseManager } from './DatabaseManager';
export { SCHEMA_VERSION } from './schema';
export { RowMapper } from './rowMapping';
export type { BookRow, HighlightRow, TagRow } from './rowMapping';
export { DatabaseError } from '../types/database';
export type { IDatabaseManager, Transaction } from '../types/database';
