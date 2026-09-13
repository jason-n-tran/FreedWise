// Smoke test: every tab screen must at least mount without throwing. This
// guards the "Cannot read property 'replace' of undefined" class of render
// crashes that only surface when a tab is opened on device.

import React from 'react';
import { render } from '@testing-library/react-native';
import ServiceFactory from '../../services/ServiceFactory';

// Minimal service doubles so screens can call their services on mount.
function installMockServices() {
  const factory = ServiceFactory.getInstance();
  factory.clear();
  factory.register('BookService', {
    getBooks: jest.fn().mockResolvedValue([]),
    getBookById: jest.fn(),
    importBook: jest.fn(),
    deleteBook: jest.fn(),
    updateBook: jest.fn(),
    checkBookFileExists: jest.fn(),
    updateReadingProgress: jest.fn(),
    getReadingProgress: jest.fn(),
  });
  factory.register('HighlightService', {
    getHighlightsByBook: jest.fn().mockResolvedValue([]),
    createHighlight: jest.fn(),
    getHighlightById: jest.fn(),
    updateHighlight: jest.fn(),
    deleteHighlight: jest.fn(),
    searchHighlights: jest.fn().mockResolvedValue([]),
    getDueHighlights: jest.fn().mockResolvedValue([]),
    getHighlightsByTag: jest.fn().mockResolvedValue([]),
  });
  factory.register('FSRSService', {
    getReviewStats: jest.fn().mockResolvedValue({
      totalCards: 0,
      dueToday: 0,
      newCards: 0,
      learningCards: 0,
      reviewCards: 0,
      averageRetention: 0,
    }),
    gradeCard: jest.fn(),
    batchGradeCards: jest.fn(),
    calculateNextReview: jest.fn(),
    resetCard: jest.fn(),
    preloadNextCards: jest.fn(),
    clearCache: jest.fn(),
  });
  factory.register('SearchService', {
    searchHighlights: jest.fn().mockResolvedValue([]),
    loadMore: jest.fn().mockResolvedValue([]),
    searchBooks: jest.fn().mockResolvedValue([]),
    getRecentSearches: jest.fn().mockResolvedValue([]),
    saveSearch: jest.fn(),
    clearSearchHistory: jest.fn(),
  });
  factory.register('NotificationService', {
    getNotificationSettings: jest.fn().mockResolvedValue({
      enabled: false,
      dailyTime: '09:00',
      soundEnabled: true,
      vibrationEnabled: true,
    }),
    updateNotificationSettings: jest.fn(),
    requestPermissions: jest.fn().mockResolvedValue(true),
    scheduleDailyReviewNotification: jest.fn(),
    cancelDailyNotification: jest.fn(),
    sendImmediateNotification: jest.fn(),
  });
}

const nav = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() } as any;
const route = { params: {} } as any;

describe('tab screens mount without crashing', () => {
  beforeEach(() => installMockServices());

  it('LibraryScreen mounts', () => {
    const LibraryScreen = require('../LibraryScreen').default;
    expect(() => render(<LibraryScreen navigation={nav} route={route} />)).not.toThrow();
  });

  it('HighlightsScreen mounts', () => {
    const HighlightsScreen = require('../HighlightsScreen').default;
    expect(() => render(<HighlightsScreen navigation={nav} route={route} />)).not.toThrow();
  });

  it('ReviewScreen mounts', () => {
    const ReviewScreen = require('../ReviewScreen').default;
    expect(() => render(<ReviewScreen navigation={nav} route={route} />)).not.toThrow();
  });

  it('SearchScreen mounts', () => {
    const SearchScreen = require('../SearchScreen').default;
    expect(() => render(<SearchScreen navigation={nav} route={route} />)).not.toThrow();
  });

  it('SettingsScreen mounts', () => {
    const SettingsScreen = require('../SettingsScreen').default;
    expect(() => render(<SettingsScreen navigation={nav} route={route} />)).not.toThrow();
  });
});
