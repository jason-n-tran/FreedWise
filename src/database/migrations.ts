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

// All migrations in order
export const MIGRATIONS: Migration[] = [migrationV1, migrationV2];

export async function getCurrentSchemaVersion(tx: Transaction): Promise<number> {
  try {
    const result = await tx.executeQuery<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      ['schema_version']
    );

    if (result.length > 0) {
      return parseInt(result[0].value, 10);
    }
  } catch (error) {
    // Settings table might not exist yet
    return 0;
  }

  return 0;
}

export async function runMigrations(
  transaction: (callback: (tx: Transaction) => Promise<void>) => Promise<void>
): Promise<void> {
  await transaction(async tx => {
    const currentVersion = await getCurrentSchemaVersion(tx);

    // Run migrations that haven't been applied yet
    let newVersion = currentVersion;
    for (const migration of MIGRATIONS) {
      if (migration.version > currentVersion) {
        console.log(`Running migration v${migration.version}...`);
        await migration.up(tx);
        console.log(`Migration v${migration.version} completed`);
        newVersion = migration.version;
      }
    }

    if (newVersion > currentVersion) {
      const now = Date.now();
      await tx.executeUpdate(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        ['schema_version', newVersion.toString(), now]
      );
    }
  });
}
