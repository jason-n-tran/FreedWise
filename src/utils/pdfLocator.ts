// Helpers for PDF highlight locators: normalizing selection rectangles into
// page-relative (0..1) coordinates so a highlight can be redrawn at any zoom,
// and a deterministic text hash to validate/disambiguate re-anchoring.
//
// Pure and dependency-free so they're unit-testable in node/jest. The WebView
// runtime produces the raw pixel rects; these functions convert to/from the
// stored normalized form.

import type { PDFLocator } from '../types/models';

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageViewport {
  width: number;
  height: number;
}

/**
 * Convert pixel-space selection rectangles (within a page of the given viewport)
 * into normalized 0..1 quads. Values are clamped to [0,1] so off-page subpixel
 * drift doesn't produce out-of-range coordinates.
 */
export function normalizeQuads(rects: PixelRect[], viewport: PageViewport): PDFLocator['quads'] {
  const w = viewport.width || 1;
  const h = viewport.height || 1;
  return rects.map(r => ({
    x: clamp01(r.x / w),
    y: clamp01(r.y / h),
    width: clamp01(r.width / w),
    height: clamp01(r.height / h),
  }));
}

/**
 * Convert normalized 0..1 quads back into pixel rectangles for a given viewport
 * (e.g. when redrawing a rehydrated highlight at the current render scale).
 */
export function denormalizeQuads(quads: PDFLocator['quads'], viewport: PageViewport): PixelRect[] {
  const w = viewport.width || 1;
  const h = viewport.height || 1;
  return quads.map(q => ({
    x: q.x * w,
    y: q.y * h,
    width: q.width * w,
    height: q.height * h,
  }));
}

/**
 * Deterministic, stable hash of selected text (FNV-1a, 32-bit, hex). Used to
 * confirm a re-anchored selection still matches the originally highlighted text.
 * Whitespace is collapsed so trivial reflow differences don't break the match.
 */
export function hashText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in integer range
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Build a complete PDFLocator from a raw WebView selection.
 */
export function buildLocator(params: {
  pageNumber: number;
  rects: PixelRect[];
  viewport: PageViewport;
  text: string;
  startCharOffset?: number;
  endCharOffset?: number;
}): PDFLocator {
  return {
    pageNumber: params.pageNumber,
    quads: normalizeQuads(params.rects, params.viewport),
    textHash: hashText(params.text),
    startCharOffset: params.startCharOffset,
    endCharOffset: params.endCharOffset,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
