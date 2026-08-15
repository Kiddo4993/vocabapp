import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    // §2 bundle budget: initial JS under 150 KB gzipped. Each study mode is
    // a lazy route (see src/router.tsx) so this is mostly about not pulling
    // heavy deps into the entry chunk.
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
});
