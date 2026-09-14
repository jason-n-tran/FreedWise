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

// ---------------------------------------------------------------------------
// SearchScreen - main component
// ---------------------------------------------------------------------------
export default function SearchScreen({ navigation }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchService = ServiceFactory.getInstance().getSearchService();
  const highlightService = ServiceFactory.getInstance().getHighlightService();
  const bookService = ServiceFactory.getInstance().getBookService();

  // Load recent searches and books/tags on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [recent, books] = await Promise.all([
        searchService.getRecentSearches(),
        bookService.getBooks(),
      ]);
      setRecentSearches(recent);
      setAllBooks(books);

      // Collect all tags from highlights
      const highlightArrays = await Promise.all(
        books.map(b => highlightService.getHighlightsByBook(b.id))
      );
      const tagSet = new Set<string>();
      highlightArrays.flat().forEach(h => h.tags.forEach(t => tagSet.add(t.name)));
      setAllTags(Array.from(tagSet).sort());
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  // Debounced search - Req 7.1, 7.2
  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      if (text.length < 2) {
        setResults([]);
        setOffset(0);
        setHasMore(false);
        return;
      }

      debounceTimer.current = setTimeout(() => {
        performSearch(text, filters, 0);
      }, 300);
    },
    [filters]
  );

  const performSearch = useCallback(
    async (q: string, f: SearchFilters, off: number) => {
      if (q.length < 2) return;
      try {
        setLoading(true);
        const res = await searchService.searchHighlights(q, f, off);
        setResults(res);
        setOffset(res.length);
        setHasMore(res.length === 50);

        // Save to recent searches
        await searchService.saveSearch(q);
        const updated = await searchService.getRecentSearches();
        setRecentSearches(updated);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setLoading(false);
      }
    },
    [searchService]
  );

  // Load more results - Req 7.9
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || query.length < 2) return;
    try {
      setLoadingMore(true);
      const more = await searchService.loadMore(query, filters, offset);
      setResults(prev => {
        const seen = new Set(prev.map(r => r.highlight.id));
        const unique = more.filter(r => !seen.has(r.highlight.id));
        return [...prev, ...unique];
      });
      setOffset(prev => prev + more.length);
      setHasMore(more.length === 50);
    } catch (error) {
      console.error('Load more failed:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, query, filters, offset, searchService]);

  // Apply filters - Req 7.5, 7.6
  const handleApplyFilters = useCallback(
    (newFilters: SearchFilters) => {
      setFilters(newFilters);
      setFilterModalVisible(false);
      if (query.length >= 2) {
        performSearch(query, newFilters, 0);
      }
    },
    [query, performSearch]
  );

  // Tap recent search
  const handleRecentSearchTap = useCallback(
    (term: string) => {
      setQuery(term);
      performSearch(term, filters, 0);
    },
    [filters, performSearch]
  );

  // Clear search history
  const handleClearHistory = useCallback(async () => {
    try {
      await searchService.clearSearchHistory();
      setRecentSearches([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }, [searchService]);

  // Navigate to book at highlight position - Req 7.4
  const handleResultTap = useCallback(
    (result: SearchResult) => {
      navigation.navigate('Reader', {
        bookId: result.highlight.bookId,
        highlightId: result.highlight.id,
      });
    },
    [navigation]
  );

  const activeFilterCount = Object.keys(filters).length;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderRecentSearches = () => {
    if (query.length >= 2 || recentSearches.length === 0) return null;
    return (
      <View style={styles.recentContainer}>
        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>Recent</Text>
          <TouchableOpacity onPress={handleClearHistory}>
            <Text style={styles.clearHistoryText}>CLEAR</Text>
          </TouchableOpacity>
        </View>
        {recentSearches.map(term => (
          <TouchableOpacity
            key={term}
            style={styles.recentItem}
            onPress={() => handleRecentSearchTap(term)}
          >
            <Text style={styles.recentIcon}>↳</Text>
            <Text style={styles.recentText}>{term}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderResultItem = useCallback(
    ({ item }: { item: SearchResult }) => {
      const { highlight, book, matchedText, matchType } = item;
      const chapter = highlight.position.chapterTitle;

      return (
        <TouchableOpacity
          style={styles.resultCard}
          onPress={() => handleResultTap(item)}
          activeOpacity={0.7}
        >
          {/* Color bar */}
          <View style={[styles.colorBar, { backgroundColor: highlight.color }]} />

          <View style={styles.resultContent}>
            {/* Book title + chapter - Req 7.4 */}
            <View style={styles.resultMeta}>
              <Text style={styles.bookTitle} numberOfLines={1}>
                {book.title}
              </Text>
              {chapter ? (
                <Text style={styles.chapterTitle} numberOfLines={1}>
                  {' · '}
                  {chapter}
                </Text>
              ) : null}
            </View>

            {/* Highlight preview with matched text highlighted - Req 7.4 */}
            <HighlightedText
              text={matchType === 'text' ? matchedText : highlight.text}
              query={query}
              style={styles.highlightPreview}
              numberOfLines={3}
            />

            {/* Note preview if match is in note */}
            {matchType === 'note' && highlight.note ? (
              <HighlightedText
                text={highlight.note}
                query={query}
                style={styles.notePreview}
                numberOfLines={2}
              />
            ) : null}

            {/* Tag match indicator */}
            {matchType === 'tag' && (
              <View style={styles.tagMatchRow}>
                <Text style={styles.tagMatchLabel}>Tag: </Text>
                <HighlightedText
                  text={item.matchedText}
                  query={query}
                  style={styles.tagMatchText}
                />
              </View>
            )}

            {/* Tags */}
            {highlight.tags.length > 0 && (
              <View style={styles.tagRow}>
                {highlight.tags.slice(0, 4).map(tag => (
                  <View key={tag.id} style={styles.tag}>
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
                {highlight.tags.length > 4 && (
                  <Text style={styles.moreTagsText}>+{highlight.tags.length - 4}</Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [query, handleResultTap]
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={palette.ink} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    if (query.length < 2) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Results</Text>
        <Text style={styles.emptyText}>
          No highlights found for "{query}"
          {activeFilterCount > 0 ? ' with the current filters' : ''}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Masthead title="Search" />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <View style={styles.inputWrapper}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search every passage…"
            placeholderTextColor={palette.inkFaint}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
        {/* Filter button - Req 7.5 */}
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Text style={[styles.filterBtnText, activeFilterCount > 0 && styles.filterBtnTextActive]}>
            {activeFilterCount > 0 ? `FILTER ${activeFilterCount}` : 'FILTER'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={palette.ink} />
        </View>
      )}

      {/* Recent searches (shown when no query) */}
      {renderRecentSearches()}

      {/* Results list */}
      {query.length >= 2 && !loading && (
        <FlatList
          data={results}
          keyExtractor={item => item.highlight.id}
          renderItem={renderResultItem}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Filter modal */}
      <FilterModal
        visible={filterModalVisible}
        books={allBooks}
        allTags={allTags}
        filters={filters}
        onApply={handleApplyFilters}
        onClose={() => setFilterModalVisible(false)}
      />
    </View>
  );
}
