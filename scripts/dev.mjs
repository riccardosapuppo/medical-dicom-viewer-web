#!/usr/bin/env node
/**
 * Starts the viewer's development server with this repository's extension and
 * mode linked in. It is a thin wrapper over the viewer's own dev script; its
 * jobs are to fail with a sentence a person can act on when the distribution
 * has not been built yet, and to point the viewer at the local archive.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageManagerFor } from './lib/packageManager.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ohifDir = path.join(root, '.ohif');
const appDir = path.join(ohifDir, 'platform', 'app');

if (!fs.existsSync(path.join(appDir, 'node_modules'))) {
  console.error('The viewer distribution is not built yet. Run: npm run setup');
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

const child = spawn(packageManagerFor(ohifDir).command('run dev'), [], {
  cwd: appDir,
  env: environment,
  stdio: 'inherit',
  shell: true,
});
child.on('exit', code => process.exit(code ?? 0));
