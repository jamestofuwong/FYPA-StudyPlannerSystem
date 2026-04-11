const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
  '^@/core/(.*)$': '<rootDir>/core/$1',
  '^@/shared/(.*)$': '<rootDir>/core/shared/$1', 
},
  preset: 'ts-jest',
}

module.exports = createJestConfig(customJestConfig)