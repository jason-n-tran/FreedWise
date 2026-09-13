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
