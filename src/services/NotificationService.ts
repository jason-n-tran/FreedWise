// NotificationService implementation for daily review reminders
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { INotificationService, NotificationSettings, IHighlightService } from './interfaces';
import type { IDatabaseManager } from '../types/database';

const DAILY_NOTIFICATION_ID_KEY = 'notification_daily_id';
const NOTIFICATION_SETTINGS_KEY = 'notification_settings';
const NOTIFICATION_CHANNEL_ID = 'daily-review';

// Configure how notifications are presented when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class NotificationService implements INotificationService {
  private db: IDatabaseManager;
  private highlightService: IHighlightService;

  constructor(db: IDatabaseManager, highlightService: IHighlightService) {
    this.db = db;
    this.highlightService = highlightService;
  }

  /**
   * Request notification permissions from the user.
   * Requirements: 6.1, 6.10
   */
  async requestPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Schedule a daily repeating notification at the given time.
   * Cancels any existing daily notification first to ensure uniqueness.
   * Requirements: 6.2, 6.3, 6.12
   */
  async scheduleDailyReviewNotification(time: Date): Promise<void> {
    // Cancel existing notification first (Requirement 6.12: only one at a time)
    await this.cancelDailyNotification();

    // Android 8+ requires a notification channel or notifications silently never
    // appear. Must exist before scheduling against it.
    await this.ensureAndroidChannel();

    const dueCount = await this.getDueHighlightsCount();
    const body = this.formatNotificationBody(dueCount);

    // Requirement 6.3: Use user-configured time of day
    const trigger: Notifications.DailyTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.getHours(),
      minute: time.getMinutes(),
      channelId: NOTIFICATION_CHANNEL_ID,
    };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Freedwise Reader',
        body,
        // Requirement 6.8: data payload to navigate to ReviewDashboard on tap
        data: { navigateTo: 'Review' },
        sound: true,
      },
      trigger,
    });

    // Persist the notification ID so we can cancel it later
    await this.saveSetting(DAILY_NOTIFICATION_ID_KEY, notificationId);
  }

  /**
   * Create the Android notification channel (idempotent). No-op on iOS.
   * Without this, scheduled notifications never display on Android 8+.
   */
  private async ensureAndroidChannel(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'Daily Review Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  /**
   * Cancel the scheduled daily notification.
   * Requirements: 6.10
   */
  async cancelDailyNotification(): Promise<void> {
    const existingId = await this.loadSetting(DAILY_NOTIFICATION_ID_KEY);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
      await this.deleteSetting(DAILY_NOTIFICATION_ID_KEY);
    }
  }

  /**
   * Get persisted notification settings.
   * Requirement: 6.9
   */
  async getNotificationSettings(): Promise<NotificationSettings> {
    const raw = await this.loadSetting(NOTIFICATION_SETTINGS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as NotificationSettings;
      } catch {
        // Fall through to defaults
      }
    }

    return {
      enabled: false,
      dailyTime: '09:00',
      soundEnabled: true,
      vibrationEnabled: true,
    };
  }

  /**
   * Persist notification settings and reschedule if enabled.
   * Requirement: 6.9
   */
  async updateNotificationSettings(settings: NotificationSettings): Promise<void> {
    await this.saveSetting(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));

    if (settings.enabled) {
      const [hours, minutes] = settings.dailyTime.split(':').map(Number);
      const time = new Date();
      time.setHours(hours, minutes, 0, 0);
      // Requirement 6.9: cancel previous and schedule new when time changes
      await this.scheduleDailyReviewNotification(time);
    } else {
      // Requirement 6.10: cancel when disabled
      await this.cancelDailyNotification();
    }
  }

  /**
   * Send an immediate (non-scheduled) notification.
   */
  async sendImmediateNotification(title: string, body: string): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  }

  /**
   * Format notification body based on due count.
   * Requirements: 6.4, 6.5, 6.6, 6.7, 6.11
   */
  formatNotificationBody(dueCount: number): string {
    if (dueCount === 0) {
      return 'No highlights due today';
    }
    if (dueCount === 1) {
      return '1 highlight due for review';
    }
    return `${dueCount} highlights due for review`;
  }

  /**
   * Get the count of highlights due today (excludes discarded).
   * Requirements: 6.4, 6.11
   */
  private async getDueHighlightsCount(): Promise<number> {
    try {
      const due = await this.highlightService.getDueHighlights(new Date());
      return due.length;
    } catch {
      return 0;
    }
  }

  // --- Settings persistence helpers (uses the settings table) ---

  private async saveSetting(key: string, value: string): Promise<void> {
    const now = Date.now();
    await this.db.executeUpdate(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now]
    );
  }

  private async loadSetting(key: string): Promise<string | null> {
    const rows = await this.db.executeQuery<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return rows.length > 0 ? rows[0].value : null;
  }

  private async deleteSetting(key: string): Promise<void> {
    await this.db.executeUpdate('DELETE FROM settings WHERE key = ?', [key]);
  }
}
