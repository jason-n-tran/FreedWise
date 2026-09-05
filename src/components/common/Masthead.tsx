// Masthead — shared screen header. Left-aligned grotesk title over a monospace
// "instrument readout" eyebrow (live stats), with a hard ink rule beneath.
// Replaces the centered iOS navigation header across the tab screens.

import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type, space, border } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { makeStyles } from '../../theme/makeStyles';
import MarkerText from './MarkerText';

interface MastheadProps {
  // Eyebrow segments rendered as `A · B · C` in mono. e.g. ['04 DUE', '128 CARDS'].
  readout?: string[];
  title: string;
  // If set, this exact substring of the title gets the marker swipe.
  markWord?: string;
  right?: React.ReactNode;
}

export default function Masthead({ readout, title, markWord, right }: MastheadProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + space.sm }]}>
      {readout && readout.length > 0 ? (
        <Text style={styles.readout} numberOfLines={1}>
          {readout.join('  ·  ')}
        </Text>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleWrap}>{renderTitle(styles, title, markWord)}</View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

function renderTitle(styles: ReturnType<typeof useStyles>, title: string, markWord?: string) {
  if (!markWord || !title.includes(markWord)) {
    return <Text style={styles.title}>{title}</Text>;
  }
  const [before, ...rest] = title.split(markWord);
  const after = rest.join(markWord);
  return (
    <View style={styles.markTitleRow}>
      {before ? <Text style={styles.title}>{before}</Text> : null}
      <MarkerText textStyle={styles.title}>{markWord}</MarkerText>
      {after ? <Text style={styles.title}>{after}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(palette => ({
  container: {
    backgroundColor: palette.paper,
    borderBottomColor: palette.line,
    borderBottomWidth: border.bold,
    paddingBottom: space.md,
    paddingHorizontal: space.lg,
  },
  markTitleRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  readout: {
    ...type.eyebrow,
    color: palette.inkSoft,
    marginBottom: space.sm,
  },
  right: {
    marginLeft: space.md,
  },
  title: {
    ...type.title,
    color: palette.ink,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleWrap: {
    flex: 1,
  },
}));
