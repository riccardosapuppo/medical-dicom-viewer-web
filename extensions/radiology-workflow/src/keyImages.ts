import type { Study } from '../../../src/domain/study';

export interface Point {
  x: number;
  y: number;
}

export interface LengthAnnotation {
  start: Point;
  end: Point;
  label: string;
}

export interface KeyImage {
  id: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  instanceNumber: number;
  patientName: string;
  patientId: string;
  studyDescription: string;
  modality: string;
  capturedAt: string;
  annotation?: LengthAnnotation;
}

export function captureKeyImage(study: Study, sliceIndex: number, annotation?: LengthAnnotation, capturedAt = new Date().toISOString()): KeyImage {
  return {
    id: study.sopInstanceUIDs[sliceIndex],
    studyInstanceUID: study.studyInstanceUID,
    seriesInstanceUID: study.seriesInstanceUID,
    sopInstanceUID: study.sopInstanceUIDs[sliceIndex],
    instanceNumber: sliceIndex + 1,
    patientName: study.patientName,
    patientId: study.patientId,
    studyDescription: study.description,
    modality: study.modality,
    capturedAt,
    ...(annotation ? { annotation: structuredClone(annotation) } : {}),
  };
}

export function annotationLength(annotation: LengthAnnotation, width: number, height: number) {
  const x = (annotation.end.x - annotation.start.x) * width;
  const y = (annotation.end.y - annotation.start.y) * height;
  return Math.sqrt(x * x + y * y);
}

