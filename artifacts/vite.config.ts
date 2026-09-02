import path from 'path';
import fs from 'fs';
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

function validateReleaseMetadata(): Plugin {
  return {
    name: 'attendenz-validate-release-metadata',
    buildStart() {
      const source = fs.readFileSync(path.resolve(import.meta.dirname, 'src/lib/appVersion.ts'), 'utf8');
      const appVersion = source.match(/APP_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
      const metadata = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'public/version.json'), 'utf8')) as { version?: string };
      const worker = fs.readFileSync(path.resolve(import.meta.dirname, 'public/sw.js'), 'utf8');
      if (!appVersion || metadata.version !== appVersion || !worker.includes(`VERSION = '${appVersion}'`)) {
        this.error(`Release metadata mismatch: app=${appVersion || 'missing'}, version.json=${metadata.version || 'missing'}, service worker version marker missing.`);
      }
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    silentBuildRevision(),
    validateReleaseMetadata(),

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
