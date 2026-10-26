// Integration tests: real code against a real PostgreSQL (an embedded one, started for the run).
//
//   npm run test:integration
//
// No database has to exist beforehand. globalSetup starts a temporary PostgreSQL, applies the migrations, and
// globalTeardown stops it. Test files run one at a time because they share that database.
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './web' });

module.exports = createJestConfig({
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration-db/**/*.test.ts'],
  globalSetup: '<rootDir>/tests/integration-db/globalSetup.js',
  globalTeardown: '<rootDir>/tests/integration-db/globalTeardown.js',
  setupFiles: ['<rootDir>/tests/integration-db/setupEnv.js'],
  maxWorkers: 1,
  testTimeout: 60000,
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/core/$1',
    '^@shared/(.*)$': '<rootDir>/core/shared/$1',
    '^@/(.*)$': '<rootDir>/web/$1',
  },
});
