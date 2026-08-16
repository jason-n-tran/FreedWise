// Legacy color shim. The design system now lives in src/theme. This file maps
// the old `colors` / `highlightColors` API onto the new palette so any remaining
// importers (and tests) stay consistent with the redesign.

import { palette, markerInks } from '../theme';

export const colors = {
  white: palette.white,
  black: palette.ink,
  primary: palette.pop,
  background: palette.paper,
};

// Highlight (marker) ink colors for text highlighting.
export const highlightColors = {
  yellow: markerInks.yellow,
  green: markerInks.green,
  blue: markerInks.blue,
  pink: markerInks.pink,
  orange: markerInks.orange,
};

// Default highlight color
export const defaultHighlightColor = highlightColors.yellow;
