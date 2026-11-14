import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
// `wrangler dev` runs the Worker here (see the dev:worker script).
const apiPort = 8787;

export default defineConfig({
  root: path.join(rootDir, 'client'),
  envDir: rootDir,
  plugins: [react()],
  resolve: { alias: { '@shared': path.join(rootDir, 'shared') } },
  build: { outDir: path.join(rootDir, 'dist'), emptyOutDir: true },
  server: {
    port: 5173,
    // Discord loads the activity through a tunnel (cloudflared etc.), whose host varies.
    allowedHosts: true,
    fs: { allow: [rootDir] },
    proxy: {
      '/api': `http://localhost:${apiPort}`,
      '/ws': { target: `ws://localhost:${apiPort}`, ws: true },
    },
  },
});
