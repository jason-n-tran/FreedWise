// Library Screen - displays imported books

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { MainTabScreenProps } from '../navigation/types';
import type { Book } from '../types/models';
import ServiceFactory from '../services/ServiceFactory';
import { useAppStore } from '../store/appStore';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import { Masthead } from '../components';

type Props = MainTabScreenProps<'Library'>;

export default function LibraryScreen({ navigation }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  // Books live in the shared store so import/delete here propagate to the
  // Highlights / Search / Review screens without each re-querying. (Gap 2)
  const books = useAppStore(s => s.books);
  const setBooks = useAppStore(s => s.setBooks);
  const addBook = useAppStore(s => s.addBook);
  const removeBook = useAppStore(s => s.removeBook);
  const updateBookInStore = useAppStore(s => s.updateBook);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Metadata edit modal state
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');

  const bookService = ServiceFactory.getInstance().getBookService();

  // Load books on mount
  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    try {
      const loadedBooks = await bookService.getBooks();
      setBooks(loadedBooks);
    } catch (error) {
      console.error('Failed to load books:', error);
      Alert.alert('Error', 'Failed to load library');
    } finally {
      setLoading(false);
    }
  };

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBooks();
    setRefreshing(false);
  }, []);

  // Import book handler
  const handleImportBook = async () => {
    try {
      setImporting(true);

      // Open document picker
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/epub+zip'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setImporting(false);
        return;
      }

      // Import the book
      const book = await bookService.importBook(result.assets[0].uri);

      // Update shared state (propagates to other screens)
      addBook(book);

      // Show success message
      Alert.alert('Success', `"${book.title}" has been imported`);

      // Navigate to reader
      navigation.navigate('Reader', { bookId: book.id });
    } catch (error) {
      console.error('Failed to import book:', error);
      Alert.alert(
        'Import Failed',
        error instanceof Error ? error.message : 'Failed to import book'
      );
    } finally {
      setImporting(false);
    }
  };

  // Delete book handler with confirmation
  const handleDeleteBook = (book: Book) => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to delete "${book.title}"? This will also delete all highlights.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await bookService.deleteBook(book.id);
              // Removes the book and cascades its highlights in shared state.
              removeBook(book.id);
              Alert.alert('Deleted', `"${book.title}" has been deleted`);
            } catch (error) {
              console.error('Failed to delete book:', error);
              Alert.alert('Error', 'Failed to delete book');
            }
          },
        },
      ]
    );
  };

  // Long-press a book → Edit metadata / Delete.
  const handleBookLongPress = (book: Book) => {
    Alert.alert(book.title, undefined, [
      {
        text: 'Edit Details',
        onPress: () => {
          setEditingBook(book);
          setEditTitle(book.title);
          setEditAuthor(book.author);
        },
      },
      { text: 'Delete', style: 'destructive', onPress: () => handleDeleteBook(book) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editingBook) return;
    const title = editTitle.trim() || editingBook.title;
    const author = editAuthor.trim() || 'Unknown';
    try {
      await bookService.updateBook(editingBook.id, { title, author });
      updateBookInStore(editingBook.id, { title, author });
      setEditingBook(null);
    } catch (error) {
      console.error('Failed to update book:', error);
      Alert.alert('Error', 'Failed to save changes');
    }
  };

  // Open book handler
  const handleOpenBook = (book: Book) => {
    navigation.navigate('Reader', { bookId: book.id });
  };

  // Render book item
  const renderBookItem = ({ item, index }: { item: Book; index: number }) => (
    <TouchableOpacity
      style={[styles.bookCard, index % 2 === 0 ? styles.bookCardLeft : styles.bookCardRight]}
      onPress={() => handleOpenBook(item)}
      onLongPress={() => handleBookLongPress(item)}
      activeOpacity={0.85}
    >
      <View style={styles.coverContainer}>
        {item.coverImagePath ? (
          <Image
            source={{ uri: item.coverImagePath }}
            style={styles.cover}
            // Lazy load: only decode when visible, use low-res thumbnail size
            resizeMode="cover"
            fadeDuration={200}
            progressiveRenderingEnabled={true}
          />
        ) : (
          <View style={styles.placeholderCover}>
            <View style={styles.placeholderSwipe} />
            <Text style={styles.placeholderText}>{item.title.substring(0, 2).toUpperCase()}</Text>
            <Text style={styles.placeholderType}>{item.fileType?.toUpperCase() ?? ''}</Text>
          </View>
        )}
      </View>
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.author}
        </Text>
        {item.totalPages ? <Text style={styles.bookPages}>{item.totalPages} PP</Text> : null}
      </View>
    </TouchableOpacity>
  );

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyMark}>[ ]</Text>
      <Text style={styles.emptyTitle}>Empty shelf</Text>
      <Text style={styles.emptyText}>
        Import a PDF or EPUB to start a library. Highlights you make become review cards.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.ink} />
      </View>
    );
  }

  const shelfReadout = [`${books.length} ${books.length === 1 ? 'BOOK' : 'BOOKS'}`, 'LOCAL ONLY'];

  return (
    <View style={styles.container}>
      <Masthead
        readout={shelfReadout}
        title="Library"
        right={
          <TouchableOpacity
            style={styles.importButton}
            onPress={handleImportBook}
            disabled={importing}
            activeOpacity={0.85}
          >
            {importing ? (
              <ActivityIndicator size="small" color={palette.popText} />
            ) : (
              <Text style={styles.importButtonText}>+ IMPORT</Text>
            )}
          </TouchableOpacity>
        }
      />

      <FlatList
        data={books}
        renderItem={renderBookItem}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.column}
        ListEmptyComponent={renderEmptyState}
        // Lazy loading optimizations - Req 11.2, 11.3
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[palette.ink]}
            tintColor={palette.ink}
          />
        }
      />

      {/* Edit metadata modal */}
      <Modal
        visible={editingBook !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingBook(null)}
      >
        <View style={styles.editOverlay}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>EDIT DETAILS</Text>
            <Text style={styles.editLabel}>Title</Text>
            <TextInput
              style={styles.editInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Title"
              placeholderTextColor={palette.inkFaint}
            />
            <Text style={styles.editLabel}>Author</Text>
            <TextInput
              style={styles.editInput}
              value={editAuthor}
              onChangeText={setEditAuthor}
              placeholder="Author"
              placeholderTextColor={palette.inkFaint}
            />
            <View style={styles.editButtons}>
              <TouchableOpacity
                style={[styles.editButton, styles.editCancel]}
                onPress={() => setEditingBook(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.editCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editButton, styles.editSave]}
                onPress={handleSaveEdit}
                activeOpacity={0.85}
              >
                <Text style={styles.editSaveText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles(palette => ({
  bookAuthor: {
    ...typo.label,
    color: palette.inkSoft,
    marginBottom: space.xs,
  },
  bookCard: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderWidth: border.rule,
    flex: 1,
    maxWidth: '50%',
  },
  bookCardLeft: {
    marginRight: space.sm,
  },
  bookCardRight: {
    marginLeft: space.sm,
  },
  bookInfo: {
    borderTopColor: palette.line,
    borderTopWidth: border.hair,
    padding: space.md,
  },
  bookPages: {
    ...typo.eyebrow,
    color: palette.inkFaint,
  },
  bookTitle: {
    ...typo.bodyStrong,
    color: palette.ink,
    marginBottom: space.xs,
  },
  column: {
    marginBottom: space.lg,
  },
  container: {
    backgroundColor: palette.paper,
    flex: 1,
  },
  cover: {
    height: '100%',
    resizeMode: 'cover',
    width: '100%',
  },
  coverContainer: {
    aspectRatio: 0.7,
    overflow: 'hidden',
    width: '100%',
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    paddingTop: 80,
  },
  emptyMark: {
    ...typo.readout,
    color: palette.ink,
    marginBottom: space.md,
  },
  emptyText: {
    ...typo.body,
    color: palette.inkSoft,
    textAlign: 'center',
  },
  emptyTitle: {
    ...typo.title,
    color: palette.ink,
    marginBottom: space.sm,
  },
  importButton: {
    backgroundColor: palette.pop,
    borderColor: palette.ink,
    borderWidth: border.rule,
    minWidth: 96,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  importButtonText: {
    ...typo.data,
    color: palette.popText,
    textAlign: 'center',
  },
  listContent: {
    flexGrow: 1,
    padding: space.lg,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    flex: 1,
    justifyContent: 'center',
  },
  placeholderCover: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    height: '100%',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  placeholderSwipe: {
    backgroundColor: palette.marker,
    height: 18,
    position: 'absolute',
    right: -8,
    top: '46%',
    transform: [{ skewX: '-9deg' }],
    width: '70%',
  },
  placeholderText: {
    color: palette.paper,
    fontFamily: typo.title.fontFamily,
    fontSize: 36,
    letterSpacing: -1,
  },
  placeholderType: {
    ...typo.eyebrow,
    bottom: space.sm,
    color: palette.inkFaint,
    position: 'absolute',
  },
  editOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23,24,28,0.55)',
  },
  editCard: {
    backgroundColor: palette.paper,
    borderTopColor: palette.line,
    borderTopWidth: border.bold,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: 40,
  },
  editTitle: {
    ...typo.eyebrow,
    color: palette.inkSoft,
    marginBottom: space.lg,
  },
  editLabel: {
    ...typo.label,
    color: palette.inkSoft,
    marginBottom: space.xs,
    marginTop: space.md,
  },
  editInput: {
    ...typo.body,
    color: palette.ink,
    borderColor: palette.line,
    borderWidth: border.rule,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  editButtons: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xl,
  },
  editButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderWidth: border.rule,
  },
  editCancel: {
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  editCancelText: {
    ...typo.data,
    color: palette.ink,
  },
  editSave: {
    borderColor: palette.ink,
    backgroundColor: palette.pop,
  },
  editSaveText: {
    ...typo.data,
    color: palette.popText,
  },
}));
