// Mock implementation of expo-sqlite for testing

interface MockDatabase {
  execAsync: jest.Mock;
  getAllAsync: jest.Mock;
  runAsync: jest.Mock;
  withTransactionAsync: jest.Mock;
  closeAsync: jest.Mock;
}

const mockDb: MockDatabase = {
  execAsync: jest.fn(),
  getAllAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
  closeAsync: jest.fn(),
};

// In-memory storage for testing
const storage = new Map<string, any[]>();

// Helper to execute SQL in memory
function executeSql(sql: string, params: any[] = []): any {
  const normalizedSql = sql.trim().toUpperCase();

  // Handle invalid SQL
  if (normalizedSql.includes('INVALID SQL')) {
    throw new Error('SQL syntax error');
  }

  // Handle PRAGMA
  if (normalizedSql.startsWith('PRAGMA')) {
    return { changes: 0 };
  }

  // Handle CREATE TABLE
  if (normalizedSql.includes('CREATE TABLE')) {
    const match = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i);
    if (match) {
      const tableName = match[1];
      if (!storage.has(tableName)) {
        storage.set(tableName, []);
      }
    }
    return { changes: 0 };
  }

  // Handle CREATE INDEX
  if (normalizedSql.includes('CREATE INDEX')) {
    return { changes: 0 };
  }

  // Handle INSERT
  if (normalizedSql.startsWith('INSERT')) {
    const match = sql.match(/INSERT (?:OR REPLACE )?INTO (\w+)/i);
    if (match) {
      const tableName = match[1];
      const table = storage.get(tableName) || [];

      // Parse values
      const row: any = {};
      if (tableName === 'settings') {
        row.key = params[0];
        row.value = params[1];
        row.updated_at = params[2];

        // Remove existing row with same key
        const filtered = table.filter(r => r.key !== params[0]);
        filtered.push(row);
        storage.set(tableName, filtered);
      } else if (tableName === 'books') {
        row.id = params[0];
        row.title = params[1];
        row.file_path = params[2];
        row.file_type = params[3];
        row.created_at = params[4];
        row.updated_at = params[5];
        table.push(row);
        storage.set(tableName, table);
      } else if (tableName === 'highlights') {
        // Check foreign key constraint - book_id must exist
        const bookId = params[1];
        const books = storage.get('books') || [];
        const bookExists = books.some(b => b.id === bookId);
        if (!bookExists) {
          throw new Error('FOREIGN KEY constraint failed');
        }

        row.id = params[0];
        row.book_id = params[1];
        row.text = params[2];
        row.position_data = params[3];
        row.created_at = params[4];
        row.updated_at = params[5];
        row.due_date = params[6];
        table.push(row);
        storage.set(tableName, table);
      }

      return { changes: 1 };
    }
  }

  // Handle SELECT
  if (normalizedSql.startsWith('SELECT')) {
    // Handle sqlite_master queries
    if (normalizedSql.includes('SQLITE_MASTER')) {
      if (normalizedSql.includes("TYPE='TABLE'")) {
        return Array.from(storage.keys()).map(name => ({ name }));
      }
      if (normalizedSql.includes("TYPE='INDEX'")) {
        return [
          { name: 'idx_highlights_book_id' },
          { name: 'idx_highlights_due_date' },
          { name: 'idx_highlights_is_discarded' },
          { name: 'idx_highlight_tags_highlight_id' },
          { name: 'idx_highlight_tags_tag_id' },
        ];
      }
    }

    // Handle settings queries
    if (normalizedSql.includes('FROM SETTINGS')) {
      const table = storage.get('settings') || [];
      if (params.length > 0) {
        return table.filter(row => row.key === params[0]);
      }
      return table;
    }

    // Handle books queries
    if (normalizedSql.includes('FROM BOOKS')) {
      const table = storage.get('books') || [];
      if (params.length > 0) {
        return table.filter(row => row.id === params[0]);
      }
      return table;
    }

    // Handle highlights queries
    if (normalizedSql.includes('FROM HIGHLIGHTS')) {
      const table = storage.get('highlights') || [];
      if (params.length > 0) {
        return table.filter(row => row.id === params[0]);
      }
      return table;
    }

    return [];
  }

  // Handle DELETE
  if (normalizedSql.startsWith('DELETE')) {
    const match = sql.match(/DELETE FROM (\w+)/i);
    if (match) {
      const tableName = match[1];
      const table = storage.get(tableName) || [];

      if (params.length > 0) {
        const filtered = table.filter(row => row.id !== params[0]);
        const changes = table.length - filtered.length;
        storage.set(tableName, filtered);

        // Cascade delete for highlights when book is deleted
        if (tableName === 'books') {
          const highlights = storage.get('highlights') || [];
          const filteredHighlights = highlights.filter(h => h.book_id !== params[0]);
          storage.set('highlights', filteredHighlights);
        }

        return { changes };
      }
    }
  }

  return { changes: 0 };
}

// Mock implementation
mockDb.execAsync.mockImplementation(async (sql: string) => {
  executeSql(sql);
});

mockDb.getAllAsync.mockImplementation(async (sql: string, params: any[] = []) => {
  return executeSql(sql, params);
});

mockDb.runAsync.mockImplementation(async (sql: string, params: any[] = []) => {
  return executeSql(sql, params);
});

mockDb.withTransactionAsync.mockImplementation(async (callback: () => Promise<void>) => {
  // Create a snapshot of the current state
  const snapshot = new Map<string, any[]>();
  for (const [key, value] of storage.entries()) {
    snapshot.set(key, JSON.parse(JSON.stringify(value)));
  }

  try {
    await callback();
  } catch (error) {
    // Rollback - restore state from snapshot
    storage.clear();
    for (const [key, value] of snapshot.entries()) {
      storage.set(key, value);
    }
    throw error;
  }
});

mockDb.closeAsync.mockImplementation(async () => {
  storage.clear();
});

export const openDatabaseAsync = jest.fn().mockResolvedValue(mockDb);

export default {
  openDatabaseAsync,
};
