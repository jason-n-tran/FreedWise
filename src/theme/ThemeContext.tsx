// Theme context: holds the active theme mode (light/dark/system), resolves the
// effective palette, and persists the choice via SettingsService. Screens read
// the active palette through useTheme()/makeStyles so a mode change re-renders
// the whole app instantly.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';
import { lightPalette, darkPalette, type Palette } from './index';
import ServiceFactory from '../services/ServiceFactory';
import type { ThemeMode } from '../services/interfaces';

interface ThemeContextValue {
  palette: Palette;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveIsDark(mode: ThemeMode, system: ColorSchemeName): boolean {
  if (mode === 'system') return system === 'dark';
  return mode === 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? 'light'
  );

  // Load the persisted mode once at startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = ServiceFactory.getInstance().getSettingsService();
        const stored = await settings.getThemeMode();
        if (!cancelled) setModeState(stored);
      } catch {
        // SettingsService not ready / no value — keep the light default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Track OS appearance changes (only matters when mode === 'system').
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      ServiceFactory.getInstance().getSettingsService().setThemeMode(next);
    } catch {
      // Persistence failure is non-fatal; the in-memory mode still applies.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = resolveIsDark(mode, systemScheme);
    return {
      palette: isDark ? darkPalette : lightPalette,
      mode,
      isDark,
      setMode,
    };
  }, [mode, systemScheme, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback so components used outside the provider (e.g. isolated tests)
    // still render with the light palette rather than crashing.
    return {
      palette: lightPalette,
      mode: 'light',
      isDark: false,
      setMode: () => {},
    };
  }
  return ctx;
}
