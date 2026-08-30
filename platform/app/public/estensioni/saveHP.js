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
  //Parto da una configurazione di base
  let baseHP = {
    id: `@mdv/preferiti`,
    description: 'Applica HP per i preferiti salvati',
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

  // ********* Compongo baseHP
  //Layout griglia -->
  // baseHP.stages[0].viewportStructure.properties.rows = Number(window.layout.split('x')[1]);
  // baseHP.stages[0].viewportStructure.properties.columns = Number(window.layout.split('x')[0]);

  if (!window.preferiti || window.preferiti.length === 0) {
    window.hpPreferiti = null;
    return;
  }
  for (let i = 0; i < window.preferiti.length; i++) {
    const descrizioneSerie = window.preferiti[i].DescrizioneSerie;
    const numeroIstanza = window.preferiti[i].NumeroIstanza;
    const displaySetKey = `DisplaySet${i}`;
    //Serie
    baseHP.displaySetSelectors[displaySetKey] = {};
    baseHP.displaySetSelectors[displaySetKey].seriesMatchingRules = [
      {
        attribute: 'SeriesDescription',
        constraint: {
          contains: descrizioneSerie,
        },
      },
    ];
    baseHP.stages[0].viewports.push({
      viewportOptions: {
        viewportId: `mdv-${i}`,
        viewportType: 'stack',
        orientation: 'sagittal',
        initialImageOptions: {
          index: numeroIstanza,
        },
      },
      displaySets: [
        {
          id: `DisplaySet${i}`,
        },
      ],
    });
  }
  window.hpPreferiti = JSON.parse(JSON.stringify(baseHP));
};

window.saveHP = saveHP;

export default saveHP;
