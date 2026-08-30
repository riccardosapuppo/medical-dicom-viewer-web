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

const archive = process.env.ORTHANC_URL ?? 'http://localhost:8042';

// The viewer talks to the archive through the development server rather than
// straight to port 8042. That makes every DICOMweb request same-origin, so no
// cross-origin configuration is needed on the archive, and the browser applies
// no preflight to hundreds of image requests.
const environment = {
  ...process.env,
  APP_CONFIG: 'app-config/radiology-workflow.js',
  PROXY_TARGET: '/pacs/dicom-web',
  PROXY_DOMAIN: archive,
  PROXY_PATH_REWRITE_FROM: '/pacs/dicom-web',
  PROXY_PATH_REWRITE_TO: '/dicom-web',
};

console.log(`Serving the viewer on http://localhost:3000, reading from ${archive}`);

// The viewer's root dev script delegates to bun, which is not needed to run it;
// the workspace's own script uses webpack and is what we want.
const child = spawn('yarn', ['dev'], {
  cwd: appDir,
  env: environment,
  stdio: 'inherit',
  shell: true,
});
child.on('exit', code => process.exit(code ?? 0));
