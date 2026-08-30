import { dicomWebFrameImageId, parseSopInstanceUID, parseStudyInstanceUIDs, querySeriesMetadata, queryStudyInstanceUIDs } from './dicomWeb';

describe('same-origin DICOMweb query', () => {
  it('reads Study Instance UIDs from DICOM JSON', () => {
    expect(parseStudyInstanceUIDs([{ '0020000D': { vr: 'UI', Value: ['2.25.123'] } }, { '0020000D': { vr: 'UI', Value: ['2.25.456'] } }])).toEqual(['2.25.123', '2.25.456']);
  });

  it('uses the same-origin proxy path', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ '0020000D': { Value: ['2.25.123'] } }]), { status: 200 })) as typeof fetch;
    await expect(queryStudyInstanceUIDs(fetcher)).resolves.toEqual(['2.25.123']);
    expect(fetcher).toHaveBeenCalledWith('/dicom-web/studies?limit=100', expect.any(Object));
  });

  it('builds WADO-RS frame identifiers and loads same-origin series metadata', async () => {
    expect(dicomWebFrameImageId('http://localhost:3000', '2.25.1', '2.25.2', '2.25.3'))
      .toBe('wadors:http://localhost:3000/dicom-web/studies/2.25.1/series/2.25.2/instances/2.25.3/frames/1');
    const metadata = { '00080018': { Value: ['2.25.3'] } };
    const fetcher = vi.fn(async () => new Response(JSON.stringify([metadata]), { status: 200 })) as typeof fetch;
    await expect(querySeriesMetadata('2.25.1', '2.25.2', fetcher)).resolves.toEqual([metadata]);
    expect(fetcher).toHaveBeenCalledWith('/dicom-web/studies/2.25.1/series/2.25.2/metadata', expect.any(Object));
    expect(parseSopInstanceUID(metadata)).toBe('2.25.3');
  });
});
