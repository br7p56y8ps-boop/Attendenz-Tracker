import path from 'path';
import fs from 'fs';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

type ReleaseConfig = {
  version: string;
  releaseType: 'major' | 'minor';
  updateMode: 'manual' | 'automatic';
  summary: string;
};

const port = Number(process.env.PORT ?? 3000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error('PORT must be a positive number.');
}

const basePath = process.env.BASE_PATH ?? '/';
const releaseConfigPath = path.resolve(import.meta.dirname, 'release.config.json');
const serviceWorkerTemplatePath = path.resolve(import.meta.dirname, 'sw.template.js');

function readReleaseConfig(): ReleaseConfig {
  let config: Partial<ReleaseConfig>;
  try {
    config = JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8')) as Partial<ReleaseConfig>;
  } catch (cause) {
    throw new Error(`Unable to read ${releaseConfigPath}: ${cause instanceof Error ? cause.message : 'invalid JSON'}`);
  }

  if (!config.version || !/^\d+\.\d+\.\d+$/.test(config.version)) {
    throw new Error(`Release version must use three numeric parts, for example 1.6.6; received ${config.version || 'missing'}.`);
  }
  if (config.releaseType !== 'major' && config.releaseType !== 'minor') {
    throw new Error(`Release type must be major or minor; received ${config.releaseType || 'missing'}.`);
  }
  if (config.updateMode !== 'manual' && config.updateMode !== 'automatic') {
    throw new Error(`Update mode must be manual or automatic; received ${config.updateMode || 'missing'}.`);
  }
  if (!config.summary || !config.summary.trim()) {
    throw new Error('Release summary must not be empty.');
  }
  return config as ReleaseConfig;
}

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

function generateReleaseArtifacts(): Plugin {
  return {
    name: 'attendenz-generate-release-artifacts',
    buildStart() {
      readReleaseConfig();
      if (!fs.existsSync(serviceWorkerTemplatePath)) {
        this.error(`Missing service-worker template: ${serviceWorkerTemplatePath}`);
      }
    },
    generateBundle() {
      const release = readReleaseConfig();
      const template = fs.readFileSync(serviceWorkerTemplatePath, 'utf8');
      const serviceWorker = template.replaceAll('__ATTENDENZ_VERSION__', release.version);
      if (serviceWorker === template) {
        this.error('Service-worker template is missing the __ATTENDENZ_VERSION__ marker.');
      }
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(release, null, 2)}\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorker,
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
    generateReleaseArtifacts(),
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
    host: 'localhost',
    allowedHosts: ['localhost', '127.0.0.1', '::1'],
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: 'localhost',
    allowedHosts: ['localhost', '127.0.0.1', '::1'],
  },
});
