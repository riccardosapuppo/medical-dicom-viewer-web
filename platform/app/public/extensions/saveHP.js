const generateRandomString = length => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

const saveHP = () => {
  // Starting from a base configuration
  let baseHP = {
    id: `@mdv/favourites`,
    description: 'Apply the hanging protocol for saved favourites',
    name: `customMdv`,
    createdDate: '2021-02-23T19:22:08.894Z',
    modifiedDate: '2022-10-04T19:22:08.894Z',
    availableTo: {},
    editableBy: {},
    imageLoadStrategy: 'interleaveTopToBottom',
    protocolMatchingRules: [
      {
        // attribute: 'ModalitiesInStudy',
        // constraint: {
        //   contains: ['CT', 'PT'],
        // },
      },
    ],
    displaySetSelectors: {
      DisplaySet0: {
        seriesMatchingRules: [],
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
        viewports: [],
        createdDate: '2021-02-23T18:32:42.850Z',
      },
    ],
    numberOfPriorsReferenced: -1,
  };

  // ********* Composing baseHP
  // Grid layout -->
  // baseHP.stages[0].viewportStructure.properties.rows = Number(window.layout.split('x')[1]);
  // baseHP.stages[0].viewportStructure.properties.columns = Number(window.layout.split('x')[0]);

  if (!window.favourites || window.favourites.length === 0) {
    window.favouritesHangingProtocol = null;
    return;
  }
  for (let i = 0; i < window.favourites.length; i++) {
    const seriesDescription = window.favourites[i].SeriesDescription;
    const instanceNumber = window.favourites[i].instanceNumber;
    const displaySetKey = `DisplaySet${i}`;
    //Series
    baseHP.displaySetSelectors[displaySetKey] = {};
    baseHP.displaySetSelectors[displaySetKey].seriesMatchingRules = [
      {
        attribute: 'SeriesDescription',
        constraint: {
          contains: seriesDescription,
        },
      },
    ];
    baseHP.stages[0].viewports.push({
      viewportOptions: {
        viewportId: `mdv-${i}`,
        viewportType: 'stack',
        orientation: 'sagittal',
        initialImageOptions: {
          index: instanceNumber,
        },
      },
      displaySets: [
        {
          id: `DisplaySet${i}`,
        },
      ],
    });
  }
  window.favouritesHangingProtocol = JSON.parse(JSON.stringify(baseHP));
};

window.saveHP = saveHP;

export default saveHP;
