import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { appVersion } from './src/bootstrap/appVersion.ts';
import { frameAncestors, parseAllowedSites } from './src/infrastructure/config/embedding.ts';

function packageVersion(): string {
  return (JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }).version;
}

/** Azure sends the CSP from staticwebapp.config.json, so the build writes embedding.allowedSites into it. */
function embeddingPolicy(): Plugin {
  let outDir = '';
  return {
    name: 'orgapp-embedding-policy',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const appConfig = JSON.parse(readFileSync(resolve(outDir, 'config.json'), 'utf8')) as {
        embedding?: { allowedSites?: unknown };
      };
      const directive = frameAncestors(parseAllowedSites(appConfig.embedding?.allowedSites, 'embedding.allowedSites'));
      const swaPath = resolve(outDir, 'staticwebapp.config.json');
      const swa = JSON.parse(readFileSync(swaPath, 'utf8')) as { globalHeaders: Record<string, string> };
      const csp = swa.globalHeaders['Content-Security-Policy'] ?? '';
      if (!/frame-ancestors [^;]*/.test(csp)) throw new Error('staticwebapp.config.json has no frame-ancestors directive.');
      swa.globalHeaders['Content-Security-Policy'] = csp.replace(/frame-ancestors [^;]*/, directive);
      writeFileSync(swaPath, `${JSON.stringify(swa, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), embeddingPolicy()],
  // Settings > About this chart shows it (src/bootstrap/version.d.ts); the pipeline sets ORGAPP_BUILD_ID.
  define: { __APP_VERSION__: JSON.stringify(appVersion(packageVersion(), process.env.ORGAPP_BUILD_ID)) },
  resolve: { tsconfigPaths: true },
  // Fixed ports: they are registered as redirect URIs, so silently moving to another port breaks sign-in.
  server: { port: 5173, strictPort: true },
  // These load lazily, which Vite's dependency scan can miss; a late find breaks the dev page once.
  optimizeDeps: {
    include: [
      '@azure/msal-browser',
      '@azure/msal-browser/redirect-bridge',
      '@azure/msal-browser/popup-relay',
      '@microsoft/teams-js',
    ],
  },
  preview: { port: 4173, strictPort: true },
  build: {
    rolldownOptions: {
      // MSAL v5 requires its auth responses to land on dedicated pages, not the SPA itself.
      input: {
        main: 'index.html',
        redirect: 'redirect.html',
        popupRelay: 'popup-relay.html',
      },
    },
  },
  test: {
    // Scripts are tested in their own language, which keeps Node's types out of the app's.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    environment: 'node',
    // Stylesheets read as text (?raw), as stylesheets.test.ts reads them, come through; imported ones stay empty.
    css: { include: [/[?&]raw(?:&|$)/] },
  },
});
