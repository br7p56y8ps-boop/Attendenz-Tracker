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
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
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
        // Precache the whole shell + media
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,jpg,jpeg,webp,woff,woff2}'],

        // Serve cached shell for any navigation when offline
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//],

        // ★★★ THE ACTUAL FIX ★★★
        // Force the NEW service worker to activate immediately and kick out
        // the old broken one (prompt mode otherwise leaves it waiting forever).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            // Navigations: try network briefly, then fall back to cached shell
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Everything else: cache-first so logo/audio/fonts work offline
            urlPattern: ({ request }) =>
              ['script', 'style', 'font', 'image', 'audio', 'media'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
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
