// Provide safe-area insets in the node test environment. Screens render their
// Masthead/header against useSafeAreaInsets(), which needs a provider; the
// library ships a jest mock that returns static insets.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
