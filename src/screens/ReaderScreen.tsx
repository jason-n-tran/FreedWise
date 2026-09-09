// ReaderScreen - Main entry point for reading books
// Detects file type and routes to appropriate renderer
// Implements Requirements 3.1, 3.2, 3.3, 3.4, 3.10

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, PanResponder, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../navigation/types';
import type { Book, Highlight } from '../types/models';
import ServiceFactory from '../services/ServiceFactory';
import { useAppStore } from '../store/appStore';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import PDFReader from './PDFReader';
import EPUBReader from './EPUBReader';
import { TextSelectionMenu, HighlightModal } from '../components';
import type { SelectionData } from '../services/interfaces';

type Props = RootStackScreenProps<'Reader'>;

export default function ReaderScreen({ route, navigation }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const { bookId } = route.params;
  const highlightId = route.params.highlightId;
  const insets = useSafeAreaInsets();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileUnavailable, setFileUnavailable] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // For EPUB: raw 0-1 percentage from epub.js (precise, matches cfiFromPercentage)
  const [currentPct, setCurrentPct] = useState<number>(0);
  const [showProgress, setShowProgress] = useState(true);
  const [isPaginated, setIsPaginated] = useState(true);
  const [dynamicTotalPages, setDynamicTotalPages] = useState<number>(0);

  // Highlights for THIS book, loaded from the DB so they re-render in the reader
  // on every open (fixes Gap 1). Kept in local state and mirrored to the store.
  const [bookHighlights, setBookHighlights] = useState<Highlight[]>([]);

  // Text selection state
  const [selectionMenuVisible, setSelectionMenuVisible] = useState(false);
  const [currentSelection, setCurrentSelection] = useState<SelectionData | null>(null);

  // Highlight modal state
  const [highlightModalVisible, setHighlightModalVisible] = useState(false);

  // Active highlight from navigation (for scroll-to and temporary highlight)
  const [activeHighlightId, setActiveHighlightId] = useState<string | undefined>(highlightId);

  // When the reader is opened by tapping a highlight in the Highlights tab, we
  // jump to that highlight — which scrolls the document and emits a `progress`
  // event. Persisting that would clobber the user's real last-read position, so
  // we suppress progress writes for a highlight-opened session. The user keeps
  // their place; jumping to a highlight is a transient view, not a position.
  const suppressProgressRef = useRef<boolean>(!!highlightId);

  const bookService = ServiceFactory.getInstance().getBookService();
  const highlightService = ServiceFactory.getInstance().getHighlightService();
  const addHighlightToStore = useAppStore(s => s.addHighlight);

  const readerRef = useRef<any>(null);

  const screenWidth = Dimensions.get('window').width;
  const trackLeft = space.xl + space.md;
  const trackWidth = screenWidth - trackLeft * 2;

  const totalPages = book?.fileType === 'epub'
    ? (dynamicTotalPages || book?.totalPages || 100)
    : (book?.totalPages || 0);

  // For the slider: track the current file type so the pan responder (which is
  // stable and can't close over reactive state) can navigate correctly.
  const fileTypeRef = useRef<string>(book?.fileType ?? 'pdf');
  useEffect(() => {
    if (book?.fileType) fileTypeRef.current = book.fileType;
  }, [book?.fileType]);

  // Raw 0–1 slider percentage (either from EPUB progress events or derived from
  // PDF page number). Used for visual positioning AND EPUB navigation.
  const sliderPct = book?.fileType === 'epub'
    ? currentPct
    : totalPages > 0 ? currentPage / totalPages : 0;

  const handleTouch = useCallback(
    (pageX: number, isRelease = false) => {
      if (pageX <= 0) return;
      const relativeX = pageX - trackLeft;
      const rawPct = Math.max(0, Math.min(1, relativeX / trackWidth)); // 0-1
      console.log('[Slider] handleTouch pageX:', pageX, 'rawPct:', rawPct, 'fileType:', fileTypeRef.current);

      if (fileTypeRef.current === 'epub') {
        // For EPUB, keep percentage as source of truth — no lossy rounding.
        setCurrentPct(rawPct);
        const approxPage = Math.max(1, Math.min(totalPages, Math.round(rawPct * totalPages)));
        setCurrentPage(approxPage);
        if (isRelease && readerRef.current) {
          console.log('[Slider] EPUB jumping to percentage:', rawPct);
          readerRef.current.goToPage(rawPct); // pass raw pct (0-1) for epub
        }
      } else {
        // For PDF, navigate by integer page number.
        const newPage = Math.max(1, Math.min(totalPages, Math.round(rawPct * totalPages) || 1));
        console.log('[Slider] PDF jumping to page:', newPage);
        setCurrentPage(newPage);
        if (isRelease && readerRef.current) {
          readerRef.current.goToPage(newPage);
        }
      }
    },
    [totalPages, trackLeft, trackWidth]
  );

  const handleTouchRef = useRef(handleTouch);
  useEffect(() => {
    handleTouchRef.current = handleTouch;
  }, [handleTouch]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        console.log('[Slider] onStartShouldSetPanResponder');
        return true;
      },
      onMoveShouldSetPanResponder: () => {
        console.log('[Slider] onMoveShouldSetPanResponder');
        return true;
      },
      onPanResponderGrant: (evt, gestureState) => {
        console.log('[Slider] onPanResponderGrant x0:', gestureState.x0);
        handleTouchRef.current(gestureState.x0);
      },
      onPanResponderMove: (evt, gestureState) => {
        console.log('[Slider] onPanResponderMove moveX:', gestureState.moveX);
        handleTouchRef.current(gestureState.moveX);
      },
      onPanResponderRelease: (evt, gestureState) => {
        console.log('[Slider] onPanResponderRelease moveX:', gestureState.moveX, 'x0:', gestureState.x0);
        const finalX = gestureState.moveX > 0 ? gestureState.moveX : gestureState.x0;
        handleTouchRef.current(finalX, true);
      },
    })
  ).current;

  // Load book + its persisted highlights on mount
  useEffect(() => {
    loadBook();

    // Clear temporary highlight after 3 seconds. We also lift progress
    // suppression here: the deep-link jump has settled, so any navigation from
    // now on is genuine reading and should update the last-read position.
    if (highlightId) {
      const timer = setTimeout(() => {
        setActiveHighlightId(undefined);
        suppressProgressRef.current = false;
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [bookId]);

  // Load user settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = ServiceFactory.getInstance().getSettingsService();
        const flow = await settings.getEpubFlow();
        setIsPaginated(flow !== 'scrolled');
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);

  const loadBook = async () => {
    try {
      setLoading(true);
      setError(null);
      setFileUnavailable(false);

      const loadedBook = await bookService.getBookById(bookId);

      if (!loadedBook) {
        setError('Book not found');
        return;
      }

      // Check if the book file still exists on disk (Req 13.7)
      const fileExists = await bookService.checkBookFileExists(bookId);
      if (!fileExists) {
        setBook(loadedBook);
        if (loadedBook) {
          setCurrentPage(loadedBook.currentPage || 1);
          setDynamicTotalPages(loadedBook.totalPages || 0);
        }
        setFileUnavailable(true);
        return;
      }

      setBook(loadedBook);
      if (loadedBook) {
        setCurrentPage(loadedBook.currentPage || 1);
        setDynamicTotalPages(loadedBook.totalPages || 0);
      }

      // Load persisted highlights so the reader can rehydrate them (Gap 1).
      try {
        const existing = await highlightService.getHighlightsByBook(bookId);
        setBookHighlights(existing);
      } catch (hErr) {
        console.error('Failed to load highlights for book:', hErr);
      }
    } catch (err) {
      console.error('Failed to load book:', err);
      setError('Failed to load book');
    } finally {
      setLoading(false);
    }
  };

  // Called by the reader when the user selects real text in the document.
  // The menu anchors at a fixed bottom-center position (see TextSelectionMenu),
  // so we don't translate the WebView-space selection rect to screen space.
  const handleReaderSelection = useCallback((data: SelectionData) => {
    setCurrentSelection(data);
    setSelectionMenuVisible(true);
  }, []);

  // Handle back navigation
  const handleBack = () => {
    navigation.goBack();
  };

  // Handle removing an unavailable book from the library
  const handleRemoveFromLibrary = () => {
    if (!book) return;
    Alert.alert(
      'Remove from Library',
      `"${book.title}" will be removed from your library. Your highlights will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await bookService.deleteBook(book.id);
              navigation.goBack();
            } catch (err) {
              console.error('Failed to remove book:', err);
              Alert.alert('Error', 'Failed to remove book from library.');
            }
          },
        },
      ]
    );
  };

  const handlePageChange = async (currentPage: number, totalPages?: number, rawPct?: number, rawCfi?: string) => {
    if (!book) return;

    // Update local state so progress overlay re-renders
    setCurrentPage(currentPage);
    if (totalPages) {
      setDynamicTotalPages(totalPages);
    }
    if (rawPct !== undefined) {
      setCurrentPct(rawPct);
    }

    // Don't persist position while a highlight deep-link is settling — that
    // scroll isn't the user's reading position (see suppressProgressRef).
    if (suppressProgressRef.current) return;

    const resolvedTotal = totalPages || book.totalPages || 0;
    const pct = rawPct !== undefined
      ? rawPct * 100
      : resolvedTotal > 0 ? (currentPage / resolvedTotal) * 100 : 0;

    try {
      await bookService.updateReadingProgress(book.id, {
        bookId: book.id,
        currentPage,
        totalPages: resolvedTotal,
        percentage: pct,
        lastCfi: rawCfi,
      });
    } catch (err) {
      console.error('Failed to update reading progress:', err);
    }
  };

  // Handle text selection menu dismiss
  const handleSelectionMenuDismiss = useCallback(() => {
    setSelectionMenuVisible(false);
    setCurrentSelection(null);
  }, []);

  // Handle highlight button press
  const handleHighlightPress = useCallback(() => {
    setSelectionMenuVisible(false);
    setHighlightModalVisible(true);
  }, []);

  // Handle highlight save
  const handleHighlightSave = useCallback(
    async (data: { note: string; tags: string[]; color: string }) => {
      if (!currentSelection || !book) {
        return;
      }

      try {
        // Persist the highlight (also parses action tags, inits FSRS state).
        const highlight = await highlightService.createHighlight({
          bookId: book.id,
          text: currentSelection.text,
          note: data.note || undefined,
          tags: data.tags,
          position: currentSelection.position,
          color: data.color,
        });

        // Add to local + shared state. The reader rehydrates from bookHighlights,
        // so appending here draws the new marker in the WebView immediately.
        setBookHighlights(prev => [highlight, ...prev]);
        addHighlightToStore(highlight);

        setCurrentSelection(null);
        setHighlightModalVisible(false);
      } catch (err) {
        console.error('Failed to create highlight:', err);
        Alert.alert('Error', 'Failed to create highlight. Please try again.');
      }
    },
    [currentSelection, book, highlightService, addHighlightToStore]
  );

  // Handle highlight modal cancel
  const handleHighlightCancel = useCallback(() => {
    setHighlightModalVisible(false);
    setCurrentSelection(null);
  }, []);

  // Render loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={palette.ink} />
        <Text style={styles.loadingText}>LOADING BOOK…</Text>
      </View>
    );
  }

  // Render error state
  if (error || !book) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || 'Book not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render unavailable state (file missing from disk, Req 13.7)
  if (fileUnavailable && book) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.unavailableTitle}>{book.title}</Text>
        <Text style={styles.unavailableText}>
          Book file not found. The file may have been moved or deleted.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.removeButton} onPress={handleRemoveFromLibrary}>
          <Text style={styles.removeButtonText}>Remove from Library</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayPct = Math.round(sliderPct * 100); // 0-100 integer for display
  const percentage = displayPct; // alias kept for JSX below

  // Render appropriate reader based on file type
  return (
    <View style={styles.container}>
      {/* Navigation Header */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {book.title}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {book.author.toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Reader Content */}
      {book.fileType === 'pdf' ? (
        <PDFReader
          ref={readerRef}
          book={book}
          highlights={bookHighlights}
          activeHighlightId={activeHighlightId}
          onSelection={handleReaderSelection}
          onPageChange={handlePageChange}
          totalPages={totalPages}
        />
      ) : book.fileType === 'epub' ? (
        <EPUBReader
          ref={readerRef}
          book={book}
          highlights={bookHighlights}
          activeHighlightId={activeHighlightId}
          onSelection={handleReaderSelection}
          onPageChange={handlePageChange}
          totalPages={totalPages}
        />
      ) : (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Unsupported file type: {book.fileType}</Text>
        </View>
      )}

      {/* Text Selection Menu */}
      <TextSelectionMenu
        visible={selectionMenuVisible}
        onHighlight={handleHighlightPress}
        onDismiss={handleSelectionMenuDismiss}
      />

      {/* Highlight Modal */}
      <HighlightModal
        visible={highlightModalVisible}
        selectedText={currentSelection?.text || ''}
        onSave={handleHighlightSave}
        onCancel={handleHighlightCancel}
      />

      {/* Progress Overlay */}
      {isPaginated && totalPages > 0 && (
        showProgress ? (
          <View style={styles.progressContainer} collapsable={false}>
            <View 
              style={styles.sliderTrackContainer}
              {...panResponder.panHandlers}
              collapsable={false}
            >
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderTrackFill, { width: `${percentage}%` }]} />
              </View>
              <View style={[styles.sliderThumb, { left: `${percentage}%` }]} />
            </View>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressText}>
                {percentage}% • Page {currentPage} of {totalPages}
              </Text>
              <TouchableOpacity onPress={() => setShowProgress(false)} style={styles.hideButton}>
                <Text style={styles.hideButtonText}>[ HIDE ]</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowProgress(true)} style={styles.collapsedProgressContainer}>
            <Text style={styles.collapsedProgressText}>
              [ {percentage}% • {currentPage}/{totalPages} ]
            </Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
