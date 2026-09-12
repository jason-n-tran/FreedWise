// SearchScreen - Full-text search across highlights
// Implements Requirements 7.1, 7.4, 7.5, 7.6, 7.10

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import type { MainTabScreenProps } from '../navigation/types';
import type { Book } from '../types/models';
import type { SearchResult, SearchFilters } from '../services/interfaces';
import ServiceFactory from '../services/ServiceFactory';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import { Masthead } from '../components';

type Props = MainTabScreenProps<'Search'>;

// ---------------------------------------------------------------------------
// HighlightedText - renders text with matched query highlighted
// ---------------------------------------------------------------------------
interface HighlightedTextProps {
  text: string;
  query: string;
  style?: object;
  highlightStyle?: object;
  numberOfLines?: number;
}

function HighlightedText({
  text,
  query,
  style,
  highlightStyle,
  numberOfLines,
}: HighlightedTextProps) {
  const styles = useStyles();
  if (!query || query.length < 2) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;
  let idx = lower.indexOf(lowerQuery);

  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push({ text: text.slice(lastIndex, idx), highlight: false });
    }
    parts.push({ text: text.slice(idx, idx + query.length), highlight: true });
    lastIndex = idx + query.length;
    idx = lower.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) =>
        part.highlight ? (
          <Text key={i} style={[styles.matchHighlight, highlightStyle]}>
            {part.text}
          </Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        )
      )}
    </Text>
  );
}
