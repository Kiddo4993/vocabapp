// Vitest setup: polyfill IndexedDB in jsdom so src/db tests can run against
// a real (in-memory) IDB implementation instead of mocking idb wholesale.
import 'fake-indexeddb/auto';
