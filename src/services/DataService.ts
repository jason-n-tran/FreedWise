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
