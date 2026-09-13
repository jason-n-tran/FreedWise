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

// ---------------------------------------------------------------------------
// FilterModal - book filter, tag multi-select, date range
// ---------------------------------------------------------------------------
interface FilterModalProps {
  visible: boolean;
  books: Book[];
  allTags: string[];
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}

function FilterModal({ visible, books, allTags, filters, onApply, onClose }: FilterModalProps) {
  const styles = useStyles();
  const [localBookId, setLocalBookId] = useState<string | undefined>(filters.bookId);
  const [localTags, setLocalTags] = useState<string[]>(filters.tags ?? []);
  const [startDate, setStartDate] = useState<string>(
    filters.dateRange ? filters.dateRange.start.toISOString().slice(0, 10) : ''
  );
  const [endDate, setEndDate] = useState<string>(
    filters.dateRange ? filters.dateRange.end.toISOString().slice(0, 10) : ''
  );

  // Sync when filters prop changes
  useEffect(() => {
    setLocalBookId(filters.bookId);
    setLocalTags(filters.tags ?? []);
    setStartDate(filters.dateRange ? filters.dateRange.start.toISOString().slice(0, 10) : '');
    setEndDate(filters.dateRange ? filters.dateRange.end.toISOString().slice(0, 10) : '');
  }, [filters, visible]);

  const toggleTag = (tag: string) => {
    setLocalTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  };

  const handleApply = () => {
    const newFilters: SearchFilters = {};
    if (localBookId) newFilters.bookId = localBookId;
    if (localTags.length > 0) newFilters.tags = localTags;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
        newFilters.dateRange = { start, end };
      }
    }
    onApply(newFilters);
  };

  const handleClear = () => {
    setLocalBookId(undefined);
    setLocalTags([]);
    setStartDate('');
    setEndDate('');
    onApply({});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filters</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Book filter */}
            <Text style={styles.filterSectionLabel}>Book</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !localBookId && styles.chipActive]}
                onPress={() => setLocalBookId(undefined)}
              >
                <Text style={[styles.chipText, !localBookId && styles.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {books.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.chip, localBookId === b.id && styles.chipActive]}
                  onPress={() => setLocalBookId(b.id)}
                >
                  <Text
                    style={[styles.chipText, localBookId === b.id && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {b.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tag multi-select */}
            {allTags.length > 0 && (
              <>
                <Text style={styles.filterSectionLabel}>Tags</Text>
                <View style={styles.tagGrid}>
                  {allTags.map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.chip, localTags.includes(tag) && styles.chipActive]}
                      onPress={() => toggleTag(tag)}
                    >
                      <Text
                        style={[styles.chipText, localTags.includes(tag) && styles.chipTextActive]}
                      >
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Date range */}
            <Text style={styles.filterSectionLabel}>Date Range</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>From (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.dateInput}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="2024-01-01"
                  placeholderTextColor="#aaa"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>To (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.dateInput}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="2024-12-31"
                  placeholderTextColor="#aaa"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
