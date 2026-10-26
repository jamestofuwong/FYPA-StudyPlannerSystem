// jest.config.js
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './web',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // These run with their own configs: integration-db needs a database, student/ has its own app, e2e uses Playwright
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration-db/', '<rootDir>/student/', '<rootDir>/e2e/'],
  testEnvironment: 'node',
  moduleNameMapper: {
  '^@core/(.*)$': '<rootDir>/core/$1',
  '^@shared/(.*)$': '<rootDir>/core/shared/$1',
  '^@student/(.*)$': '<rootDir>/student/$1',
  '\\.module\\.css$': 'identity-obj-proxy',
  '\\.(css|less|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
  '^@/(.*)$': '<rootDir>/web/$1', 
    
  },
  // preset: 'ts-jest',
}

module.exports = createJestConfig(customJestConfig)