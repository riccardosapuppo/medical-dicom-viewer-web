#!/usr/bin/env node
/**
 * The one command that brings the whole demonstration up.
 *
 *   yarn start
 *
 * Four things have to be true before there is anything to look at: the
 * dependencies are installed, the archive container is running, the studies are
 * downloaded, and they are loaded into the archive. Only then is `yarn dev`
 * worth starting — before that it serves a viewer with nothing behind it, which
 * is what an empty study list means and why it is not obvious what went wrong.
 *
 * The four steps were in the README as a list to follow by hand, and `yarn
 * start` was an alias for `yarn dev`, so the shortest-looking command was the
 * one that skipped the other three. This runs all of them.
 *
 * Every step asks before it acts, and each question is about the world rather
 * than a marker file: is something answering on the archive's port, are the
 * images on disk, does the archive hold them. So running this twice costs a few
 * HTTP requests, and running it after deleting any one of the four repairs that
 * one. Nothing here is destructive.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { get } from './lib/viewerReady.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER = process.env.VIEWER_URL ?? 'http://localhost:3000';
const ORTHANC = process.env.ORTHANC_URL ?? 'http://localhost:8042';

/** How many images the manifest says a complete download is. */
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'studies.json'), 'utf8'));
const expected = manifest.studies.reduce(
  (total, study) => total + study.series.reduce((n, series) => n + series.imageCount, 0),
  0
);

let step = 0;
function heading(text) {
  console.log('');
  console.log(`${++step}/5  ${text}`);
}

/**
 * Runs a step, showing its output as it happens.
 *
 * `shell: true` because on Windows `yarn` and `docker` are batch files, which
 * cannot be executed directly. `stdio: inherit` because these steps take
 * minutes and a progress bar nobody can see is a hung command.
 */
function run(command, hint) {
  console.log(`  ${command}`);
  const done = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true });
  if (done.status === 0) {
    return;
  }
  console.log('');
  console.error(`"${command}" stopped with ${done.status ?? done.signal}.`);
  if (hint) {
    console.error(hint);
  }
  process.exit(done.status ?? 1);
}

async function waitFor(url, what) {
  for (let waited = 0; waited < 180; waited += 2) {
    if (await get(url)) {
      console.log('');
      return;
    }
    process.stdout.write(waited === 0 ? `  waiting for ${what} ` : '.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  console.log('');
  console.error(`${what} never answered on ${url}.`);
  process.exit(1);
}

/** How many .dcm files are under a directory, at any depth. */
function imagesOnDisk(directory) {
  if (!fs.existsSync(directory)) {
    return 0;
  }
  let found = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found += imagesOnDisk(full);
    } else if (entry.name.endsWith('.dcm')) {
      found += 1;
    }
  }
  return found;
}

async function asJson(url) {
  const answered = await get(url);
  try {
    return answered ? JSON.parse(answered.body) : undefined;
  } catch {
    return undefined;
  }
}

heading('Dependencies');
if (fs.existsSync(path.join(root, 'node_modules', '.bin'))) {
  console.log('  node_modules is here');
} else {
  // yarn, not npm: this is a Lerna monorepo with a yarn.lock, and npm resolves
  // it into a tree that does not build.
  run('yarn install', 'Install yarn first: npm install --global yarn');
}

heading('The archive');
if (await get(`${ORTHANC}/system`)) {
  console.log(`  already answering on ${ORTHANC}`);
} else {
  run('docker compose up -d', 'Is Docker running? This step needs it; the other four do not.');
  await waitFor(`${ORTHANC}/system`, 'the archive');
}

heading('The studies');
const onDisk = imagesOnDisk(path.join(root, 'data', 'dicom'));
if (onDisk >= expected) {
  console.log(`  ${onDisk} images already in data/dicom`);
} else {
  // Several hundred megabytes from a public archive, the first time only.
  run('yarn data');
}

heading('The studies, in the archive');
const instances = await asJson(`${ORTHANC}/instances`);
if (Array.isArray(instances) && instances.length >= expected) {
  console.log(`  ${instances.length} instances already loaded`);
} else {
  run('yarn data:load');
}

heading('The viewer');
if (await get(`${VIEWER}/`)) {
  // Starting a second one would either fail on the port or quietly move to
  // another, and then every check pointed at 3000 would be driving the old one.
  console.log(`  something is already serving on ${VIEWER}; leaving it alone`);
  console.log('');
  console.log(`  Open ${VIEWER}`);
  process.exit(0);
}
console.log(`  starting the viewer; it will serve on ${VIEWER}. Ctrl+C stops it.`);
run('yarn dev');
