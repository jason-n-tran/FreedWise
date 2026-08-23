// SettingsService — general-purpose typed persistence over the `settings` table.
//
// Values are JSON-encoded so any serializable type round-trips. Replaces the
// pattern of each feature poking the settings table directly. Keys for app-wide
// preferences are defined here as constants with typed accessors.

import type { IDatabaseManager } from '../types/database';
import type { ISettingsService, ThemeMode, EpubFlow } from './interfaces';

const KEY_THEME_MODE = 'pref_theme_mode';
const KEY_READER_FONT_SCALE = 'pref_reader_font_scale';
const KEY_EPUB_FLOW = 'pref_epub_flow';

const DEFAULT_THEME_MODE: ThemeMode = 'light';
const DEFAULT_FONT_SCALE = 1.0;
const DEFAULT_EPUB_FLOW: EpubFlow = 'paginated';

export class SettingsService implements ISettingsService {
  private db: IDatabaseManager;

  constructor(databaseManager: IDatabaseManager) {
    this.db = databaseManager;
  }

  async get<T>(key: string, defaultValue: T): Promise<T> {
    const rows = await this.db.executeQuery<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    if (rows.length === 0) {
      return defaultValue;
    }
    try {
      return JSON.parse(rows[0].value) as T;
    } catch {
      return defaultValue;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const now = Date.now();
    await this.db.executeUpdate(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), now]
    );
  }

  async remove(key: string): Promise<void> {
    await this.db.executeUpdate('DELETE FROM settings WHERE key = ?', [key]);
  }

  // --- Typed accessors ---

  getThemeMode(): Promise<ThemeMode> {
    return this.get<ThemeMode>(KEY_THEME_MODE, DEFAULT_THEME_MODE);
  }
  setThemeMode(mode: ThemeMode): Promise<void> {
    return this.set(KEY_THEME_MODE, mode);
  }

  getReaderFontScale(): Promise<number> {
    return this.get<number>(KEY_READER_FONT_SCALE, DEFAULT_FONT_SCALE);
  }
  setReaderFontScale(scale: number): Promise<void> {
    return this.set(KEY_READER_FONT_SCALE, scale);
  }

  getEpubFlow(): Promise<EpubFlow> {
    return this.get<EpubFlow>(KEY_EPUB_FLOW, DEFAULT_EPUB_FLOW);
  }
  setEpubFlow(flow: EpubFlow): Promise<void> {
    return this.set(KEY_EPUB_FLOW, flow);
  }
}
