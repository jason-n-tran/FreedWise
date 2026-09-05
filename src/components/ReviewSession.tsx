// ReviewSession component — displays highlights one-by-one for spaced repetition review
// Requirements: 5.2, 5.3, 5.12, 5.14

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Grade } from '../types/models';
import type { Highlight } from '../types/models';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import Button from './common/Button';

export interface ReviewHighlight extends Highlight {
  bookTitle: string;
}

interface ReviewSessionProps {
  highlights: ReviewHighlight[];
  onComplete: () => void;
  onGrade: (highlightId: string, grade: Grade) => Promise<void>;
  renderGradingButtons?: (highlightId: string, onGrade: (grade: Grade) => void) => React.ReactNode;
}
