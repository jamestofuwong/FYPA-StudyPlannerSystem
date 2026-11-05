// Student app tests (unit, component and route tests). They need no database.
//
//   npm run test:student          from the repository root
//
// The student app has its own aliases (@/ means student/, not web/), so it has its own Jest config. Jest itself comes
// from the repository root.
// next/jest loads next.config.ts, and that file stops when DATABASE_URL or CMS_JWT_SECRET is missing. On a computer
// without student/.env (a fresh clone, CI) the tests could not start. These placeholders are used only when no value is set.
process.env.DATABASE_URL ||= 'postgresql://unused:unused@127.0.0.1:1/unused';
process.env.CMS_JWT_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.test.ts?(x)'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupDom.js'],
  moduleNameMapper: {
    // One copy of React for the app and for the test library (the library lives in the repository root)
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
    '^server-only$': '<rootDir>/tests/stubs/empty.js',
    '^@/(.*)$': '<rootDir>/$1',
    '^@student/(.*)$': '<rootDir>/$1',
    '^@core/(.*)$': '<rootDir>/../core/$1',
    '\\.module\\.css$': 'identity-obj-proxy',
  },
});
