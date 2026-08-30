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
