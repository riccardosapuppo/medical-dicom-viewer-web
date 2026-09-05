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
 *   npm install --no-save playwright-core
 *   node scripts/layout.mjs
 *
 * Against the viewer and the loaded archive already running — see
 * scripts/lib/viewerReady.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireViewer } from './lib/viewerReady.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWER = process.env.VIEWER_URL ?? 'http://localhost:3000';
const STUDY = '1.3.6.1.4.1.14519.5.2.1.3320.3273.330352612792644515148733881839';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('This check drives a real browser: npm install --no-save playwright-core');
  process.exit(1);
}

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
 * What counts as a fault, measured in the page rather than judged by eye.
 *
 * Runs inside the browser, so it is written as one self-contained function.
 */
function rileva(altezzaFinestra) {
  const visibile = e => {
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) {
      return false;
    }
    const b = e.getBoundingClientRect();
    if (b.width <= 2 || b.height <= 2) {
      return false;
    }
    // Parcheggiato fuori tela.
    //
    // I riquadri dei suggerimenti alla vecchia maniera vivono a x un milione
    // finche' non servono: sono a schermo per ogni proprieta' che si possa
    // interrogare, e nessuno li vede. Senza questo, quattro di loro si
    // segnalavano a vicenda come testo sovrapposto e coprivano i guai veri.
    return b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < window.innerHeight;
  };

  /** Solo il testo proprio, non quello dei figli. */
  const testoProprio = e =>
    [...e.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim())
      .join(' ')
      .trim();

  const nome = e =>
    `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${
      typeof e.className === 'string' && e.className.trim()
        ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.')
        : ''
    }`.slice(0, 52);

  const guai = [];

  // 1. Testo sopra testo: due scritte che occupano lo stesso posto.
  const scritte = [...document.querySelectorAll('*')].filter(
    e => visibile(e) && testoProprio(e).length > 1
  );
  for (let i = 0; i < scritte.length; i++) {
    for (let j = i + 1; j < scritte.length; j++) {
      const a = scritte[i];
      const b = scritte[j];
      if (a.contains(b) || b.contains(a)) {
        continue;
      }
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const larghezza = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const altezza = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (larghezza <= 2 || altezza <= 2) {
        continue;
      }
      // Una sovrapposizione conta se copre una parte apprezzabile del piu piccolo.
      const area = larghezza * altezza;
      const minima = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (area / minima > 0.25) {
        guai.push(
          `testo sovrapposto: ${nome(a)} "${testoProprio(a).slice(0, 20)}" e ${nome(b)} "${testoProprio(b).slice(0, 20)}"`
        );
      }
    }
  }

  // 2. Comandi finiti fuori dallo schermo.
  for (const e of document.querySelectorAll('button,[role="button"],a[href]')) {
    if (!visibile(e)) {
      continue;
    }
    const b = e.getBoundingClientRect();
    if (b.top >= altezzaFinestra || b.bottom <= 0 || b.left >= innerWidth || b.right <= 0) {
      guai.push(`fuori schermo: ${nome(e)} a ${Math.round(b.x)},${Math.round(b.y)}`);
    }
  }

  // 3. Comandi senza niente da leggere e senza niente da guardare.
  for (const e of document.querySelectorAll('button,[role="button"],[role="tab"]')) {
    if (!visibile(e)) {
      continue;
    }
    const haTesto = (e.innerText || '').trim().length > 0;
    const haDisegno = e.querySelector('svg,img');
    const haNome = e.getAttribute('aria-label') || e.getAttribute('title');
    if (!haTesto && !haDisegno && !haNome) {
      const b = e.getBoundingClientRect();
      guai.push(`comando muto: ${nome(e)} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
  }

  return [...new Set(guai)];
}

await requireViewer(VIEWER);

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let totale = 0;

for (const [nomePagina, url, attesa] of [
  ['study list', `${VIEWER}/`, 14000],
  ['viewer', `${VIEWER}/viewer?StudyInstanceUIDs=${STUDY}`, 32000],
]) {
  for (const [larghezza, altezza] of [
    [1600, 950],
    [1366, 768],
  ]) {
    const page = await browser.newPage({ viewport: { width: larghezza, height: altezza } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(attesa);
    // Il giro guidato copre la pagina: si chiude, come farebbe un lettore.
    await page.evaluate(() =>
      [...document.querySelectorAll('.shepherd-button')]
        .find(b => /Chiudi|Ho capito/.test(b.innerText))
        ?.click()
    );
    await page.waitForTimeout(1200);

    const guai = await page.evaluate(rileva, altezza);
    console.log(`\n${nomePagina} ${larghezza}x${altezza}: ${guai.length || 'niente da segnalare'}`);
    guai.slice(0, 12).forEach(g => console.log(`  ${g}`));
    totale += guai.length;
    await page.close();
  }
}

await browser.close();
console.log(`\nSegnalazioni: ${totale}`);
process.exit(totale > 0 ? 1 : 0);
