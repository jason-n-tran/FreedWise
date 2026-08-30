import { SettingsService } from '../SettingsService';
import type { IDatabaseManager } from '../../types/database';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockDb: jest.Mocked<IDatabaseManager>;

  beforeEach(() => {
    mockDb = {
      initialize: jest.fn(),
      executeQuery: jest.fn().mockResolvedValue([]),
      executeUpdate: jest.fn().mockResolvedValue(1),
      transaction: jest.fn(),
      batchUpdate: jest.fn(),
      close: jest.fn(),
    } as jest.Mocked<IDatabaseManager>;
    service = new SettingsService(mockDb);
  });

  describe('get', () => {
    it('returns the default when the key is absent', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([]);
      const value = await service.get('missing', 'fallback');
      expect(value).toBe('fallback');
    });

    it('parses and returns a stored JSON value', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([{ value: JSON.stringify({ a: 1 }) }]);
      const value = await service.get('k', {});
      expect(value).toEqual({ a: 1 });
    });

    it('falls back to the default on malformed JSON', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([{ value: 'not json{' }]);
      const value = await service.get('k', 'def');
      expect(value).toBe('def');
    });
  });

  describe('set', () => {
    it('upserts a JSON-encoded value', async () => {
      await service.set('k', { hello: 'world' });
      const call = mockDb.executeUpdate.mock.calls[0]!;
      expect(call[0]).toContain('INSERT INTO settings');
      expect(call[0]).toContain('ON CONFLICT(key) DO UPDATE');
      expect(call[1]![0]).toBe('k');
      expect(JSON.parse(call[1]![1] as string)).toEqual({ hello: 'world' });
    });
  });

  describe('remove', () => {
    it('deletes the key', async () => {
      await service.remove('k');
      const call = mockDb.executeUpdate.mock.calls[0]!;
      expect(call[0]).toContain('DELETE FROM settings');
      expect(call[1]).toEqual(['k']);
    });
  });

  describe('typed accessors', () => {
    it('defaults themeMode to light', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([]);
      expect(await service.getThemeMode()).toBe('light');
    });

    it('round-trips themeMode', async () => {
      await service.setThemeMode('dark');
      const stored = JSON.parse(mockDb.executeUpdate.mock.calls[0]![1]![1] as string);
      expect(stored).toBe('dark');
    });

    it('defaults reader font scale to 1.0', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([]);
      expect(await service.getReaderFontScale()).toBe(1.0);
    });

    it('defaults epub flow to paginated', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([]);
      expect(await service.getEpubFlow()).toBe('paginated');
    });

    it('reads a persisted epub flow', async () => {
      mockDb.executeQuery.mockResolvedValueOnce([{ value: JSON.stringify('scrolled') }]);
      expect(await service.getEpubFlow()).toBe('scrolled');
    });
  });
});
