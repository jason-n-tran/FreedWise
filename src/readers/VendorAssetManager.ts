// VendorAssetManager — materializes the vendored WebView libraries and the
// generated reader HTML pages into a versioned directory under the app's
// document storage, once per LIB_VERSION. The WebView readers then load those
// pages via file:// with relative <script src> resolution.
//
// Everything is local: assets are bundled in the app (expo-asset) and copied to
// disk; nothing is fetched from the network. Bump LIB_VERSION whenever any
// vendored file or template changes so installed copies are refreshed.

import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { pdfReaderHtml, epubReaderHtml, extractHtml } from './html/templates';

// Bump whenever any vendored file or template changes so installed copies are
// refreshed (the .installed marker gates reinstall).
//   v2: copy libs to disk with .js extensions so the Android WebView serves them
//       with a JS MIME and executes them (the .wvlib on-disk extension gave an
//       unknown MIME, so <script src> silently failed to define its global).
//   v3: reader runtime now waits for an explicit `init` message (kind/book/
//       worker) instead of reading injected globals, fixing the Android race
//       where EPUB pages ran the PDF branch ("pdfjsLib not loaded").
//   v4: EPUB rendition uses manager:'continuous' + flow:'scrolled' so the whole
//       book renders, not just the first section.
//   v5: PDF page sets --scale-factor so the text layer aligns with the canvas
//       (fixes highlights landing a few characters to the right).
//   v6: reader theming (dark mode bg/fg + PDF canvas invert), EPUB paginated
//       tap-to-flip + scroll toggle, font-size scaling, pinch-zoom viewport.
//   v7: EPUB tap-to-flip via per-section content hook (taps land in the section
//       iframe, not the parent doc); goToHighlight fires after render + PDF
//       page-number fallback so opening from Highlights jumps to the highlight.
//   v8: EPUB tap-to-flip via fixed parent-document edge overlays (the per-section
//       iframe handler read clientX in full-content space → looped to page 1 and
//       double-flipped). Reading-position persistence is now suppressed during a
//       highlight deep-link jump (RN side) so jumping to a highlight no longer
//       overwrites the last-read page.
//   v9: PDF supports paginated tap-to-flip too (shows one .page div at a time,
//       edge zones flip even when zoomed). The reading-mode setting now drives
//       both readers; goToHighlight reveals the target page first in PDF pages
//       mode.
//   v10: tap-to-flip moved to NATIVE RN edge overlays (WebViewReader) posting a
//        `flip` message. In-WebView fixed overlays drifted under Android pinch-
//        zoom (zoom pans the whole WebView), so a zoomed viewer's edge taps
//        landed on page content instead of flipping. RN overlays stay in true
//        screen space, immune to zoom/pan.
//   v11: tap-to-flip moved to NATIVE RN edge overlays (WebViewReader) posting a
//        `flip` message. In-WebView fixed overlays drifted under Android pinch-
//        zoom (zoom pans the whole WebView), so a zoomed viewer's edge taps
//        landed on page content instead of flipping. RN overlays stay in true
//        screen space, immune to zoom/pan.
//   v12: progress slider (PanResponder). EPUB location-based page count via
//        book.locations.generate(600); WebViewReader now accepts forwardRef so
//        ReaderScreen can call goToPage() directly.
//   v13: stale-closure fix — handleTouchRef keeps the PanResponder in sync with
//        current totalPages/fileType so the slider registers correctly.
//   v14: EPUB slider accuracy fix — progress events relay the raw 0-1 percentage
//        from epub.js through to ReaderScreen; goToPage passes it straight to
//        cfiFromPercentage, removing the double-rounding that caused jumps to the
//        wrong location.
//   v15: PDF fit-to-width — fixed PDF_SCALE=1.3 replaced with per-page dynamic
//        scale: (containerWidth / naturalPageWidth) × devicePixelRatio. Canvas
//        rasterises at device resolution; CSS shrinks it to CSS pixels so the
//        page always fills—but never exceeds—the screen width at max zoom-out.
//   v17: PDF resume/deep-link fix. Scroll mode creates lightweight page shells
//        before heavyweight rendering so resume/highlight jumps can happen
//        immediately; background rendering no longer pulls highlight jumps back
//        to the last-read page.
export const LIB_VERSION = '17';

// Static requires so Metro bundles the .wvlib assets. require() (not import) is
// the required form for RN/Metro static assets — they resolve to numeric module
// ids, not JS modules. The map key is the ON-DISK filename (.js, for correct
// WebView MIME); the bundled asset keeps the .wvlib extension Metro needs.
/* eslint-disable @typescript-eslint/no-require-imports */
const LIB_MODULES: Record<string, number> = {
  'pdf.min.js': require('../../assets/webview-libs/pdf.min.wvlib'),
  'pdf.worker.min.js': require('../../assets/webview-libs/pdf.worker.min.wvlib'),
  'epub.min.js': require('../../assets/webview-libs/epub.min.wvlib'),
  'jszip.min.js': require('../../assets/webview-libs/jszip.min.wvlib'),
  'reader-runtime.js': require('../../assets/webview-libs/reader-runtime.wvlib'),
  'extract-runtime.js': require('../../assets/webview-libs/extract-runtime.wvlib'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

let installPromise: Promise<string> | null = null;

function libsDir(): Directory {
  return new Directory(Paths.document, 'webview-libs', LIB_VERSION);
}
