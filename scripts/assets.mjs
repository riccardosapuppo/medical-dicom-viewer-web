#!/usr/bin/env node
/**
 * Every file the page asks the browser for is a file that is there.
 *
 *   node scripts/assets.mjs
 *
 * The page template declared twenty-five icons and four of them existed. The
 * de-branding replaced the icon set and left the references, so every load
 * asked for favicon.ico and got a 404, the web manifest listed nine icons under
 * a base path this deployment does not use, and two of the files it pointed at
 * pointed in turn at four more that were never there.
 *
 * None of that fails anything. A missing icon is a browser shrugging, and the
 * only trace was one line in a console the smoke check prints and does not
 * count. Which is the whole reason for this file: it costs a directory listing,
 * it needs no browser and no archive, and it answers before a build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'platform/app/public');

/** Somewhere else's problem: another host, or the bytes are in the address. */
const elsewhere = reference => /^(https?:|data:|blob:|mailto:|#|\/\/)/.test(reference);

/**
 * What a page asks for, by the attribute it asks with.
 *
 * `<%= PUBLIC_URL %>` is where the deployment's base path goes, and whatever
 * follows it is a path under this directory. A trailing `<%= CACHE_BUSTER %>`
 * is a query string, not part of the name.
 */
function referencedByTemplate(source) {
  const found = [];
  for (const match of source.matchAll(/(?:href|src|content)="<%= PUBLIC_URL %>([^"]+)"/g)) {
    const reference = match[1].split('<%=')[0].split('?')[0].trim();
    if (reference && !elsewhere(reference)) {
      found.push(reference);
    }
  }
  return found;
}

/** What a manifest asks for: every `src` in it, and the paths beside them. */
function referencedByManifest(source) {
  const found = [];
  for (const match of source.matchAll(/(?:"src"\s*:\s*"|src=")([^"]+)"/g)) {
    const reference = match[1].split('?')[0].trim();
    if (reference && !elsewhere(reference)) {
      found.push(reference);
    }
  }
  return found;
}

/**
 * Names the build makes, and the file each is made from.
 *
 * app-config.js is not in this directory and never will be: webpack copies
 * whichever file APP_CONFIG names, config/default.js unless something says
 * otherwise, and renames it on the way into dist. The reference is right, so
 * what is checked is the file it stands for.
 */
const BUILT = new Map([['app-config.js', 'config/default.js']]);

/**
 * A reference resolved against this directory.
 *
 * The manifest wrote "/viewer/assets/icon.png", which is a base path from
 * another deployment: on a leading slash the part that matters is what comes
 * after the last "assets/", and a relative one is simply relative to here.
 */
function resolved(reference) {
  if (reference.startsWith('/')) {
    const at = reference.lastIndexOf('assets/');
    return at === -1 ? path.join(publicDir, reference.slice(1)) : path.join(publicDir, reference.slice(at));
  }
  return path.join(publicDir, reference);
}

/**
 * The check can still see a reference.
 *
 * Run first. A reader that has quietly stopped reading reports the same
 * all-clear as one that read everything, and the two have to be told apart from
 * outside.
 */
function proveItLooks() {
  const template = '<link rel="icon" href="<%= PUBLIC_URL %>assets/SENTINEL.png" />';
  const manifest = '{ "icons": [{ "src": "/viewer/assets/SENTINEL.png" }] }';
  const seen = [...referencedByTemplate(template), ...referencedByManifest(manifest)];

  if (seen.length !== 2 || !seen.every(one => one.endsWith('SENTINEL.png'))) {
    console.error('This check has stopped seeing the references it used to see.');
    // 2, not 1: nothing was checked, so this is neither a pass nor a failure.
    process.exit(2);
  }
  if (path.basename(resolved('/viewer/assets/SENTINEL.png')) !== 'SENTINEL.png') {
    console.error('This check no longer resolves a reference to a file.');
    process.exit(2);
  }
}

proveItLooks();

const pages = fs
  .readdirSync(path.join(publicDir, 'html-templates'))
  .filter(name => name.endsWith('.html'))
  .map(name => path.join('html-templates', name));

const manifests = ['manifest.json', ...fs
  .readdirSync(path.join(publicDir, 'assets'))
  .filter(name => /\.(json|xml)$/.test(name))
  .map(name => path.join('assets', name))];

if (pages.length === 0) {
  console.error('No page template found. This check is looking in the wrong place.');
  process.exit(2);
}

const missing = [];
let asked = 0;

for (const file of [...pages, ...manifests]) {
  const full = path.join(publicDir, file);
  if (!fs.existsSync(full)) {
    continue;
  }
  const source = fs.readFileSync(full, 'utf8');
  const references = file.endsWith('.html')
    ? referencedByTemplate(source)
    : referencedByManifest(source);

  for (const reference of references) {
    asked++;
    if (!fs.existsSync(resolved(BUILT.get(reference) ?? reference))) {
      missing.push({ file, reference });
    }
  }
}

if (missing.length > 0) {
  console.error(`${missing.length} of the ${asked} files the page asks for are not there:\n`);
  for (const one of missing) {
    console.error(`  ${one.file.padEnd(30)} ${one.reference}`);
  }
  console.error('\nEither add the file or stop asking for it.');
  process.exit(1);
}

console.log(`Every one of the ${asked} files the page asks for is there.`);
