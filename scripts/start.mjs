#!/usr/bin/env node
/**
 * The one command that brings the whole demonstration up.
 *
 *   yarn start
 *
 * Four things have to be true before there is anything to look at: the
 * dependencies are installed, the archive container is running, the studies are
 * downloaded, and they are loaded into the archive. Only then is the viewer
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
 *
 * And it says what it is waiting for while it waits. `yarn install` on a Lerna
 * monorepo sits without printing for minutes at a time, and a terminal that
 * prints nothing looks exactly like a terminal whose command has died. So the
 * step, how long it has taken so far and a turning cursor appear whenever the
 * command underneath goes quiet, and get out of the way the moment it speaks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { since, watching } from './lib/pulse.mjs';
import { get } from './lib/viewerReady.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* One variable, not two. `OHIF_PORT` is what the webpack dev server reads, so
   deriving the address from it means there is no way to move the server and
   leave this looking at where it used to be. VIEWER_URL still wins, for a
   viewer served from somewhere else entirely. */
const VIEWER = process.env.VIEWER_URL ?? `http://localhost:${process.env.OHIF_PORT ?? 3000}`;
const ORTHANC = process.env.ORTHANC_URL ?? 'http://localhost:8042';

/** How many images the manifest says a complete download is. */
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'studies.json'), 'utf8'));
const expected = manifest.studies.reduce(
  (total, study) => total + study.series.reduce((n, series) => n + series.imageCount, 0),
  0
);

let step = 0;
let current = '';
function heading(text) {
  console.log('');
  current = `${++step}/5  ${text}`;
  console.log(current);
}


/**
 * Runs a step, showing its output as it happens and a pulse while it does not.
 *
 * `shell: true` because on Windows `yarn` and `docker` are batch files, which
 * cannot be executed directly. The output is piped rather than inherited so the
 * pulse can be taken out of the way before a chunk lands; the chunks themselves
 * go through untouched, so whatever the command draws, it draws.
 *
 * @param {object} options
 * @param {string} [options.label] - What to call this while it is quiet.
 * @param {string} [options.hint] - What to suggest if it fails.
 * @param {RegExp} [options.readyOn] - What the command prints when it is up. A
 *   command that never exits has no other way of saying so, and being quiet is
 *   its finished state: a cursor still turning after the viewer is serving says
 *   the opposite of what is true.
 * @param {() => Promise<string|null>} [options.ready] - Asked once, when that
 *   pattern is seen; its answer replaces the pulse for good.
 *
 * Read from the output rather than by asking the port. The first version polled
 * the viewer every three seconds, which made webpack print "wait until bundle
 * finished" every three seconds, which reset the silence the pulse measures -
 * so the thing built for a terminal that says nothing filled the terminal with
 * noise and then went quiet itself.
 */
function run(command, { label, hint, readyOn, ready } = {}) {
  console.log(`  ${command}`);
  const pulse = watching(label ?? current.slice(current.indexOf(' ') + 1).trim());

  return new Promise(resolve => {
    const child = spawn(command, { cwd: root, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });

    // Claimed before the await, and settled only once: two overlapping checks
    // printed the line twice.
    let asking = false;
    let said = false;

    const listen = async chunk => {
      pulse.heard(chunk);
      if (said || asking || !readyOn || !readyOn.test(String(chunk))) {
        return;
      }
      asking = true;
      const line = ready ? await ready() : null;
      asking = false;
      if (line) {
        said = true;
        pulse.settle(line);
      }
    };

    child.stdout.on('data', listen);
    child.stderr.on('data', listen);

    child.on('close', (status, signal) => {
      const took = pulse.stop();

      if (status === 0) {
        console.log(`  done in ${took}`);
        resolve();
        return;
      }

      console.log('');
      console.error(`"${command}" stopped with ${status ?? signal}.`);
      if (hint) {
        console.error(hint);
      }
      process.exit(status ?? 1);
    });
  });
}

async function waitFor(url, what) {
  const started = Date.now();
  const pulse = watching(`waiting for ${what}`);

  for (let attempt = 0; attempt < 90; attempt++) {
    if (await get(url)) {
      pulse.stop();
      console.log(`  ${what} answered after ${since(started)}`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  pulse.stop();
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

/**
 * Whether what answered is this viewer, and not merely something.
 *
 * Port 3000 is the port every development server wants, and another project in
 * this portfolio publishes its API on it. Asked only whether anything answered,
 * this said the viewer was already up, printed its address and stopped - and
 * that address opened somebody else's booking API.
 *
 * The page is asked for two things it has and a JSON reply does not: the
 * element the application mounts into, and the configuration file the page
 * loads before its entry points.
 */
function isTheViewer(answered) {
  const page = String(answered?.body ?? '');
  return page.includes('id="root"') && page.includes('app-config.js');
}

/** The first line of whatever did answer, so the reader can see whose it is. */
function firstLine(answered) {
  return String(answered?.body ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Opens it, the way every other project here does.
 *
 * Detached and unwatched: the browser outlives this process, and a machine with
 * no browser to open must not take the demonstration down with it.
 */
function openIt(url) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];

  if (process.argv.includes('--no-open')) {
    console.log(`  Open ${url}`);
    return;
  }

  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    console.log(`  Opening ${url}`);
  } catch {
    console.log(`  No browser could be opened here. ${url} is waiting.`);
  }
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
  // it into a tree that does not build. It is also the slowest step by far, and
  // the one that prints nothing for minutes at a time.
  await run('yarn install', {
    label: 'installing, which takes several minutes the first time',
    hint: 'Install yarn first: npm install --global yarn',
  });
}

heading('The archive');
if (await get(`${ORTHANC}/system`)) {
  console.log(`  already answering on ${ORTHANC}`);
} else {
  await run('docker compose up -d', {
    label: 'starting the archive',
    hint: 'Is Docker running? This step needs it; the other four do not.',
  });
  await waitFor(`${ORTHANC}/system`, 'the archive');
}

heading('The studies');
const onDisk = imagesOnDisk(path.join(root, 'data', 'dicom'));
if (onDisk >= expected) {
  console.log(`  ${onDisk} images already in data/dicom`);
} else {
  // Several hundred megabytes from a public archive, the first time only.
  await run('yarn data', { label: 'downloading the studies' });
}

heading('The studies, in the archive');
const instances = await asJson(`${ORTHANC}/instances`);
if (Array.isArray(instances) && instances.length >= expected) {
  console.log(`  ${instances.length} instances already loaded`);
} else {
  await run('yarn data:load', { label: 'loading the studies into the archive' });
}

heading('The viewer');
const answering = await get(`${VIEWER}/`);

if (answering && isTheViewer(answering)) {
  // Starting a second one would either fail on the port or quietly move to
  // another, and then every check pointed at 3000 would be driving the old one.
  console.log(`  already serving on ${VIEWER}; leaving it alone`);
  console.log('');
  openIt(VIEWER);
  process.exit(0);
}

if (answering) {
  // Something answers and it is not this. Port 3000 is the one every
  // development server wants, and the demonstration of another project in this
  // portfolio holds it: asked only whether anything answered, this said the
  // viewer was already up, printed an address, and stopped - and what that
  // address opened was somebody else's API.
  console.log(`  Something else is on ${VIEWER}. It is not the viewer.`);
  console.log('');
  console.log(`  ${firstLine(answering)}`);
  console.log('');
  console.log('  Free that port, or move the viewer to another one:');
  console.log('    OHIF_PORT=3100 yarn start');
  process.exit(1);
}

console.log(`  Ctrl+C stops it.`);

// The development server opens a browser of its own the moment it starts
// listening, which is before there is anything to show: the tab sat on an empty
// page for the length of the build, and then a second tab opened here when the
// build finished. One browser, once, when there is a viewer in it.
process.env.OHIF_NO_OPEN = '1';

await run('yarn dev', {
  label: 'building the viewer, a minute or two the first time',
  // webpack says this once, at the end of a build, whether or not it had
  // warnings. The port is then asked once to confirm it, rather than asked
  // over and over while the build is still running.
  readyOn: /webpack .*compiled/,
  // ANSWERING ONCE IS NOT THE SAME AS SERVING.
  //
  // On the first announcement the viewer answered, the browser opened, and the
  // browser waited: the server had already started a second compilation, and it
  // holds every request until a build ends. That second build is watchpack, which
  // on Windows reports directories as changed on its first cycle -- different
  // directories on different runs, so there is nothing here to fix, only something
  // to wait out.
  //
  // Three answers in a row, spaced out. A build that starts in the middle takes the
  // streak with it, because the requests stop coming back.
  ready: async () => {
    const wanted = 3;
    let inARow = 0;

    for (let attempt = 0; attempt < 90; attempt++) {
      const page = await get(`${VIEWER}/`);
      inARow = page && isTheViewer(page) ? inARow + 1 : 0;

      if (inARow === wanted) {
        openIt(VIEWER);
        return `  Serving on ${VIEWER}`;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return null;
  },
});
