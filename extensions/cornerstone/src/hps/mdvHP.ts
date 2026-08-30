export const mdvHP = {
  id: 'mdvHP',
  locked: true,
  name: 'mdvHP',
  icon: 'layout-advanced-axial-primary',
  isPreset: true,
  createdDate: '2021-02-23T19:22:08.894Z',
  modifiedDate: '2022-10-04T19:22:08.894Z',
  availableTo: {},
  editableBy: {},
  imageLoadStrategy: 'interleaveTopToBottom',
  protocolMatchingRules: [{}],
  displaySetSelectors: {
    DisplaySet0: {
      seriesMatchingRules: [
        {
          attribute: 'SeriesDescription',
          constraint: {
            contains: 'Body 5.0 Lung I+ CE',
          },
        },
      ],
    },
    DisplaySet1: {
      seriesMatchingRules: [
        {
          attribute: 'SeriesDescription',
          constraint: {
            contains: 'Body 5.0 Lung I+ CE',
          },
        },
      ],
    },
  },
  stages: [
    {
      id: 'hYbmMy3b7pz7GLiaT',
      name: 'default',
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 2,
        },
      },
      viewports: [
        {
          viewportOptions: {
            viewportId: 'mdv-0',
            toolGroupId: 'default',
            viewportType: 'stack',
            initialImageOptions: {
              index: 7,
            },
          },
          displaySets: [
            {
              id: 'DisplaySet0',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mdv-1',
            toolGroupId: 'default',
            viewportType: 'stack',
            initialImageOptions: {
              index: 19,
            },
          },
          displaySets: [
            {
              id: 'DisplaySet1',
            },
          ],
        },
      ],
      createdDate: '2021-02-23T18:32:42.850Z',
    },
  ],
  numberOfPriorsReferenced: -1,
};
