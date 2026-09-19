// WebViewReader — shared WebView host for both PDF (PDF.js) and EPUB (epub.js)
// readers. Loads the versioned reader HTML page from file://, hands the book's
// own file:// URI to the in-WebView runtime, relays text selections out, and
// pushes highlight apply/remove/rehydrate/goto messages in.
//
// Highlights render INSIDE the WebView keyed by the highlight's DB id, so they
// survive reopen once ReaderScreen rehydrates them here (fixes Gap 1).

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { View, Text, ActivityIndicator, Pressable, PanResponder, Animated } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Book, Highlight, HighlightPosition } from '../../types/models';
import type { SelectionData } from '../../services/interfaces';
import ServiceFactory from '../../services/ServiceFactory';
import { ensureInstalled, libUri, documentRootUri } from '../../readers/VendorAssetManager';
import { type as typo, space } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { makeStyles } from '../../theme/makeStyles';

export interface WebViewReaderRef {
  goToPage: (pageNumber: number) => void;
}

export interface RehydrateHighlight {
  highlightId: string;
  position: HighlightPosition;
  color: string;
}

interface WebViewReaderProps {
  book: Book;
  kind: 'pdf' | 'epub';
  highlights: Highlight[];
  activeHighlightId?: string;
  onSelection: (data: SelectionData) => void;
  onHighlightTap?: (highlightId: string) => void;
  onProgress?: (page: number, total?: number, rawPct?: number, rawCfi?: string) => void;
  totalPages: number;
}

interface WVMessage {
  type: string;
  text?: string;
  position?: HighlightPosition;
  boundingRect?: { x: number; y: number; width: number; height: number };
  highlightId?: string;
  message?: string;
  pdf?: { page: number };
  epub?: { cfi: string; percentage: number; page?: number; total?: number };
}

const WebViewReader = forwardRef<WebViewReaderRef, WebViewReaderProps>(
  (
    {
      book,
      kind,
      highlights,
      activeHighlightId,
      onSelection,
      onHighlightTap,
      onProgress,
      totalPages,
    },
    ref
  ) => {
    const styles = useStyles();
    const { palette, isDark } = useTheme();
    const webViewRef = useRef<WebView>(null);
    const [installedDir, setInstalledDir] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [rendered, setRendered] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Reader preferences (epub flow + font scale) loaded once before init.
    const [epubFlow, setEpubFlow] = useState<'paginated' | 'scrolled'>('paginated');
    const [fontScale, setFontScale] = useState(1.0);
    const [prefsLoaded, setPrefsLoaded] = useState(false);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const settings = ServiceFactory.getInstance().getSettingsService();
          const [flow, scale] = await Promise.all([
            settings.getEpubFlow(),
            settings.getReaderFontScale(),
          ]);
          if (!cancelled) {
            setEpubFlow(flow);
            setFontScale(scale);
          }
        } catch {
          // defaults are fine
        } finally {
          if (!cancelled) setPrefsLoaded(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    // Install vendored libs/pages once, then we can point the WebView at them.
    useEffect(() => {
      let cancelled = false;
      ensureInstalled()
        .then(dir => {
          if (!cancelled) setInstalledDir(dir);
        })
        .catch(err => {
          if (!cancelled) setError(`Failed to prepare reader: ${err?.message ?? err}`);
        });
      return () => {
        cancelled = true;
      };
    }, []);

    const pageName = kind === 'pdf' ? 'reader-pdf.html' : 'reader-epub.html';
    // Wait for prefs too so the first init carries the right flow/fontScale.
    const sourceUri = installedDir && prefsLoaded ? libUri(pageName) : null;

    // The init payload the runtime needs to start the correct (pdf|epub) reader.
    // Sent as an explicit message when the runtime reports `runtimeLoaded`, rather
    // than via injected globals — injection timing is unreliable on Android and
    // caused the runtime to default to the PDF branch on EPUB pages.
    const initMessage = useMemo(
      () => ({
        type: 'init',
        kind,
        bookUri: book.filePath,
        workerUri: installedDir ? libUri('pdf.worker.min.js') : '',
        startPage: book.currentPage || 1,
        startCfi: book.lastCfi || '',
        isDark,
        bg: palette.paper,
        fg: palette.ink,
        flow: epubFlow,
        fontScale,
      }),
      [
        kind,
        book.filePath,
        book.currentPage,
        book.lastCfi,
        installedDir,
        isDark,
        palette.paper,
        palette.ink,
        epubFlow,
        fontScale,
      ]
    );

    const postToWeb = useCallback((msg: object) => {
      webViewRef.current?.postMessage(JSON.stringify(msg));
    }, []);

    const goToPage = useCallback(
      (pageNumberOrPct: number) => {
        if (kind === 'pdf') {
          postToWeb({ type: 'goToPage', pageNumber: pageNumberOrPct });
        } else {
          // EPUB: if value is 0-1 float, treat as raw percentage directly;
          // if it's an integer > 1, divide by totalPages.
          const pct =
            pageNumberOrPct <= 1 ? pageNumberOrPct : pageNumberOrPct / Math.max(1, totalPages);
          postToWeb({ type: 'goToPage', percentage: pct });
        }
      },
      [kind, totalPages, postToWeb]
    );

    useImperativeHandle(
      ref,
      () => ({
        goToPage,
      }),
      [goToPage]
    );

    // Page flipping is driven from RN, not the WebView. In-WebView tap zones break
    // under Android pinch-zoom: zoom scales/pans the whole WebView (including
    // position:fixed overlays), so the zones drift off-screen and taps land on
    // page content. These RN overlays sit on the glass in true screen space, so
    // they work no matter how the page is zoomed or panned.
    const flip = useCallback(
      (direction: 'prev' | 'next') => {
        postToWeb({ type: 'flip', direction });
      },
      [postToWeb]
    );

    // Horizontal swipe gesture for page turning in paginated mode.
    // PanResponder lives on the container so it never blocks touches from
    // reaching the WebView (text selection, long-press, etc.).
    const swipeThreshold = 50;
    const swipeActive = useRef(false);
    const leftArrowOpacity = useRef(new Animated.Value(0)).current;
    const rightArrowOpacity = useRef(new Animated.Value(0)).current;
    const swipeIndicatorX = useRef(new Animated.Value(0)).current;
    const activeArrowRef = useRef<'left' | 'right' | null>(null);

    const swipePanResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (_, gestureState) => {
            return (
              Math.abs(gestureState.dx) > 10 &&
              Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2
            );
          },
          onPanResponderGrant: () => {
            swipeActive.current = false;
            activeArrowRef.current = null;
          },
          onPanResponderMove: (_, gestureState) => {
            const isHorizontalSwipe =
              Math.abs(gestureState.dx) > 20 &&
              Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
            if (isHorizontalSwipe) {
              swipeActive.current = true;
              const dir = gestureState.dx > 0 ? 'right' : 'left';
              const opacity = Math.min(1, Math.abs(gestureState.dx) / 80);
              if (dir !== activeArrowRef.current) {
                // Direction changed — instantly hide the other arrow.
                if (activeArrowRef.current === 'left') leftArrowOpacity.setValue(0);
                if (activeArrowRef.current === 'right') rightArrowOpacity.setValue(0);
                activeArrowRef.current = dir;
              }
              if (dir === 'left') leftArrowOpacity.setValue(opacity);
              else rightArrowOpacity.setValue(opacity);
              swipeIndicatorX.setValue(gestureState.dx * 0.3);
            } else {
              swipeActive.current = false;
              if (activeArrowRef.current === 'left') leftArrowOpacity.setValue(0);
              if (activeArrowRef.current === 'right') rightArrowOpacity.setValue(0);
              activeArrowRef.current = null;
              swipeIndicatorX.setValue(0);
            }
          },
          onPanResponderRelease: (_, gestureState) => {
            if (
              swipeActive.current &&
              Math.abs(gestureState.dx) > swipeThreshold &&
              Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2
            ) {
              flip(gestureState.dx > 0 ? 'prev' : 'next');
            }
            swipeActive.current = false;
            // Fade out whichever arrow was active.
            const fadeOut =
              activeArrowRef.current === 'left' ? leftArrowOpacity : rightArrowOpacity;
            activeArrowRef.current = null;
            Animated.parallel([
              Animated.timing(fadeOut, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              }),
              Animated.timing(swipeIndicatorX, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start();
          },
        }),
      [flip, leftArrowOpacity, rightArrowOpacity, swipeIndicatorX]
    );

    const rehydrate = useCallback(() => {
      const payload: RehydrateHighlight[] = highlights.map(h => ({
        highlightId: h.id,
        position: h.position,
        color: h.color,
      }));
      postToWeb({ type: 'rehydrateHighlights', highlights: payload });
    }, [highlights, postToWeb]);

    // When highlights change after ready (e.g. a new one saved), re-send them.
    useEffect(() => {
      if (ready) rehydrate();
    }, [ready, rehydrate]);

    // Deep-link: jump to a specific highlight once the content has RENDERED
    // (pages/sections exist). Firing on `ready` alone raced the page render, so
    // the jump silently no-op'd and the reader stayed on the last-read page.
    useEffect(() => {
      if (rendered && activeHighlightId) {
        const target = highlights.find(h => h.id === activeHighlightId);
        postToWeb({
          type: 'goToHighlight',
          highlightId: activeHighlightId,
          // EPUB jumps by cfi; PDF by id, with page-number fallback.
          target: target?.position.cfi ?? activeHighlightId,
          pageNumber: target?.position.pageNumber ?? target?.position.locator?.pageNumber,
        });
      }
    }, [rendered, activeHighlightId, highlights, postToWeb]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        let data: WVMessage;
        try {
          data = JSON.parse(event.nativeEvent.data) as WVMessage;
        } catch {
          return;
        }
        switch (data.type) {
          case 'runtimeLoaded':
            // Runtime is loaded and waiting; hand it the kind/book/worker so it
            // starts the correct reader.
            postToWeb(initMessage);
            break;
          case 'ready':
            setReady(true);
            break;
          case 'rendered':
            rehydrate();
            setRendered(true);
            break;
          case 'selection':
            if (data.text && data.position && data.boundingRect) {
              onSelection({
                text: data.text,
                position: data.position,
                boundingRect: data.boundingRect,
              });
            }
            break;
          case 'highlightTap':
            if (data.highlightId) onHighlightTap?.(data.highlightId);
            break;
          case 'progress':
            if (data.pdf?.page) {
              onProgress?.(data.pdf.page, book.totalPages);
            } else if (data.epub) {
              const epubPct = data.epub.percentage || 0;
              const epubCfi = data.epub.cfi || '';
              if (data.epub.page !== undefined && data.epub.total !== undefined) {
                onProgress?.(data.epub.page, data.epub.total, epubPct, epubCfi);
              } else {
                // Fallback: synthesise page/total from percentage
                onProgress?.(Math.round(epubPct * 100), 100, epubPct, epubCfi);
              }
            }
            break;
          case 'error':
            console.error('[WebViewReader] runtime error:', data.message);
            setError(data.message ?? 'Reader error');
            break;
        }
      },
      [onSelection, onHighlightTap, onProgress, rehydrate, postToWeb, initMessage]
    );

    if (error) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (!sourceUri) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.ink} />
          <Text style={styles.loadingText}>Preparing reader…</Text>
        </View>
      );
    }

    return (
      <View
        style={styles.container}
        {...(rendered && epubFlow === 'paginated' ? swipePanResponder.panHandlers : {})}
      >
        <WebView
          ref={webViewRef}
          source={{ uri: sourceUri }}
          onMessage={handleMessage}
          originWhitelist={['file://*']}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs={false}
          // Scope file read access to the versioned libs dir + the book file dir.
          allowingReadAccessToURL={documentRootUri()}
          javaScriptEnabled
          domStorageEnabled={false}
          mixedContentMode="never"
          androidLayerType="hardware"
          // Pinch-zoom: enable Android's built-in WebView zoom (no on-screen zoom
          // buttons) and iOS page scaling. Paired with a user-scalable viewport.
          setBuiltInZoomControls
          setDisplayZoomControls={false}
          scalesPageToFit
          style={styles.webview}
        />
        {rendered && epubFlow === 'paginated' && (
          <>
            <Animated.View
              style={[
                styles.swipeIndicatorRight,
                {
                  opacity: leftArrowOpacity,
                  transform: [{ translateX: swipeIndicatorX }],
                },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.swipeArrow}>{'›'}</Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.swipeIndicatorLeft,
                {
                  opacity: rightArrowOpacity,
                  transform: [{ translateX: swipeIndicatorX }],
                },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.swipeArrow}>{'‹'}</Text>
            </Animated.View>
            <Pressable
              style={styles.flipZoneLeft}
              onPress={() => flip('prev')}
              accessibilityLabel="Previous page"
            />
            <Pressable
              style={styles.flipZoneRight}
              onPress={() => flip('next')}
              accessibilityLabel="Next page"
            />
          </>
        )}
        {!ready && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={palette.ink} />
            <Text style={styles.loadingText}>Loading {kind.toUpperCase()}…</Text>
          </View>
        )}
      </View>
    );
  }
);

export default WebViewReader;

const useStyles = makeStyles(palette => ({
  center: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    flex: 1,
    justifyContent: 'center',
    padding: space.xl,
  },
  container: { backgroundColor: palette.paper, flex: 1 },
  errorText: { ...typo.body, color: palette.danger, textAlign: 'center' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: palette.paper,
    justifyContent: 'center',
  },
  loadingText: { ...typo.eyebrow, color: palette.inkSoft, marginTop: space.md },
  webview: { backgroundColor: palette.paper, flex: 1 },
  // Transparent edge tap targets for page flipping. 15% of width each, leaving
  // the center 70% free for text selection / reading.
  flipZoneLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '15%',
  },
  flipZoneRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '15%',
  },
  swipeIndicatorLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 60,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 12,
    pointerEvents: 'none',
  },
  swipeIndicatorRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 60,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 12,
    pointerEvents: 'none',
  },
  swipeArrow: {
    fontSize: 48,
    color: palette.inkSoft,
    opacity: 0.6,
    fontWeight: '300',
  },
}));
