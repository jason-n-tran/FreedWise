module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/database/__mocks__/expo-sqlite.ts',
    // Vendored WebView libs are runtime-only assets; stub them in jest.
    '\\.wvlib$': '<rootDir>/src/readers/__mocks__/wvlibStub.js',
  },
};
