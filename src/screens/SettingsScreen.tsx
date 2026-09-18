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
const MINUTES = [0, 15, 30, 45];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: isNaN(h) ? 9 : h, minute: isNaN(m) ? 0 : m };
}

export default function SettingsScreen(_props: Props) {
  const styles = useStyles();
  const { palette, mode, setMode } = useTheme();
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    dailyTime: '09:00',
    soundEnabled: true,
    vibrationEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState(0);
  // Reader preferences (persisted via SettingsService).
  const [fontScale, setFontScale] = useState(1.0);
  const [epubFlow, setEpubFlow] = useState<'paginated' | 'scrolled'>('paginated');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const resetStore = useAppStore(s => s.reset);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const svc = ServiceFactory.getInstance().getNotificationService();
      const s = await svc.getNotificationSettings();
      setSettings(s);
      const { hour, minute } = parseTime(s.dailyTime);
      setPickerHour(hour);
      setPickerMinute(minute);
      const settingsSvc = ServiceFactory.getInstance().getSettingsService();
      setFontScale(await settingsSvc.getReaderFontScale());
      setEpubFlow(await settingsSvc.getEpubFlow());
    } catch (err) {
      console.error('Failed to load notification settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const FONT_MIN = 0.8;
  const FONT_MAX = 1.6;
  const changeFontScale = (delta: number) => {
    const next = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round((fontScale + delta) * 10) / 10));
    setFontScale(next);
    ServiceFactory.getInstance().getSettingsService().setReaderFontScale(next);
  };

  const changeEpubFlow = (flow: 'paginated' | 'scrolled') => {
    setEpubFlow(flow);
    ServiceFactory.getInstance().getSettingsService().setEpubFlow(flow);
  };

  const saveSettings = useCallback(async (updated: NotificationSettings) => {
    try {
      const svc = ServiceFactory.getInstance().getNotificationService();
      await svc.updateNotificationSettings(updated);
      setSettings(updated);
    } catch (err) {
      console.error('Failed to save notification settings:', err);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    }
  }, []);

  // Requirements 6.1, 6.2, 6.10: toggle notifications with permission request
  const handleToggleNotifications = useCallback(
    async (value: boolean) => {
      if (value) {
        const svc = ServiceFactory.getInstance().getNotificationService();
        const granted = await svc.requestPermissions();
        if (!granted) {
          // Requirement 13.5: show permission denied message, continue without notifications
          setPermissionDenied(true);
          return;
        }
        setPermissionDenied(false);
      }
      await saveSettings({ ...settings, enabled: value });
    },
    [settings, saveSettings]
  );

  const handleToggleSound = useCallback(
    async (value: boolean) => {
      await saveSettings({ ...settings, soundEnabled: value });
    },
    [settings, saveSettings]
  );

  const handleToggleVibration = useCallback(
    async (value: boolean) => {
      await saveSettings({ ...settings, vibrationEnabled: value });
    },
    [settings, saveSettings]
  );

  // Open time picker pre-populated with current time
  const openTimePicker = () => {
    const { hour, minute } = parseTime(settings.dailyTime);
    setPickerHour(hour);
    // Snap to nearest 15-min slot
    const snapped = MINUTES.reduce((prev, curr) =>
      Math.abs(curr - minute) < Math.abs(prev - minute) ? curr : prev
    );
    setPickerMinute(snapped);
    setTimePickerVisible(true);
  };

  // Requirement 6.9: cancel previous and schedule new when time changes
  const handleConfirmTime = useCallback(async () => {
    const newTime = `${pad(pickerHour)}:${pad(pickerMinute)}`;
    setTimePickerVisible(false);
    await saveSettings({ ...settings, dailyTime: newTime });
  }, [pickerHour, pickerMinute, settings, saveSettings]);

  const handleExportData = async () => {
    setExporting(true);
    try {
      await ServiceFactory.getInstance().getDataService().exportAndShare();
    } catch (err) {
      console.error('Export failed:', err);
      Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export data');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveExport = async () => {
    setExporting(true);
    try {
      const uri = await ServiceFactory.getInstance().getDataService().saveExportToDevice();
      Alert.alert('Export Saved', `File saved to:\n${uri}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save export';
      if (message !== 'Save canceled.') {
        console.error('Save export failed:', err);
        Alert.alert('Save Failed', message);
      }
    } finally {
      setExporting(false);
    }
  };

  const formatImportSummary = (summary: DataImportSummary): string => {
    const content =
      `Books: ${summary.books.added} added, ${summary.books.updated} updated\n` +
      `Highlights: ${summary.highlights.added} added, ${summary.highlights.updated} updated\n` +
      `Review logs: ${summary.reviewLogs.added} added\n` +
      `Files restored: ${summary.files.restored}`;
    const settings =
      summary.mode === 'replace'
        ? `\nSettings restored: ${summary.settings.imported}`
        : '\nSettings kept from this device';
    const warnings =
      summary.warnings.length > 0
        ? `\n\nWarnings:\n${summary.warnings.slice(0, 3).join('\n')}`
        : summary.files.missing > 0
          ? `\n\n${summary.files.missing} book file(s) were not embedded in the export.`
          : '';
    return content + settings + warnings;
  };

  const runImport = async (mode: DataImportMode) => {
    setImporting(true);
    try {
      const summary = await ServiceFactory.getInstance().getDataService().importFromPicker(mode);
      resetStore();
      await loadSettings();
      Alert.alert('Import Complete', formatImportSummary(summary));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not import data';
      if (message !== 'Import canceled.') {
        console.error('Import failed:', err);
        Alert.alert('Import Failed', message);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleImportData = () => {
    Alert.alert(
      'Import Freedwise JSON',
      'Merge keeps this device’s settings and only updates matching books/highlights when the export is newer. Restore replaces local library data with the export.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: () => runImport('merge') },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Restore From Export',
              'This replaces local books, highlights, tags, review logs, and restorable settings with the JSON export. Continue?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Restore', style: 'destructive', onPress: () => runImport('replace') },
              ]
            );
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all books, highlights, and review history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await ServiceFactory.getInstance().getDataService().clearAllData();
              // Reset shared state so all screens reflect the empty library.
              resetStore();
              Alert.alert('Done', 'All data has been cleared.');
            } catch (err) {
              console.error('Clear data failed:', err);
              Alert.alert('Error', 'Failed to clear data.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>LOADING…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Masthead readout={['v' + APP_VERSION, 'OFFLINE']} title="Settings" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Notification Settings Section */}
        <Text style={styles.sectionHeader}>Notifications</Text>
        <View style={styles.card}>
          <SettingRow
            label="Daily Review Reminder"
            description="Get reminded to review your highlights"
          >
            <Switch
              value={settings.enabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: palette.lineSoft, true: palette.ink }}
              thumbColor={Platform.OS === 'android' ? palette.marker : undefined}
            />
          </SettingRow>

          {permissionDenied && (
            <Text style={styles.permissionWarning}>
              Notification permission was denied. Please enable it in your device settings to
              receive reminders.
            </Text>
          )}

          {settings.enabled && (
            <>
              <View style={styles.separator} />
              <TouchableOpacity style={styles.row} onPress={openTimePicker} activeOpacity={0.7}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel}>Reminder Time</Text>
                  <Text style={styles.rowDescription}>Daily notification time</Text>
                </View>
                <Text style={styles.timeValue}>{settings.dailyTime}</Text>
              </TouchableOpacity>

              <View style={styles.separator} />
              <SettingRow label="Sound" description="Play sound with notification">
                <Switch
                  value={settings.soundEnabled}
                  onValueChange={handleToggleSound}
                  trackColor={{ false: palette.lineSoft, true: palette.ink }}
                  thumbColor={Platform.OS === 'android' ? palette.marker : undefined}
                />
              </SettingRow>

              <View style={styles.separator} />
              <SettingRow label="Vibration" description="Vibrate with notification">
                <Switch
                  value={settings.vibrationEnabled}
                  onValueChange={handleToggleVibration}
                  trackColor={{ false: palette.lineSoft, true: palette.ink }}
                  thumbColor={Platform.OS === 'android' ? palette.marker : undefined}
                />
              </SettingRow>
            </>
          )}
        </View>

        {/* Appearance Section */}
        <Text style={styles.sectionHeader}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.rowColumn}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Theme</Text>
              <Text style={styles.rowDescription}>Light / Dark / System</Text>
            </View>
            <View style={styles.segment}>
              {(['light', 'dark', 'system'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.segmentItem, mode === m && styles.segmentItemActive]}
                  onPress={() => setMode(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                    {m.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Font Size</Text>
              <Text style={styles.rowDescription}>EPUB reader text size</Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => changeFontScale(-0.1)}
                disabled={fontScale <= FONT_MIN}
                activeOpacity={0.8}
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{Math.round(fontScale * 100)}%</Text>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => changeFontScale(0.1)}
                disabled={fontScale >= FONT_MAX}
                activeOpacity={0.8}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.rowColumn}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Reading Mode</Text>
              <Text style={styles.rowDescription}>Tap-to-flip pages or continuous scroll</Text>
            </View>
            <View style={styles.segment}>
              {(['paginated', 'scrolled'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.segmentItem, epubFlow === f && styles.segmentItemActive]}
                  onPress={() => changeEpubFlow(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, epubFlow === f && styles.segmentTextActive]}>
                    {f === 'paginated' ? 'PAGES' : 'SCROLL'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Data Management Section */}
        <Text style={styles.sectionHeader}>Data</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={handleExportData}
            disabled={exporting}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Export Data</Text>
              <Text style={styles.rowDescription}>Export everything as JSON</Text>
            </View>
            <Text style={styles.rowValue}>{exporting ? '…' : 'SHARE'}</Text>
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity
            style={styles.row}
            onPress={handleSaveExport}
            disabled={exporting}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Save Export</Text>
              <Text style={styles.rowDescription}>Save JSON file to device storage</Text>
            </View>
            <Text style={styles.rowValue}>{exporting ? '…' : 'SAVE'}</Text>
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity
            style={styles.row}
            onPress={handleImportData}
            disabled={importing}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowLabel}>Import Data</Text>
              <Text style={styles.rowDescription}>Merge or restore from JSON</Text>
            </View>
            <Text style={styles.rowValue}>{importing ? '…' : 'CHOOSE'}</Text>
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.row} onPress={handleClearData} activeOpacity={0.7}>
            <Text style={styles.dangerLabel}>Clear All Data</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>{APP_VERSION}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Storage</Text>
            <Text style={styles.rowValue}>Local only</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Network</Text>
            <Text style={styles.rowValue}>Offline</Text>
          </View>
        </View>

        {/* Time Picker Modal */}
        <TimePickerModal
          visible={timePickerVisible}
          hour={pickerHour}
          minute={pickerMinute}
          onChangeHour={setPickerHour}
          onChangeMinute={setPickerMinute}
          onConfirm={handleConfirmTime}
          onCancel={() => setTimePickerVisible(false)}
        />
      </ScrollView>
    </View>
  );
}

// --- Sub-components ---

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

interface TimePickerModalProps {
  visible: boolean;
  hour: number;
  minute: number;
  onChangeHour: (h: number) => void;
  onChangeMinute: (m: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function TimePickerModal({
  visible,
  hour,
  minute,
  onChangeHour,
  onChangeMinute,
  onConfirm,
  onCancel,
}: TimePickerModalProps) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Set Reminder Time</Text>

          <View style={styles.pickerRow}>
            {/* Hour column */}
            <View style={styles.pickerColumn}>
              <Text style={styles.pickerColumnLabel}>Hour</Text>
              <FlatList
                data={HOURS}
                keyExtractor={item => String(item)}
                style={styles.pickerList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerItem, item === hour && styles.pickerItemSelected]}
                    onPress={() => onChangeHour(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        item === hour && styles.pickerItemTextSelected,
                      ]}
                    >
                      {pad(item)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            <Text style={styles.pickerColon}>:</Text>

            {/* Minute column */}
            <View style={styles.pickerColumn}>
              <Text style={styles.pickerColumnLabel}>Min</Text>
              <FlatList
                data={MINUTES}
                keyExtractor={item => String(item)}
                style={styles.pickerList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerItem, item === minute && styles.pickerItemSelected]}
                    onPress={() => onChangeMinute(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        item === minute && styles.pickerItemTextSelected,
                      ]}
                    >
                      {pad(item)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>

          <Text style={styles.previewTime}>
            {pad(hour)}:{pad(minute)}
          </Text>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={styles.modalConfirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(palette => ({
  screen: {
    backgroundColor: palette.paper,
    flex: 1,
  },
  container: {
    backgroundColor: palette.paper,
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    flex: 1,
    justifyContent: 'center',
  },
  rowColumn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  segment: {
    flexDirection: 'row',
    marginTop: space.md,
    borderWidth: border.rule,
    borderColor: palette.line,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    backgroundColor: palette.paper,
  },
  segmentItemActive: {
    backgroundColor: palette.ink,
  },
  segmentText: {
    ...typo.label,
    color: palette.inkSoft,
  },
  segmentTextActive: {
    color: palette.paper,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.rule,
    borderColor: palette.line,
  },
  stepperButtonText: {
    ...typo.title,
    color: palette.ink,
  },
  stepperValue: {
    ...typo.data,
    color: palette.ink,
    minWidth: 52,
    textAlign: 'center',
  },
  loadingText: {
    ...typo.eyebrow,
    color: palette.inkSoft,
  },
  sectionHeader: {
    ...typo.eyebrow,
    color: palette.inkSoft,
    marginBottom: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.xl,
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderWidth: border.rule,
    marginHorizontal: space.lg,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowLeft: {
    flex: 1,
    marginRight: space.md,
  },
  rowLabel: {
    ...typo.bodyStrong,
    color: palette.ink,
  },
  rowDescription: {
    ...typo.label,
    color: palette.inkSoft,
    marginTop: 2,
  },
  rowValue: {
    ...typo.data,
    color: palette.inkSoft,
  },
  timeValue: {
    ...typo.readout,
    color: palette.ink,
    fontSize: 18,
  },
  comingSoon: {
    ...typo.label,
    color: palette.inkFaint,
  },
  dangerLabel: {
    ...typo.bodyStrong,
    color: palette.danger,
  },
  separator: {
    backgroundColor: palette.lineSoft,
    height: border.hair,
    marginLeft: space.lg,
  },
  permissionWarning: {
    ...typo.label,
    color: palette.warn,
    lineHeight: 18,
    marginBottom: space.md,
    marginHorizontal: space.lg,
  },
  // Modal styles
  modalOverlay: {
    backgroundColor: 'rgba(23,24,28,0.55)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderTopWidth: border.bold,
    paddingBottom: 40,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
  },
  modalTitle: {
    ...typo.eyebrow,
    color: palette.inkSoft,
    marginBottom: space.xl,
    textAlign: 'center',
  },
  pickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  pickerColumn: {
    alignItems: 'center',
    width: 80,
  },
  pickerColumnLabel: {
    ...typo.eyebrow,
    color: palette.inkFaint,
    marginBottom: space.sm,
  },
  pickerList: {
    height: 180,
  },
  pickerItem: {
    alignItems: 'center',
    marginVertical: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  pickerItemSelected: {
    backgroundColor: palette.marker,
  },
  pickerItemText: {
    ...typo.data,
    color: palette.inkSoft,
    fontSize: 20,
  },
  pickerItemTextSelected: {
    color: palette.ink,
  },
  pickerColon: {
    ...typo.readout,
    color: palette.ink,
    fontSize: 28,
    marginHorizontal: space.sm,
    marginTop: 20,
  },
  previewTime: {
    ...typo.readout,
    color: palette.ink,
    marginVertical: space.lg,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.sm,
  },
  modalCancelBtn: {
    alignItems: 'center',
    borderColor: palette.line,
    borderWidth: border.rule,
    flex: 1,
    paddingVertical: space.md,
  },
  modalCancelText: {
    ...typo.data,
    color: palette.ink,
  },
  modalConfirmBtn: {
    alignItems: 'center',
    backgroundColor: palette.pop,
    borderColor: palette.ink,
    borderWidth: border.rule,
    flex: 1,
    paddingVertical: space.md,
  },
  modalConfirmText: {
    ...typo.data,
    color: palette.popText,
  },
}));
