# Freedwise Reader - Source Code Structure

## Directory Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/         # Shared components (Button, Input, etc.)
│   └── index.ts        # Component exports
├── constants/          # App constants (colors, etc.)
├── database/           # SQLite database layer
│   ├── DatabaseManager.ts
│   ├── schema.ts
│   └── migrations.ts
├── navigation/         # React Navigation setup
│   ├── RootNavigator.tsx
│   ├── MainTabNavigator.tsx
│   ├── types.ts
│   └── index.ts
├── screens/            # Screen components
│   ├── LibraryScreen.tsx
│   ├── HighlightsScreen.tsx
│   ├── ReviewScreen.tsx
│   ├── SearchScreen.tsx
│   └── SettingsScreen.tsx
├── services/           # Business logic services
│   ├── interfaces.ts   # Service interface definitions
│   ├── ServiceFactory.ts
│   └── index.ts
├── store/              # Zustand state management
│   ├── appStore.ts
│   └── index.ts
├── types/              # TypeScript type definitions
│   ├── database.ts
│   └── models.ts
└── utils/              # Utility functions
    ├── validation.ts
    └── index.ts
```

## Architecture Overview

### Dependency Injection

The app uses a `ServiceFactory` for dependency injection, allowing services to be easily swapped for testing:

```typescript
import ServiceFactory from './services/ServiceFactory';

// Register services
const factory = ServiceFactory.getInstance();
factory.register('BookService', new BookService());

// Use services
const bookService = factory.getBookService();
```

### State Management

Global state is managed with Zustand:

```typescript
import { useAppStore } from './store';

function MyComponent() {
  const books = useAppStore((state) => state.books);
  const setBooks = useAppStore((state) => state.setBooks);
  
  // Use state...
}
```

### Navigation

React Navigation provides the navigation structure:

- **RootNavigator**: Stack navigator for main app flow
- **MainTabNavigator**: Bottom tab navigator with 5 tabs
  - Library
  - Highlights
  - Review
  - Search
  - Settings

### Services

Services implement business logic and are accessed via the ServiceFactory:

- **BookService**: Book import and library management
- **HighlightService**: Highlight creation and retrieval
- **FSRSService**: Spaced repetition algorithm
- **NotificationService**: Local push notifications
- **SearchService**: Full-text search

All services implement interfaces defined in `services/interfaces.ts`.

## Development Phases

1. **Phase 1**: Architecture & Setup ✓
2. **Phase 2**: Library & E-Reader Engine
3. **Phase 3**: Database & Highlighting UX
4. **Phase 4**: Spaced Repetition Engine (FSRS) & Reviews
5. **Phase 5**: Search, Dashboard, and Notifications
