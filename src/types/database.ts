// Database interfaces and types

export interface IDatabaseManager {
  initialize(): Promise<void>;
  executeQuery<T>(sql: string, params?: any[]): Promise<T[]>;
  executeUpdate(sql: string, params?: any[]): Promise<number>;
  transaction(callback: (tx: Transaction) => Promise<void>): Promise<void>;
  batchUpdate(operations: { sql: string; params?: any[] }[]): Promise<void>;
  close(): Promise<void>;
}

export interface Transaction {
  executeQuery<T>(sql: string, params?: any[]): Promise<T[]>;
  executeUpdate(sql: string, params?: any[]): Promise<number>;
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Re-export models for convenience
export * from './models';
