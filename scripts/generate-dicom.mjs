import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dcmjs from 'dcmjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const definitions = JSON.parse(fs.readFileSync(path.join(root, 'data', 'study-definitions.json'), 'utf8'));
const outputRoot = path.join(root, 'dicom', 'synthetic');
const catalogPath = path.join(root, 'public', 'data', 'studies.json');
const rows = 128;
const columns = 128;
const { DicomDict, DicomMetaDictionary } = dcmjs.data;

function uid(seed) {
  const digest = crypto.createHash('sha256').update(`medical-viewer-demo:${seed}`).digest();
  const value = BigInt(`0x${digest.subarray(0, 16).toString('hex')}`);
  return `2.25.${value}`;
}

function pixelData(definition, sliceIndex) {
  const pixels = new Uint16Array(rows * columns);
  const phase = sliceIndex / Math.max(1, definition.slices - 1);
  const bodyScale = definition.bodyPart === 'CHEST' ? 0.86 : 0.72;
  const modalityScale = definition.modality === 'CT' ? 1 : 0.78;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const nx = (x - columns / 2) / (columns / 2);
      const ny = (y - rows / 2) / (rows / 2);
      const radial = (nx * nx) / (bodyScale * bodyScale) + (ny * ny) / 0.78 ** 2;
      let value = definition.modality === 'CT' ? 24 : 32;

      if (radial < 1) {
        const tissue = 820 + 340 * Math.cos(radial * Math.PI * 0.8);
        const anatomy =
          280 * Math.exp(-((nx + 0.25) ** 2 + (ny - 0.08) ** 2) * 44) +
          230 * Math.exp(-((nx - 0.28) ** 2 + (ny + 0.12) ** 2) * 52) +
          120 * Math.sin((x + y) * 0.12 + phase * Math.PI * 2);
        const cavity = Math.exp(-((nx * 1.8) ** 2 + (ny + 0.08) ** 2) * 18) * 420;
        value = (tissue + anatomy - cavity + phase * 110) * modalityScale;
      }

      const noise = ((x * 17 + y * 31 + sliceIndex * 13) % 29) - 14;
      pixels[y * columns + x] = Math.max(0, Math.min(4095, Math.round(value + noise)));
    }
  }

  return pixels;
}

function writeInstance(definition, identifiers, sliceIndex, directory) {
  const sopInstanceUID = uid(`${definition.key}:instance:${sliceIndex + 1}`);
  const sopClassUID =
    definition.modality === 'CT'
      ? '1.2.840.10008.5.1.4.1.1.2'
      : '1.2.840.10008.5.1.4.1.1.4';
  const transferSyntaxUID = '1.2.840.10008.1.2.1';
  const pixels = pixelData(definition, sliceIndex);
  const pixelBuffer = pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength);
  const dataset = {
    _vrMap: { PixelData: 'OW' },
    SOPClassUID: sopClassUID,
    SOPInstanceUID: sopInstanceUID,
    StudyInstanceUID: identifiers.studyInstanceUID,
    SeriesInstanceUID: identifiers.seriesInstanceUID,
    PatientName: definition.patientName,
    PatientID: definition.patientId,
    PatientBirthDate: `${definition.birthYear}0101`,
    PatientSex: definition.sex,
    StudyDate: definition.studyDate,
    StudyTime: definition.studyTime,
    AccessionNumber: identifiers.accessionNumber,
    StudyDescription: definition.description,
    StudyID: String(identifiers.ordinal).padStart(4, '0'),
    Modality: definition.modality,
    SeriesNumber: 1,
    SeriesDescription: definition.seriesDescription,
    BodyPartExamined: definition.bodyPart,
    InstanceNumber: sliceIndex + 1,
    ImagePositionPatient: [0, 0, Number((sliceIndex * 2.5).toFixed(2))],
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    SliceThickness: 2.5,
    SpacingBetweenSlices: 2.5,
    PixelSpacing: [0.8, 0.8],
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    Rows: rows,
    Columns: columns,
    BitsAllocated: 16,
    BitsStored: 12,
    HighBit: 11,
    PixelRepresentation: 0,
    WindowCenter: definition.modality === 'CT' ? 48 : 620,
    WindowWidth: definition.modality === 'CT' ? 400 : 1100,
    RescaleIntercept: definition.modality === 'CT' ? -1024 : 0,
    RescaleSlope: 1,
    PixelData: [pixelBuffer],
  };
  const meta = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: sopClassUID,
    MediaStorageSOPInstanceUID: sopInstanceUID,
    TransferSyntaxUID: transferSyntaxUID,
    ImplementationClassUID: uid('implementation'),
    ImplementationVersionName: 'SYNTH_DEMO_1',
  };
  const dicom = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  dicom.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  fs.writeFileSync(path.join(directory, `${String(sliceIndex + 1).padStart(3, '0')}.dcm`), Buffer.from(dicom.write()));

  return sopInstanceUID;
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const studies = definitions.map((definition, index) => {
  const ordinal = index + 1;
  const identifiers = {
    ordinal,
    studyInstanceUID: uid(`${definition.key}:study`),
    seriesInstanceUID: uid(`${definition.key}:series:1`),
    accessionNumber: `DEMO-${definition.studyDate}-${String(ordinal).padStart(3, '0')}`,
  };
  const directory = path.join(outputRoot, definition.key);
  fs.mkdirSync(directory, { recursive: true });
  const sopInstanceUIDs = Array.from({ length: definition.slices }, (_, sliceIndex) =>
    writeInstance(definition, identifiers, sliceIndex, directory)
  );

  return {
    ...definition,
    ...identifiers,
    rows,
    columns,
    numberOfStudyRelatedInstances: definition.slices,
    numberOfStudyRelatedSeries: 1,
    sopInstanceUIDs,
  };
});

fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
fs.writeFileSync(catalogPath, `${JSON.stringify(studies, null, 2)}\n`);
console.log(`Generated ${studies.length} studies and ${studies.reduce((sum, study) => sum + study.slices, 0)} DICOM instances.`);
