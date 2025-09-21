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
    copyPublicDir: true
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      allow: ['..']
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['jsonic_wasm.js']
  }
});