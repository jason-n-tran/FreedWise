// NotificationService implementation for daily review reminders
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { INotificationService, NotificationSettings, IHighlightService } from './interfaces';
import type { IDatabaseManager } from '../types/database';

const DAILY_NOTIFICATION_ID_KEY = 'notification_daily_id';
const NOTIFICATION_SETTINGS_KEY = 'notification_settings';
