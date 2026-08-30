import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dcmjs from 'dcmjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const definitions = JSON.parse(fs.readFileSync(path.join(root, 'data', 'study-definitions.json'), 'utf8'));
const outputRoot = path.join(root, 'public', 'dicom', 'synthetic');
const catalogPaths = [
  path.join(root, 'public', 'data', 'studies.json'),
  path.join(root, 'extensions', 'radiology-workflow', 'src', 'data', 'studies.json'),
];
const rows = 96;
const columns = 96;
const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const orientations = {
  axial: {
    row: [1, 0, 0],
    column: [0, 1, 0],
    normal: [0, 0, 1],
  },
  coronal: {
    row: [1, 0, 0],
    column: [0, 0, -1],
    normal: [0, 1, 0],
  },
  sagittal: {
    row: [0, 1, 0],
    column: [0, 0, -1],
    normal: [-1, 0, 0],
  },
};

function uid(seed) {
  const digest = crypto.createHash('sha256').update(`medical-viewer-demo:${seed}`).digest();
  const value = BigInt(`0x${digest.subarray(0, 16).toString('hex')}`);
  return `2.25.${value}`;
}

function add(left, right) {
  return left.map((value, index) => value + right[index]);
}

function scale(vector, amount) {
  return vector.map(value => value * amount);
}

function squaredEllipsoid(x, y, z, center, radii) {
  return (
    ((x - center[0]) / radii[0]) ** 2 +
    ((y - center[1]) / radii[1]) ** 2 +
    ((z - center[2]) / radii[2]) ** 2
  );
}

function phantomKind(definition) {
  if (['HEAD', 'BRAIN'].includes(definition.bodyPart)) return 'cranial';
  if (definition.bodyPart === 'CHEST') return 'chest';
  if (['SPINE'].includes(definition.bodyPart)) return 'spine';
  if (['KNEE', 'ANKLE', 'SHOULDER', 'HIP'].includes(definition.bodyPart)) return 'joint';
  return 'abdomen';
}

function physicalExtent(definition, variant) {
  const kind = phantomKind(definition);
  const adjustment = 1 + ((variant % 5) - 2) * 0.035;
  const extents = {
    cranial: [190, 220, 180],
    chest: [360, 300, 340],
    spine: [220, 190, 380],
    joint: [190, 180, 240],
    abdomen: [360, 300, 360],
  };
  return extents[kind].map(value => value * adjustment);
}

function seriesDefinitions(definition, ordinal) {
  if (definition.modality === 'CT') {
    const axialSlices = 64 + (ordinal % 4) * 8;
    const coronalSlices = 60 + (ordinal % 4) * 8;
    return [
      {
        key: 'axial-soft-tissue',
        description: definition.seriesDescription,
        orientation: 'axial',
        slices: axialSlices,
        contrast: 'soft',
        windowCenter: 45,
        windowWidth: 420,
      },
      {
        key: 'coronal-bone-reformat',
        description: `CORONAL ${definition.bodyPart} REFORMAT`,
        orientation: 'coronal',
        slices: coronalSlices,
        contrast: 'bone',
        windowCenter: 450,
        windowWidth: 2200,
      },
    ];
  }

  return [
    {
      key: 'axial-t2',
      description: definition.seriesDescription,
      orientation: 'axial',
      slices: 44 + (ordinal % 3) * 8,
      contrast: 't2',
      windowCenter: 620,
      windowWidth: 1100,
    },
    {
      key: 'sagittal-t1',
      description: `SAG T1 ${definition.bodyPart}`,
      orientation: 'sagittal',
      slices: 36 + (ordinal % 3) * 6,
      contrast: 't1',
      windowCenter: 520,
      windowWidth: 900,
    },
    {
      key: 'coronal-pd',
      description: `COR PD ${definition.bodyPart}`,
      orientation: 'coronal',
      slices: 40 + (ordinal % 3) * 6,
      contrast: 'pd',
      windowCenter: 680,
      windowWidth: 1200,
    },
  ];
}

function geometryForSeries(definition, series, variant) {
  const extent = physicalExtent(definition, variant);
  const orientation = orientations[series.orientation];
  const extentAlong = vector =>
    Math.abs(vector[0]) * extent[0] + Math.abs(vector[1]) * extent[1] + Math.abs(vector[2]) * extent[2];
  const rowCoverage = extentAlong(orientation.column);
  const columnCoverage = extentAlong(orientation.row);
  const sliceCoverage = extentAlong(orientation.normal);
  const rowSpacing = rowCoverage / rows;
  const columnSpacing = columnCoverage / columns;
  const spacingBetweenSlices = sliceCoverage / Math.max(1, series.slices - 1);
  const firstPixel = add(
    add(
      scale(orientation.row, -columnCoverage / 2 + columnSpacing / 2),
      scale(orientation.column, -rowCoverage / 2 + rowSpacing / 2)
    ),
    scale(orientation.normal, -sliceCoverage / 2)
  );

  return {
    extent,
    ...orientation,
    rowSpacing,
    columnSpacing,
    spacingBetweenSlices,
    sliceThickness: spacingBetweenSlices,
    firstPixel,
  };
}

function tissueModel(definition, variant, world) {
  const [x, y, z] = world;
  const kind = phantomKind(definition);
  const extent = physicalExtent(definition, variant);
  const nx = x / (extent[0] / 2);
  const ny = y / (extent[1] / 2);
  const nz = z / (extent[2] / 2);
  const offset = ((variant % 7) - 3) * 0.025;
  let tissue = 'air';
  let density = 0;

  if (kind === 'cranial') {
    const outer = squaredEllipsoid(nx, ny, nz, [offset, 0, 0], [0.82, 0.9, 0.88]);
    const inner = squaredEllipsoid(nx, ny, nz, [offset, 0, 0], [0.72, 0.8, 0.78]);
    if (outer < 1) {
      tissue = inner > 1 ? 'bone' : 'soft';
      density = 1 - Math.min(1, inner);
    }
    const leftVentricle = squaredEllipsoid(nx, ny, nz, [-0.15 + offset, 0.02, 0.05], [0.1, 0.16, 0.28]);
    const rightVentricle = squaredEllipsoid(nx, ny, nz, [0.15 + offset, 0.02, 0.05], [0.1, 0.16, 0.28]);
    if (leftVentricle < 1 || rightVentricle < 1) tissue = 'fluid';
    if (definition.description.includes('SINUS') || definition.description.includes('TEMPORAL')) {
      const sinusLeft = squaredEllipsoid(nx, ny, nz, [-0.25, -0.32, -0.15], [0.16, 0.13, 0.2]);
      const sinusRight = squaredEllipsoid(nx, ny, nz, [0.25, -0.32, -0.15], [0.16, 0.13, 0.2]);
      if (sinusLeft < 1 || sinusRight < 1) tissue = 'air';
    }
  } else if (kind === 'chest') {
    const body = squaredEllipsoid(nx, ny, nz, [0, 0, 0], [0.92, 0.84, 0.96]);
    if (body < 1) {
      tissue = 'soft';
      density = 1 - body;
    }
    const leftLung = squaredEllipsoid(nx, ny, nz, [-0.36 + offset, -0.02, 0], [0.3, 0.55, 0.82]);
    const rightLung = squaredEllipsoid(nx, ny, nz, [0.36 + offset, -0.02, 0], [0.3, 0.55, 0.82]);
    if (leftLung < 1 || rightLung < 1) tissue = 'lung';
    const heart = squaredEllipsoid(nx, ny, nz, [0.08, 0.2, -0.08], [0.23, 0.28, 0.38]);
    if (heart < 1) tissue = 'blood';
    const spine = squaredEllipsoid(nx, ny, nz, [0, 0.62, 0], [0.11, 0.12, 0.88]);
    if (spine < 1) tissue = 'bone';
  } else if (kind === 'joint') {
    const envelope = squaredEllipsoid(nx, ny, nz, [0, 0, 0], [0.78, 0.74, 0.94]);
    if (envelope < 1) {
      tissue = 'soft';
      density = 1 - envelope;
    }
    const jointShift = definition.bodyPart === 'SHOULDER' ? 0.18 : -0.08;
    const upperBone = squaredEllipsoid(nx, ny, nz, [-0.17 + offset, jointShift, -0.38], [0.24, 0.28, 0.5]);
    const lowerBone = squaredEllipsoid(nx, ny, nz, [0.17 - offset, -jointShift, 0.38], [0.27, 0.25, 0.5]);
    if (upperBone < 1 || lowerBone < 1) tissue = 'bone';
    const jointSpace = squaredEllipsoid(nx, ny, nz, [0, 0, 0], [0.47, 0.42, 0.09]);
    if (jointSpace < 1) tissue = 'fluid';
    const tendon = squaredEllipsoid(nx, ny, nz, [0.5, -0.12, 0.02], [0.07, 0.16, 0.72]);
    if (tendon < 1) tissue = 'tendon';
  } else if (kind === 'spine') {
    const envelope = squaredEllipsoid(nx, ny, nz, [0, 0, 0], [0.78, 0.82, 0.98]);
    if (envelope < 1) tissue = 'soft';
    const levelWave = Math.cos((nz + 1) * Math.PI * (5 + (variant % 3)));
    const vertebralBody = squaredEllipsoid(nx, ny, 0, [0, 0.2, 0], [0.31, 0.27, 1]);
    if (vertebralBody < 1 && levelWave > -0.45) tissue = 'bone';
    const canal = squaredEllipsoid(nx, ny, 0, [0, -0.02, 0], [0.11, 0.13, 1]);
    if (canal < 1) tissue = 'fluid';
    const processes = squaredEllipsoid(nx, ny, 0, [0, -0.34, 0], [0.09, 0.29, 1]);
    if (processes < 1 && levelWave > -0.2) tissue = 'bone';
  } else {
    const body = squaredEllipsoid(nx, ny, nz, [0, 0, 0], [0.94, 0.84, 0.96]);
    if (body < 1) {
      tissue = 'soft';
      density = 1 - body;
    }
    const liver = squaredEllipsoid(nx, ny, nz, [0.3 + offset, -0.08, -0.1], [0.42, 0.36, 0.42]);
    if (liver < 1) tissue = 'organ';
    const leftKidney = squaredEllipsoid(nx, ny, nz, [-0.42, 0.16, 0.02], [0.13, 0.16, 0.28]);
    const rightKidney = squaredEllipsoid(nx, ny, nz, [0.42, 0.16, 0.02], [0.13, 0.16, 0.28]);
    if (leftKidney < 1 || rightKidney < 1) tissue = 'fluid';
    const spine = squaredEllipsoid(nx, ny, nz, [0, 0.56, 0], [0.11, 0.12, 0.72]);
    if (spine < 1) tissue = 'bone';
    const bowel = Math.sin(nx * 18 + variant) + Math.cos(ny * 17 - nz * 5);
    if (body < 0.55 && bowel > 1.45) tissue = definition.description.includes('COLON') ? 'air' : 'fluid';
  }

  return { tissue, density };
}

function intensityFor(definition, series, variant, world, pixelSeed) {
  const { tissue, density } = tissueModel(definition, variant, world);
  const noise = ((pixelSeed * 37 + variant * 53) % 31) - 15;

  if (definition.modality === 'CT') {
    const huByTissue = {
      air: -1000,
      lung: -760,
      fluid: 12,
      soft: 42 + density * 38,
      blood: 70,
      organ: 82,
      tendon: 110,
      bone: series.contrast === 'bone' ? 1250 : 920,
    };
    const hu = huByTissue[tissue] + noise * (series.contrast === 'bone' ? 1.8 : 1);
    return Math.max(0, Math.min(4095, Math.round(hu + 1024)));
  }

  const mrByContrast = {
    t1: { air: 0, lung: 20, fluid: 260, soft: 780, blood: 520, organ: 690, tendon: 130, bone: 80 },
    t2: { air: 0, lung: 15, fluid: 1450, soft: 720, blood: 980, organ: 840, tendon: 180, bone: 55 },
    pd: { air: 0, lung: 15, fluid: 1120, soft: 860, blood: 900, organ: 920, tendon: 260, bone: 65 },
  };
  const value = mrByContrast[series.contrast][tissue] + density * 120 + noise * 2;
  return Math.max(0, Math.min(4095, Math.round(value)));
}

function pixelData(definition, series, geometry, variant, sliceIndex) {
  const pixels = new Uint16Array(rows * columns);
  const sliceOrigin = add(geometry.firstPixel, scale(geometry.normal, sliceIndex * geometry.spacingBetweenSlices));

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const world = add(
        add(sliceOrigin, scale(geometry.row, columnIndex * geometry.columnSpacing)),
        scale(geometry.column, rowIndex * geometry.rowSpacing)
      );
      const pixelSeed = sliceIndex * rows * columns + rowIndex * columns + columnIndex;
      pixels[rowIndex * columns + columnIndex] = intensityFor(
        definition,
        series,
        variant,
        world,
        pixelSeed
      );
    }
  }

  return { pixels, imagePositionPatient: sliceOrigin };
}

function fixedNumbers(values) {
  return values.map(value => Number(value.toFixed(6)));
}

function writeInstance(definition, identifiers, series, geometry, variant, sliceIndex, directory) {
  const sopInstanceUID = uid(`${definition.key}:${series.key}:instance:${sliceIndex + 1}`);
  const sopClassUID =
    definition.modality === 'CT'
      ? '1.2.840.10008.5.1.4.1.1.2'
      : '1.2.840.10008.5.1.4.1.1.4';
  const transferSyntaxUID = '1.2.840.10008.1.2.1';
  const { pixels, imagePositionPatient } = pixelData(
    definition,
    series,
    geometry,
    variant,
    sliceIndex
  );
  const pixelBuffer = pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength);
  const imageOrientationPatient = [...geometry.row, ...geometry.column];
  const dataset = {
    _vrMap: { PixelData: 'OW' },
    ImageType: ['DERIVED', 'PRIMARY', series.orientation.toUpperCase()],
    SOPClassUID: sopClassUID,
    SOPInstanceUID: sopInstanceUID,
    StudyInstanceUID: identifiers.studyInstanceUID,
    SeriesInstanceUID: identifiers.seriesInstanceUID,
    FrameOfReferenceUID: identifiers.frameOfReferenceUID,
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
    SeriesNumber: identifiers.seriesNumber,
    AcquisitionNumber: identifiers.seriesNumber,
    SeriesDescription: series.description,
    ProtocolName: series.description,
    BodyPartExamined: definition.bodyPart,
    InstanceNumber: sliceIndex + 1,
    ImagePositionPatient: fixedNumbers(imagePositionPatient),
    ImageOrientationPatient: imageOrientationPatient,
    SliceThickness: Number(geometry.sliceThickness.toFixed(6)),
    SpacingBetweenSlices: Number(geometry.spacingBetweenSlices.toFixed(6)),
    PixelSpacing: [
      Number(geometry.rowSpacing.toFixed(6)),
      Number(geometry.columnSpacing.toFixed(6)),
    ],
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    Rows: rows,
    Columns: columns,
    BitsAllocated: 16,
    BitsStored: 12,
    HighBit: 11,
    PixelRepresentation: 0,
    WindowCenter: series.windowCenter,
    WindowWidth: series.windowWidth,
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
    ImplementationVersionName: 'SYNTH_VOLUME_1',
  };
  const dicom = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  dicom.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  const filename = `${String(sliceIndex + 1).padStart(3, '0')}.dcm`;
  fs.writeFileSync(path.join(directory, filename), Buffer.from(dicom.write()));

  return { sopInstanceUID, filename };
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const studies = definitions.map((definition, index) => {
  const ordinal = index + 1;
  const studyInstanceUID = uid(`${definition.key}:study`);
  const frameOfReferenceUID = uid(`${definition.key}:frame-of-reference`);
  const accessionNumber = `DEMO-${definition.studyDate}-${String(ordinal).padStart(3, '0')}`;
  const series = seriesDefinitions(definition, ordinal).map((seriesDefinition, seriesIndex) => {
    const seriesNumber = seriesIndex + 1;
    const seriesInstanceUID = uid(`${definition.key}:series:${seriesNumber}`);
    const geometry = geometryForSeries(definition, seriesDefinition, ordinal);
    const directory = path.join(outputRoot, definition.key, seriesDefinition.key);
    fs.mkdirSync(directory, { recursive: true });
    const instances = Array.from({ length: seriesDefinition.slices }, (_, sliceIndex) =>
      writeInstance(
        definition,
        {
          ordinal,
          studyInstanceUID,
          frameOfReferenceUID,
          accessionNumber,
          seriesInstanceUID,
          seriesNumber,
        },
        seriesDefinition,
        geometry,
        ordinal,
        sliceIndex,
        directory
      )
    );
    const relativeDirectory = `/dicom/synthetic/${definition.key}/${seriesDefinition.key}`;

    return {
      key: seriesDefinition.key,
      seriesInstanceUID,
      frameOfReferenceUID,
      seriesNumber,
      description: seriesDefinition.description,
      orientation: seriesDefinition.orientation,
      rows,
      columns,
      slices: seriesDefinition.slices,
      sliceThickness: Number(geometry.sliceThickness.toFixed(6)),
      spacingBetweenSlices: Number(geometry.spacingBetweenSlices.toFixed(6)),
      pixelSpacing: [
        Number(geometry.rowSpacing.toFixed(6)),
        Number(geometry.columnSpacing.toFixed(6)),
      ],
      imageOrientationPatient: [...geometry.row, ...geometry.column],
      sopInstanceUIDs: instances.map(instance => instance.sopInstanceUID),
      imagePaths: instances.map(instance => `${relativeDirectory}/${instance.filename}`),
    };
  });
  const primarySeries = series[0];
  const instanceCount = series.reduce((sum, item) => sum + item.slices, 0);

  return {
    ...definition,
    ordinal,
    studyInstanceUID,
    frameOfReferenceUID,
    accessionNumber,
    rows: primarySeries.rows,
    columns: primarySeries.columns,
    slices: primarySeries.slices,
    seriesDescription: primarySeries.description,
    seriesInstanceUID: primarySeries.seriesInstanceUID,
    sopInstanceUIDs: primarySeries.sopInstanceUIDs,
    numberOfStudyRelatedInstances: instanceCount,
    numberOfStudyRelatedSeries: series.length,
    series,
  };
});

for (const catalogPath of catalogPaths) {
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  fs.writeFileSync(catalogPath, `${JSON.stringify(studies, null, 2)}\n`);
}

const totalSeries = studies.reduce((sum, study) => sum + study.series.length, 0);
const totalInstances = studies.reduce((sum, study) => sum + study.numberOfStudyRelatedInstances, 0);
console.log(`Generated ${studies.length} studies, ${totalSeries} series, and ${totalInstances} DICOM instances.`);
