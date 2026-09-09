/**
 * Everything a reader sees is in English.
 *
 * This viewer ships no Italian locale, so Italian on screen was never a
 * translation: it was written into the source, and t() never touched it.
 *
 * The first version of this check read the source with regular expressions and
 * reported it clean while the About dialog still said "Basato su" and
 * "Revisione" and the preferences dialog said "Voce 1". Three separate blind
 * spots, and none of them was the vocabulary:
 *
 *   - it looked for JSX text between a `>` and a `<` ON THE SAME LINE, so a
 *     sentence written on a line of its own had neither beside it;
 *   - it excluded braces from that text, so "Voce {index + 1}" was skipped;
 *   - `Record<string, unknown>` looks enough like JSX text that letting the
 *     match span lines filled the result with noise instead.
 *
 * So it does not read the source by eye any more. The TypeScript parser says
 * what a JsxText is, what a string is, and what a generic is, and it is never
 * wrong about which is which.
 *
 *   node scripts/english.mjs          report and fail on anything found
 *   node scripts/english.mjs --list   print every piece it looked at
 *   node scripts/english.mjs --all    include the safety net, not just the
 *                                     places that are certainly on screen
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(`file:///${root.replace(/\\/g, '/')}/`);
const ts = require('typescript');

// ---------------------------------------------------------------------------
// What counts as text somebody reads
// ---------------------------------------------------------------------------

/** Attributes and properties whose value is read rather than executed. */
const TEXT_BEARING = new Set([
  'label', 'title', 'tooltip', 'placeholder', 'aria-label', 'ariaLabel', 'alt',
  'message', 'text', 'description', 'heading', 'subHeading', 'header', 'caption',
  'content', 'hint', 'help', 'summary', 'legend', 'buttonLabel', 'errorMessage',
  'emptyMessage', 'confirmText', 'cancelText', 'okText', 'iconLabel',
  'componentLabel', 'placeholderText',
]);

/** Calls whose first argument reaches a screen. */
const SHOWING = new Set(['t', 'alert', 'confirm', 'prompt']);

// ---------------------------------------------------------------------------
// What counts as Italian
// ---------------------------------------------------------------------------

/**
 * Italian words that are not also English words.
 *
 * A list is a floor, not a ceiling: it only ever catches what somebody thought
 * to write down, which is why the first version of this file went green on
 * "Basato" and "Revisione". The suffixes below are what catches the rest.
 */
const ITALIAN_WORDS = [
  // verbs and buttons
  'annulla', 'salva', 'salvato', 'salvata', 'salvate', 'salvati', 'salvataggio',
  'chiudi', 'chiuso', 'chiusa', 'apri', 'aperto', 'aperta', 'apertura',
  'aggiungi', 'aggiunto', 'rimuovi', 'rimosso', 'elimina', 'eliminato',
  'eliminazione', 'seleziona', 'selezionato', 'selezionata', 'scegli', 'scelta',
  'mostra', 'mostrato', 'nascondi', 'nascosto', 'ripristina', 'sovrascrivi',
  'attiva', 'attivo', 'attivato', 'disattiva', 'carica', 'caricato',
  'caricamento', 'inverti', 'ruota', 'rifletti', 'sposta', 'adatta', 'verifica',
  'controlla', 'imposta', 'modifica', 'visualizza', 'inserisci', 'invia',
  // nouns
  'impostazioni', 'preferenze', 'scorciatoie', 'tastiera', 'finestra', 'griglia',
  'immagine', 'immagini', 'paziente', 'pazienti', 'esame', 'esami', 'serie',
  'studio', 'studi', 'referto', 'referti', 'misura', 'misure', 'misurazione',
  'misurazioni', 'annotazione', 'annotazioni', 'lunghezza', 'angolo', 'angoli',
  'cerchio', 'ellisse', 'rettangolo', 'sonda', 'calibrazione', 'contorno',
  'sinistra', 'destra', 'larghezza', 'altezza', 'pagina', 'errore', 'errori',
  'versione', 'revisione', 'aiuto', 'sottogriglia', 'preferiti', 'preferito',
  'storico', 'descrizione', 'configurazione', 'configurazioni', 'utente',
  'utenti', 'voce', 'voci', 'riga', 'righe', 'colonna', 'colonne', 'cella',
  'celle', 'scheda', 'schede', 'pulsante', 'bottone', 'pannello', 'riquadro',
  'elenco', 'lista', 'marchio', 'testata', 'sfondo', 'bordo', 'schermo',
  'istanza', 'istanze', 'nota', 'note', 'ricerca', 'avviso', 'partizione',
  'nome', 'cognome', 'nomenclatura', 'inquadratura', 'metadati',
  // adjectives and states
  'nessuno', 'nessuna', 'nessun', 'predefinito', 'predefiniti', 'predefinita',
  'disponibile', 'disponibili', 'impossibile', 'riuscito', 'riuscita',
  'corrente', 'corrente', 'attuale', 'attuali', 'basato', 'basata', 'fisso',
  'fissa', 'fissi', 'fisse', 'vuoto', 'vuota', 'pronto', 'pronta', 'sviluppato',
  'precedente', 'successivo', 'successiva', 'principale', 'esterna', 'interna',
  'valido', 'valida', 'sconosciuto', 'sconosciuta', 'mancante', 'mancanti',
  // function words, which never appear in an English sentence
  'della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'nello', 'negli',
  'sulla', 'sulle', 'sullo', 'alla', 'alle', 'allo', 'agli', 'dalla', 'dalle',
  'dallo', 'dagli', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella',
  'perche', 'quindi', 'invece', 'oppure', 'ovvero', 'viene', 'vengono',
  'senza', 'sempre', 'ogni', 'dove', 'deve', 'devono', 'gia', 'cioe', 'anche',
  'ancora', 'mentre', 'quando', 'fino', 'cosi', 'tutto', 'tutti', 'tutte',
  'attendere', 'connessione', 'inizializzazione', 'quasi',
];

/**
 * Endings no English word has, or has only in words this project never uses.
 *
 * This is what catches the word nobody wrote down. "Basato", "Revisione" and
 * "Istanza" were all missed by a list and are all caught here.
 */
const ITALIAN_ENDINGS = [
  /zione$/, /zioni$/, /mento$/, /menti$/, /tà$/, /ità$/, /aggio$/, /ezza$/,
  /anza$/, /enza$/, /issim[oaie]$/, /ando$/, /endo$/, /zzat[oaie]$/,
  /ogli[oaie]$/, /[aeiou]nt[eio]$/,
  // A past participle, but only ending in o, a or i. Ending in e was tried and
  // it is where English lives: execute, compute, overwrite, favourite, complete,
  // separate. Italian keeps -ato, -ita, -uti; English almost never does.
  /[aeiou]t[oai]$/,
  // Any word carrying a grave or acute accent. Nothing in this project's
  // English does, and the locale folders are not read.
  /[àèéìòù]/,
];

/** Words that end like Italian and are not. */
const NOT_ITALIAN = new Set([
  'auto', 'photo', 'into', 'onto', 'unto', 'veto', 'goto', 'proto', 'moto',
  'data', 'metadata', 'beta', 'delta', 'errata', 'strata', 'alpha', 'gamma',
  'roboto', 'userdata', 'lato', 'segoe',
  'presentation', 'position', 'orientation', 'annotation', 'segmentation',
  'information', 'configuration', 'application', 'notification', 'resolution',
  'attention', 'section', 'selection', 'option', 'function', 'action',
  'dimension', 'extension', 'version', 'session', 'permission', 'compression',
  'documento', 'quality', 'entity', 'city', 'ability', 'utility', 'security',
  'modality', 'opacity', 'density', 'priority', 'capacity', 'identity',
  'archivio', 'studio', 'radio', 'audio', 'ratio', 'scenario', 'portfolio',
  'segmento', 'volume', 'value', 'valued', 'route', 'routed', 'note', 'noted',
  'quote', 'quoted', 'state', 'stated', 'rate', 'rated', 'date', 'dated',
  'create', 'created', 'update', 'updated', 'delete', 'deleted', 'complete',
  'completed', 'private', 'separate', 'separated', 'generate', 'generated',
  'annotate', 'annotated', 'calibrate', 'calibrated', 'navigate', 'truncate',
  'immediate', 'appropriate', 'accurate', 'duplicate', 'template', 'palette',
  'byte', 'site', 'suite', 'write', 'sprite', 'infinite', 'opposite',
  'candidate', 'coordinate', 'estimate', 'validate', 'evaluate', 'activate',
  'aspect', 'object', 'connect', 'select', 'detect', 'expect', 'reject',
  'nature', 'feature', 'picture', 'measure', 'failure', 'future', 'signature',
  'structure', 'texture', 'capture', 'procedure', 'aperture', 'exposure',
  'firmware', 'hardware', 'software', 'square', 'share', 'aware', 'compare',
  'prepare', 'declare', 'sure', 'pure', 'cure', 'more', 'core', 'store',
  'element', 'moment', 'segment', 'comment', 'component', 'document',
  'increment', 'argument', 'instrument', 'attachment', 'alignment',
  'measurement', 'placement', 'requirement', 'statement', 'agreement',
  'development', 'environment', 'assignment', 'management', 'movement',
  'current', 'parent', 'content', 'present', 'different', 'transparent',
  'consistent', 'persistent', 'permanent', 'silent', 'client', 'patient',
  'gradient', 'ambient', 'coefficient', 'orient', 'point', 'joint', 'print',
  'reading', 'loading', 'rendering', 'pending', 'ending', 'binding', 'padding',
  'window', 'shadow', 'follow', 'below', 'allow', 'row', 'grow', 'show',
]);

/** Technical, medical and DICOM words that are neither English nor a defect. */
const JARGON = new Set([
  'dicom', 'dicomweb', 'qido', 'wado', 'stow', 'pacs', 'ohif', 'orthanc',
  'cornerstone', 'sop', 'uid', 'mpr', 'seg', 'rtstruct', 'voi', 'lut', 'roi',
  'mip', 'suv', 'petct', 'monochrome1', 'monochrome2', 'aetitle', 'ae',
  'viewport', 'viewports', 'modality', 'modalities', 'hanging', 'protocol',
  'montage', 'thumbnail', 'crosshair', 'crosshairs', 'colormap', 'voxel',
  'axial', 'sagittal', 'coronal', 'series', 'study', 'instance', 'frame',
]);

// ---------------------------------------------------------------------------

const WORD = /[A-Za-zÀ-ÿ]{3,}/g;

/**
 * The words in a piece of text, with camelCase taken apart.
 *
 * Without this, `ContourData` and `SeriesMetadata` are single words ending in
 * -ata, which is an Italian past participle, and the check calls two perfectly
 * English identifiers a defect. Split, they are Contour, Data, Series and
 * Metadata, and none of them is Italian.
 */
function words(text) {
  return (text.match(WORD) ?? []).flatMap(one =>
    one.replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, '$1 $2').split(' ')
  );
}

/** Why this piece of text is not English, or null if it is. */
function notEnglish(text) {
  for (const raw of words(text)) {
    if (raw.length < 3) {
      continue;
    }
    const word = raw.toLowerCase();
    if (JARGON.has(word) || NOT_ITALIAN.has(word)) {
      continue;
    }
    if (ITALIAN_WORDS.includes(word)) {
      return raw;
    }
    if (word.length >= 5 && ITALIAN_ENDINGS.some(ending => ending.test(word))) {
      return raw;
    }
  }
  return null;
}

/**
 * Shapes that are not prose: an identifier, a selector, a path, a mimetype.
 *
 * Only the safety net needs this. What comes out of a JsxText or a `label=` is
 * on screen by construction and is judged whatever shape it has.
 */
function looksLikeCode(text) {
  return (
    !/\s/.test(text) ||
    /[<>{}\\/=;$]/.test(text) ||
    /^[a-z]+([A-Z][a-z]*)+$/.test(text) ||
    /^[a-z0-9]+([-_][a-z0-9]+)+$/.test(text)
  );
}

// ---------------------------------------------------------------------------

/** Files the parser understands. */
function sources() {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(
      file =>
        /\.(ts|tsx|js|jsx)$/.test(file) &&
        !file.includes('/locales/') &&
        !file.includes('/cypress/') &&
        !/\.test\.(ts|tsx|js)$/.test(file) &&
        !/\.min\.js$/.test(file)
    );
}

/**
 * HTML and CSS, which are read a line at a time instead.
 *
 * The parser has nothing to say about either, and leaving them out is how the
 * page template kept a paragraph of Italian and tailwind.css kept three
 * comments while everything else was being reported clean. Neither holds JSX,
 * so a line at a time is enough; what matters is that they are read at all.
 */
function flatFiles() {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(file => /\.(html|css)$/.test(file) && !/\.min\.css$/.test(file));
}

/** Every piece of text a reader could meet, with where it came from. */
function visibleText(file, source) {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  if ((parsed.parseDiagnostics ?? []).length > 0) {
    return [];
  }

  const found = [];
  const at = node => parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
  const add = (node, kind, text, certain) => {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(clean)) {
      return;
    }
    found.push({ file, line: at(node), kind, text: clean, certain });
  };

  const walk = node => {
    if (ts.isJsxText(node)) {
      add(node, 'JSX text', node.text, true);
    }

    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(parsed);
      if (TEXT_BEARING.has(name)) {
        const value = node.initializer;
        const literal = ts.isStringLiteral(value)
          ? value
          : ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression)
            ? value.expression
            : null;
        if (literal) {
          add(node, `${name}=`, literal.text, true);
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
          ? node.name.text
          : node.name.getText(parsed);
      if (TEXT_BEARING.has(name)) {
        const value = node.initializer;
        if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
          add(node, `${name}:`, value.text, true);
        } else if (ts.isTemplateExpression(value)) {
          add(node, `${name}:`, value.getText(parsed).replace(/^`|`$/g, ''), true);
        }
      }
    }

    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression.getText(parsed).split('.').pop();
      if (SHOWING.has(callee)) {
        const first = node.arguments[0];
        if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
          add(node, `${callee}()`, first.text, true);
        }
      }
    }

    // The safety net: every other string, judged only if it reads like prose.
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node, 'string', node.text, false);
    } else if (ts.isTemplateExpression(node)) {
      add(node, 'string', node.getText(parsed).replace(/^`|`$/g, ''), false);
    }

    ts.forEachChild(node, walk);
  };

  walk(parsed);
  return found;
}

/**
 * The check can see the three shapes that once got past it.
 *
 * Run before anything else. A check that has quietly stopped looking reports
 * the same "all clear" as one that looked and found nothing, and those two
 * have to be told apart from the outside.
 */
function proveItLooks() {
  const sample = [
    'const a = (',
    '  <Panel>',
    '    <Tab>',
    '      SENTINEL_ON_ITS_OWN_LINE',
    '    </Tab>',
    '    <b>SENTINEL_BESIDE {value} AN_EXPRESSION</b>',
    '    <Field label="SENTINEL_IN_AN_ATTRIBUTE" />',
    '  </Panel>',
    ');',
    'const generic: Record<string, unknown> = {};',
  ].join('\n');

  const seen = visibleText('sample.tsx', sample)
    .filter(piece => piece.certain)
    .map(piece => piece.text)
    .join(' | ');

  const wanted = ['SENTINEL_ON_ITS_OWN_LINE', 'SENTINEL_BESIDE', 'SENTINEL_IN_AN_ATTRIBUTE'];
  const missed = wanted.filter(one => !seen.includes(one));
  if (missed.length > 0) {
    console.error('This check has stopped seeing text it used to see:\n');
    for (const one of missed) {
      console.error(`  ${one}`);
    }
    console.error('\nFix the reader before trusting anything it says.');
    process.exit(2);
  }
  if (seen.includes('string, unknown')) {
    console.error('The reader is picking up TypeScript generics as if they were text.');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------

proveItLooks();

const listing = process.argv.includes('--list');
const includeNet = process.argv.includes('--all');
const hits = [];

for (const file of sources()) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const piece of visibleText(file, source)) {
    if (!piece.certain && looksLikeCode(piece.text)) {
      continue;
    }
    if (listing && (piece.certain || includeNet)) {
      console.log(`${piece.file}:${piece.line}  [${piece.kind}]  ${piece.text}`);
    }
    const word = notEnglish(piece.text);
    if (word) {
      hits.push({ ...piece, word });
    }
  }
}

for (const file of flatFiles()) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  source.split('\n').forEach((line, index) => {
    const word = notEnglish(line);
    if (word) {
      hits.push({
        file,
        line: index + 1,
        kind: file.endsWith('.css') ? 'css' : 'html',
        text: line.trim().slice(0, 120),
        certain: true,
        word,
      });
    }
  });
}

const certain = hits.filter(one => one.certain);
const net = hits.filter(one => !one.certain);
const reported = includeNet ? hits : certain;

if (reported.length === 0) {
  console.log(
    `Every piece of interface text is English.` +
      (net.length > 0 && !includeNet
        ? `  (${net.length} in the safety net; --all to see them)`
        : '')
  );
  process.exit(0);
}

console.error(`${reported.length} pieces of interface text are not English:\n`);
for (const one of reported.slice(0, 60)) {
  console.error(`  ${one.file}:${one.line}   [${one.kind}]`);
  console.error(`    "${one.text}"   (${one.word})`);
}
if (reported.length > 60) {
  console.error(`  ...and ${reported.length - 60} more.`);
}
process.exit(1);
