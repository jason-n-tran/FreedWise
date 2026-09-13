import { registerRootComponent } from 'expo';

import App from './App';

// NOTE: Do NOT define a global `window` here. React Native detects its runtime
// via `typeof window`/`window.document`; injecting a fake top-level `window`
// makes RN think it's running on web and can prevent the React context from
// initializing (blank screen, "context is not ready", no JS logs). epub.js does
// NOT need a window at app startup — it runs inside the WebView, which has a real
// window. Any web-env shimming must stay scoped to the WebView, never global.

// [BOOT] breadcrumb at ERROR level so it shows up even in an error-filtered
// logcat (adb logcat *:E). Temporary startup diagnostic.
console.error('[BOOT] index.ts evaluated, registering root component');
registerRootComponent(App);
