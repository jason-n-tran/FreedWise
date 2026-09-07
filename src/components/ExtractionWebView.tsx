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

export default function ExtractionWebView() {
  const webViewRef = useRef<WebView>(null);
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const readyRef = useRef(false);
  const seqRef = useRef(0);
  const pending = useRef<Map<string, PendingRequest>>(new Map());

  useEffect(() => {
    let cancelled = false;
    ensureInstalled()
      .then(() => {
        if (!cancelled) setSourceUri(libUri('reader-extract.html'));
      })
      .catch(err => console.error('ExtractionWebView install failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const runExtract = useCallback((uri: string, kind: 'pdf' | 'epub'): Promise<ExtractionResult> => {
    return new Promise((resolve, reject) => {
      if (!readyRef.current || !webViewRef.current) {
        reject(new Error('Extraction WebView not ready'));
        return;
      }
      const id = `x${++seqRef.current}`;
      pending.current.set(id, { resolve, reject });

      const workerUri = libUri('pdf.worker.min.js');
      // Provide the worker path then send the request.
      webViewRef.current.injectJavaScript(
        `window.__PDF_WORKER_URI__ = ${JSON.stringify(workerUri)}; true;`
      );
      webViewRef.current.postMessage(JSON.stringify({ type: 'extract', id, uri, kind }));

      setTimeout(() => {
        if (pending.current.has(id)) {
          pending.current.delete(id);
          reject(new Error('Extraction timed out'));
        }
      }, EXTRACT_TIMEOUT_MS);
    });
  }, []);

  // Register/unregister with the service.
  useEffect(() => {
    const factory = ServiceFactory.getInstance();
    if (!factory.has('ExtractionService')) return undefined;
    const service = factory.getExtractionService();
    service.setExtractor((uri, kind) => runExtract(uri, kind));
    return () => service.setExtractor(null);
  }, [runExtract]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let data: {
      type: string;
      id?: string;
      ok?: boolean;
      error?: string;
    } & ExtractionResult;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type === 'extractReady') {
      readyRef.current = true;
      return;
    }
    if (data.type === 'extractResult' && data.id) {
      const req = pending.current.get(data.id);
      if (!req) return;
      pending.current.delete(data.id);
      if (data.ok) {
        req.resolve({
          title: data.title,
          author: data.author,
          pageCount: data.pageCount,
          coverPngBase64: data.coverPngBase64,
        });
      } else {
        req.reject(new Error(data.error || 'extraction failed'));
      }
    }
  }, []);

  if (!sourceUri) return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUri }}
        onMessage={handleMessage}
        originWhitelist={['file://*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs={false}
        allowingReadAccessToURL={documentRootUri()}
        javaScriptEnabled
        domStorageEnabled={false}
        mixedContentMode="never"
      />
    </View>
  );
}
