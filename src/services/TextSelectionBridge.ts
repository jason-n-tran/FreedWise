// TextSelectionBridge - carries the current text selection between a reader
// (PDF or EPUB WebView) and ReaderScreen.
//
// Highlight *rendering* is no longer the bridge's responsibility: each WebView
// reader draws highlights internally, keyed by the highlight's DB id, and is
// hydrated from the database on open. The bridge only holds the transient
// "currently selected text" and notifies ReaderScreen's listener. Requirements:
// 3.1, 3.2.

import type { PDFLocator } from '../types/models';
import type { ITextSelectionBridge, SelectionData } from './interfaces';

export class TextSelectionBridge implements ITextSelectionBridge {
  private currentSelection: SelectionData | null = null;
  private epubSelectionListener: ((data: SelectionData) => void) | null = null;
  private pdfSelectionListener: ((data: SelectionData) => void) | null = null;

  /**
   * Return the current selection captured from a reader.
   * Requirement: 13.4
   */
  async captureSelection(source: 'pdf' | 'epub'): Promise<SelectionData | null> {
    try {
      // Both readers push their selection via setPDF/EPUBSelection; we just
      // return whatever was most recently captured.
      void source;
      return this.currentSelection;
    } catch (error) {
      console.error('TextSelectionBridge.captureSelection: failed to capture selection', error);
      throw new Error('Failed to capture text selection. Please try again.');
    }
  }

  /**
   * Set PDF selection data (called by the PDF WebView reader). The optional
   * locator carries precise page-relative quads + text hash for re-anchoring.
   */
  setPDFSelection(
    text: string,
    pageNumber: number,
    boundingRect: { x: number; y: number; width: number; height: number },
    locator?: PDFLocator
  ): void {
    this.currentSelection = {
      text,
      position: { pageNumber, locator },
      boundingRect,
    };
  }

  /**
   * Set EPUB selection data (called by the EPUB WebView reader).
   */
  setEPUBSelection(
    text: string,
    cfi: string,
    boundingRect: { x: number; y: number; width: number; height: number }
  ): void {
    this.currentSelection = {
      text,
      position: { cfi },
      boundingRect,
    };
  }

  /**
   * Clear current selection.
   */
  clearSelection(): void {
    this.currentSelection = null;
  }

  /**
   * Register a listener for EPUB selection events.
   */
  onEPUBSelection(listener: (data: SelectionData) => void): void {
    this.epubSelectionListener = listener;
  }

  /**
   * Register a listener for PDF selection events.
   */
  onPDFSelection(listener: (data: SelectionData) => void): void {
    this.pdfSelectionListener = listener;
  }

  /**
   * Notify EPUB selection listener.
   * @internal
   */
  notifyEPUBSelection(data: SelectionData): void {
    if (this.epubSelectionListener) {
      this.epubSelectionListener(data);
    }
  }

  /**
   * Notify PDF selection listener.
   * @internal
   */
  notifyPDFSelection(data: SelectionData): void {
    if (this.pdfSelectionListener) {
      this.pdfSelectionListener(data);
    }
  }
}

// Singleton instance
let textSelectionBridgeInstance: TextSelectionBridge | null = null;
