// Database migration system

import { Transaction } from '../types/database';
import { ALL_TABLES, CREATE_INDEXES, SCHEMA_VERSION } from './schema';

export interface Migration {
  version: number;
  up: (tx: Transaction) => Promise<void>;
}

// Migration v1: Initial schema creation
const migrationV1: Migration = {
  version: 1,
  up: async (tx: Transaction) => {
    // Create all tables
    for (const tableSQL of ALL_TABLES) {
      await tx.executeUpdate(tableSQL, []);
    }

    // Create all indexes
    for (const indexSQL of CREATE_INDEXES) {
      await tx.executeUpdate(indexSQL, []);
    }

    // Store schema version in settings
    const now = Date.now();
    await tx.executeUpdate(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      ['schema_version', SCHEMA_VERSION.toString(), now]
    );
  },
};

// Migration v2: Add last_cfi column to books table
const migrationV2: Migration = {
  version: 2,
  up: async (tx: Transaction) => {
    try {
      await tx.executeUpdate('ALTER TABLE books ADD COLUMN last_cfi TEXT', []);
    } catch (e: any) {
      // If the column already exists (e.g. from a previous partial run), ignore it so the migration completes and updates schema_version.
      if (e && e.message && (e.message.includes('duplicate column') || e.message.includes('already exists'))) {
        console.log('last_cfi column already exists, skipping ADD COLUMN');
      } else {
        throw e;
      }
    }
  },
};
