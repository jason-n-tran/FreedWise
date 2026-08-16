// Vendored WebView libraries are bundled as `.wvlib` assets (see metro.config.js).
// Metro resolves require() of these to a numeric asset module id at runtime, so
// we type the module's export as a number (matches `const x = require('x.wvlib')`).
declare module '*.wvlib' {
  const asset: number;
  export = asset;
}
