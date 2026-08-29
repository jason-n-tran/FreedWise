// DataService — complete JSON export/import and wipe of user-owned data.
//
// Export embeds book/cover bytes so a JSON file can act as a portable manual
// sync/backup. Import is intentionally conservative: merge keeps local settings
// and only updates same-id content when the incoming row is newer; replace
// restores the exported snapshot while leaving unknown device-only state alone.

import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { SCHEMA_VERSION } from '../database/schema';
import type { IDatabaseManager, Transaction } from '../types/database';
import type { DataImportMode, DataImportSummary, IDataService } from './interfaces';
import { base64ToBytes, bytesToBase64 } from '../utils/base64';

interface Row {
  [key: string]: unknown;
}

interface ExportAsset {
  fileName: string;
  base64: string;
}

interface ExportSnapshot {
  app?: string;
  version?: number;
  exportFormatVersion?: number;
  schemaVersion?: number;
  exportedAt?: string;
  sourcePlatform?: string;
  books?: Row[];
  highlights?: Row[];
  tags?: Row[];
  highlightTags?: Row[];
  reviewLogs?: Row[];
  settings?: Row[];
  assets?: {
    books?: Record<string, ExportAsset>;
    covers?: Record<string, ExportAsset>;
  };
}

const EXPORT_FORMAT_VERSION = 2;
const DEVICE_ONLY_SETTING_KEYS = new Set(['notification_daily_id']);

const BOOK_COLUMNS = [
  'id',
  'title',
  'author',
  'file_path',
  'file_type',
  'cover_image_path',
  'total_pages',
  'current_page',
  'last_cfi',
  'last_read_at',
  'created_at',
  'updated_at',
];

const HIGHLIGHT_COLUMNS = [
  'id',
  'book_id',
  'text',
  'note',
  'color',
  'position_data',
  'created_at',
  'updated_at',
  'due_date',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'reps',
  'lapses',
  'state',
  'last_reviewed_at',
  'is_flashcard',
  'flashcard_question',
  'is_discarded',
  'header_level',
];

const TAG_COLUMNS = ['id', 'name', 'created_at'];
const REVIEW_LOG_COLUMNS = [
  'id',
  'highlight_id',
  'grade',
  'reviewed_at',
  'elapsed_days',
  'scheduled_days',
  'state',
];
const SETTINGS_COLUMNS = ['key', 'value', 'updated_at'];

export class DataService implements IDataService {
  private db: IDatabaseManager;
  private booksDir = new Directory(Paths.document, 'books');
  private coversDir = new Directory(Paths.document, 'covers');

  constructor(databaseManager: IDatabaseManager) {
    this.db = databaseManager;
  }

  async buildExport(): Promise<string> {
    const [books, highlights, tags, highlightTags, reviewLogs, settings] = await Promise.all([
      this.db.executeQuery<Row>('SELECT * FROM books'),
      this.db.executeQuery<Row>('SELECT * FROM highlights'),
      this.db.executeQuery<Row>('SELECT * FROM tags'),
      this.db.executeQuery<Row>('SELECT * FROM highlight_tags'),
      this.db.executeQuery<Row>('SELECT * FROM review_logs'),
      this.db.executeQuery<Row>('SELECT * FROM settings'),
    ]);

    const assets = await this.collectAssets(books);
    const snapshot: ExportSnapshot = {
      app: 'Freedwise Reader',
      version: 1,
      exportFormatVersion: EXPORT_FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      sourcePlatform: Platform.OS,
      books,
      highlights,
      tags,
      highlightTags,
      reviewLogs,
      settings: settings.filter(row => !DEVICE_ONLY_SETTING_KEYS.has(String(row.key))),
      assets,
    };
    return JSON.stringify(snapshot, null, 2);
  }

  async saveExportToDevice(): Promise<string> {
    const json = await this.buildExport();
    const filename = `freedwise-export-${Date.now()}.json`;

    if (Platform.OS === 'android') {
      const permissions =
        await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        throw new Error('Save canceled.');
      }

      const uri = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        filename.replace(/\.json$/i, ''),
        'application/json'
      );
      await LegacyFileSystem.StorageAccessFramework.writeAsStringAsync(uri, json);
      return uri;
    }

    const directory = await Directory.pickDirectoryAsync();
    const file = directory.createFile(filename, 'application/json');
    file.write(json);
    return file.uri;
  }

  async exportAndShare(): Promise<void> {
    const json = await this.buildExport();
    const file = new File(Paths.cache, `freedwise-export-${Date.now()}.json`);
    if (file.exists) file.delete();
    file.create();
    file.write(json);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Freedwise data',
        UTI: 'public.json',
      });
    } else {
      throw new Error('Sharing is not available on this device.');
    }
  }

  async importFromPicker(mode: DataImportMode): Promise<DataImportSummary> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) {
      throw new Error('Import canceled.');
    }

    const picked = result.assets[0];
    const file = new File(picked.uri);
    return this.importFromJson(await file.text(), mode);
  }

  async importFromJson(json: string, mode: DataImportMode): Promise<DataImportSummary> {
    const snapshot = this.parseSnapshot(json);
    const summary = this.emptySummary(mode);
    const tagIdMap = new Map<string, string>();

    await this.ensureDirectoriesExist();
    const restoredPaths = await this.restoreAssets(snapshot, summary);

    await this.db.transaction(async tx => {
      if (mode === 'replace') {
        await tx.executeUpdate('DELETE FROM review_logs');
        await tx.executeUpdate('DELETE FROM highlight_tags');
        await tx.executeUpdate('DELETE FROM highlights');
        await tx.executeUpdate('DELETE FROM tags');
        await tx.executeUpdate('DELETE FROM books');
      }

      await this.importBooks(tx, snapshot.books ?? [], restoredPaths, summary, mode);
      await this.importTags(tx, snapshot.tags ?? [], tagIdMap, summary, mode);
      await this.importHighlights(tx, snapshot.highlights ?? [], summary, mode);
      await this.importHighlightTags(tx, snapshot.highlightTags ?? [], tagIdMap);
      await this.importReviewLogs(tx, snapshot.reviewLogs ?? [], summary, mode);
      await this.importSettings(tx, snapshot.settings ?? [], summary, mode);
    });

    return summary;
  }

  async clearAllData(): Promise<void> {
    // Wipe content tables in one transaction. books cascades to highlights ->
    // highlight_tags/review_logs, but we delete explicitly to also clear tags
    // and to be resilient if cascade pragmas differ. Settings are preserved.
    await this.db.transaction(async tx => {
      await tx.executeUpdate('DELETE FROM review_logs');
      await tx.executeUpdate('DELETE FROM highlight_tags');
      await tx.executeUpdate('DELETE FROM highlights');
      await tx.executeUpdate('DELETE FROM tags');
      await tx.executeUpdate('DELETE FROM books');
    });

    // Delete the book + cover files (leave webview-libs/ — they're app assets).
    for (const name of ['books', 'covers']) {
      try {
        const dir = new Directory(Paths.document, name);
        if (dir.exists) {
          dir.delete();
        }
      } catch (err) {
        console.warn(`Failed to delete ${name} directory:`, err);
      }
    }
  }

  private parseSnapshot(json: string): ExportSnapshot {
    let parsed: ExportSnapshot;
    try {
      parsed = JSON.parse(json) as ExportSnapshot;
    } catch {
      throw new Error('That file is not valid JSON.');
    }

    if (parsed.app !== 'Freedwise Reader') {
      throw new Error('That JSON file does not look like a Freedwise Reader export.');
    }
    for (const key of ['books', 'highlights', 'tags', 'highlightTags', 'reviewLogs'] as const) {
      if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
        throw new Error(`The export is invalid: ${key} must be an array.`);
      }
    }
    if ((parsed.schemaVersion ?? 1) > SCHEMA_VERSION) {
      throw new Error('This export was created by a newer app version. Update Freedwise first.');
    }

    return parsed;
  }

  private async collectAssets(books: Row[]): Promise<ExportSnapshot['assets']> {
    const assets = { books: {}, covers: {} } as {
      books: Record<string, ExportAsset>;
      covers: Record<string, ExportAsset>;
    };
    for (const book of books) {
      const id = String(book.id ?? '');
      if (!id) continue;
      const bookPath = typeof book.file_path === 'string' ? book.file_path : undefined;
      const coverPath =
        typeof book.cover_image_path === 'string' ? book.cover_image_path : undefined;

      const bookAsset = await this.readAsset(bookPath, `${id}.${book.file_type || 'book'}`);
      if (bookAsset) assets.books[id] = bookAsset;

      const coverAsset = await this.readAsset(coverPath, `${id}.png`);
      if (coverAsset) assets.covers[id] = coverAsset;
    }
    return assets;
  }

  private async readAsset(
    uri: string | undefined,
    fallbackFileName: string
  ): Promise<ExportAsset | null> {
    if (!uri) return null;
    try {
      const file = new File(uri);
      if (!file.exists) return null;
      return {
        fileName: this.sanitizeFileName(file.name || fallbackFileName),
        base64: bytesToBase64(await file.bytes()),
      };
    } catch (err) {
      console.warn('Failed to export asset:', err);
      return null;
    }
  }

  private async restoreAssets(
    snapshot: ExportSnapshot,
    summary: DataImportSummary
  ): Promise<Map<string, { bookPath?: string; coverPath?: string }>> {
    const paths = new Map<string, { bookPath?: string; coverPath?: string }>();
    const bookAssets = snapshot.assets?.books ?? {};
    const coverAssets = snapshot.assets?.covers ?? {};
    const bookIds = new Set([
      ...Object.keys(bookAssets),
      ...Object.keys(coverAssets),
      ...(snapshot.books ?? []).map(row => String(row.id ?? '')).filter(Boolean),
    ]);

    for (const id of bookIds) {
      const entry: { bookPath?: string; coverPath?: string } = {};
      const bookAsset = bookAssets[id];
      const coverAsset = coverAssets[id];

      if (bookAsset) {
        const file = await this.writeAsset(this.booksDir, bookAsset, id);
        entry.bookPath = file?.uri;
        if (file) summary.files.restored += 1;
      } else {
        summary.files.missing += 1;
      }

      if (coverAsset) {
        const file = await this.writeAsset(this.coversDir, coverAsset, id);
        entry.coverPath = file?.uri;
        if (file) summary.files.restored += 1;
      }

      paths.set(id, entry);
    }

    return paths;
  }

  private async writeAsset(
    directory: Directory,
    asset: ExportAsset,
    fallbackName: string
  ): Promise<File | null> {
    try {
      const file = new File(directory, this.sanitizeFileName(asset.fileName || fallbackName));
      if (file.exists) file.delete();
      file.create();
      file.write(base64ToBytes(asset.base64));
      return file;
    } catch (err) {
      console.warn('Failed to restore exported file:', err);
      return null;
    }
  }

  private async importBooks(
    tx: Transaction,
    rows: Row[],
    restoredPaths: Map<string, { bookPath?: string; coverPath?: string }>,
    summary: DataImportSummary,
    mode: DataImportMode
  ): Promise<void> {
    for (const row of rows) {
      const id = this.requiredString(row, 'id');
      const existing = await this.findById(tx, 'books', id);
      const paths = restoredPaths.get(id);
      const next = this.pick(row, BOOK_COLUMNS);

      if (paths?.bookPath) next.file_path = paths.bookPath;
      else if (existing?.file_path) next.file_path = existing.file_path;

      if (paths?.coverPath) next.cover_image_path = paths.coverPath;
      else if (existing?.cover_image_path) next.cover_image_path = existing.cover_image_path;

      if (!existing) {
        await this.insert(tx, 'books', BOOK_COLUMNS, next);
        summary.books.added += 1;
      } else if (mode === 'replace' || this.isIncomingNewer(row, existing)) {
        await this.update(tx, 'books', BOOK_COLUMNS, next, id);
        summary.books.updated += 1;
      } else if (paths?.bookPath && !this.fileExists(String(existing.file_path ?? ''))) {
        await tx.executeUpdate('UPDATE books SET file_path = ?, updated_at = ? WHERE id = ?', [
          paths.bookPath,
          Date.now(),
          id,
        ]);
        summary.books.updated += 1;
      } else {
        summary.books.unchanged += 1;
      }
    }
  }

  private async importTags(
    tx: Transaction,
    rows: Row[],
    tagIdMap: Map<string, string>,
    summary: DataImportSummary,
    mode: DataImportMode
  ): Promise<void> {
    for (const row of rows) {
      const id = this.requiredString(row, 'id');
      const name = this.requiredString(row, 'name');
      const existingById = await this.findById(tx, 'tags', id);
      const existingByName = await tx.executeQuery<Row>(
        'SELECT * FROM tags WHERE name = ? LIMIT 1',
        [name]
      );

      if (existingById) {
        tagIdMap.set(id, id);
        summary.tags.unchanged += 1;
      } else if (existingByName[0]) {
        tagIdMap.set(id, String(existingByName[0].id));
        summary.tags.reused += 1;
      } else {
        await this.insert(tx, 'tags', TAG_COLUMNS, this.pick(row, TAG_COLUMNS));
        tagIdMap.set(id, id);
        summary.tags.added += 1;
      }

      if (mode === 'replace' && existingById) {
        await this.update(tx, 'tags', TAG_COLUMNS, this.pick(row, TAG_COLUMNS), id);
      }
    }
  }

  private async importHighlights(
    tx: Transaction,
    rows: Row[],
    summary: DataImportSummary,
    mode: DataImportMode
  ): Promise<void> {
    for (const row of rows) {
      const id = this.requiredString(row, 'id');
      const bookId = this.requiredString(row, 'book_id');
      if (!(await this.findById(tx, 'books', bookId))) {
        summary.warnings.push(`Skipped highlight ${id}: missing book ${bookId}.`);
        continue;
      }

      const existing = await this.findById(tx, 'highlights', id);
      if (!existing) {
        await this.insert(tx, 'highlights', HIGHLIGHT_COLUMNS, this.pick(row, HIGHLIGHT_COLUMNS));
        summary.highlights.added += 1;
      } else if (mode === 'replace' || this.isIncomingNewer(row, existing)) {
        await this.update(
          tx,
          'highlights',
          HIGHLIGHT_COLUMNS,
          this.pick(row, HIGHLIGHT_COLUMNS),
          id
        );
        summary.highlights.updated += 1;
      } else {
        summary.highlights.unchanged += 1;
      }
    }
  }

  private async importHighlightTags(
    tx: Transaction,
    rows: Row[],
    tagIdMap: Map<string, string>
  ): Promise<void> {
    for (const row of rows) {
      const highlightId = this.requiredString(row, 'highlight_id');
      const incomingTagId = this.requiredString(row, 'tag_id');
      const tagId = tagIdMap.get(incomingTagId) ?? incomingTagId;
      if (!(await this.findById(tx, 'highlights', highlightId))) continue;
      if (!(await this.findById(tx, 'tags', tagId))) continue;
      await tx.executeUpdate(
        'INSERT OR IGNORE INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)',
        [highlightId, tagId]
      );
    }
  }

  private async importReviewLogs(
    tx: Transaction,
    rows: Row[],
    summary: DataImportSummary,
    mode: DataImportMode
  ): Promise<void> {
    for (const row of rows) {
      const id = this.requiredString(row, 'id');
      const highlightId = this.requiredString(row, 'highlight_id');
      if (!(await this.findById(tx, 'highlights', highlightId))) {
        summary.warnings.push(`Skipped review log ${id}: missing highlight ${highlightId}.`);
        continue;
      }

      const existing = await this.findById(tx, 'review_logs', id);
      if (!existing || mode === 'replace') {
        await this.upsert(
          tx,
          'review_logs',
          REVIEW_LOG_COLUMNS,
          this.pick(row, REVIEW_LOG_COLUMNS)
        );
        summary.reviewLogs.added += existing ? 0 : 1;
        summary.reviewLogs.unchanged += existing ? 1 : 0;
      } else {
        summary.reviewLogs.unchanged += 1;
      }
    }
  }

  private async importSettings(
    tx: Transaction,
    rows: Row[],
    summary: DataImportSummary,
    mode: DataImportMode
  ): Promise<void> {
    for (const row of rows) {
      const key = this.requiredString(row, 'key');
      if (DEVICE_ONLY_SETTING_KEYS.has(key) || mode === 'merge') {
        summary.settings.skipped += 1;
        continue;
      }

      await this.upsert(tx, 'settings', SETTINGS_COLUMNS, this.pick(row, SETTINGS_COLUMNS));
      summary.settings.imported += 1;
    }
  }

  private async findById(tx: Transaction, table: string, id: string): Promise<Row | null> {
    const rows = await tx.executeQuery<Row>(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  }

  private async insert(tx: Transaction, table: string, columns: string[], row: Row): Promise<void> {
    const placeholders = columns.map(() => '?').join(', ');
    await tx.executeUpdate(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
      columns.map(column => row[column] ?? null)
    );
  }

  private async update(
    tx: Transaction,
    table: string,
    columns: string[],
    row: Row,
    id: string
  ): Promise<void> {
    const updateColumns = columns.filter(column => column !== 'id');
    await tx.executeUpdate(
      `UPDATE ${table} SET ${updateColumns.map(column => `${column} = ?`).join(', ')} WHERE id = ?`,
      [...updateColumns.map(column => row[column] ?? null), id]
    );
  }

  private async upsert(tx: Transaction, table: string, columns: string[], row: Row): Promise<void> {
    const updateColumns = columns.filter(column => column !== columns[0]);
    const placeholders = columns.map(() => '?').join(', ');
    await tx.executeUpdate(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(${columns[0]}) DO UPDATE SET ${updateColumns
         .map(column => `${column} = excluded.${column}`)
         .join(', ')}`,
      columns.map(column => row[column] ?? null)
    );
  }

  private pick(row: Row, columns: string[]): Row {
    const picked: Row = {};
    for (const column of columns) {
      picked[column] = row[column] ?? null;
    }
    return picked;
  }

  private isIncomingNewer(incoming: Row, existing: Row): boolean {
    return Number(incoming.updated_at ?? 0) > Number(existing.updated_at ?? 0);
  }

  private requiredString(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`The export is invalid: missing ${key}.`);
    }
    return value;
  }

  private fileExists(uri: string): boolean {
    if (!uri) return false;
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }

  private async ensureDirectoriesExist(): Promise<void> {
    if (!this.booksDir.exists) {
      this.booksDir.create({ intermediates: true, idempotent: true });
    }
    if (!this.coversDir.exists) {
      this.coversDir.create({ intermediates: true, idempotent: true });
    }
  }

  private emptySummary(mode: DataImportMode): DataImportSummary {
    return {
      mode,
      books: { added: 0, updated: 0, unchanged: 0 },
      highlights: { added: 0, updated: 0, unchanged: 0 },
      tags: { added: 0, reused: 0, unchanged: 0 },
      reviewLogs: { added: 0, unchanged: 0 },
      settings: { imported: 0, skipped: 0 },
      files: { restored: 0, missing: 0 },
      warnings: [],
    };
  }
}
