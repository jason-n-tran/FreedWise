// ExtractionService — the non-React seam between BookService and the hidden
// ExtractionWebView. BookService.importBook calls extract(); the WebView (mounted
// once at app root) registers itself as the backing extractor via setExtractor.
//
// Keeping the WebView behind this interface preserves the layering (services
// don't import React) and makes extraction trivially mockable in tests.

import type { IExtractionService, Extractor, ExtractionResult } from './interfaces';

// If no extractor has registered yet (e.g. extraction requested before the
// WebView mounts), wait briefly before giving up so import still succeeds with
// fallback metadata rather than hanging.
const READY_TIMEOUT_MS = 8000;
const READY_POLL_MS = 100;

export class ExtractionService implements IExtractionService {
  private extractor: Extractor | null = null;

  setExtractor(extractor: Extractor | null): void {
    this.extractor = extractor;
  }

  isReady(): boolean {
    return this.extractor !== null;
  }

  async extract(uri: string, kind: 'pdf' | 'epub'): Promise<ExtractionResult> {
    const extractor = await this.waitForExtractor();
    if (!extractor) {
      // No WebView available; caller falls back to filename/no-cover.
      return {};
    }
    try {
      return await extractor(uri, kind);
    } catch (err) {
      console.error('ExtractionService.extract failed:', err);
      return {};
    }
  }

  private async waitForExtractor(): Promise<Extractor | null> {
    if (this.extractor) return this.extractor;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await delay(READY_POLL_MS);
      if (this.extractor) return this.extractor;
    }
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
