import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: 'happy-dom',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/live': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
