// Metro config: register a dedicated `.wvlib` asset extension for the vendored
// WebView libraries (PDF.js, epub.js, JSZip, reader runtime). We deliberately
// do NOT add `js` to assetExts — `js` lives in sourceExts and adding it would
// break the whole app bundle. `.wvlib` lets us require() the vendored files as
// assets and copy them to the document dir at first launch (VendorAssetManager).

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wvlib');

module.exports = config;
