import { defineConfig } from 'vite';

export default defineConfig({
  base: '/jetrix/',
  build: {
    outDir: 'docs',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});