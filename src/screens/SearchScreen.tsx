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
