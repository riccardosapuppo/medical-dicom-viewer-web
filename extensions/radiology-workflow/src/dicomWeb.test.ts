import { parseStudyInstanceUIDs, queryStudyInstanceUIDs } from './dicomWeb';

describe('same-origin DICOMweb query', () => {
  it('reads Study Instance UIDs from DICOM JSON', () => {
    expect(parseStudyInstanceUIDs([{ '0020000D': { vr: 'UI', Value: ['2.25.123'] } }, { '0020000D': { vr: 'UI', Value: ['2.25.456'] } }])).toEqual(['2.25.123', '2.25.456']);
  });

  it('uses the same-origin proxy path', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ '0020000D': { Value: ['2.25.123'] } }]), { status: 200 })) as typeof fetch;
    await expect(queryStudyInstanceUIDs(fetcher)).resolves.toEqual(['2.25.123']);
    expect(fetcher).toHaveBeenCalledWith('/dicom-web/studies?limit=100', expect.any(Object));
  });
});

