#!/usr/bin/env node
/**
 * Starts the OHIF development server with this repository's extension and mode
 * linked in. It is a thin wrapper over the viewer's own dev script; its only
 * job is to fail with a sentence a person can act on when the distribution has
 * not been built yet.
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

// The viewer's root dev script delegates to bun, which is not needed to run it;
// the workspace's own script uses webpack and is what we want.
const child = spawn('yarn', ['dev'], { cwd: appDir, stdio: 'inherit', shell: true });
child.on('exit', code => process.exit(code ?? 0));
