import path from 'path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const port = Number(process.env.PORT ?? 3000);

if (Number.isNaN(port) || port <= 0) {
}

const basePath = process.env.BASE_PATH ?? "/";

function silentBuildRevision(): Plugin {
  const revision = process.env.ATTENDENZ_BUILD_REVISION || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || `local-${Date.now()}`;
  return {
    name: 'attendenz-silent-build-revision',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-revision.json',
        source: JSON.stringify({ revision }, null, 2),
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    silentBuildRevision(),

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
