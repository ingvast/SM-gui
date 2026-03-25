import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // mqtt has deep Node.js dependencies (net, tls, readable-stream)
      // that don't bundle well — keep it as a runtime require()
      external: ['mqtt'],
    },
  },
});
