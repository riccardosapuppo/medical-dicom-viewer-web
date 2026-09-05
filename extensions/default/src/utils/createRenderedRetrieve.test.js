import createRenderedRetrieve from './createRenderedRetrieve';

/**
 * The two inherited cases below expect the bare URL, and they are right: this
 * fork appends an `aetitle` only when the page it is opened from supplies one,
 * which no test does. They were failing because the parameter was appended
 * unconditionally, so the assertion was reading back the string "undefined" —
 * the defect, not a stale expectation. The case at the end is the fork's own
 * addition, and it is here so that removing the parameter would be noticed too.
 */
describe('createRenderedRetrieve', () => {
  const config = {
    wadoRoot: 'https://example.com/wado',
  };

  const params = {
    instance: {
      StudyInstanceUID: 'study-uid',
      SeriesInstanceUID: 'series-uid',
      SOPInstanceUID: 'sop-uid',
    },
  };

  it('should return the rendered URL for PixelData tag', () => {
    const result = createRenderedRetrieve(config, {
      ...params,
      tag: 'PixelData',
    });

    expect(result).toBe(
      'https://example.com/wado/studies/study-uid/series/series-uid/instances/sop-uid/rendered'
    );
  });

  it('should return the rendered URL for EncapsulatedDocument tag', () => {
    const result = createRenderedRetrieve(config, {
      ...params,
      tag: 'EncapsulatedDocument',
    });

    expect(result).toBe(
      'https://example.com/wado/studies/study-uid/series/series-uid/instances/sop-uid/rendered'
    );
  });

  it('should carry the AE title when the page supplies one', () => {
    window.mdvAETitle = 'DEMO';

    try {
      const result = createRenderedRetrieve({ ...config }, { ...params, tag: 'PixelData' });

      expect(result).toBe(
        'https://example.com/wado/studies/study-uid/series/series-uid/instances/sop-uid/rendered?aetitle=DEMO'
      );
    } finally {
      delete window.mdvAETitle;
    }
  });

  it('should return undefined for unknown tag', () => {
    const result = createRenderedRetrieve(config, {
      ...params,
      tag: 'UnknownTag',
    });

    expect(result).toBeUndefined();
  });
});
