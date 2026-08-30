export type Modality = 'CT' | 'MR';
export type SeriesOrientation = 'axial' | 'coronal' | 'sagittal';

export interface StudySeries {
  key: string;
  seriesInstanceUID: string;
  frameOfReferenceUID: string;
  seriesNumber: number;
  description: string;
  orientation: SeriesOrientation;
  rows: number;
  columns: number;
  slices: number;
  sliceThickness: number;
  spacingBetweenSlices: number;
  pixelSpacing: [number, number];
  imageOrientationPatient: [number, number, number, number, number, number];
  sopInstanceUIDs: string[];
  imagePaths: string[];
}

export interface Study {
  key: string;
  patientName: string;
  patientId: string;
  birthYear: string;
  sex: 'F' | 'M' | 'O';
  studyDate: string;
  studyTime: string;
  modality: Modality;
  description: string;
  bodyPart: string;
  slices: number;
  seriesDescription: string;
  ordinal: number;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  accessionNumber: string;
  rows: number;
  columns: number;
  numberOfStudyRelatedInstances: number;
  numberOfStudyRelatedSeries: number;
  sopInstanceUIDs: string[];
  series: StudySeries[];
}

export function isUid225(value: string) {
  return /^2\.25\.[1-9]\d{0,38}$/.test(value);
}
