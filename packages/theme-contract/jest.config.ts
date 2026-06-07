import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__', '<rootDir>/page-resolver'],
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/page-resolver/__tests__/**/*.(test|spec).ts',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.json',
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  verbose: true,
};

export default config;
