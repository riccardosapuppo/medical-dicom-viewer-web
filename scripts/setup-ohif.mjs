#!/usr/bin/env node
/**
 * Builds a runnable OHIF distribution around the extension and mode in this
 * repository.
 *
 * OHIF is not vendored here. It is cloned into .ohif/ at a pinned commit and
 * this repository's two packages are linked into its workspace, which is the
 * arrangement OHIF documents for out-of-tree plugins. Nothing outside .ohif/ is
 * written, and the script can be run again at any time.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ohifDir = path.join(root, '.ohif');

const OHIF_REPO = 'https://github.com/OHIF/Viewers.git';
const OHIF_TAG = 'v3.12.12';
// Pinned so that a fresh clone builds the same viewer this was developed
// against, even if the tag is ever moved.
const OHIF_COMMIT = '8509efea265985088163dc7069b8717304fc41a2';

const PACKAGES = [
  { dir: path.join('extensions', 'radiology-workflow'), key: 'extensions' },
  { dir: path.join('modes', 'radiology-workflow'), key: 'modes' },
];

const step = message => console.log(`\n▸ ${message}`);
const info = message => console.log(`  ${message}`);

// yarn is a shell script, and a .cmd on Windows, so it needs a shell; git is a
// real executable and is safer launched without one, because a shell would need
// the paths quoting and this repository can live under a path containing spaces.
function run(command, args, cwd, { shell = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
}

function gitOutput(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function cloneOhif() {
  if (fs.existsSync(path.join(ohifDir, 'package.json'))) {
    const head = gitOutput(['rev-parse', 'HEAD'], ohifDir);
    if (head !== OHIF_COMMIT) {
      info(`the clone is at ${head.slice(0, 10)}, expected ${OHIF_COMMIT.slice(0, 10)}`);
      info('delete .ohif/ and run this again to move it');
    } else {
      info(`already cloned at ${OHIF_TAG} (${head.slice(0, 10)})`);
    }
    return;
  }

  info(`cloning ${OHIF_REPO} at ${OHIF_TAG}, this takes a few minutes`);
  run('git', ['clone', '--depth', '1', '--branch', OHIF_TAG, OHIF_REPO, ohifDir]);

  const head = gitOutput(['rev-parse', 'HEAD'], ohifDir);
  if (head !== OHIF_COMMIT) {
    throw new Error(
      `the tag ${OHIF_TAG} points at ${head}, not the pinned ${OHIF_COMMIT}. ` +
        'Refusing to build against a tree this was not developed against.'
    );
  }
  info(`cloned at ${head.slice(0, 10)}`);
}

/**
 * Links a package into the OHIF workspace. A directory junction is used rather
 * than a copy so that editing a file here is picked up by the running dev
 * server; on Windows a junction needs no elevated rights, unlike a symlink.
 */
function linkPackage({ dir }) {
  const source = path.join(root, dir);
  const target = path.join(ohifDir, dir);

  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      const resolved = stat.isSymbolicLink() ? fs.realpathSync(target) : target;
      if (path.resolve(resolved) === path.resolve(source)) {
        info(`${dir} already linked`);
        return;
      }
    }
    fs.rmSync(target, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  info(`${dir} linked into the workspace`);
}

/**
 * Puts this repository's viewer configuration where the build looks for it.
 * A junction on the whole directory rather than a link per file, because a
 * symbolic link to a single file needs elevated rights on Windows and a
 * junction does not.
 */
function linkConfig() {
  const source = path.join(root, 'config');
  const target = path.join(ohifDir, 'platform', 'app', 'public', 'app-config');

  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    const resolved = stat.isSymbolicLink() ? fs.realpathSync(target) : target;
    if (path.resolve(resolved) === path.resolve(source)) {
      info('config already linked');
      return;
    }
    fs.rmSync(target, { recursive: true, force: true });
  }

  fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  info('config linked as public/app-config');
}

/**
 * Applies this repository's palette to the half of the viewer that does not use
 * CSS variables.
 *
 * OHIF is two generations of UI package at once, and the older one carries its
 * colours as literal values in a Tailwind preset. Adding ours after both of
 * theirs is the supported way for a later preset to win; the alternative was a
 * stylesheet of overrides fighting components that had already been given a
 * colour, which is how a theme ends up half applied.
 */
function applyPalette() {
  const configPath = path.join(ohifDir, 'platform', 'app', 'tailwind.config.js');
  const ours = "require('../../../config/tailwind.preset.js')";
  const source = fs.readFileSync(configPath, 'utf8');

  if (source.includes(ours)) {
    info('palette already applied');
    return;
  }

  const stock = "presets: [require('../ui/tailwind.config.js'), require('../ui-next/tailwind.config.js')],";
  if (!source.includes(stock)) {
    throw new Error(
      'the viewer no longer declares its Tailwind presets the way this expects. ' +
        'Check platform/app/tailwind.config.js before going further.'
    );
  }

  const patched = source.replace(
    stock,
    [
      'presets: [',
      "    require('../ui/tailwind.config.js'),",
      "    require('../ui-next/tailwind.config.js'),",
      "    // Applied last, so this repository's palette wins over both of OHIF's.",
      `    ${ours},`,
      '  ],',
    ].join('\n  ')
  );

  fs.writeFileSync(configPath, patched);
  info('palette applied to the viewer build');
}

/** Registers the packages with the viewer, which loads only what is listed. */
function registerPlugins() {
  const configPath = path.join(ohifDir, 'platform', 'app', 'pluginConfig.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  let changed = false;

  for (const { dir, key } of PACKAGES) {
    const { name } = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
    const at = config[key].findIndex(entry => entry.packageName === name);

    // The study list offers one button per mode, in the order they are
    // registered. This mode goes first so that opening a study lands in it
    // rather than in the stock viewer, which is the whole point of building it.
    const wantsFront = key === 'modes';

    if (at === 0 || (at > 0 && !wantsFront)) {
      info(`${name} already registered`);
      continue;
    }
    if (at > 0) {
      config[key].splice(at, 1);
      info(`${name} moved to the front`);
    } else {
      info(`${name} registered as ${key.replace(/s$/, '')}`);
    }
    if (wantsFront) {
      config[key].unshift({ packageName: name });
    } else {
      config[key].push({ packageName: name });
    }
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
}

try {
  step('OHIF source');
  cloneOhif();

  step('linking this repository into the OHIF workspace');
  PACKAGES.forEach(linkPackage);

  step('linking the viewer configuration');
  linkConfig();

  step('applying the palette');
  applyPalette();

  step('registering the plugins with the viewer');
  registerPlugins();

  step('installing dependencies');
  run('yarn install', [], ohifDir, { shell: true });

  console.log('\nReady. Start the viewer with: npm run dev');
} catch (error) {
  console.error(`\nSetup failed: ${error.message}`);
  process.exitCode = 1;
}
