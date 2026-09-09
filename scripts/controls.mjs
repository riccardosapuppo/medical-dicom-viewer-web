#!/usr/bin/env node
/**
 * Presses the controls this fork adds, one at a time, and reports what breaks.
 *
 * The smoke check opens a study. The layout check looks at the arrangement.
 * Neither presses anything, and most of what has gone wrong here went wrong on
 * a press: a panel that opened onto "loading" forever, a button whose tooltip
 * was its own function name, a toggle that never changed, a control that walked
 * up three parents from the click and pressed the wrong thing.
 *
 * For each control: press it, wait, and record any exception, any console error,
 * and whether anything appeared. A control that raises nothing and shows nothing
 * is reported too — that is what a dead button looks like.
 *
 *   node scripts/controls.mjs
 *
 * Against the viewer and the loaded archive already running — see
 * scripts/lib/viewerReady.mjs.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aBrowser } from './lib/a-browser.mjs';
import { requireInSource } from './lib/in-source.mjs';
import { dismissTour, TOUR_HANDLES } from './lib/tour.mjs';
import { requireViewer } from './lib/viewerReady.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER = process.env.VIEWER_URL ?? 'http://localhost:3000';
const STUDY = '1.3.6.1.4.1.14519.5.2.1.3320.3273.330352612792644515148733881839';

/**
 * What this fork adds, by the name the page knows it by.
 *
 * `handle` is the string the selector rests on, and it is checked against the
 * source before anything is launched. Three of these six selectors were dead
 * and nobody knew: a rename moved `Sottogriglia` to `Subgrid`, `gestioneHP` to
 * `hangingProtocols` and `preferiti.png` to `favourites.png`, and this file kept
 * asking for the old names. The check reported them as broken controls, which
 * is what a broken check and a broken button look like from here, and neither
 * was noticed because running it needs an archive and a viewer up.
 *
 * The preflight needs neither. A rename now goes red in the same commit.
 */
const CONTROLS = [
  { name: 'subgrid', selector: '[aria-label="Subgrid"]', handle: 'aria-label="Subgrid"' },
  { name: 'MPR', selector: '[data-cy="LayoutMPR"]', handle: "id: 'LayoutMPR'" },
  {
    name: 'hanging protocol',
    selector: '[data-cy="hangingProtocols"]',
    handle: "id: 'hangingProtocols'",
  },
  { name: 'hide the info', selector: '[data-cy="hideInfoDicom"]', handle: "id: 'hideInfoDicom'" },
  { name: 'notes', selector: 'img[src*="edit.png"]', handle: 'assets/edit.png' },
  { name: 'favourites', selector: 'img[src*="favourites.png"]', handle: 'assets/favourites.png' },
];

requireInSource(root, [...CONTROLS, ...TOUR_HANDLES]);

await requireViewer(VIEWER);

const { browser, driving } = await aBrowser();
console.log(`  driving ${driving}`);

let broken = 0;

for (const { name, selector } of CONTROLS) {
  // A fresh page for each: pressing one control changes the arrangement, and
  // the next would meet a screen other than the one it expects.
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const exceptions = [];
  const consoleErrors = [];
  page.on('pageerror', error => exceptions.push(String(error.message).slice(0, 120)));
  page.on(
    'console',
    message =>
      message.type() === 'error' &&
      !/shader|WebGL|GL_/i.test(message.text()) &&
      consoleErrors.push(message.text().slice(0, 120))
  );

  await page.goto(`${VIEWER}/viewer?StudyInstanceUIDs=${STUDY}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(30000);
  await dismissTour(page);
  exceptions.length = 0;
  consoleErrors.length = 0;

  const before = await page.evaluate(() => document.body.innerText || '');
  const pressed = await page.evaluate(sel => {
    const element = document.querySelector(sel);
    if (!element) {
      return false;
    }
    (element.closest('button,[role="button"]') || element).click();
    return true;
  }, selector);

  // An effect can be text appearing OR text going away: the control that hides
  // the overlaid data does exactly the second, and judging it on new lines
  // alone made it look dead.
  const lines = text =>
    text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

  // Watched DURING the wait, not at the end.
  //
  // A passing notice — "Added to favourites" lasts a few seconds — can already
  // be gone by the time the final state is compared: the control read as dead
  // one run in two. A check that contradicts itself teaches people to ignore
  // it, which is worse than not having it.
  let appeared = '';
  for (let attempt = 0; attempt < 12 && !appeared; attempt++) {
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => document.body.innerText || '');
    const added = lines(now).filter(line => !before.includes(line));
    const gone = lines(before).filter(line => !now.includes(line));
    appeared = added.length
      ? added.slice(0, 2).join(' | ')
      : gone.length
        ? `${gone.length} lines gone: ${gone.slice(0, 2).join(' | ')}`
        : '';
  }

  // A console error is as much a fault as an exception: that is how the broken
  // MPR showed itself, while this count said zero.
  if (!pressed || exceptions.length > 0 || consoleErrors.length > 0) {
    broken++;
  }
  const outcome = !pressed
    ? 'NOT FOUND'
    : exceptions.length
      ? 'EXCEPTION'
      : appeared
        ? 'ok'
        : 'no visible effect';
  console.log(
    `${outcome === 'ok' ? '  ok  ' : '  FAIL'}  ${name.padEnd(18)} ${
      outcome === 'ok' ? appeared.slice(0, 70) : outcome
    }`
  );
  exceptions.slice(0, 2).forEach(one => console.log(`        ${one}`));
  consoleErrors.slice(0, 2).forEach(one => console.log(`        console: ${one}`));
  await page.close();
}

await browser.close();
console.log(`\nControls with faults: ${broken}`);
process.exit(broken > 0 ? 1 : 0);
