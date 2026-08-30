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

import { packageManagerFor } from './lib/packageManager.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ohifDir = path.join(root, '.ohif');

const OHIF_REPO = 'https://github.com/OHIF/Viewers.git';
const OHIF_TAG = 'v3.13.0';
// Pinned so that a fresh clone builds the same viewer this was developed
// against, even if the tag is ever moved.
const OHIF_COMMIT = '7aec1113dceffab51cf011a246774dda889a256b';

// Where a fault in this demonstration should be reported.
const ISSUES_URL = 'https://github.com/riccardosapuppo/medical-dicom-viewer-web/issues';

const PACKAGES = [
  { dir: path.join('extensions', 'radiology-workflow'), key: 'extensions' },
  { dir: path.join('modes', 'radiology-workflow'), key: 'modes' },
];

const step = message => console.log(`\n▸ ${message}`);
const info = message => console.log(`  ${message}`);

// Package managers are shell scripts, and .cmd files on Windows, so they need a
// shell; git is a real executable and is safer launched without one, because a
// shell would need the paths quoting and this repository can live under a path
// containing spaces.
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

/**
 * Refuses to build with a second copy of React sitting in this repository.
 *
 * The two packages here are linked into the viewer workspace, but their files
 * still live under this directory, and the bundler resolves a bare import by
 * walking up from the file that made it. A node_modules here is therefore
 * found before the one belonging to the viewer, and React resolved from it is
 * a different instance from the one doing the rendering. The symptom is a
 * blank viewer and "Cannot read properties of null (reading useState)",
 * pointing at a component that is perfectly correct.
 *
 * Nothing here declares runtime dependencies, so a node_modules in this
 * directory is always a leftover.
 */
function refuseDuplicateReact() {
  const strays = path.join(root, "node_modules");
  if (!fs.existsSync(path.join(strays, "react"))) {
    return;
  }
  throw new Error(
    "a second copy of React is installed at " +
      strays +
      ". The bundler resolves the imports of this repository to it rather than " +
      "to the copy the viewer uses, and hooks then fail at runtime with a null " +
      "dispatcher. Delete that directory and run this again."
  );
}

/**
 * Points the error dialog at this project.
 *
 * When something throws, the viewer shows a dialog titled "Something went
 * wrong in OHIF" with a button that files an issue against the viewer. Both
 * are wrong here: a reader of this demonstration has met a fault in this
 * project, and the people who maintain the viewer should not receive it.
 *
 * The component takes the name from a default prop and the address from a
 * literal, with no hook for either, so both are rewritten in the clone. The
 * button is kept: an error worth showing is worth reporting somewhere.
 */
function redirectErrorReports() {
  const file = path.join(
    ohifDir,
    "platform", "ui-next", "src", "components", "Errorboundary", "ErrorBoundary.tsx"
  );
  if (!fs.existsSync(file)) {
    throw new Error("the error dialog is no longer where this expects it: " + file);
  }

  const source = fs.readFileSync(file, "utf8");
  let patched = source
    .replace(
      "https://github.com/OHIF/Viewers/issues/new?template=bug-report.yml",
      ISSUES_URL
    )
    .replace("context = 'OHIF',", "context = 'Medical DICOM Viewer',");

  if (patched === source && !source.includes(ISSUES_URL)) {
    throw new Error("could not redirect the error dialog; check " + file);
  }
  if (patched !== source) {
    fs.writeFileSync(file, patched);
  }
  info("error reports point at this project");
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

  // The study list offers one button per registered mode. The viewer ships
  // several, most of which cannot open most studies and appear greyed out; a
  // row of disabled buttons asks the reader to work out which one applies. Only
  // this mode is left enabled, so opening a study is one decision.
  for (const entry of config.modes) {
    const isOurs = PACKAGES.some(({ dir }) => {
      const { name } = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
      return name === entry.packageName;
    });
    if (!isOurs && entry.default !== false) {
      entry.default = false;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    info(`${config.modes.filter(m => m.default !== false).length} mode offered in the study list`);
  }
}

/**
 * Gives the viewer this application's name and mark.
 *
 * The name matches the portfolio entry exactly, because a project that calls
 * itself one thing in one place and another elsewhere reads as two unfinished
 * projects. The viewer's own name and logo are replaced everywhere the reader
 * can see them; where it is named is the README and the third party notices,
 * which is where crediting belongs.
 */
function applyBranding() {
  const publicDir = path.join(ohifDir, 'platform', 'app', 'public');

  // The mark. An SVG icon is declared before the packaged .ico files, and
  // browsers prefer it, so the stock favicon never wins.
  const assets = path.join(publicDir, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.copyFileSync(path.join(root, 'branding', 'favicon.svg'), path.join(assets, 'icon.svg'));

  fs.copyFileSync(
    path.join(root, 'branding', 'manifest.json'),
    path.join(publicDir, 'manifest.json')
  );

  const templatePath = path.join(publicDir, 'html-templates', 'index.html');
  let template = fs.readFileSync(templatePath, 'utf8');
  const before = template;

  template = template.replace(
    /<title>[^<]*<\/title>/,
    '<title>Medical DICOM Viewer (Web)</title>'
  );

  // Declared before the packaged .ico, and browsers prefer an SVG icon, so the
  // stock favicon never wins. Matched on the manifest link with a pattern
  // rather than an exact string, because the template is wrapped across lines
  // and its indentation is not something to depend on.
  if (!template.includes('assets/icon.svg')) {
    const svgIcon =
      '<link rel="icon" type="image/svg+xml" href="<%= PUBLIC_URL %>assets/icon.svg" />\n    ';
    const patched = template.replace(/<link\s+rel="manifest"/, `${svgIcon}$&`);
    if (patched === template) {
      throw new Error('could not find where to declare the icon in the page template');
    }
    template = patched;
  }

  // Anything left naming the viewer where a reader would see it: the page
  // title, the name a phone shows under a saved shortcut, the package name
  // that reaches a meta tag. Matched case-insensitively and on the package
  // scope too, because one of them is written "@ohif/app".
  template = template.replace(
    /content="[^"]*ohif[^"]*"/gi,
    'content="Medical DICOM Viewer (Web)"'
  );

  if (template !== before) {
    fs.writeFileSync(templatePath, template);
  }
  info('name and mark applied');
}

try {
  step('checking this repository is clean to build from');
  refuseDuplicateReact();

  step('OHIF source');
  cloneOhif();

  step('linking this repository into the OHIF workspace');
  PACKAGES.forEach(linkPackage);

  step('linking the viewer configuration');
  linkConfig();

  step('applying the palette');
  applyPalette();

  step('applying the name and mark');
  applyBranding();
  redirectErrorReports();

  step('registering the plugins with the viewer');
  registerPlugins();

  step('installing dependencies');
  const packageManager = packageManagerFor(ohifDir);
  info(`the viewer expects ${packageManager.version}`);

  // The lockfile that ships with the viewer cannot know about the two packages
  // this repository links into its workspace, so an install that insists the
  // lockfile is already correct will always refuse. Allowing it to be extended
  // is the point of linking them; the viewer's own dependencies stay pinned by
  // the lockfile exactly as published.
  run(packageManager.command('install --no-frozen-lockfile'), [], ohifDir, { shell: true });

  console.log('\nReady. Start the viewer with: npm run dev');
} catch (error) {
  console.error(`\nSetup failed: ${error.message}`);
  process.exitCode = 1;
}
