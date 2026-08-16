import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const port = Number(process.env.PORT ?? 3000);

if (Number.isNaN(port) || port <= 0) {
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
     registerType: 'prompt',
     filename: 'gen-sw.js',
     includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'Logo.jpeg'],
     manifest: {
     name: 'Attendenz Tracker',
     short_name: 'Attendenz',
     description: 'Attendance Tracking Application',
     theme_color: '#ffffff',
     icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  workbox: {
    // 1) Precache the FULL shell + media (was missing jpg/jpeg/webp/mp3/woff2)
    globPatterns: ['**/*.{js,css,html,ico,png,svg,json,jpg,jpeg,webp,mp3,woff,woff2}'],

    // 2) THE offline fix: serve the cached shell for any navigation when offline
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//],

    // 3) Drop old broken caches from previous deploys + claim open tabs
    cleanupOutdatedCaches: true,
    clientsClaim: true,

    // 4) Cache-first for logo / avatars / audio / fonts the precache might miss
    runtimeCaching: [
      {
        urlPattern: ({ request }) =>
          request.destination === 'image' ||
          request.destination === 'font' ||
          request.destination === 'audio' ||
          request.destination === 'media',
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
     ],
    },
   }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
