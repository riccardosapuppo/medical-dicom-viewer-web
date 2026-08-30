#!/usr/bin/env node
/**
 * Produces a static build of the viewer, with this repository's extension and
 * mode compiled in, under .ohif/platform/app/dist.
 *
 * The output is a plain set of files that any web server can host; the archive
 * it reads from is chosen at run time by the configuration in config/.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, '.ohif', 'platform', 'app');

if (!fs.existsSync(path.join(appDir, 'node_modules'))) {
  console.error('The OHIF distribution is not built yet. Run: npm run setup');
  process.exit(1);
}

const environment = {
  ...process.env,
  NODE_ENV: 'production',
  APP_CONFIG: 'app-config/radiology-workflow.js',
  // The viewer is served from the root of wherever it is hosted.
  PUBLIC_URL: '/',
};

const child = spawn('yarn build', [], {
  cwd: appDir,
  env: environment,
  stdio: 'inherit',
  shell: true,
});
child.on('exit', code => {
  if (code === 0) {
    console.log(`\nBuilt into ${path.join(appDir, 'dist')}`);
  }
  process.exit(code ?? 0);
});
