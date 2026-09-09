/**
 * An arrangement saved by an older build still reads.
 *
 * The fields of a saved hanging protocol were named in Italian, and they are
 * not interface text: they are keys in JSON that has already been written, to
 * localStorage and to a backend that is not part of this repository. Renaming
 * them in the code alone would leave every stored arrangement in place and
 * unreadable, every field coming back undefined, and the panel offering a
 * configuration that restores nothing. That looks like a bug in saving, and the
 * cause would be several commits behind.
 *
 * So `ensureHpStructure` writes the new names and still accepts the old ones,
 * and this drives that with an entry written the old way.
 *
 *   node scripts/saved-arrangements.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = path.join(
  root,
  'platform/app/public/extensions/hangingProtocols/hpStore.js'
);

/**
 * The three functions this needs, lifted out of the module.
 *
 * hpStore.js imports half of OHIF, so importing it here would pull a browser
 * runtime into a script that only wants to try one pure function. The pieces
 * are taken by name, and if one of them is renamed or removed this stops with a
 * sentence saying so rather than passing on nothing.
 */
function lift(source, name, pattern) {
  const found = source.match(pattern);
  if (!found) {
    console.error(`${name} is no longer where this check looks for it in hpStore.js.`);
    console.error('Nothing was tried. Fix this before trusting a pass.');
    process.exit(2);
  }
  return found[0];
}

const source = fs.readFileSync(store, 'utf8');
const module_ = [
  lift(source, 'dedupByKey', /const dedupByKey =[\s\S]*?\n};/),
  'const canonExamKey = value => String(value ?? "").trim().toLowerCase();',
  'const canonModalityKey = value => String(value ?? "").trim().toLowerCase();',
  lift(source, 'RENAMED', /const RENAMED = \{[\s\S]*?\n\};/),
  lift(source, 'withRenamedFields', /const withRenamedFields =[\s\S]*?\n};/),
  lift(source, 'ensureHpStructure', /export const ensureHpStructure =[\s\S]*?\n};/).replace(
    'export ',
    ''
  ),
  'export { ensureHpStructure };',
].join('\n\n');

const temporary = path.join(root, 'node_modules', '.hp-structure.mjs');
fs.writeFileSync(temporary, module_, 'utf8');
const { ensureHpStructure } = await import(`file:///${temporary.replace(/\\/g, '/')}`);
fs.rmSync(temporary, { force: true });

/** An arrangement as an older build wrote it, every field under its old name. */
const asItWasSaved = {
  studioSpecifico: {
    '1.2.840.113619.2.1': {
      performanceHP: { id: 'mdvhp' },
      layoutGriglia: { rows: 2, columns: 3 },
      serieLabels: ['CT', 'MR'],
      istanzeSpecifiche: [4, null],
    },
  },
  examName: [{ examName: 'MR ELBOW', layoutGriglia: { rows: 1, columns: 2 } }],
  modality: [{ modalityName: 'CT', serieLabels: ['axial'] }],
};

const read = ensureHpStructure(structuredClone(asItWasSaved));
const one = read.specificStudy?.['1.2.840.113619.2.1'];

const checks = [
  ['the per-study map arrives under the new name', Boolean(one)],
  ['the protocol', one?.protocol?.id === 'mdvhp'],
  ['the grid layout', one?.gridLayout?.columns === 3],
  ['the series labels', one?.seriesLabels?.[0] === 'CT'],
  ['the specific instances', one?.specificInstances?.[0] === 4],
  ['the entries under examName', read.examName?.[0]?.gridLayout?.columns === 2],
  ['the entries under modality', read.modality?.[0]?.seriesLabels?.[0] === 'axial'],
];

// And one written the new way is left exactly as it is: a migration that
// rewrites what is already right is a migration that will one day rewrite it
// wrong.
const already = ensureHpStructure({
  specificStudy: { x: { protocol: { id: 'kept' }, gridLayout: { rows: 1, columns: 1 } } },
});
checks.push([
  'one already written the new way is untouched',
  already.specificStudy.x.protocol.id === 'kept',
]);

let failed = 0;
for (const [what, ok] of checks) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${checks.length}: an arrangement saved before the rename no longer reads.`);
  process.exit(1);
}
console.log(`\n${checks.length} checks: what was saved before the rename still reads.`);
