// ExtractionWebView — a hidden (0x0) WebView that loads the vendored PDF.js /
// epub.js libs and pulls metadata + a cover image out of a book file. Mounted
// once at the app root; on ready it registers itself with ExtractionService so
// BookService can request extraction without knowing about React/WebView.
//
// Requests are serialized (one in flight at a time) via a simple promise queue.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import ServiceFactory from '../services/ServiceFactory';
import type { ExtractionResult } from '../services/interfaces';
import { ensureInstalled, libUri, documentRootUri } from '../readers/VendorAssetManager';

interface PendingRequest {
  resolve: (result: ExtractionResult) => void;
  reject: (err: Error) => void;
}

const EXTRACT_TIMEOUT_MS = 30000;
