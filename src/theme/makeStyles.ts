// makeStyles — render-time themed styles.
//
// Usage mirrors StyleSheet.create, but the factory receives the ACTIVE palette
// so styles recompute when the theme changes:
//
//   const useStyles = makeStyles(palette => ({
//     container: { backgroundColor: palette.paper },
//   }));
//   function Screen() { const styles = useStyles(); ... }
//
// The factory param is intentionally named `palette` so a screen's existing
// StyleSheet.create({...palette.x...}) body can be wrapped verbatim. The generic
// mirrors StyleSheet.create's own signature so literal style types (e.g.
// position: 'absolute') are preserved.

import { useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import type { Palette } from './index';
import { useTheme } from './ThemeContext';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T> | NamedStyles<unknown>>(
  factory: (palette: Palette) => T & NamedStyles<T>
): () => T {
  return function useStyles(): T {
    const { palette } = useTheme();
    return useMemo(() => StyleSheet.create(factory(palette)), [palette]);
  };
}
