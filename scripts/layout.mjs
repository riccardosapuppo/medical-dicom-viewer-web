#!/usr/bin/env node
/**
 * Looks at the whole screen, at the sizes it is used, and reports what is wrong
 * with the way it is arranged.
 *
 * The smoke check answers "does it work". This answers "does it look like
 * somebody arranged it", which is a different question and the one that kept
 * being answered by a person opening the page: a mark that outgrew its bar and
 * sat over the page title, a tab strip that covered the tooltips it was next to,
 * a tab with no text in it, a band left behind by a control that was removed.
 *
 * None of those raise an error. Every one of them is visible in the geometry.
 *
 *   node scripts/layout.mjs
 *
 * Against the viewer and the loaded archive already running — see
 * scripts/lib/viewerReady.mjs.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aBrowser } from './lib/a-browser.mjs';
import { dismissTour, requireTour } from './lib/tour.mjs';
import { requireViewer } from './lib/viewerReady.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER = process.env.VIEWER_URL ?? 'http://localhost:3000';
const STUDY = '1.3.6.1.4.1.14519.5.2.1.3320.3273.330352612792644515148733881839';

/**
 * What counts as a fault, measured in the page rather than judged by eye.
 *
 * Runs inside the browser, so it is written as one self-contained function.
 */
function faultsOnScreen(windowHeight) {
  const visible = element => {
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.05) {
      return false;
    }
    const box = element.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2) {
      return false;
    }
    // Parked off the canvas.
    //
    // The older tooltip boxes live at x of a million until they are wanted:
    // they are on screen by every property you can ask about, and nobody sees
    // them. Without this, four of them reported each other as overlapping text
    // and buried the real faults.
    return (
      box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < window.innerHeight
    );
  };

  /** Its own text only, not its children's. */
  const ownText = element =>
    [...element.childNodes]
      .filter(node => node.nodeType === 3)
      .map(node => node.textContent.trim())
      .join(' ')
      .trim();

  const named = element =>
    `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${
      typeof element.className === 'string' && element.className.trim()
        ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.')
        : ''
    }`.slice(0, 52);

  const faults = [];

  // 1. Text over text: two pieces of writing in the same place.
  const writing = [...document.querySelectorAll('*')].filter(
    element => visible(element) && ownText(element).length > 1
  );
  for (let i = 0; i < writing.length; i++) {
    for (let j = i + 1; j < writing.length; j++) {
      const a = writing[i];
      const b = writing[j];
      if (a.contains(b) || b.contains(a)) {
        continue;
      }
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const width = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const height = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (width <= 2 || height <= 2) {
        continue;
      }
      // An overlap counts if it covers an appreciable part of the smaller one.
      const overlap = width * height;
      const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (overlap / smaller > 0.25) {
        faults.push(
          `text over text: ${named(a)} "${ownText(a).slice(0, 20)}" and ${named(b)} "${ownText(b).slice(0, 20)}"`
        );
      }
    }
  }

  // 2. Controls that ended up off the screen.
  for (const element of document.querySelectorAll('button,[role="button"],a[href]')) {
    if (!visible(element)) {
      continue;
    }
    const box = element.getBoundingClientRect();
    if (box.top >= windowHeight || box.bottom <= 0 || box.left >= innerWidth || box.right <= 0) {
      faults.push(`off screen: ${named(element)} at ${Math.round(box.x)},${Math.round(box.y)}`);
    }
  }

  // 3. Controls with nothing to read and nothing to look at.
  for (const element of document.querySelectorAll('button,[role="button"],[role="tab"]')) {
    if (!visible(element)) {
      continue;
    }
    const hasText = (element.innerText || '').trim().length > 0;
    const hasPicture = element.querySelector('svg,img');
    const hasName = element.getAttribute('aria-label') || element.getAttribute('title');
    if (!hasText && !hasPicture && !hasName) {
      const box = element.getBoundingClientRect();
      faults.push(
        `mute control: ${named(element)} ${Math.round(box.width)}x${Math.round(box.height)}`
      );
    }
  }

  return [...new Set(faults)];
}

requireTour(root);

await requireViewer(VIEWER);

const { browser, driving } = await aBrowser();
console.log(`  driving ${driving}`);

let total = 0;

for (const [pageName, url, settle] of [
  ['study list', `${VIEWER}/`, 14000],
  ['viewer', `${VIEWER}/viewer?StudyInstanceUIDs=${STUDY}`, 32000],
]) {
  for (const [width, height] of [
    [1600, 950],
    [1366, 768],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(settle);
    // The guided tour covers the page: it is closed, as a reader would close it.
    await dismissTour(page);

    const faults = await page.evaluate(faultsOnScreen, height);
    console.log(`\n${pageName} ${width}x${height}: ${faults.length || 'nothing to report'}`);
    faults.slice(0, 12).forEach(fault => console.log(`  ${fault}`));
    total += faults.length;
    await page.close();
  }
}

await browser.close();
console.log(`\nReported: ${total}`);
process.exit(total > 0 ? 1 : 0);
