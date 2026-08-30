const studyInstanceUIDTag = '0020000D';
const sopInstanceUIDTag = '00080018';

interface DicomJsonAttribute {
  Value?: unknown[];
}

export type DicomJsonObject = Record<string, DicomJsonAttribute>;

export function parseStudyInstanceUIDs(payload: unknown) {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const value = (item as DicomJsonObject)[studyInstanceUIDTag]?.Value?.[0];
    return typeof value === 'string' ? [value] : [];
  });
}

export function dicomWebFrameImageId(origin: string, studyInstanceUID: string, seriesInstanceUID: string, sopInstanceUID: string) {
  const path = `/dicom-web/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances/${sopInstanceUID}/frames/1`;
  return `wadors:${new URL(path, origin).href}`;
}

export function parseSopInstanceUID(metadata: DicomJsonObject) {
  const value = metadata[sopInstanceUIDTag]?.Value?.[0];
  return typeof value === 'string' ? value : undefined;
}

export async function querySeriesMetadata(studyInstanceUID: string, seriesInstanceUID: string, fetcher: typeof fetch = fetch) {
  const path = `/dicom-web/studies/${studyInstanceUID}/series/${seriesInstanceUID}/metadata`;
  const response = await fetcher(path, { headers: { Accept: 'application/dicom+json' } });
  if (!response.ok) throw new Error(`DICOMweb metadata request failed with ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('DICOMweb metadata response is not an array.');
  return payload as DicomJsonObject[];
}

export async function queryStudyInstanceUIDs(fetcher: typeof fetch = fetch) {
  const response = await fetcher('/dicom-web/studies?limit=100', {
    headers: { Accept: 'application/dicom+json' },
  });
  if (!response.ok) throw new Error(`DICOMweb query failed with ${response.status}`);
  return parseStudyInstanceUIDs(await response.json());
}
