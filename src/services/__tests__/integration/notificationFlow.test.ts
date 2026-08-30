/**
 * Integration test: Notification flow end-to-end
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.8, 6.10, 6.12
 *
 * This test verifies the complete notification flow:
 * 1. requestPermissions() returns true when permissions are granted (Req 6.1)
 * 2. scheduleDailyReviewNotification(time) schedules a repeating daily notification
 *    at the configured time (Req 6.2, 6.3)
 * 3. The notification content includes the due highlights count (Req 6.4)
 * 4. The notification data payload contains the navigation target for ReviewDashboard (Req 6.8)
 * 5. cancelDailyNotification() cancels the scheduled notification (Req 6.10)
 * 6. Only one daily notification exists at a time (Req 6.12)
 *
 * Since this is a unit/integration test (not a device test):
 * - "notification appears at scheduled time" is verified by checking the trigger config
 * - "tap notification" is verified by checking the data payload
 */

// jest.mock must be called before imports — the factory cannot reference
// variables declared in the outer scope (they are not yet initialised when
// the mock factory runs due to hoisting).
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
  },
  AndroidImportance: {
    DEFAULT: 3,
  },
}));

import * as ExpoNotifications from 'expo-notifications';
import { NotificationService } from '../../NotificationService';
import type { IHighlightService } from '../../interfaces';
import type { IDatabaseManager, Transaction } from '../../../types/database';
import type { Highlight } from '../../../types/models';

// ---------------------------------------------------------------------------
// Helpers to access the mocked functions with proper typing
// ---------------------------------------------------------------------------

const mockGetPermissionsAsync = ExpoNotifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissionsAsync = ExpoNotifications.requestPermissionsAsync as jest.Mock;
const mockScheduleNotificationAsync = ExpoNotifications.scheduleNotificationAsync as jest.Mock;
const mockCancelScheduledNotificationAsync =
  ExpoNotifications.cancelScheduledNotificationAsync as jest.Mock;

// ---------------------------------------------------------------------------
// In-memory database for settings persistence
// ---------------------------------------------------------------------------

interface AnyRow {
  [key: string]: any;
}

class InMemoryDatabase implements IDatabaseManager {
  private tables: Map<string, AnyRow[]> = new Map();

  async initialize(): Promise<void> {
    this.tables.set('settings', []);
    this.tables.set('highlights', []);
    this.tables.set('books', []);
  }

  async executeQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    return this.runSql(sql, params) as T[];
  }

  async executeUpdate(sql: string, params: any[] = []): Promise<number> {
    const result = this.runSql(sql, params);
    return typeof result === 'number' ? result : 1;
  }

  async transaction(callback: (tx: Transaction) => Promise<void>): Promise<void> {
    const tx: Transaction = {
      executeQuery: async <T>(sql: string, p: any[] = []) => this.runSql(sql, p) as T[],
      executeUpdate: async (sql: string, p: any[] = []) => {
        const r = this.runSql(sql, p);
        return typeof r === 'number' ? r : 1;
      },
    };
    await callback(tx);
  }

  async batchUpdate(operations: { sql: string; params?: any[] }[]): Promise<void> {
    for (const op of operations) {
      this.runSql(op.sql, op.params ?? []);
    }
  }

  async close(): Promise<void> {
    this.tables.clear();
  }

  getTable(name: string): AnyRow[] {
    return this.tables.get(name) ?? [];
  }

  private runSql(sql: string, params: any[]): any {
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT')) return this.handleSelect(sql, params);
    if (upper.startsWith('INSERT')) return this.handleInsert(sql, params);
    if (upper.startsWith('DELETE')) return this.handleDelete(sql, params);
    return [];
  }

  private handleSelect(sql: string, params: any[]): AnyRow[] {
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableMatch) return [];
    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName) ?? [];

    // WHERE key = ?
    if (/WHERE\s+key\s*=\s*\?/i.test(sql) && params.length > 0) {
      return table.filter(r => r.key === params[0]);
    }

    // WHERE due_date <= ? AND is_discarded = 0
    if (/WHERE\s+due_date\s*<=\s*\?/i.test(sql)) {
      const targetDate = params[0];
      return table.filter(r => r.due_date <= targetDate && r.is_discarded === 0);
    }

    return [...table];
  }

  private handleInsert(sql: string, params: any[]): number {
    const tableMatch = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i);
    if (!tableMatch) return 0;
    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return 0;

    const colMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colMatch) return 0;

    const columns = colMatch[1].split(',').map(c => c.trim().replace(/[`"[\]]/g, ''));
    const row: AnyRow = {};
    columns.forEach((col, i) => {
      row[col] = params[i] !== undefined ? params[i] : null;
    });

    // Handle INSERT ... ON CONFLICT for settings (upsert)
    if (/ON\s+CONFLICT/i.test(sql) && tableName === 'settings') {
      const idx = table.findIndex(r => r.key === row.key);
      if (idx >= 0) {
        table[idx] = row;
      } else {
        table.push(row);
      }
      return 1;
    }

    table.push(row);
    return 1;
  }

  private handleDelete(sql: string, params: any[]): number {
    const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (!tableMatch) return 0;
    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return 0;

    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (!whereMatch || params.length === 0) return 0;
    const whereCol = whereMatch[1].toLowerCase();
    const whereValue = params[0];

    const before = table.length;
    const filtered = table.filter(r => r[whereCol] !== whereValue);
    this.tables.set(tableName, filtered);
    return before - filtered.length;
  }
}

// ---------------------------------------------------------------------------
// Mock HighlightService
// ---------------------------------------------------------------------------

function createMockHighlightService(dueCount: number): IHighlightService {
  const dueHighlights: Highlight[] = Array.from({ length: dueCount }, (_, i) => ({
    id: `highlight-${i}`,
    bookId: 'book-1',
    text: `Highlight ${i}`,
    tags: [],
    position: { pageNumber: i + 1 },
    color: '#FFEB3B',
    createdAt: new Date(),
    updatedAt: new Date(),
    dueDate: new Date(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 'new' as const,
    isFlashcard: false,
    isDiscarded: false,
  }));

  return {
    createHighlight: jest.fn(),
    getHighlightsByBook: jest.fn(),
    getHighlightById: jest.fn(),
    updateHighlight: jest.fn(),
    deleteHighlight: jest.fn(),
    searchHighlights: jest.fn(),
    getDueHighlights: jest.fn().mockResolvedValue(dueHighlights),
    getHighlightsByTag: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Notification mock state — tracks scheduled notifications in memory
// ---------------------------------------------------------------------------

const scheduledNotifications: Map<string, { content: any; trigger: any }> = new Map();
let notificationIdCounter = 0;

function setupNotificationMocks({
  permissionStatus = 'granted',
  existingPermission = 'undetermined',
}: {
  permissionStatus?: string;
  existingPermission?: string;
} = {}) {
  notificationIdCounter = 0;
  scheduledNotifications.clear();

  mockGetPermissionsAsync.mockResolvedValue({ status: existingPermission });
  mockRequestPermissionsAsync.mockResolvedValue({ status: permissionStatus });

  mockScheduleNotificationAsync.mockImplementation(
    async (request: { content: any; trigger: any }) => {
      const id = `notification-id-${++notificationIdCounter}`;
      scheduledNotifications.set(id, {
        content: request.content,
        trigger: request.trigger,
      });
      return id;
    }
  );

  mockCancelScheduledNotificationAsync.mockImplementation(async (id: string) => {
    scheduledNotifications.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: Notification flow end-to-end', () => {
  let db: InMemoryDatabase;
  let notificationService: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = new InMemoryDatabase();
    await db.initialize();
    setupNotificationMocks();
  });

  afterEach(async () => {
    await db.close();
  });

  // -------------------------------------------------------------------------
  // Requirement 6.1 — requestPermissions() returns true when granted
  // -------------------------------------------------------------------------

  describe('requestPermissions (Req 6.1)', () => {
    it('should return true when permissions are already granted', async () => {
      setupNotificationMocks({ existingPermission: 'granted' });
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const result = await notificationService.requestPermissions();

      expect(result).toBe(true);
      // Should not request again if already granted
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('should request permissions and return true when user grants them', async () => {
      setupNotificationMocks({ existingPermission: 'undetermined', permissionStatus: 'granted' });
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const result = await notificationService.requestPermissions();

      expect(result).toBe(true);
      expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('should return false when user denies permissions', async () => {
      setupNotificationMocks({ existingPermission: 'undetermined', permissionStatus: 'denied' });
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const result = await notificationService.requestPermissions();

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.2, 6.3 — scheduleDailyReviewNotification schedules a
  // repeating daily notification at the configured time
  // -------------------------------------------------------------------------

  describe('scheduleDailyReviewNotification (Req 6.2, 6.3)', () => {
    it('should schedule a daily repeating notification', async () => {
      const highlightService = createMockHighlightService(3);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.trigger.type).toBe('daily');
    });

    it('should use the user-configured hour and minute (Req 6.3)', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(14, 30, 0, 0); // 2:30 PM

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.trigger.hour).toBe(14);
      expect(callArg.trigger.minute).toBe(30);
    });

    it('should persist the notification ID to the database', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      const settings = db.getTable('settings');
      const notificationIdRow = settings.find(r => r.key === 'notification_daily_id');
      expect(notificationIdRow).toBeDefined();
      expect(notificationIdRow!.value).toBe('notification-id-1');
    });

    it('creates the Android channel and tags the trigger with it (Android only)', async () => {
      // Force the Android branch of ensureAndroidChannel.
      const RN = require('react-native');
      const originalOS = RN.Platform.OS;
      RN.Platform.OS = 'android';
      try {
        const highlightService = createMockHighlightService(2);
        notificationService = new NotificationService(db, highlightService);

        const scheduledTime = new Date();
        scheduledTime.setHours(9, 0, 0, 0);

        await notificationService.scheduleDailyReviewNotification(scheduledTime);

        const setChannel = ExpoNotifications.setNotificationChannelAsync as jest.Mock;
        expect(setChannel).toHaveBeenCalledWith('daily-review', expect.any(Object));

        const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
        expect(callArg.trigger.channelId).toBe('daily-review');
      } finally {
        RN.Platform.OS = originalOS;
      }
    });

    it('does NOT create a channel on iOS', async () => {
      const RN = require('react-native');
      const originalOS = RN.Platform.OS;
      RN.Platform.OS = 'ios';
      try {
        (ExpoNotifications.setNotificationChannelAsync as jest.Mock).mockClear();
        const highlightService = createMockHighlightService(1);
        notificationService = new NotificationService(db, highlightService);

        const scheduledTime = new Date();
        scheduledTime.setHours(9, 0, 0, 0);

        await notificationService.scheduleDailyReviewNotification(scheduledTime);

        expect(ExpoNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
      } finally {
        RN.Platform.OS = originalOS;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.4 — Notification content includes due highlights count
  // -------------------------------------------------------------------------

  describe('notification content with due highlights count (Req 6.4)', () => {
    it('should display "No highlights due today" when count is 0 (Req 6.5)', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.content.body).toBe('No highlights due today');
    });

    it('should display "1 highlight due for review" when count is 1 (Req 6.6)', async () => {
      const highlightService = createMockHighlightService(1);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.content.body).toBe('1 highlight due for review');
    });

    it('should display "X highlights due for review" when count is greater than 1 (Req 6.7)', async () => {
      const highlightService = createMockHighlightService(5);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.content.body).toBe('5 highlights due for review');
    });

    it('should include the app title in the notification', async () => {
      const highlightService = createMockHighlightService(2);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.content.title).toBe('Freedwise Reader');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.8 — Tapping notification navigates to ReviewDashboard
  // -------------------------------------------------------------------------

  describe('notification tap navigates to ReviewDashboard (Req 6.8)', () => {
    it('should include navigation target in notification data payload', async () => {
      const highlightService = createMockHighlightService(3);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.content.data).toBeDefined();
      // The data payload should contain a navigation target pointing to the Review screen
      expect(callArg.content.data.navigateTo).toBe('Review');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.10 — cancelDailyNotification cancels the scheduled notification
  // -------------------------------------------------------------------------

  describe('cancelDailyNotification (Req 6.10)', () => {
    it('should cancel the scheduled notification', async () => {
      const highlightService = createMockHighlightService(2);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      // Schedule first
      await notificationService.scheduleDailyReviewNotification(scheduledTime);
      expect(scheduledNotifications.size).toBe(1);

      // Cancel
      await notificationService.cancelDailyNotification();

      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-id-1');
      expect(scheduledNotifications.size).toBe(0);
    });

    it('should remove the notification ID from the database after cancellation', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const scheduledTime = new Date();
      scheduledTime.setHours(9, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(scheduledTime);

      // Verify ID was persisted
      let settings = db.getTable('settings');
      expect(settings.find(r => r.key === 'notification_daily_id')).toBeDefined();

      await notificationService.cancelDailyNotification();

      // Verify ID was removed
      settings = db.getTable('settings');
      expect(settings.find(r => r.key === 'notification_daily_id')).toBeUndefined();
    });

    it('should do nothing when no notification is scheduled', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      // Cancel without scheduling first — should not throw
      await expect(notificationService.cancelDailyNotification()).resolves.not.toThrow();
      expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6.12 — Only one daily notification exists at a time
  // -------------------------------------------------------------------------

  describe('notification uniqueness (Req 6.12)', () => {
    it('should cancel the previous notification before scheduling a new one', async () => {
      const highlightService = createMockHighlightService(1);
      notificationService = new NotificationService(db, highlightService);

      const firstTime = new Date();
      firstTime.setHours(8, 0, 0, 0);

      const secondTime = new Date();
      secondTime.setHours(10, 0, 0, 0);

      // Schedule first notification
      await notificationService.scheduleDailyReviewNotification(firstTime);
      expect(scheduledNotifications.size).toBe(1);
      const firstId = 'notification-id-1';

      // Schedule second notification — should cancel the first
      await notificationService.scheduleDailyReviewNotification(secondTime);

      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(firstId);
      // Only one notification should remain
      expect(scheduledNotifications.size).toBe(1);
    });

    it('should update the persisted notification ID when rescheduling', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const firstTime = new Date();
      firstTime.setHours(8, 0, 0, 0);

      const secondTime = new Date();
      secondTime.setHours(10, 0, 0, 0);

      await notificationService.scheduleDailyReviewNotification(firstTime);
      await notificationService.scheduleDailyReviewNotification(secondTime);

      const settings = db.getTable('settings');
      const notificationIdRow = settings.find(r => r.key === 'notification_daily_id');
      expect(notificationIdRow).toBeDefined();
      // Should be the second notification's ID
      expect(notificationIdRow!.value).toBe('notification-id-2');
    });

    it('should use the new time when rescheduling', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const firstTime = new Date();
      firstTime.setHours(8, 0, 0, 0);

      const secondTime = new Date();
      secondTime.setHours(20, 45, 0, 0); // 8:45 PM

      await notificationService.scheduleDailyReviewNotification(firstTime);
      await notificationService.scheduleDailyReviewNotification(secondTime);

      // The second scheduleNotificationAsync call should use the new time
      const secondCallArg = mockScheduleNotificationAsync.mock.calls[1][0];
      expect(secondCallArg.trigger.hour).toBe(20);
      expect(secondCallArg.trigger.minute).toBe(45);
    });
  });

  // -------------------------------------------------------------------------
  // updateNotificationSettings — full settings flow
  // -------------------------------------------------------------------------

  describe('updateNotificationSettings', () => {
    it('should schedule a notification when settings are enabled', async () => {
      const highlightService = createMockHighlightService(2);
      notificationService = new NotificationService(db, highlightService);

      await notificationService.updateNotificationSettings({
        enabled: true,
        dailyTime: '09:30',
        soundEnabled: true,
        vibrationEnabled: true,
      });

      expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const callArg = mockScheduleNotificationAsync.mock.calls[0][0];
      expect(callArg.trigger.hour).toBe(9);
      expect(callArg.trigger.minute).toBe(30);
    });

    it('should cancel the notification when settings are disabled (Req 6.10)', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      // First enable
      await notificationService.updateNotificationSettings({
        enabled: true,
        dailyTime: '09:00',
        soundEnabled: true,
        vibrationEnabled: true,
      });

      // Then disable
      await notificationService.updateNotificationSettings({
        enabled: false,
        dailyTime: '09:00',
        soundEnabled: true,
        vibrationEnabled: true,
      });

      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-id-1');
      expect(scheduledNotifications.size).toBe(0);
    });

    it('should persist settings to the database', async () => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);

      const settings = {
        enabled: true,
        dailyTime: '18:00',
        soundEnabled: false,
        vibrationEnabled: true,
      };

      await notificationService.updateNotificationSettings(settings);

      const storedSettings = await notificationService.getNotificationSettings();
      expect(storedSettings.enabled).toBe(true);
      expect(storedSettings.dailyTime).toBe('18:00');
      expect(storedSettings.soundEnabled).toBe(false);
      expect(storedSettings.vibrationEnabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // formatNotificationBody — unit tests for body formatting
  // -------------------------------------------------------------------------

  describe('formatNotificationBody', () => {
    beforeEach(() => {
      const highlightService = createMockHighlightService(0);
      notificationService = new NotificationService(db, highlightService);
    });

    it('should return "No highlights due today" for count 0 (Req 6.5)', () => {
      const body = (notificationService as any).formatNotificationBody(0);
      expect(body).toBe('No highlights due today');
    });

    it('should return "1 highlight due for review" for count 1 (Req 6.6)', () => {
      const body = (notificationService as any).formatNotificationBody(1);
      expect(body).toBe('1 highlight due for review');
    });

    it('should return "X highlights due for review" for count > 1 (Req 6.7)', () => {
      const body = (notificationService as any).formatNotificationBody(7);
      expect(body).toBe('7 highlights due for review');
    });
  });
});
