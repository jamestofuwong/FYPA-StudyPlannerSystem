// Student app tests that use a real PostgreSQL (an embedded one that the run starts and stops by itself).
//
//   npm run test:student:integration          from the repository root
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  globalSetup: '<rootDir>/tests/integration/globalSetup.js',
  globalTeardown: '<rootDir>/tests/integration/globalTeardown.js',
  setupFiles: ['<rootDir>/tests/integration/setupEnv.js'],
  maxWorkers: 1,
  testTimeout: 60000,
  moduleNameMapper: {
    '^server-only$': '<rootDir>/tests/stubs/empty.js',
    '^@/(.*)$': '<rootDir>/$1',
    '^@student/(.*)$': '<rootDir>/$1',
    '^@core/(.*)$': '<rootDir>/../core/$1',
  },
});
