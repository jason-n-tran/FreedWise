<!-- LOGO placeholder -->

# FreedWise

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React Native](https://img.shields.io/badge/React_Native-0.83-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-55-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-expo--sqlite-003B57?logo=sqlite&logoColor=white)](https://docs.expo.dev/versions/latest/sdk/sqlite/)
[![Jest](https://img.shields.io/badge/Jest-30-C21325?logo=jest&logoColor=white)](https://jestjs.io/)

A free, offline-first mobile reading app that turns the books you already own into durable knowledge. Import EPUB and PDF files, highlight as you read, and FreedWise automatically schedules your highlights for review with the **FSRS** spaced-repetition algorithm — so the passages you care about resurface exactly when you're about to forget them. Everything runs **on-device**: your library, your highlights, and your review history never leave your phone, and the app works with **no account and no network**.

## Visuals

![App Screenshot](path/to/screenshot.png)

<!--
Best screenshot: the Library grid with a few imported book covers, plus a second
shot of the in-reader text-selection menu creating a highlight, and a third of
the Review session showing the FSRS grading buttons (Again / Hard / Good / Easy).
-->

## Table of Contents

- [About The Project](#about-the-project)
  - [Motivation](#motivation)
  - [Key Features](#key-features)
  - [Built With](#built-with)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [Common Commands](#common-commands)
  - [Configuration](#configuration)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [License](#license)
- [Contact / Support](#contact--support)
- [Disclaimer](#disclaimer)

## About The Project

### Motivation

Most people read far more than they remember. You highlight a great passage, close the book, and never see it again. Dedicated spaced-repetition tools exist, but they live *outside* your reading — you have to stop, switch apps, and hand-author flashcards, so almost nobody keeps it up.

FreedWise collapses that gap. Reading, highlighting, and reviewing happen in one place: highlight a sentence and it becomes a review item automatically; tag it with a question and it becomes a flashcard. A modern FSRS scheduler then decides when each item comes back. Because the whole thing is offline and account-free, there's nothing to sign up for, nothing to sync, and nothing to pay — your reading stays private on your device.

### Key Features

- **Import your own books** — add EPUB and PDF files straight from the device document picker; FreedWise verifies file type by magic bytes and extracts metadata and cover art in a sandboxed WebView.
- **Read EPUB and PDF in-app** — a WebView-based reader renders both formats with a shared highlighting layer, so selection and annotation work the same everywhere.
- **Highlight to remember** — select text to create a highlight; action-tags turn a highlight into a flashcard (with a question), set a heading level, or discard it from review.
- **FSRS spaced repetition** — highlights become review cards scheduled by the [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) engine, with Again/Hard/Good/Easy grading and a full review-log history.
- **Daily review reminders** — optional local notifications nudge you when cards are due; everything is scheduled on-device with no push server.
- **Search and organize** — full-text search across books and highlights, with filters, recent-search history, and a dedicated highlights browser.
- **100% offline & private** — an on-device SQLite database holds your entire library and review state; the app needs no account, no backend, and no network connection.

### Built With

**Language**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**App & UI**

![React Native](https://img.shields.io/badge/React_Native-61DAFB?logo=react&logoColor=black)
![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)
![React Navigation](https://img.shields.io/badge/React_Navigation-6B52AE?logo=react&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-2D3748)

**Reading & Review**

![react-native-webview](https://img.shields.io/badge/react--native--webview-1C1E21)
![epub.js](https://img.shields.io/badge/epub.js-85B435)
![pdf.js](https://img.shields.io/badge/pdf.js-D93832)
![ts-fsrs](https://img.shields.io/badge/ts--fsrs-4B8BBE)

**Data & Platform**

![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![expo-file-system](https://img.shields.io/badge/expo--file--system-000020?logo=expo&logoColor=white)
![expo-notifications](https://img.shields.io/badge/expo--notifications-000020?logo=expo&logoColor=white)

**Tooling**

![Jest](https://img.shields.io/badge/Jest-C21325?logo=jest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=black)

## Getting Started

### Prerequisites

- **Node.js 20+** and **npm**.
- **Expo tooling** — installed automatically via `npx expo` (no global install required).
- A device or emulator: the **Expo Go** app on a physical phone, or an Android/iOS simulator.

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/jason-n-tran/freedwise.git
cd freedwise

# 2. Install dependencies
npm install

# 3. Start the Expo dev server
npm start

# 4. Launch on a device/emulator
npm run android      # or: npm run ios
```

Scan the QR code from `npm start` with Expo Go on a physical device, or press `a`/`i` to open an emulator.

## Usage

FreedWise is a self-contained mobile app — there is no server to run. The primary workflow is: import a book, read and highlight, then review.

### Common Commands

```bash
npm start                # Expo dev server (Metro bundler)
npm run android          # build & launch on Android
npm run ios              # build & launch on iOS
npm run web              # run in a browser (limited)

npm test                 # run the Jest test suite
npm run test:watch       # Jest in watch mode
npm run test:coverage    # coverage report

npm run lint             # ESLint
npm run type-check       # tsc --noEmit
npm run format           # Prettier
```

### Configuration

FreedWise is designed to run with zero configuration — it works offline out of the box. App-level settings are managed in two places:

| Where | Purpose |
|-------|---------|
| `app.json` | Expo app config — name, icons, splash screen, bundle identifiers, and platform permissions (document access, notifications). |
| In-app Settings screen | User preferences — theme (light/dark), daily review reminder time, and notification toggles, all persisted to the on-device database. |

Reader runtime libraries (epub.js, pdf.js, jszip) are bundled as versioned WebView assets under `assets/webview-libs/` and installed to the device on first launch by the `VendorAssetManager`, so the reader works without fetching anything at runtime.

## Architecture

A single React Native / Expo app organized into clear layers. A **SQLite database** (via `expo-sqlite`) is the source of truth, wrapped by a `DatabaseManager` with versioned migrations and a row-mapping layer. Business logic lives in a **services layer** (book import, highlights, FSRS scheduling, search, notifications, settings, extraction) wired together through a `ServiceFactory` for dependency injection and easy test substitution. Global UI state is held in a **Zustand store**. **React Navigation** drives a tab-based UI of **screens** (Library, Reader, Review, Highlights, Search, Settings) built from reusable **components**. Reading is powered by a **WebView reader** that renders EPUB (epub.js) and PDF (pdf.js) with a shared highlighting bridge; a hidden **ExtractionWebView** pulls metadata and covers from imported files. Spaced repetition is handled by the **FSRSService** on top of `ts-fsrs`, and due-card reminders are delivered through on-device local notifications.

## Roadmap

- [x] EPUB & PDF import with on-device metadata/cover extraction
- [x] In-app reader with a shared highlighting layer
- [x] Highlight-to-flashcard with action-tags
- [x] FSRS spaced-repetition scheduling and review history
- [x] Daily local-notification reminders
- [x] Full-text search across books and highlights
- [ ] Highlight export (Markdown / CSV) and optional backup
- [ ] Tablet-optimized two-column reading layout
- [ ] Configurable FSRS parameters and per-deck scheduling

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

FreedWise reads only the files you explicitly import and never transmits your library or reading data off the device.

## Contact / Support

- **Email:** [tran219jn@gmail.com](mailto:tran219jn@gmail.com)
- **Website:** [jasontran.pages.dev](https://jasontran.pages.dev/)

## Disclaimer

FreedWise is a personal reading and study tool. It is provided "as is," without warranty of any kind. You are responsible for ensuring you have the right to import and use any book files you add to the app. Spaced-repetition scheduling is a study aid, not a guarantee of retention.
