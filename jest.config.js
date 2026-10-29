// jest.config.js
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './web',
})

const customJestConfig = {
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/e2e/', '<rootDir>/student/tests/e2e/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'node',
  moduleNameMapper: {
  '^@core/(.*)$': '<rootDir>/core/$1',
  '^@shared/(.*)$': '<rootDir>/core/shared/$1',
  '\\.module\\.css$': 'identity-obj-proxy',
  '\\.(css|less|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
  '^@/(.*)$': '<rootDir>/web/$1', 
    
  },
  // preset: 'ts-jest',
}

module.exports = createJestConfig(customJestConfig)
