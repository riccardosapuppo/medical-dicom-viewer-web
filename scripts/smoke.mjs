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

/**
 * Two lists, because they mean different things. An uncaught exception stopped
 * something; a console error is a library complaining, and the onboarding tour
 * complains on every load about an element it looks for before the viewport
 * exists. Only the first kind fails this check, but both are printed, because a
 * new line in the second is worth a look.
 */
const problems = [];
const noise = [];
const record = (text, fatal = true) => {
  const line = String(text).slice(0, 300);
  const list = fatal ? problems : noise;
  if (!list.includes(line)) {
    list.push(line);
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
page.on('console', message => message.type() === 'error' && record(message.text(), false));

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
// This viewer is entered by address with the study on it, which is how the host
// page enters it in a real installation. The three-series study is the one worth
// opening: it is the one that exercises the series panel.
const study = '1.3.6.1.4.1.14519.5.2.1.3320.3273.330352612792644515148733881839';
await page.goto(`${VIEWER}/viewer?StudyInstanceUIDs=${study}`, {
  waitUntil: 'domcontentloaded',
  timeout: 120000,
});
await page.waitForTimeout(35000);

const canvases = await page.locator('canvas').count();
check('the study renders', canvases > 0, `${canvases} canvas`);

const toolbar = await page.evaluate(
  () => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().y < 50).length
);
check('the toolbar is present', toolbar > 10, `${toolbar} buttons`);

// Every icon in this project is cut at the size it is used, because nothing
// sizes them: they are placed as plain images and drawn at whatever they
// intrinsically are. One at ninety-six pixels sat over the middle of the study.
const oversized = await page.evaluate(() =>
  [...document.querySelectorAll('img')]
    // Only the icons. Thumbnails arrive as data URIs and are meant to be large,
    // which an earlier version of this check reported as a fault.
    .filter(i => /\/assets\//.test(i.src) && !i.src.startsWith('data:'))
    .filter(i => i.naturalWidth > 64 && i.getBoundingClientRect().width > 64)
    .map(i => i.src.split('/').pop())
);
check('no icon is drawn oversized', oversized.length === 0, oversized.join(', '));

const series = await page.evaluate(
  () => ((document.body.innerText || '').match(/Pre Contrast|BONE|po 7min/g) || []).length
);
check('the series panel is populated', series >= 3, `${series} mentions`);

// A missing file is not a 404 here. The development server answers an address
// it does not know with the application's own page, at status 200, so an <img>
// pointing at a file nobody ever added receives HTML and draws as a broken
// frame. Three icons shipped that way, and so did a script that stopped the
// page. Nothing reports it: the request succeeded.
const broken = await page.evaluate(() =>
  [...document.querySelectorAll('img')]
    .filter(i => i.complete && i.naturalWidth === 0 && i.src)
    .map(i => i.src.split('/').pop())
);
check('every image resolves to an image', broken.length === 0, broken.join(', '));

// The guided tour opens over a first visit and dims the page behind it, which
// is right for a reader and wrong for a screenshot of the viewer.
await page.evaluate(() => {
  const chiudi = [...document.querySelectorAll('.shepherd-button')].find(b =>
    /Chiudi|Ho capito/.test(b.innerText)
  );
  chiudi?.click();
});
await page.waitForTimeout(1500);

await page.screenshot({ path: path.join(shots, 'viewer.png') });

console.log(`\nUncaught errors: ${problems.length}`);
problems.slice(0, 10).forEach(problem => console.log(`  ${problem}`));

if (noise.length > 0) {
  console.log(`Console errors, which do not fail this check: ${noise.length}`);
  noise.slice(0, 6).forEach(line => console.log(`  ${line.slice(0, 110)}`));
}

console.log(`Screenshots in ${shots}`);

await browser.close();

const failed = problems.length > 0 || checks.some(c => !c.passed);
process.exit(failed ? 1 : 0);
