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
