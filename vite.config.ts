import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* not a git checkout */
}

export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 6000 },
  server: { host: true },
  define: {
    /** Shown in the game menu, e.g. "0.2.0 · a1b2c3d", so a bug report says which build it came from. */
    __APP_VERSION__: JSON.stringify(commit ? `${pkg.version} · ${commit}` : pkg.version),
  },
});
