// MarkerText — the app's signature element.
//
// A highlighter swipe drawn behind one hero word or number. It is literally the
// product's core action (highlighting a passage) rendered as brand. Use it ONCE
// per screen, on the single most important token — never as general emphasis.

import React from 'react';
import { View, Text, type TextStyle, type StyleProp } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { makeStyles } from '../../theme/makeStyles';

interface MarkerTextProps {
  children: React.ReactNode;
  textStyle?: StyleProp<TextStyle>;
  color?: string;
  // How far the swipe overshoots the glyphs, in px. Larger = looser swipe.
  bleed?: number;
  // Vertical band the marker covers (fraction of line). Highlighter sits low.
  band?: number;
}

export default function MarkerText({
  children,
  textStyle,
  color,
  bleed = 6,
  band = 0.62,
}: MarkerTextProps) {
  const styles = useStyles();
  const { palette } = useTheme();
  const bandFrac = Math.min(Math.max(band, 0.3), 1);
  return (
    <View style={styles.wrap}>
      <View
        pointerEvents="none"
        style={[
          styles.swipe,
          {
            backgroundColor: color ?? palette.marker,
            left: -bleed,
            right: -bleed,
            top: `${(1 - bandFrac) * 100}%`,
            height: `${bandFrac * 100}%`,
          },
        ]}
      />
      <Text style={textStyle}>{children}</Text>
    </View>
  );
}

const useStyles = makeStyles(palette => ({
  swipe: {
    bottom: 0,
    position: 'absolute',
    // Slight skew = hand-drawn swipe, not a flat rectangle.
    transform: [{ skewX: '-9deg' }],
  },
  wrap: {
    alignSelf: 'flex-start',
    position: 'relative',
  },
}));
