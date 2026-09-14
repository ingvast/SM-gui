import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // ws's optional native deps aren't installed; ws already handles their
      // absence at runtime via try/catch, but Rollup tries to statically
      // resolve the require() calls at build time, so keep them external.
      external: ['bufferutil', 'utf-8-validate'],
    },
  },
});
