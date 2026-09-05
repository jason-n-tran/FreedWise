// GradingButtons component — four graded response buttons for spaced repetition
// Requirements: 5.4

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { Grade } from '../types/models';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';

interface GradingButtonsProps {
  onGrade: (grade: Grade) => void;
  disabled?: boolean;
}

export default function GradingButtons({ onGrade, disabled = false }: GradingButtonsProps) {
  const styles = useStyles();
  const { palette } = useTheme();
  // Grading reads as a recall scale, so the fill goes light → dark with recall
  // quality. "Easy" is the only one that earns the marker yellow. Built from the
  // active palette so colors track the theme.
  const BUTTONS: { grade: Grade; label: string; shortcut: string; bg: string; fg: string }[] = [
    { grade: 'again', label: 'AGAIN', shortcut: '1', bg: palette.danger, fg: palette.popText },
    { grade: 'hard', label: 'HARD', shortcut: '2', bg: palette.warn, fg: palette.popText },
    { grade: 'good', label: 'GOOD', shortcut: '3', bg: palette.good, fg: palette.popText },
    { grade: 'easy', label: 'EASY', shortcut: '4', bg: palette.marker, fg: palette.ink },
  ];
  return (
    <View style={styles.row}>
      {BUTTONS.map(({ grade, label, shortcut, bg, fg }) => (
        <TouchableOpacity
          key={grade}
          style={[styles.button, { backgroundColor: bg }, disabled && styles.disabled]}
          onPress={() => onGrade(grade)}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Text style={[styles.shortcut, { color: fg }]}>{shortcut}</Text>
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const useStyles = makeStyles(palette => ({
  button: {
    alignItems: 'center',
    borderColor: palette.ink,
    borderWidth: border.bold,
    flex: 1,
    justifyContent: 'center',
    minHeight: 60,
    paddingVertical: space.md,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...typo.data,
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  shortcut: {
    ...typo.eyebrow,
    fontSize: 10,
    opacity: 0.7,
  },
}));
