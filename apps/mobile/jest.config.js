/**
 * Deliberately plain ts-jest on the Node test environment, not jest-expo.
 *
 * Everything under test (src/db, src/domain, src/guidance, src/repositories,
 * src/services) is plain TypeScript with no React Native/Expo runtime
 * dependency - the app wires it to expo-sqlite at runtime (src/db/driver.expo.ts),
 * but tests exercise the same SQL and repository code against a real,
 * file-backed SQLite database via Node's built-in node:sqlite. See
 * src/db/driver.node.ts and README.md "Testing approach".
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // node:sqlite's DatabaseSync handle can linger briefly after close() on
  // some platforms; all tests pass and drivers are explicitly closed, this
  // just stops Jest waiting on that handle after the run is done.
  forceExit: true,
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
