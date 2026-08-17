// Base64 helpers for moving binary book data (PDF/EPUB bytes) into a WebView.
//
// The primary reader path hands PDF.js / epub.js the book's own file:// URI and
// never touches these. They exist for the fallback path where a WebView blocks
// file XHR and we must postMessage the bytes in chunks instead. Kept dependency
// -free and pure so they're unit-testable in the node/jest environment.

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encode bytes to a standard base64 string. Pure JS (no Buffer/btoa) so it runs
 * identically in node tests and the RN runtime.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? B64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

/**
 * Decode a standard base64 string back to bytes.
 */
export function base64ToBytes(b64: string): Uint8Array {
  // Strip everything that isn't a base64 data char (including '=' padding and
  // any whitespace/newlines). The byte length derives from the count of real
  // data chars, not the padded input length.
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const byteLength = Math.floor((len * 6) / 8); // 6 bits per char -> bytes
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = i + 1 < len ? B64_CHARS.indexOf(clean[i + 1]) : 0;
    const c2 = i + 2 < len ? B64_CHARS.indexOf(clean[i + 2]) : 0;
    const c3 = i + 3 < len ? B64_CHARS.indexOf(clean[i + 3]) : 0;

    if (p < byteLength) bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (p < byteLength) bytes[p++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (p < byteLength) bytes[p++] = ((c2 & 0x03) << 6) | c3;
  }
  return bytes;
}
