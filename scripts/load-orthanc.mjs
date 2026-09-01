#!/usr/bin/env node
/**
 * Uploads the downloaded studies into the Orthanc container.
 *
 * Orthanc is the archive the viewer reads from over DICOMweb, which is how a
 * real deployment is arranged: the viewer holds no images of its own. Running
 * this again is harmless, because the archive stores an instance once and
 * recognises a repeat by its SOP Instance UID.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dicomParser from 'dicom-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dicomRoot = path.join(root, 'data', 'dicom');
const orthanc = process.env.ORTHANC_URL ?? 'http://localhost:8042';

/** How many uploads are in flight at once. Enough to saturate a local socket. */
const CONCURRENCY = 8;

function listDicomFiles(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...listDicomFiles(full));
    } else if (entry.name.endsWith('.dcm')) {
      found.push(full);
    }
  }
  return found;
}

async function waitForOrthanc() {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const response = await fetch(`${orthanc}/system`);
      if (response.ok) {
        const system = await response.json();
        console.log(`Archive ready: ${system.Name}, Orthanc ${system.Version}`);
        return;
      }
    } catch {
      // Not up yet; the container may still be starting.
    }
    if (attempt === 1) {
      process.stdout.write('Waiting for the archive ');
    }
    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`no archive answering at ${orthanc}. Start it with: docker compose up -d`);
}

async function upload(file, name) {
  const response = await fetch(`${orthanc}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/dicom' },
    body: name ? withPatientName(fs.readFileSync(file), name) : fs.readFileSync(file),
  });
  if (!response.ok) {
    throw new Error(`${path.basename(file)}: the archive answered ${response.status}`);
  }
  return response.json();
}

/**
 * The same DICOM, with a patient name a person can read.
 *
 * The identifiers these collections publish are real and stay exactly as they
 * are: LIDC-IDRI-0001, C3N-00310, MSB-01799 are what makes an image traceable
 * back to the archive it came from, and the licence attribution refers to them.
 *
 * What they are not is a name. In a worklist the name column is the first
 * thing read, and a column of catalogue numbers does not say "a person whose
 * identity was removed" - it says the software failed to fill the field in.
 *
 * The substitution happens here, on the way to the archive, and never on disk:
 * the downloaded files stay byte for byte what the collection published. The
 * archive was asked to do this first and refused - keeping the study, series
 * and instance identifiers while changing a patient tag is not something it
 * will do, and without them the archive stopped matching data/studies.json.
 */
function withPatientName(bytes, name) {
  const dataSet = dicomParser.parseDicom(bytes, { untilTag: 'x00100020' });
  const element = dataSet.elements.x00100010;
  if (!element) {
    return bytes;
  }

  // Every value in DICOM has an even length; a name is padded with a space.
  const value = Buffer.from(name.length % 2 === 0 ? name : `${name} `, 'latin1');

  // Explicit VR, short form: the two bytes before the value are its length.
  const header = bytes.subarray(element.dataOffset - 8, element.dataOffset);
  const rewritten = Buffer.from(header);
  rewritten.writeUInt16LE(value.length, 6);

  return Buffer.concat([
    bytes.subarray(0, element.dataOffset - 8),
    rewritten,
    value,
    bytes.subarray(element.dataOffset + element.length),
  ]);
}

/** Which name each published identifier is shown under. */
function nameEveryPatient(files) {
  const identifiers = new Set();
  for (const file of files) {
    const dataSet = dicomParser.parseDicom(fs.readFileSync(file), { untilTag: 'x00100030' });
    identifiers.add(dataSet.string('x00100020') ?? '');
  }

  // Sorted, so two runs over the same data give the same names rather than
  // shuffling them by whatever order the file system answered in.
  const names = new Map();
  [...identifiers].sort().forEach((id, i) => {
    names.set(id, `Anonymized^Patient ${String(i + 1).padStart(2, '0')}`);
  });
  return names;
}

async function main() {
  if (!fs.existsSync(dicomRoot)) {
    throw new Error('no studies downloaded yet. Run: npm run data');
  }

  await waitForOrthanc();

  const files = listDicomFiles(dicomRoot);
  console.log(`Uploading ${files.length} instances from ${dicomRoot}`);

  const names = nameEveryPatient(files);
  console.log(
    `Showing ${names.size} patients as Anonymized Patient 01..${String(names.size).padStart(2, '0')}, ` +
      'keeping the identifiers their collections published.'
  );

  let done = 0;
  const queue = [...files];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let file = queue.pop(); file; file = queue.pop()) {
      const identifier = dicomParser.parseDicom(fs.readFileSync(file), { untilTag: 'x00100030' }).string('x00100020') ?? '';
      await upload(file, names.get(identifier));
      done++;
      if (done % 25 === 0 || done === files.length) {
        process.stdout.write(`\r  ${done} / ${files.length}`);
      }
    }
  });
  await Promise.all(workers);

  const studies = await (await fetch(`${orthanc}/studies`)).json();
  const series = await (await fetch(`${orthanc}/series`)).json();
  console.log(`\nArchive now holds ${studies.length} studies and ${series.length} series.`);
  console.log('Open the viewer at http://localhost:3000');
}

main().catch(error => {
  console.error(`\nUpload failed: ${error.message}`);
  process.exitCode = 1;
});
