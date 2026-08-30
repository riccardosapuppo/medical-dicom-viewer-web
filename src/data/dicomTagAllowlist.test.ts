// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dcmjs from 'dcmjs';
import { dicomTagAllowlist } from './dicomTagAllowlist';
import type { Study } from '../../extensions/radiology-workflow/src/study';

interface ParsedHeader {
  frameOfReferenceUID: string;
  rows: number;
  columns: number;
  imageOrientationPatient: number[];
  imagePositionPatient: number[];
  pixelSpacing: number[];
  spacingBetweenSlices: number;
  pixelHash: string;
}

function numbers(value: unknown): number[] {
  return (Array.isArray(value) ? value : [value]).map(Number);
}

function cross(left: number[], right: number[]) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function subtract(left: number[], right: number[]) {
  return left.map((value, index) => value - right[index]);
}

describe('generated DICOM volumes', () => {
  it('contains only allowed tags and reconstructable multi-series geometry', () => {
    const studies = JSON.parse(fs.readFileSync(path.resolve('public/data/studies.json'), 'utf8')) as Study[];
    const expectedPaths = studies.flatMap(study => study.series.flatMap(series => series.imagePaths));
    const files = fs
      .readdirSync(path.resolve('public/dicom/synthetic'), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.dcm'));
    const unexpected = new Set<string>();
    const headers = new Map<string, ParsedHeader>();

    for (const imagePath of expectedPaths) {
      const diskPath = path.resolve(`public${imagePath}`);
      const bytes = fs.readFileSync(diskPath);
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const data = dcmjs.data.DicomMessage.readFile(arrayBuffer);
      const tags = [
        ...Object.keys(data.meta).map(tag => tag.replace('x', '').toLowerCase()),
        ...Object.keys(data.dict).map(tag => tag.replace('x', '').toLowerCase()),
      ];
      tags.filter(tag => !dicomTagAllowlist.has(tag)).forEach(tag => unexpected.add(tag));
      const natural = dcmjs.data.DicomMetaDictionary.naturalizeDataset(data.dict);
      const pixelData = natural.PixelData?.[0] ?? natural.PixelData;
      const pixelBytes = pixelData instanceof ArrayBuffer ? Buffer.from(pixelData) : Buffer.from([]);

      headers.set(imagePath, {
        frameOfReferenceUID: String(natural.FrameOfReferenceUID),
        rows: Number(natural.Rows),
        columns: Number(natural.Columns),
        imageOrientationPatient: numbers(natural.ImageOrientationPatient),
        imagePositionPatient: numbers(natural.ImagePositionPatient),
        pixelSpacing: numbers(natural.PixelSpacing),
        spacingBetweenSlices: Number(natural.SpacingBetweenSlices),
        pixelHash: crypto.createHash('sha256').update(pixelBytes).digest('hex'),
      });
    }

    expect(studies).toHaveLength(18);
    expect(files).toHaveLength(expectedPaths.length);
    expect(expectedPaths).toHaveLength(2648);
    expect([...unexpected]).toEqual([]);

    const primaryVolumeHashes = new Set<string>();
    for (const study of studies) {
      expect(study.numberOfStudyRelatedSeries).toBe(study.series.length);
      expect(study.numberOfStudyRelatedInstances).toBe(
        study.series.reduce((sum, series) => sum + series.slices, 0)
      );
      expect(study.series).toHaveLength(study.modality === 'CT' ? 2 : 3);

      for (const series of study.series) {
        if (study.modality === 'CT') expect(series.slices).toBeGreaterThanOrEqual(60);
        else expect(series.slices).toBeGreaterThanOrEqual(30);
        expect(series.slices).toBeLessThanOrEqual(study.modality === 'CT' ? 200 : 120);
        expect(series.imagePaths).toHaveLength(series.slices);
        expect(series.sopInstanceUIDs).toHaveLength(series.slices);

        const first = headers.get(series.imagePaths[0])!;
        const second = headers.get(series.imagePaths[1])!;
        const last = headers.get(series.imagePaths.at(-1)!)!;
        expect(first.frameOfReferenceUID).toBe(series.frameOfReferenceUID);
        expect(first.rows).toBe(series.rows);
        expect(first.columns).toBe(series.columns);
        expect(first.imageOrientationPatient).toEqual(series.imageOrientationPatient);
        expect(first.pixelSpacing).toEqual(series.pixelSpacing);
        expect(first.spacingBetweenSlices).toBeCloseTo(series.spacingBetweenSlices, 5);

        const normal = cross(
          first.imageOrientationPatient.slice(0, 3),
          first.imageOrientationPatient.slice(3, 6)
        );
        const adjacentSpacing = dot(subtract(second.imagePositionPatient, first.imagePositionPatient), normal);
        const fullCoverage = dot(subtract(last.imagePositionPatient, first.imagePositionPatient), normal);
        expect(adjacentSpacing).toBeCloseTo(series.spacingBetweenSlices, 4);
        expect(fullCoverage).toBeCloseTo(series.spacingBetweenSlices * (series.slices - 1), 3);
      }

      const primary = study.series[0];
      primaryVolumeHashes.add(headers.get(primary.imagePaths[Math.floor(primary.slices / 2)])!.pixelHash);
    }

    expect(primaryVolumeHashes.size).toBe(studies.length);
  }, 60_000);
});
