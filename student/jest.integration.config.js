// Student app tests that use a real PostgreSQL (an embedded one that the run starts and stops by itself).
//
//   npm run test:student:integration          from the repository root
// next/jest loads next.config.ts, and that file stops when DATABASE_URL or CMS_JWT_SECRET is missing. On a computer
// without student/.env (a fresh clone, CI) the tests could not start. These placeholders are used only when no value is set.
process.env.DATABASE_URL ||= 'postgresql://unused:unused@127.0.0.1:1/unused';
process.env.CMS_JWT_SECRET ||= 'test-secret-test-secret-test-secret-123456';
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
