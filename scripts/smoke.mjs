#!/usr/bin/env node
/**
 * Opens the running viewer in a real browser and reports what happened.
 *
 * Every other check in this repository inspects files: whether they are served,
 * what they contain. None of that executes a line of the application, and a
 * viewer can serve a perfect bundle and still fail on its first render — a
 * service left undefined, two copies of React, a missing WebGL context. Each of
 * those shipped here at least once and each was found by a person opening the
 * page, which is a slow and unkind way to find them.
 *
 * This drives the study list and one study, and fails on any uncaught error.
 * The screenshots it leaves behind are the ones the README uses, so the
 * documentation shows the application as it actually renders.
 *
 * Needs a browser to drive:
 *   npm install --no-save playwright-core
 *   npx playwright install chromium
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'docs');

const VIEWER = process.env.VIEWER_URL ?? 'http://localhost:3000';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error(
    'This check drives a real browser and playwright-core is not installed.\n' +
      '  npm install --no-save playwright-core\n' +
      '  npx playwright install chromium'
  );
  process.exit(1);
}

/** Where a Playwright-managed Chromium lands, so an existing one is reused. */
function findChromium() {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  const cache =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
      : path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');

  if (!fs.existsSync(cache)) {
    return undefined;
  }
  for (const entry of fs.readdirSync(cache)) {
    if (!entry.startsWith('chromium-')) {
      continue;
    }
    for (const candidate of [
      path.join(cache, entry, 'chrome-win64', 'chrome.exe'),
      path.join(cache, entry, 'chrome-linux', 'chrome'),
      path.join(cache, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ]) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

const problems = [];
const record = text => {
  const line = String(text).slice(0, 300);
  if (!problems.includes(line)) {
    problems.push(line);
  }
};

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: [
    // A headless browser has no GPU. These give it a software implementation of
    // WebGL, so the run exercises the path a machine with a graphics card takes
    // rather than the CPU fallback, which is not what most people will see.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', error => record(`uncaught: ${error.message}`));
page.on('console', message => message.type() === 'error' && record(`console: ${message.text()}`));

fs.mkdirSync(shots, { recursive: true });
const checks = [];
const check = (name, passed, detail = '') => {
  checks.push({ name, passed, detail });
  console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nStudy list');
await page.goto(`${VIEWER}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });

let studies = 0;
try {
  await page.waitForSelector('text=LIDC-IDRI-0001', { timeout: 60000 });
  // Rows carrying a patient identifier, rather than every tr: the table has a
  // filter row, and there is a second table for the column headers.
  studies = await page.locator('tr', { hasText: /C3[LN]-|LIDC-IDRI/ }).count();
} catch {
  // Left at zero, reported below.
}
check('the archive answers with studies', studies >= 3, `${studies} studies`);

// Visible text, not the served HTML: the stylesheets carry the upstream name in
// comments and class names, which no reader ever sees. What matters is that
// nothing on screen says it.
const visible = (await page.evaluate(() => document.body.innerText || '')).toLowerCase();
check('the viewer is not named anywhere a reader can see', !visible.includes('ohif'));
await page.screenshot({ path: path.join(shots, 'study-list.png') });

console.log('\nViewer');
// Opening through the button is what a reader does, and it exercises the mode
// route rather than a hand-written URL. The multi-series study is chosen
// because it is the one that exercises the series panel.
await page.locator('tr', { hasText: 'C3N-00310' }).first().click();
const launch = page.getByRole('button', { name: /open study/i }).first();
await launch.click({ timeout: 30000 }).catch(() => record('no launch button on the study list'));
await page.waitForTimeout(25000);

const canvases = await page.locator('canvas').count();
check('the study renders', canvases > 0, `${canvases} canvas`);

const toolbar = await page.evaluate(
  () => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().y < 50).length
);
check('the toolbar is present', toolbar > 10, `${toolbar} buttons`);

const overlap = await page.evaluate(() => {
  const mark = document.querySelector('.rw-wordmark');
  if (!mark) {
    return 'no mark';
  }
  const right = mark.getBoundingClientRect().right;
  const first = [...document.querySelectorAll('button')]
    .filter(b => b.getBoundingClientRect().y < 50 && b.getBoundingClientRect().width > 8)
    .map(b => b.getBoundingClientRect().x)
    .sort((a, b) => a - b)[0];
  return first === undefined ? 'no buttons' : first < right - 2;
});
check('the name is not sitting under the toolbar', overlap === false, String(overlap));

await page.screenshot({ path: path.join(shots, 'viewer.png') });

console.log(`\nUncaught errors: ${problems.length}`);
problems.slice(0, 10).forEach(problem => console.log(`  ${problem}`));
console.log(`Screenshots in ${shots}`);

await browser.close();

const failed = problems.length > 0 || checks.some(c => !c.passed);
process.exit(failed ? 1 : 0);
