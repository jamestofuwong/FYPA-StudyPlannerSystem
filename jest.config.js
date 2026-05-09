// jest.config.js
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './web',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/core/(.*)$': '<rootDir>/core/$1',
    '^@/shared/(.*)$': '<rootDir>/core/shared/$1',
    
    '\\.module\\.css$': 'identity-obj-proxy',
    '\\.(css|less|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
    '^@/(.*)$': '<rootDir>/$1',
  },
  preset: 'ts-jest',
}

module.exports = createJestConfig(customJestConfig)