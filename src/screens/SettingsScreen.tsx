// Settings Screen - app settings, notifications, and data management
// Requirements: 6.1, 6.2, 6.3, 6.9, 6.10, 13.5

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import type { MainTabScreenProps } from '../navigation/types';
import type {
  DataImportMode,
  DataImportSummary,
  NotificationSettings,
} from '../services/interfaces';
import ServiceFactory from '../services/ServiceFactory';
import { useAppStore } from '../store/appStore';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import { Masthead } from '../components';

type Props = MainTabScreenProps<'Settings'>;

const APP_VERSION = '1.0.0';

// Generate hours 0-23 and minutes 0, 15, 30, 45 for the time picker
const HOURS = Array.from({ length: 24 }, (_, i) => i);
