import { defineConfig } from 'vite';

// Relative base keeps the build portable: it works when served from
// https://user.github.io/<repo>/ (project page), from https://user.github.io/
// (user page), and from a plain `file://` open or any sub-path preview.
// The site is a single index.html with no client-side router, so there is no
// deep-link path for a relative base to break.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: { host: true, port: 5173 },
});
