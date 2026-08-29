const studyInstanceUIDTag = '0020000D';

interface DicomJsonAttribute {
  Value?: unknown[];
}

type DicomJsonStudy = Record<string, DicomJsonAttribute>;

export function parseStudyInstanceUIDs(payload: unknown) {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const value = (item as DicomJsonStudy)[studyInstanceUIDTag]?.Value?.[0];
    return typeof value === 'string' ? [value] : [];
  });
}

export async function queryStudyInstanceUIDs(fetcher: typeof fetch = fetch) {
  const response = await fetcher('/dicom-web/studies?limit=100', {
    headers: { Accept: 'application/dicom+json' },
  });
  if (!response.ok) throw new Error(`DICOMweb query failed with ${response.status}`);
  return parseStudyInstanceUIDs(await response.json());
}

