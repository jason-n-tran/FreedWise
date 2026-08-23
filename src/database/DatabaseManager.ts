// DatabaseManager implementation using expo-sqlite

import * as SQLite from 'expo-sqlite';
import { IDatabaseManager, Transaction, DatabaseError } from '../types/database';
import { runMigrations } from './migrations';

const DATABASE_NAME = 'freedwise_reader.db';

export class DatabaseManager implements IDatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Open database connection
      this.db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // Enable foreign key constraints
      await this.db.execAsync('PRAGMA foreign_keys = ON;');

      // Mark as initialized before running migrations
      // (migrations need to use transaction which checks initialized)
      this.initialized = true;

      // Run migrations to create/update schema
      await runMigrations(this.transaction.bind(this));

      console.log('Database initialized successfully');
    } catch (error) {
      this.initialized = false;
      this.db = null;
      throw new DatabaseError('Failed to initialize database', error as Error);
    }
  }

  async executeQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    this.ensureInitialized();

    try {
      const result = await this.db!.getAllAsync<T>(sql, params);
      return result;
    } catch (error) {
      throw new DatabaseError(`Query execution failed: ${sql}`, error as Error);
    }
  }

  async executeUpdate(sql: string, params: any[] = []): Promise<number> {
    this.ensureInitialized();

    try {
      const result = await this.db!.runAsync(sql, params);
      return result.changes;
    } catch (error) {
      throw new DatabaseError(`Update execution failed: ${sql}`, error as Error);
    }
  }

  async transaction(callback: (tx: Transaction) => Promise<void>): Promise<void> {
    this.ensureInitialized();

    try {
      await this.db!.withTransactionAsync(async () => {
        const tx: Transaction = {
          executeQuery: async <T>(sql: string, params: any[] = []) => {
            return await this.db!.getAllAsync<T>(sql, params);
          },
          executeUpdate: async (sql: string, params: any[] = []) => {
            const result = await this.db!.runAsync(sql, params);
            return result.changes;
          },
        };

        await callback(tx);
      });
    } catch (error) {
      throw new DatabaseError('Transaction failed', error as Error);
    }
  }

  /**
   * Execute multiple update statements in a single transaction for batch operations.
   * Requirements: 11.1, 11.4
   */
  async batchUpdate(operations: { sql: string; params?: any[] }[]): Promise<void> {
    this.ensureInitialized();
    if (operations.length === 0) return;

    try {
      await this.db!.withTransactionAsync(async () => {
        for (const op of operations) {
          await this.db!.runAsync(op.sql, op.params ?? []);
        }
      });
    } catch (error) {
      throw new DatabaseError('Batch update failed', error as Error);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.initialized = false;
      console.log('Database connection closed');
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new DatabaseError('Database not initialized. Call initialize() first.');
    }
  }
}

// Singleton instance
let databaseManagerInstance: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!databaseManagerInstance) {
    databaseManagerInstance = new DatabaseManager();
  }
  return databaseManagerInstance;
}
