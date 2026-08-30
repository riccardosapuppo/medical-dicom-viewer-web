#!/usr/bin/env node
/**
 * Downloads the studies listed in data/studies.json from The Cancer Imaging
 * Archive.
 *
 * The images are real clinical acquisitions that the archive de-identified
 * before publishing them; both collections are Creative Commons Attribution,
 * and the attribution they require is in data/studies.json and in the README.
 * Nothing is committed to this repository: the files land in data/dicom/, which
 * is ignored, so a clone stays small and the licence terms stay simple.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzip } from './lib/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data', 'studies.json'), 'utf8'));
const outputRoot = path.join(root, 'data', 'dicom');

const endpoint = `${manifest.source.api}/getImage`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A DICOM file carries its magic 128 bytes in, after the preamble. */
function isDicom(data) {
  return data.length > 132 && data.toString('latin1', 128, 132) === 'DICM';
}

async function fetchSeries(series, collection) {
  const target = path.join(outputRoot, collection, series.seriesInstanceUID);

  if (fs.existsSync(target)) {
    const have = fs.readdirSync(target).filter(name => name.endsWith('.dcm')).length;
    if (have === series.imageCount) {
      console.log(`  = ${series.description}: ${plural(have, 'image')} already downloaded`);
      return have;
    }
    fs.rmSync(target, { recursive: true, force: true });
  }

  process.stdout.write(`  · ${series.description}: downloading ... `);
  const response = await fetch(`${endpoint}?SeriesInstanceUID=${series.seriesInstanceUID}`);
  if (!response.ok) {
    throw new Error(`the archive answered ${response.status} ${response.statusText}`);
  }
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.length === 0) {
    throw new Error('the archive returned an empty response');
  }

  const files = unzip(archive);
  const images = files.filter(file => isDicom(file.data));
  if (images.length !== files.length) {
    throw new Error(`${files.length - images.length} of the files returned are not DICOM`);
  }

  fs.mkdirSync(target, { recursive: true });
  images
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .forEach((file, index) => {
      fs.writeFileSync(path.join(target, `${String(index + 1).padStart(4, '0')}.dcm`), file.data);
    });

  const megabytes = (archive.length / 1024 / 1024).toFixed(1);
  const warning = images.length === series.imageCount ? '' : ` (manifest says ${series.imageCount})`;
  console.log(`${plural(images.length, 'image')}, ${megabytes} MB${warning}`);
  return images.length;
}

async function main() {
  console.log('Downloading from', manifest.source.archive);
  for (const [name, collection] of Object.entries(manifest.collections)) {
    console.log(`  ${name}: ${collection.license}, doi ${collection.doi}`);
  }

  let total = 0;
  for (const study of manifest.studies) {
    console.log(`\n${study.label} (${study.collection})`);
    for (const series of study.series) {
      total += await fetchSeries(series, study.collection);
    }
  }

  console.log(`\n${plural(total, 'image')} in ${outputRoot}`);
  console.log('Load them into the archive with: npm run data:load');
}

main().catch(error => {
  console.error(`\nDownload failed: ${error.message}`);
  process.exitCode = 1;
});
