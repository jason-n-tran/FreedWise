import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { RootNavigator } from './src/navigation';
import { initializeServices } from './src/services/initializeServices';
import { ErrorBoundary } from './src/components';
import ExtractionWebView from './src/components/ExtractionWebView';
import { ensureInstalled } from './src/readers/VendorAssetManager';
import type { RootStackParamList } from './src/navigation/types';
import { palette, type } from './src/theme';
import { ThemeProvider } from './src/theme/ThemeContext';
import { useAppFonts } from './src/theme/useAppFonts';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fontsLoaded = useAppFonts();
  // ERROR level so it appears in `adb logcat *:E` (temporary startup diagnostic).
  console.error('[BOOT] App render — isReady:', isReady, 'fontsLoaded:', fontsLoaded);
  // Ref to the NavigationContainer so we can navigate from outside React tree
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    async function prepare() {
      try {
        console.error('[BOOT] prepare() start — initializing services');
        await initializeServices();
        console.error('[BOOT] services initialized');
        // Install vendored WebView libs/pages early so readers + extraction are
        // ready on first use. Non-fatal: readers also call this on demand.
        ensureInstalled().catch(e => console.warn('Vendor asset install (deferred) failed:', e));
        setIsReady(true);
        console.error('[BOOT] isReady set true');
      } catch (e) {
        console.error('[BOOT] Failed to initialize app:', e);
        setError(e instanceof Error ? e.message : 'Failed to initialize app');
      }
    }

    prepare();
  }, []);

  // Requirement 6.8: Navigate to ReviewDashboard when user taps a notification
  useEffect(() => {
    // Handle tap when app is already open (foreground / background)
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as
        | { navigateTo?: string }
        | undefined;
      if (data?.navigateTo === 'Review' && navigationRef.current) {
        navigationRef.current.navigate('Main');
        // The Main navigator will show the Review tab; we navigate there via the tab navigator
        // by resetting to the Review tab through the navigation state.
        // Using a small delay to ensure the navigator is mounted.
        setTimeout(() => {
          navigationRef.current?.navigate('Main', { screen: 'Review' } as any);
        }, 100);
      }
    });

    return () => subscription.remove();
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorEyebrow}>ERROR</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!isReady || !fontsLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={palette.ink} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
          {/* Hidden WebView that backs metadata/cover extraction. */}
          <ExtractionWebView />
        </SafeAreaProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    flex: 1,
    justifyContent: 'center',
  },
  errorEyebrow: {
    ...type.eyebrow,
    color: palette.danger,
    marginBottom: 8,
  },
  errorText: {
    color: palette.ink,
    fontSize: 16,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
});
