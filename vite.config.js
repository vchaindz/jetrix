import { defineConfig } from 'vite';

export default defineConfig({
  base: '/jetrix/',
  build: {
    outDir: 'docs',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    },
    assetsInlineLimit: 0, // Don't inline WASM files
    copyPublicDir: false
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: ['..']
    }
  },
  assetsInclude: ['**/*.wasm']
});