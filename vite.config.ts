import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'happy-dom',
    /**
     * Worker threads, not forked child processes.
     *
     * On the default `forks` pool this suite failed roughly one run in thirty,
     * always the same way: tinypool reporting `Error: Worker exited
     * unexpectedly`, and `src/device/conformance.http.test.ts` cut off
     * part-way through — 5, 12 or 15 of its 19 tests reported, the rest never
     * run, the file never reaching "passed". (The run does exit non-zero, so
     * it fails loudly rather than silently under-reporting.)
     *
     * The child process is killed at the OS level rather than failing in JS:
     * instrumenting that file with `uncaughtException`, `unhandledRejection`,
     * `beforeExit` and `exit` handlers and looping until it crashed fired
     * *none* of them, and the worker's buffered stdio dies with it, which is
     * why vitest has no detail to report. The project's own code is not at
     * fault — 760 create/close cycles of `createMockDevice`, with full HTTP
     * traffic and a real WebSocket per cycle, run clean in plain Node.
     *
     * That file is the only one in the suite doing real socket I/O (19 HTTP
     * servers and 19 WebSocket servers stood up and torn down in about a
     * second and a half), and it is the only one ever affected. Running it in
     * a worker thread removes the child process that was being killed. 76
     * consecutive runs of that file and 40 of the whole suite pass on this
     * pool; the same loops on `forks` reproduced the crash four separate
     * times.
     */
    pool: 'threads',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/live': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
