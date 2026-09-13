// HighlightsScreen - View all highlights grouped by book
// Implements Requirements 4.7, 3.10, 3.4

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SectionList,
} from 'react-native';
import type { MainTabScreenProps } from '../navigation/types';
import type { Book, Highlight } from '../types/models';
import ServiceFactory from '../services/ServiceFactory';
import { useAppStore } from '../store/appStore';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import { Masthead } from '../components';
import HighlightModal from '../components/HighlightModal';

type Props = MainTabScreenProps<'Highlights'>;

interface BookSection {
  book: Book;
  data: Highlight[];
}

export default function HighlightsScreen({ navigation }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [sections, setSections] = useState<BookSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Books and highlights come from the shared store, so changes made in the
  // Library or Reader screens are reflected here live. (Gap 2)
  const allBooks = useAppStore(s => s.books);
  const allHighlights = useAppStore(s => s.highlights);
  const setBooks = useAppStore(s => s.setBooks);
  const setHighlights = useAppStore(s => s.setHighlights);
  const removeHighlightFromStore = useAppStore(s => s.removeHighlight);
  const updateHighlightInStore = useAppStore(s => s.updateHighlightInStore);

  // Filter state
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);

  const bookService = ServiceFactory.getInstance().getBookService();
  const highlightService = ServiceFactory.getInstance().getHighlightService();

  useEffect(() => {
    loadData();
  }, []);

  // Rebuild sections whenever filters or data change
  useEffect(() => {
    buildSections();
  }, [allHighlights, allBooks, selectedBookId, selectedTag]);

  // Refresh the tag list whenever highlights change
  useEffect(() => {
    const tagSet = new Set<string>();
    allHighlights.forEach(h => h.tags.forEach(t => tagSet.add(t.name)));
    setAllTags(Array.from(tagSet).sort());
  }, [allHighlights]);

  const loadData = async () => {
    try {
      setLoading(true);
      const books = await bookService.getBooks();
      setBooks(books);

      // Load highlights for all books into the shared store
      const highlightArrays = await Promise.all(
        books.map(b => highlightService.getHighlightsByBook(b.id))
      );
      setHighlights(highlightArrays.flat());
    } catch (error) {
      console.error('Failed to load highlights:', error);
      Alert.alert('Error', 'Failed to load highlights');
    } finally {
      setLoading(false);
    }
  };

  const buildSections = useCallback(() => {
    let filtered = allHighlights;

    if (selectedBookId) {
      filtered = filtered.filter(h => h.bookId === selectedBookId);
    }

    if (selectedTag) {
      filtered = filtered.filter(h => h.tags.some(t => t.name === selectedTag));
    }

    // Group by book
    const bookMap = new Map<string, Highlight[]>();
    filtered.forEach(h => {
      const existing = bookMap.get(h.bookId) || [];
      bookMap.set(h.bookId, [...existing, h]);
    });

    const newSections: BookSection[] = [];
    allBooks.forEach(book => {
      const bookHighlights = bookMap.get(book.id);
      if (bookHighlights && bookHighlights.length > 0) {
        newSections.push({ book, data: bookHighlights });
      }
    });

    setSections(newSections);
  }, [allHighlights, allBooks, selectedBookId, selectedTag]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  // Navigate to reader at highlight position (Req 3.10)
  const handleHighlightTap = useCallback(
    (highlight: Highlight) => {
      navigation.navigate('Reader', {
        bookId: highlight.bookId,
        highlightId: highlight.id,
      });
    },
    [navigation]
  );

  // Long-press: show edit/delete options (Req 3.4)
  const handleHighlightLongPress = useCallback((highlight: Highlight) => {
    Alert.alert('Highlight Options', undefined, [
      {
        text: 'Edit',
        onPress: () => {
          setEditingHighlight(highlight);
          setEditModalVisible(true);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDelete(highlight),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const confirmDelete = useCallback(
    (highlight: Highlight) => {
      Alert.alert('Delete Highlight', 'Are you sure you want to delete this highlight?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await highlightService.deleteHighlight(highlight.id);
              removeHighlightFromStore(highlight.id);
            } catch (error) {
              console.error('Failed to delete highlight:', error);
              Alert.alert('Error', 'Failed to delete highlight');
            }
          },
        },
      ]);
    },
    [highlightService, removeHighlightFromStore]
  );

  const handleEditSave = useCallback(
    async (data: { note: string; tags: string[]; color: string }) => {
      if (!editingHighlight) return;
      try {
        await highlightService.updateHighlight(editingHighlight.id, {
          note: data.note || undefined,
          color: data.color,
        });

        // Re-fetch the updated highlight (to pick up any tag changes) and patch
        // it into the shared store so all screens reflect the edit. (Gap 2)
        const updated = await highlightService.getHighlightById(editingHighlight.id);
        if (updated) {
          updateHighlightInStore(updated.id, updated);
        }
        setEditModalVisible(false);
        setEditingHighlight(null);
      } catch (error) {
        console.error('Failed to update highlight:', error);
        Alert.alert('Error', 'Failed to update highlight');
      }
    },
    [editingHighlight, highlightService, updateHighlightInStore]
  );

  const handleEditCancel = useCallback(() => {
    setEditModalVisible(false);
    setEditingHighlight(null);
  }, []);

  // Format date for display
  const formatDate = (date: Date) => {
    return new Date(date)
      .toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
      .toUpperCase();
  };

  // Render a single highlight row
  const renderHighlight = useCallback(
    ({ item }: { item: Highlight }) => (
      <TouchableOpacity
        style={styles.highlightCard}
        onPress={() => handleHighlightTap(item)}
        onLongPress={() => handleHighlightLongPress(item)}
        activeOpacity={0.85}
      >
        {/* Marker edge — the highlight's own ink */}
        <View style={[styles.colorBar, { backgroundColor: item.color }]} />

        <View style={styles.highlightContent}>
          {/* The book's voice: quoted passage in serif */}
          <Text style={styles.highlightText} numberOfLines={4}>
            {item.text}
          </Text>

          {/* Note in serif-italic */}
          {item.note ? (
            <Text style={styles.noteText} numberOfLines={2}>
              {item.note}
            </Text>
          ) : null}

          {/* Tags + date in mono */}
          <View style={styles.metaRow}>
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            {item.tags.length > 0 && (
              <View style={styles.tagRow}>
                {item.tags.map(tag => (
                  <View key={tag.id} style={styles.tag}>
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    ),
    [handleHighlightTap, handleHighlightLongPress]
  );

  // Render section header (book title)
  const renderSectionHeader = useCallback(
    ({ section }: { section: BookSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {section.book.title}
        </Text>
        <Text style={styles.sectionCount}>{String(section.data.length).padStart(2, '0')}</Text>
      </View>
    ),
    []
  );

  // Filter bar
  const renderFilterBar = () => (
    <View style={styles.filterBar}>
      {/* Book filter */}
      <FlatList
        horizontal
        data={[
          { id: null, label: 'All Books' },
          ...allBooks.map(b => ({ id: b.id, label: b.title })),
        ]}
        keyExtractor={item => item.id ?? '__all__'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, selectedBookId === item.id && styles.filterChipActive]}
            onPress={() => setSelectedBookId(item.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedBookId === item.id && styles.filterChipTextActive,
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Tag filter */}
      {allTags.length > 0 && (
        <FlatList
          horizontal
          data={[{ name: null, label: 'All Tags' }, ...allTags.map(t => ({ name: t, label: t }))]}
          keyExtractor={item => item.name ?? '__all_tags__'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, selectedTag === item.name && styles.filterChipActive]}
              onPress={() => setSelectedTag(item.name)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedTag === item.name && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.ink} />
      </View>
    );
  }

  const totalHighlights = sections.reduce((sum, s) => sum + s.data.length, 0);

  return (
    <View style={styles.container}>
      <Masthead
        readout={[
          `${allHighlights.length} TOTAL`,
          `${allBooks.length} ${allBooks.length === 1 ? 'BOOK' : 'BOOKS'}`,
        ]}
        title="Marginalia"
      />

      {/* Filter bar */}
      {renderFilterBar()}

      {/* Highlights list grouped by book */}
      {sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyMark}>“ ”</Text>
          <Text style={styles.emptyTitle}>No marginalia yet</Text>
          <Text style={styles.emptyText}>
            Open a book and select a passage to keep. Each one becomes a review card.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderHighlight}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[palette.ink]}
              tintColor={palette.ink}
            />
          }
          ListFooterComponent={
            <Text style={styles.footerText}>
              — {totalHighlights} {totalHighlights !== 1 ? 'PASSAGES' : 'PASSAGE'} —
            </Text>
          }
        />
      )}

      {/* Edit modal */}
      {editingHighlight && (
        <HighlightModal
          visible={editModalVisible}
          selectedText={editingHighlight.text}
          initialNote={editingHighlight.note}
          initialTags={editingHighlight.tags.map(t => t.name)}
          initialColor={editingHighlight.color}
          onSave={handleEditSave}
          onCancel={handleEditCancel}
        />
      )}
    </View>
  );
}
