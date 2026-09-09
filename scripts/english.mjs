/**
 * Everything a reader sees is in English.
 *
 * This viewer ships no Italian locale, so Italian on screen was never a
 * translation: it was written into the source, and t() never touched it.
 *
 * The earlier checks read quoted strings and nothing else, which is why the
 * loading screen went out saying "Quasi pronto..." and "Sviluppato da". The
 * first was a string and the second was not: it was JSX text, sitting between
 * a > and a <, where a search for quotes never looks. This one reads both.
 *
 *   node scripts/english.mjs        report and fail on anything found
 *   node scripts/english.mjs --list list every line it looked at
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Italian words that are not also English words.
 *
 * Not a dictionary: a list of the ones that actually turn up in an interface,
 * chosen so that no English sentence trips them. "solo", "serve", "per",
 * "non" and "in" are all English too, and are deliberately absent.
 */
const ITALIAN = [
  'annulla', 'salva', 'salvato', 'salvata', 'salvate', 'salvati', 'chiudi', 'apri',
  'aggiungi', 'rimuovi', 'elimina', 'seleziona', 'mostra', 'nascondi', 'ripristina',
  'attiva', 'disattiva', 'carica', 'caricamento', 'salvataggio', 'eliminazione',
  'impostazioni', 'preferenze', 'scorciatoie', 'tastiera', 'finestra', 'griglia',
  'immagine', 'immagini', 'paziente', 'esame', 'serie', 'studio', 'studi', 'referto',
  'misura', 'misurazione', 'misurazioni', 'annotazione', 'annotazioni', 'lunghezza',
  'angolo', 'cerchio', 'ellisse', 'rettangolo', 'sonda', 'calibrazione', 'contorno',
  'sinistra', 'destra', 'alto', 'basso', 'larghezza', 'altezza', 'pagina', 'errore',
  'nessuno', 'nessuna', 'nessun', 'predefinito', 'predefiniti', 'versione', 'aiuto',
  'modifica', 'visualizza', 'sottogriglia', 'preferiti', 'storico', 'descrizione',
  'configurazione', 'impossibile', 'disponibile', 'disponibili', 'riuscito',
  'riuscita', 'utente', 'utenti', 'sviluppato', 'inizializzazione', 'connessione',
  'metadati', 'pronto', 'attendere', 'scegli', 'sovrascrivi', 'inverti', 'ruota',
  'rifletti', 'sposta', 'adatta', 'ingrandimento', 'quasi', 'prossimo', 'precedente',
  'successivo', 'della', 'delle', 'degli', 'nella', 'nelle', 'questo', 'questa',
  'quello', 'quella', 'perche', 'quindi', 'invece', 'oppure', 'viene', 'vengono',
];
const WORD = new RegExp(`\\b(${ITALIAN.join('|')})\\b`, 'i');

/** Files git tracks that can hold interface text. */
function sources() {
  const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter(
    f =>
      /\.(ts|tsx|js|jsx)$/.test(f) &&
      !f.includes('/locales/') &&
      !f.includes('/cypress/') &&
      !f.endsWith('.test.js') &&
      !f.endsWith('.test.ts')
  );
}

/**
 * The pieces of a line that reach a screen: quoted strings, and JSX text.
 *
 * JSX text is the half that used to be missed. `>Sviluppato da<` carries no
 * quotes at all, so a check built around quote characters reads straight past
 * it.
 */
function visible(line) {
  const found = [];
  for (const re of [/'([^'\n]{2,200})'/g, /"([^"\n]{2,200})"/g, /`([^`\n]{2,200})`/g]) {
    for (const m of line.matchAll(re)) {
      found.push(m[1]);
    }
  }
  for (const m of line.matchAll(/>([^<>{}\n]{3,200})</g)) {
    found.push(m[1]);
  }
  return found;
}

const listing = process.argv.includes('--list');
const hits = [];

for (const file of sources()) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  text.split('\n').forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return;
    }
    for (const piece of visible(line)) {
      if (piece.startsWith('http') || piece.startsWith('./') || piece.startsWith('../')) {
        continue;
      }
      const word = piece.match(WORD);
      if (word) {
        hits.push({ file, line: i + 1, piece: piece.trim().slice(0, 90), word: word[1] });
      }
    }
  });
}

if (listing) {
  for (const h of hits) {
    console.log(`${h.file}:${h.line}  ${h.word}  ${h.piece}`);
  }
}

if (hits.length === 0) {
  console.log('Every piece of interface text is English.');
  process.exit(0);
}

console.error(`${hits.length} pieces of interface text are not English:\n`);
for (const h of hits.slice(0, 40)) {
  console.error(`  ${h.file}:${h.line}`);
  console.error(`    "${h.piece}"   (${h.word})`);
}
if (hits.length > 40) {
  console.error(`  ...and ${hits.length - 40} more.`);
}
process.exit(1);
