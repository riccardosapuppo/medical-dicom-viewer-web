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

async function upload(file) {
  const response = await fetch(`${orthanc}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/dicom' },
    body: fs.readFileSync(file),
  });
  if (!response.ok) {
    throw new Error(`${path.basename(file)}: the archive answered ${response.status}`);
  }
  return response.json();
}

async function main() {
  if (!fs.existsSync(dicomRoot)) {
    throw new Error('no studies downloaded yet. Run: npm run data');
  }

  await waitForOrthanc();

  const files = listDicomFiles(dicomRoot);
  console.log(`Uploading ${files.length} instances from ${dicomRoot}`);

  let done = 0;
  const queue = [...files];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let file = queue.pop(); file; file = queue.pop()) {
      await upload(file);
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
