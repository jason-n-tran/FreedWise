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
