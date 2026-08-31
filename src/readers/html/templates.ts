// HTML page templates for the WebView readers. These are written to the
// versioned webview-libs directory at first launch (VendorAssetManager) and
// loaded via file:// so the co-dependent vendored scripts resolve with normal
// relative <script src> semantics. Scripts are referenced by relative name
// (same directory), never from the network.
//
// CSP allows 'unsafe-eval' (PDF.js needs it) and local/blob/data resources
// only — no http(s) origin is ever permitted, preserving offline guarantees.

const CSP =
  "default-src 'none'; " +
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' blob: data:;";

function baseHead(): string {
  return `
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
}

// Diagnostic bootstrap: runs before the lib scripts. Surfaces any uncaught error
// (incl. a vendored script throwing during execution) and per-<script> load
// failures back to RN, so a device failure is explainable instead of silent.
function diagnosticsBootstrap(): string {
  return `<script>
    (function () {
      function report(msg) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'error', message: msg })
          );
        }
      }
      window.onerror = function (message, source, lineno) {
        report('window.onerror: ' + message + ' @ ' + (source || '?') + ':' + (lineno || '?'));
        return false;
      };
      window.onScriptError = function (name) {
        report('failed to load script: ' + name);
      };
    })();
  </script>`;
}

/**
 * PDF reader page. pdf.min, the runtime, and the worker path are injected as
 * globals so the runtime can hand the worker URL to pdf.js.
 */
export function pdfReaderHtml(): string {
  return `<!DOCTYPE html>
<html>
  <head>${baseHead()}
    <style>
      html, body { margin: 0; padding: 0; background: #525659; }
      #viewer { width: 100%; height: 100vh; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch; }
      .page { position: relative; margin: 8px auto; max-width: 100%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
      .page canvas { display: block; }
      .textLayer { position: absolute; left: 0; top: 0; right: 0; bottom: 0; overflow: hidden; opacity: 0.2; line-height: 1; }
      .textLayer > span { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; }
      .hlLayer { position: absolute; left: 0; top: 0; right: 0; bottom: 0; pointer-events: none; }
      .hlLayer .hl { pointer-events: auto; border-radius: 2px; }
      ::selection { background: rgba(0, 100, 255, 0.3); }
      /* Dark mode: invert page canvases (hue-rotate keeps color images sane). */
      #viewer.fw-dark .page canvas { filter: invert(0.92) hue-rotate(180deg); }
    </style>
  </head>
  <body>
    <div id="viewer"></div>
    ${diagnosticsBootstrap()}
    <script src="./pdf.min.js" onerror="window.onScriptError('pdf.min.js')"></script>
    <script src="./reader-runtime.js" onerror="window.onScriptError('reader-runtime.js')"></script>
  </body>
</html>`;
}

/**
 * EPUB reader page. jszip must load before epub.min (epub.js uses it).
 */
export function epubReaderHtml(): string {
  return `<!DOCTYPE html>
<html>
  <head>${baseHead()}
    <style>
      html, body { margin: 0; padding: 0; background: #fafafa; }
      #viewer { width: 100%; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="viewer"></div>
    ${diagnosticsBootstrap()}
    <script src="./jszip.min.js" onerror="window.onScriptError('jszip.min.js')"></script>
    <script src="./epub.min.js" onerror="window.onScriptError('epub.min.js')"></script>
    <script src="./reader-runtime.js" onerror="window.onScriptError('reader-runtime.js')"></script>
  </body>
</html>`;
}

/**
 * Hidden extraction page — loads both libs to pull metadata/cover without
 * rendering a full reader. Used by ExtractionService.
 */
export function extractHtml(): string {
  return `<!DOCTYPE html>
<html>
  <head>${baseHead()}
    <style>html, body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    ${diagnosticsBootstrap()}
    <script src="./jszip.min.js" onerror="window.onScriptError('jszip.min.js')"></script>
    <script src="./pdf.min.js" onerror="window.onScriptError('pdf.min.js')"></script>
    <script src="./epub.min.js" onerror="window.onScriptError('epub.min.js')"></script>
    <script src="./extract-runtime.js" onerror="window.onScriptError('extract-runtime.js')"></script>
  </body>
</html>`;
}
