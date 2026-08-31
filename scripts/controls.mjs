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
 *   npm install --no-save playwright-core
 *   node scripts/controls.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** What this fork adds, by the name the page knows it by. */
const CONTROLS = [
  ['Sottogriglia', '[aria-label="Sottogriglia"]'],
  ['MPR', '[data-cy="LayoutMPR"]'],
  ['hanging protocol', '[data-cy="gestioneHP"]'],
  ['nascondi info', '[data-cy="hideInfoDicom"]'],
  ['note', 'img[src*="edit.png"]'],
  ['preferiti', 'img[src*="preferiti.png"]'],
];

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let guasti = 0;

for (const [nome, selettore] of CONTROLS) {
  // Una pagina nuova per ciascuno: premere un comando cambia la disposizione, e
  // il successivo si troverebbe uno schermo diverso da quello che si aspetta.
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const eccezioni = [];
  const errori = [];
  page.on('pageerror', e => eccezioni.push(String(e.message).slice(0, 120)));
  page.on(
    'console',
    m =>
      m.type() === 'error' &&
      !/shader|WebGL|GL_/i.test(m.text()) &&
      errori.push(m.text().slice(0, 120))
  );

  await page.goto(`${VIEWER}/viewer?StudyInstanceUIDs=${STUDY}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(30000);
  await page.evaluate(() =>
    [...document.querySelectorAll('.shepherd-button')]
      .find(b => /Chiudi|Ho capito/.test(b.innerText))
      ?.click()
  );
  await page.waitForTimeout(1200);
  eccezioni.length = 0;
  errori.length = 0;

  const prima = await page.evaluate(() => document.body.innerText || '');
  const premuto = await page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) {
      return false;
    }
    (e.closest('button,[role="button"]') || e).click();
    return true;
  }, selettore);
  await page.waitForTimeout(4500);

  const dopo = await page.evaluate(() => document.body.innerText || '');
  // Un effetto puo' essere testo che compare O testo che sparisce: il comando
  // che nasconde i dati sovrimpressi fa esattamente il secondo, e giudicarlo
  // solo sulle righe nuove lo faceva sembrare morto.
  const spezza = t =>
    t
      .split(/\r?\n/)
      .map(r => r.trim())
      .filter(Boolean);
  const nuoveRighe = spezza(dopo).filter(r => !prima.includes(r));
  const sparite = spezza(prima).filter(r => !dopo.includes(r));
  const comparso = nuoveRighe.length
    ? nuoveRighe.slice(0, 2).join(' | ')
    : sparite.length
      ? `sparite ${sparite.length} righe: ${sparite.slice(0, 2).join(' | ')}`
      : '';

  // Un errore in console e' un guasto quanto un'eccezione: e' cosi' che si e'
  // manifestato l'MPR rotto, mentre questo conteggio diceva zero.
  const rotto = !premuto || eccezioni.length > 0 || errori.length > 0;
  if (rotto) {
    guasti++;
  }
  const esito = !premuto ? 'NON TROVATO' : eccezioni.length ? 'ECCEZIONE' : comparso ? 'ok' : 'nessun effetto visibile';
  console.log(`${esito === 'ok' ? '  ok  ' : '  FAIL'}  ${nome.padEnd(18)} ${esito === 'ok' ? comparso.slice(0, 70) : esito}`);
  eccezioni.slice(0, 2).forEach(e => console.log(`        ${e}`));
  errori.slice(0, 2).forEach(e => console.log(`        console: ${e}`));
  await page.close();
}

await browser.close();
console.log(`\nComandi con guasti: ${guasti}`);
process.exit(guasti > 0 ? 1 : 0);
