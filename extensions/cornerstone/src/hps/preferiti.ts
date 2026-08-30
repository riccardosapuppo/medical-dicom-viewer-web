import { Types } from '@ohif/core';
export const preferiti: Types.HangingProtocol.Protocol = {
  id: '@_mdv/preferiti',
  descrition: 'Applica HP per i preferiti salvati',
  name: 'Preferiti',
  icon: 'layout-advanced-axial-primary',
  isPreset: true,
  createdDate: '2023-03-15T10:29:44.894Z',
  modifiedDate: '2023-03-15T10:29:44.894Z',
  availableTo: {},
  editableBy: {},
  imageLoadStrategy: 'interleaveTopToBottom',
  protocolMatchingRules: [],
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
            contains: 'Lung 5.0 Lung I+ CE',
          },
        },
      ],
    },
    DisplaySet2: {
      seriesMatchingRules: [{}],
    },
    DisplaySet3: {
      seriesMatchingRules: [{}],
    },
    DisplaySet4: {
      seriesMatchingRules: [{}],
    },
    DisplaySet5: {
      seriesMatchingRules: [{}],
    },
    DisplaySet6: {
      seriesMatchingRules: [{}],
    },
    DisplaySet7: {
      seriesMatchingRules: [{}],
    },
    DisplaySet8: {
      seriesMatchingRules: [{}],
    },
    DisplaySet9: {
      seriesMatchingRules: [{}],
    },
    DisplaySet10: {
      seriesMatchingRules: [{}],
    },
    DisplaySet11: {
      seriesMatchingRules: [{}],
    },
    DisplaySet12: {
      seriesMatchingRules: [{}],
    },
    DisplaySet13: {
      seriesMatchingRules: [{}],
    },
    DisplaySet14: {
      seriesMatchingRules: [{}],
    },
    DisplaySet15: {
      seriesMatchingRules: [{}],
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
          columns: 3,
        },
      },
      viewports: [
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
            initialImageOptions: {
              index: '1',
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
            viewportType: 'stack',
            orientation: 'sagittal',
            initialImageOptions: {
              index: '4',
            },
          },
          displaySets: [
            {
              id: 'DisplaySet1',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet2',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet3',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet4',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet5',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet6',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet7',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet8',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet9',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
          },
          displaySets: [
            {
              id: 'DisplaySet10',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
            // initialImageOptions: {
            //   preset: 'middle',
            // },
          },
          displaySets: [
            {
              id: 'DisplaySet11',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
            // initialImageOptions: {
            //   preset: 'middle',
            // },
          },
          displaySets: [
            {
              id: 'DisplaySet12',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
            // initialImageOptions: {
            //   preset: 'middle',
            // },
          },
          displaySets: [
            {
              id: 'DisplaySet13',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
            // initialImageOptions: {
            //   preset: 'middle',
            // },
          },
          displaySets: [
            {
              id: 'DisplaySet14',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
            orientation: 'sagittal',
            // initialImageOptions: {
            //   preset: 'middle',
            // },
          },
          displaySets: [
            {
              id: 'DisplaySet15',
            },
          ],
        },
      ],
      createdDate: '2021-02-23T18:32:42.850Z',
    },
  ],
  numberOfPriorsReferenced: -1,
};
