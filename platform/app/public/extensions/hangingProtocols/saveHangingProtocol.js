import { metaData } from '@cornerstonejs/core';
import { fetchPreferencesFromApi } from './loadHangingProtocol';

let uiNotificationService;
let mdvHP = {
  id: 'mdvhp',
  locked: true,
  name: 'Default',
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
      seriesMatchingRules: [
        {
          attribute: 'SeriesDescription',
          constraint: {
            contains: 'MAMMOGRAM, Diagnosis',
          },
        },
      ],
    },
    DisplaySet1: {
      seriesMatchingRules: [{}],
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
            initialImageOptions: {
              index: 3,
            },
          },
          displaySets: [
            {
              options: {
                // colormap: 'hsv',
                camera: {
                  windowWidth: 5,
                  windowCenter: 2.5,
                },
              },
              id: 'DisplaySet0',
            },
          ],
        },
        {
          viewportOptions: {
            viewportType: 'stack',
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

let specificInstances = [];
let seriesLabels = [];

const aetitle = window.mdvAETitle;
const username = window.mdvUsername;
const studyInstanceUIDs = window.mdvStudyInstanceUIDs;
let studyDescription = window.mdvStudyDescription;
let modality = window.mdvModality;

const syncStudyInfo = () => {
  studyDescription = window.mdvStudyDescription || studyDescription || '';
  modality = window.mdvModality || modality || '';
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const tryResolveStudyInfoFromMetadata = () => {
  const displaySetService = window.servicesManager?.services?.displaySetService;
  if (!displaySetService) {
    return false;
  }

  let displaySets = [];
  if (studyInstanceUIDs && displaySetService.getDisplaySetsBy) {
    displaySets =
      displaySetService.getDisplaySetsBy(ds => ds?.StudyInstanceUID === studyInstanceUIDs) || [];
  }

  if (!displaySets.length) {
    displaySets =
      displaySetService.getActiveDisplaySets?.() || displaySetService.activeDisplaySets || [];
  }

  if (!displaySets.length) {
    return false;
  }

  const displaySetWithInstance = displaySets.find(ds => ds?.instances?.length) || displaySets[0];
  const referenceInstance =
    displaySetWithInstance?.instance || displaySetWithInstance?.instances?.[0] || {};

  let changed = false;

  if (!studyDescription) {
    const studyDescriptionFromMetadata =
      referenceInstance?.StudyDescription || displaySetWithInstance?.StudyDescription;
    if (studyDescriptionFromMetadata) {
      studyDescription = studyDescriptionFromMetadata;
      window.mdvStudyDescription = studyDescriptionFromMetadata;
      changed = true;
    }
  }

  if (!modality) {
    const modalities = new Set();
    displaySets.forEach(ds => {
      if (ds?.Modality) {
        modalities.add(ds.Modality);
      } else if (ds?.instances?.[0]?.Modality) {
        modalities.add(ds.instances[0].Modality);
      }
    });
    if (modalities.size) {
      modality = Array.from(modalities).join('\\');
      window.mdvModality = modality;
      changed = true;
    }
  }

  return changed;
};

const ensureStudyInfoFromMetadata = async () => {
  syncStudyInfo();
  if (studyDescription && modality) {
    return;
  }

  const start = Date.now();
  const timeoutMs = 5000;
  const stepMs = 250;

  while (Date.now() - start <= timeoutMs) {
    syncStudyInfo();
    tryResolveStudyInfoFromMetadata();
    syncStudyInfo();
    if (studyDescription && modality) {
      return;
    }
    await wait(stepMs);
  }
};

const normalizza = value => (value || '').toString().trim().toUpperCase();
const normalizzaModality = value =>
  (value || '')
    .toString()
    .split('\\')
    .map(item => normalizza(item))
    .filter(Boolean);

const ensureHpStructure = hp => {
  const safeHp = hp && typeof hp === 'object' ? hp : {};

  if (
    !safeHp.specificStudy ||
    typeof safeHp.specificStudy !== 'object' ||
    Array.isArray(safeHp.specificStudy)
  ) {
    safeHp.specificStudy = {};
  }
  safeHp.examName = Array.isArray(safeHp.examName)
    ? safeHp.examName.filter(item => item && typeof item === 'object')
    : [];
  safeHp.modality = Array.isArray(safeHp.modality)
    ? safeHp.modality.filter(item => item && typeof item === 'object')
    : [];

  return safeHp;
};

const ensurePreferencesPayload = preferencesPayload => {
  const safePayload =
    preferencesPayload && typeof preferencesPayload === 'object' ? preferencesPayload : {};
  if (!safePayload.json || typeof safePayload.json !== 'object') {
    safePayload.json = {};
  }
  safePayload.json.hp = ensureHpStructure(safePayload.json.hp);
  return safePayload;
};

const logHangingProtocolSave = (tipo, entry) => {
  console.log('[HP] Saving', {
    tipo,
    aetitle,
    username,
    studyInstanceUIDs,
    studyDescription,
    modality,
    entry,
  });
};

const getAppliedHpConfig = preferencesJson => {
  syncStudyInfo();
  const hp = preferencesJson?.hp;
  if (!hp) {
    return null;
  }
  if (hp.specificStudy?.[studyInstanceUIDs]) {
    return { tipo: 'specificStudy', entry: hp.specificStudy[studyInstanceUIDs] };
  }
  const normalisedExamName = normalizza(studyDescription);
  const matchExam = (hp.examName || []).find(
    item => normalizza(item?.examName) === normalisedExamName
  );
  if (matchExam) {
    return { tipo: 'examDescription', entry: matchExam };
  }
  const modalityCandidates = normalizzaModality(modality);
  const matchModality = (hp.modality || []).find(item => {
    const savedCandidates = normalizzaModality(item?.modalityName);
    return savedCandidates.some(value => modalityCandidates.includes(value));
  });
  if (matchModality) {
    return { tipo: 'modality', entry: matchModality };
  }
  return null;
};

const parseLayout = (entry = {}) => {
  const layout = entry.gridLayout || entry.protocol?.stages?.[0]?.viewportStructure?.properties;
  if (typeof layout === 'string' && layout.includes('x')) {
    const [columns, rows] = layout.split('x').map(value => Number(value));
    if (Number.isFinite(rows) && Number.isFinite(columns) && rows > 0 && columns > 0) {
      return { rows, columns };
    }
  }
  if (layout && typeof layout === 'object') {
    const rows = Number(layout.rows || 1);
    const columns = Number(layout.columns || 1);
    if (rows > 0 && columns > 0) {
      return { rows, columns };
    }
  }
  return { rows: 1, columns: 1 };
};

const buildGridIconHtml = ({ rows, columns }) => {
  const total = rows * columns;
  const cells = new Array(total).fill(0).map((_, index) => {
    return `<span style="width:8px;height:8px;border:1px solid #8a8a8a;border-radius:2px;display:block"></span>`;
  });
  return `
    <div style="display:grid;grid-template-columns:repeat(${columns},8px);grid-template-rows:repeat(${rows},8px);gap:2px;padding:4px;border:1px solid #333;border-radius:4px;">
      ${cells.join('')}
    </div>
  `;
};

const resolveSeriesLabel = (rule, fallbackIndex) => {
  if (!rule) {
    return { label: 'Series not set' };
  }
  const attribute = rule.attribute;
  const constraint = rule.constraint || {};
  let value = constraint.contains ?? constraint.equals ?? constraint.startsWith ?? '';
  if (Array.isArray(value)) {
    value = value[0];
  }

  if (attribute === 'SeriesInstanceUID' && value) {
    const displaySetService = window.servicesManager?.services?.displaySetService;
    const displaySets = displaySetService?.getDisplaySetsBy?.(
      ds =>
        ds?.SeriesInstanceUID === value ||
        ds?.seriesInstanceUID === value ||
        ds?.instances?.[0]?.SeriesInstanceUID === value
    );
    const displaySet = displaySets?.[0];
    const seriesDescription =
      displaySet?.SeriesDescription || displaySet?.instances?.[0]?.SeriesDescription;
    const seriesNumber = displaySet?.SeriesNumber || displaySet?.instances?.[0]?.SeriesNumber;
    if (seriesDescription || seriesNumber !== undefined) {
      const numberText =
        seriesNumber !== undefined && seriesNumber !== null ? `Series ${seriesNumber}` : 'Series';
      const descrText = seriesDescription ? ` ${seriesDescription}` : '';
      return { label: `${numberText}${descrText}`.trim() };
    }
  }

  if (attribute === 'SeriesDescription') {
    if (value) {
      return { label: `Series ${value}` };
    }
    if (typeof fallbackIndex === 'number') {
      const displaySetService = window.servicesManager?.services?.displaySetService;
      const studyId = window.mdvStudyInstanceUIDs;
      const displaySets = displaySetService?.getDisplaySetsBy?.(ds => ds?.StudyInstanceUID === studyId);
      if (displaySets?.length) {
        const sorted = [...displaySets].sort((a, b) => (a.SeriesNumber || 0) - (b.SeriesNumber || 0));
        const ds = sorted[fallbackIndex];
        const dsDesc = ds?.SeriesDescription || ds?.instances?.[0]?.SeriesDescription;
        const dsNum = ds?.SeriesNumber || ds?.instances?.[0]?.SeriesNumber;
        if (dsDesc || dsNum !== undefined) {
          const numberText = dsNum !== undefined && dsNum !== null ? `Series ${dsNum}` : 'Series';
          const descrText = dsDesc ? ` ${dsDesc}` : '';
          return { label: `${numberText}${descrText}`.trim() };
        }
      }
    }
    return { label: 'Series with no description' };
  }
  if (attribute === 'SeriesNumber') {
    if (value !== '' && value !== undefined && value !== null) {
      const displaySetService = window.servicesManager?.services?.displaySetService;
      const studyId = window.mdvStudyInstanceUIDs;
      const displaySets = displaySetService?.getDisplaySetsBy?.(ds => ds?.StudyInstanceUID === studyId);
      const match = displaySets?.find(ds => String(ds.SeriesNumber) === String(value));
      const desc = match?.SeriesDescription || match?.instances?.[0]?.SeriesDescription;
      if (desc) {
        return { label: `Series ${value} ${desc}` };
      }
      return { label: `Series ${value}` };
    }
    return { label: 'Series' };
  }

  if (value) {
    return { label: `${attribute || 'Series'} ${value}`.trim() };
  }
  return { label: attribute || 'Series' };
};

const buildSavedConfigHtml = (tipo, entry) => {
  if (!entry) {
    return `<div style="color:#bbb;">No saved configuration applies here.</div>`;
  }

  const { rows, columns } = parseLayout(entry);
  const totalCells = rows * columns;
  const protocol = entry.protocol || {};
  const viewports = protocol?.stages?.[0]?.viewports || [];
  const displaySetSelectors = protocol?.displaySetSelectors || {};
  const specificInstances = entry.specificInstances || [];
  const seriesLabels = entry.seriesLabels || [];

  const typeLabel =
    tipo === 'specificStudy'
      ? 'Active for: this study'
      : tipo === 'examDescription'
        ? 'Active for: exam description'
        : tipo === 'modality'
          ? 'Active for: modality'
          : 'Configuration';

  const typeValue =
    tipo === 'specificStudy'
      ? studyInstanceUIDs
      : tipo === 'examDescription'
        ? studyDescription || ''
        : tipo === 'modality'
          ? modality || ''
          : '';

  const header = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      ${buildGridIconHtml({ rows, columns })}
      <div>
        <div style="font-weight:600;color:#e5e5e5;">${typeLabel}${typeValue ? `: ${typeValue}` : ''}</div>
        <div style="color:#b3b3b3;">Grid: ${columns}x${rows}</div>
      </div>
    </div>
  `;

  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const viewport = viewports[i];
    const displaySetId = viewport?.displaySets?.[0]?.id || `DisplaySet${i}`;
    const rule = displaySetSelectors?.[displaySetId]?.seriesMatchingRules?.[0];
    const savedLabel = seriesLabels[i];
    const { label: ruleLabel } = resolveSeriesLabel(rule, i);
    const label = savedLabel || ruleLabel;
    const instance = specificInstances[i];
    const row = Math.floor(i / columns) + 1;
    const col = (i % columns) + 1;
    const instanceText = instance ? ` - Instance ${instance}` : '';
    cells.push(`
      <div style="padding:4px 0;color:#ddd;">
        <span style="display:inline-block;min-width:48px;color:#9aa0a6;">${row},${col}</span>
        ${label}${instanceText}
      </div>
    `);
  }

  return `
    ${header}
    <div style="border-top:1px solid #212832;padding-top:6px;">
      ${cells.join('')}
    </div>
  `;
};

const renderSavedConfig = preferencesJson => {
  const container = document.getElementById('hp-saved-config-body');
  if (!container) {
    return;
  }
  const match = getAppliedHpConfig(preferencesJson);
  if (!match) {
    container.innerHTML = buildSavedConfigHtml(null, null);
    return;
  }
  container.innerHTML = buildSavedConfigHtml(match.tipo, match.entry);
};
async function saveHangingProtocol() {
  await ensureStudyInfoFromMetadata();
  await creaDIV();
}

function currentlySavedHangingProtocols() {
  syncStudyInfo();
  const activeConfig = [];
  const key = `userPreferences-${aetitle}`;
  const cachedRaw = localStorage.getItem(key);
  if (!cachedRaw) {
    return activeConfig;
  }
  let cachedPreferences;
  try {
    cachedPreferences = JSON.parse(cachedRaw);
  } catch (err) {
    console.warn('The cached hanging protocol preferences are not valid', err);
    return activeConfig;
  }

  const hp = ensureHpStructure(cachedPreferences?.hp);
  const userPreferencesForThisStudy = hp.specificStudy;
  const userPreferencesByExam = hp.examName;
  const userPreferencesByModality = hp.modality;
  if (userPreferencesForThisStudy[studyInstanceUIDs]) {
    activeConfig.push('specificStudy');
  }

  for (let i = 0; i < userPreferencesByExam.length; i++) {
    if (userPreferencesByExam[i]?.examName === studyDescription) {
      activeConfig.push('examDescription');
    }
  }

  for (let i = 0; i < userPreferencesByModality.length; i++) {
    if (modality !== '' && userPreferencesByModality[i]?.modalityName === modality) {
      activeConfig.push('modality');
    }
  }
  return activeConfig;
}

async function creaDIV() {
  await ensureStudyInfoFromMetadata();
  //Toggle
  if (document.getElementById('menu-hp')) {
    document.getElementById('menu-hp').remove();
    return;
  }

  const activeConfig = currentlySavedHangingProtocols(); // Which hanging protocols this study already has

  const menuHP = /*html*/ `
  <div id="menu-hp">
  <button id="close-hp">X</button>
  <h2>Hanging protocols</h2>
  <div id="info">
  <p>Modality: <span>${modality}</span></p>
  <p>Exam: <span>${studyDescription}</span></p>
  <p style=${activeConfig.length > 0 ? 'color:#e9e9e9;display:block' : 'display:none'}>🟢 Hanging protocols are applied for this study </p>
  </div>

  <div style="margin-top:12px;border-top:1px solid #212832;padding-top:10px;">
    <button id="toggle-hp-saved-config" style="background:#1f1f1f;border:1px solid #333;color:#e5e5e5;padding:6px 10px;border-radius:4px;cursor:pointer;">
      Show the saved configuration
    </button>
    <div id="hp-saved-config-body" style="display:none;margin-top:10px;"></div>
  </div>

  <div style="display:flex;margin-top: 10px;">
  <div class="hp-option">
  <h3 style>Save the current arrangement for this <span style="color:#38bdf8">study</span> only</h3>
  <p>The hanging protocols will apply to this study alone</p>
  <p style="color:red;display:none" id="hp-studiospecifico-presente">There is a configuration saved for this study alone </p>
  <button id="save-hp-config-actual-study">${activeConfig.includes('specificStudy') ? 'Overwrite the current configuration' : 'Save for this study only'}</button>
  <button style=${activeConfig.includes('specificStudy') ? 'display:block' : 'display:none'} class="delete-hp-btn" id="delete-hp-config-actual-study">Delete the saved configuration</button>
  </div>

  <div class="hp-option">
  <h3>Save the current arrangement for this kind of <span style="color:#38bdf8">exam</span></h3>
  <p>The hanging protocols will apply to every exam described as <span style="font-weight: 600;">${studyDescription}</span></p>
  <p style="color:red;display:none" id="hp-descrizioneesame-presente">There is a configuration saved for every exam described as "${studyDescription}" </p>
  <p style="color:red;display:none" id="unnamed-exam">This exam has no name, so a configuration saved here will apply to every unnamed exam. </p>
  <button id="save-hp-config-exam">${activeConfig.includes('examDescription') ? 'Overwrite the current configuration' : 'Save for this kind of exam'} </button>
  <button style=${activeConfig.includes('examDescription') ? 'display:block' : 'display:none'} class="delete-hp-btn" id="delete-hp-config-exam">Delete the saved configuration</button>
  </div>

  <div style="margin-right:0" class="hp-option">
  <h3>Save the current arrangement for this <span style="color:#38bdf8">modality</span></h3>
  <p>The hanging protocols will apply to every exam of modality <span style="font-weight: 600;">${modality}</span></p>
  <p style="color:red;display:none" id="hp-modality-presente">There is a configuration saved for this modality</p>
  <button id="save-hp-config-modality">${activeConfig.includes('modality') ? 'Overwrite the current configuration' : 'Save for this modality'}</button>
  <button style=${activeConfig.includes('modality') ? 'display:block' : 'display:none'} class="delete-hp-btn" id="delete-hp-config-modality">Delete the saved configuration</button>
  </div>

  </div>
  </div>
  </div>
  `;

  // document.querySelector('.toolbar-below').style.filter = 'blur(2px) brightness(0.5)';
  document.body.insertAdjacentHTML('afterend', menuHP);

  //listener pulsanti
  const saveSpecificStudyBtn = document.getElementById('save-hp-config-actual-study');
  const saveConfigExamBtn = document.getElementById('save-hp-config-exam');
  const saveConfigModalityBtn = document.getElementById('save-hp-config-modality');

  const deleteConfigSpecificStudyBtn = document.getElementById('delete-hp-config-actual-study');
  const deleteConfigExamBtn = document.getElementById('delete-hp-config-exam');
  const deleteConfigModalityBtn = document.getElementById('delete-hp-config-modality');
  const closeHPDivBtn = document.getElementById('close-hp');
  const toggleSavedConfigBtn = document.getElementById('toggle-hp-saved-config');
  const savedConfigBody = document.getElementById('hp-saved-config-body');

  saveSpecificStudyBtn.addEventListener('click', saveSpecificStudy);
  saveConfigExamBtn.addEventListener('click', saveConfigExam);
  saveConfigModalityBtn.addEventListener('click', saveConfigModality);
  deleteConfigSpecificStudyBtn.addEventListener('click', deleteConfigSpecificStudy);
  deleteConfigExamBtn.addEventListener('click', deleteConfigExam);
  deleteConfigModalityBtn.addEventListener('click', deleteConfigModality);

  closeHPDivBtn.addEventListener('click', () => {
    document.getElementById('menu-hp').remove();
  });

  if (toggleSavedConfigBtn && savedConfigBody) {
    toggleSavedConfigBtn.addEventListener('click', () => {
      const isHidden = savedConfigBody.style.display === 'none' || !savedConfigBody.style.display;
      savedConfigBody.style.display = isHidden ? 'block' : 'none';
      toggleSavedConfigBtn.textContent = isHidden
        ? 'Hide the saved configuration'
        : 'Show the saved configuration';
    });
  }

  const remotePreferencesRaw = await fetchPreferencesFromApi(aetitle, username, studyInstanceUIDs);
  if (!remotePreferencesRaw) {
    console.warn('The remote hanging protocol preferences were not fetched');
    let cached = {};
    try {
      cached = JSON.parse(localStorage.getItem(`userPreferences-${aetitle}`) || '{}');
    } catch (err) {
      console.warn('The cached hanging protocol preferences are not valid', err);
    }
    renderSavedConfig(cached);
  } else {
    const remotePreferences = ensurePreferencesPayload(remotePreferencesRaw);
    renderSavedConfig(remotePreferences.json);
  }
  uiNotificationService = window.servicesManager.services.uiNotificationService;
}

async function componiHP(mode) {
  // scope = 'specificStudy', 'examDescription' or 'modality'
  // Get the hanging protocols as they stand right now
  const remotePreferencesRaw = await fetchPreferencesFromApi(aetitle, username, studyInstanceUIDs);
  if (!remotePreferencesRaw) {
    return console.warn('The hanging protocol preferences could not be fetched');
  }
  const remotePreferences = ensurePreferencesPayload(remotePreferencesRaw);
  const currentHangingProtocols = remotePreferences.json.hp;
  seriesLabels = [];
  specificInstances = [];
  mdvHP.stages[0].viewportStructure.properties.rows = Number(window.layout.split('x')[1]);
  mdvHP.stages[0].viewportStructure.properties.columns = Number(window.layout.split('x')[0]);
  const { cornerstoneViewportService, viewportGridService } = window.servicesManager.services;
  const { viewports } = viewportGridService.getState();
  const renderingEngine = cornerstoneViewportService.getRenderingEngine();
  let i = 0;
  let cameraHP = {};
  let cameraByIndex = [];
  viewports.forEach(_viewport => {
    const { viewportId } = _viewport;
    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport || !viewport.element) {
      const displaySetKey = `DisplaySet${i}`;
      if (mdvHP?.displaySetSelectors?.[displaySetKey]) {
        mdvHP.displaySetSelectors[displaySetKey].seriesMatchingRules = [{}];
      }
      specificInstances.push(null);
      seriesLabels.push('Series');
      i += 1;
      return;
    }
    const { element } = viewport;
    const cameraViewport = viewport.getCamera();
    const viewPresentation = viewport.getViewPresentation
      ? viewport.getViewPresentation({ pan: true, zoom: true })
      : null;
    const hpViewportId = `mdvhp-${i}`;
    const cameraData = {
      focalpoint: cameraViewport.focalPoint,
      parallelscale: cameraViewport.parallelScale,
      position: cameraViewport.position,
      viewPresentation,
    };
    cameraHP[hpViewportId] = cameraData;
    cameraByIndex.push(cameraData);
    const seriesDescriptionFromUi =
      element.parentElement.querySelector('[title="Series description"]')?.textContent?.trim() ||
      '';
    const displaySetService = window.servicesManager?.services?.displaySetService;
    const displaySetUIDs =
      viewportGridService.getDisplaySetsUIDsForViewport?.(viewportId) || [];
    const primaryDisplaySet = displaySetUIDs.length
      ? displaySetService?.getDisplaySetByUID?.(displaySetUIDs[0])
      : null;
    const displaySetSeriesInstanceUID =
      primaryDisplaySet?.SeriesInstanceUID ||
      primaryDisplaySet?.seriesInstanceUID ||
      primaryDisplaySet?.instances?.[0]?.SeriesInstanceUID ||
      null;
    const displaySetSeriesNumber =
      primaryDisplaySet?.SeriesNumber ?? primaryDisplaySet?.instances?.[0]?.SeriesNumber ?? null;
    const displaySetSeriesDescription =
      primaryDisplaySet?.SeriesDescription ||
      primaryDisplaySet?.seriesDescription ||
      primaryDisplaySet?.instances?.[0]?.SeriesDescription ||
      '';
    //Estraggo SeriesInstanceUID
    const imageId =
      viewport.csImage?.imageId ||
      (typeof viewport.getCurrentImageId === 'function' ? viewport.getCurrentImageId() : '') ||
      '';
    const match = imageId ? imageId.match(/series\/([^\/]+)/) : null;
    const instanceMeta = imageId ? metaData.get('instance', imageId) : null;
    const seriesInstanceUID = match ? match[1] : displaySetSeriesInstanceUID;
    const seriesNumber = instanceMeta?.SeriesNumber ?? displaySetSeriesNumber;
    const seriesDescriptionFromMeta = instanceMeta?.SeriesDescription || '';
    let seriesDescription =
      seriesDescriptionFromUi || seriesDescriptionFromMeta || displaySetSeriesDescription;
    if (typeof seriesDescription === 'string') {
      seriesDescription = seriesDescription.trim();
    }
    if (!seriesDescription && seriesInstanceUID) {
      const displaySets = displaySetService?.getDisplaySetsForSeries?.(seriesInstanceUID) || [];
      const ds = displaySets[0];
      seriesDescription = ds?.SeriesDescription || ds?.instances?.[0]?.SeriesDescription || '';
    }
    // // //
    let instanceNumber = null;
    if (Number.isFinite(viewport?.currentImageIdIndex)) {
      instanceNumber = viewport.currentImageIdIndex + 1;
    } else if (typeof viewport?.getCurrentImageIdIndex === 'function') {
      const idx = viewport.getCurrentImageIdIndex();
      if (Number.isFinite(idx)) {
        instanceNumber = idx + 1;
      }
    }
    specificInstances.push(instanceNumber);
    const seriesLabel = (() => {
      if (seriesDescription && seriesNumber != null) {
        return `Series ${seriesNumber} ${seriesDescription}`;
      }
      if (seriesDescription) {
        return `Series ${seriesDescription}`;
      }
      if (seriesNumber != null) {
        return `Series ${seriesNumber}`;
      }
      return 'Series';
    })();
    seriesLabels.push(seriesLabel);
    const displaySetKey = `DisplaySet${i}`;
    // Series: saved as a specific study, this sets the SeriesInstanceUID rather than the SeriesDescription
    const usaSeriesNumber = mode !== 'specificStudy' && !seriesDescription && seriesNumber != null;
    const attributoMatch =
      mode === 'specificStudy'
        ? 'SeriesInstanceUID'
        : usaSeriesNumber
          ? 'SeriesNumber'
          : 'SeriesDescription';
    const constraint = mode === 'specificStudy'
      ? { contains: seriesInstanceUID }
      : usaSeriesNumber
        ? { equals: seriesNumber }
        : { equals: seriesDescription };
    mdvHP.displaySetSelectors[displaySetKey].seriesMatchingRules = [
      {
        attribute: attributoMatch,
        constraint,
      },
    ];

    mdvHP.stages[0].viewports[i].viewportOptions.viewportId = `mdvhp-${i}`;

    mdvHP.stages[0].viewports[i].viewportOptions.initialImageOptions = {
      index: instanceNumber,
    };
    i++;
  });
  return {
    cameraHP: cameraHP,
    cameraByIndex: cameraByIndex,
    currentHangingProtocols: currentHangingProtocols,
    remotePreferences: remotePreferences,
  };
}

async function saveSpecificStudy() {
  const activeConfig = currentlySavedHangingProtocols();
  if (activeConfig.includes('specificStudy')) {
    if (!confirm('Overwrite the current configuration?') == true) {
      return;
    }
  }

  const hpComposed = await componiHP('specificStudy');
  if (!hpComposed?.remotePreferences?.json || !hpComposed?.currentHangingProtocols) {
    return;
  }
  const { cameraHP = {}, cameraByIndex = [], currentHangingProtocols = {}, remotePreferences = {} } = hpComposed;

  const entry = {
    protocol: mdvHP,
    gridLayout: window.layout,
    // These five keep their old names on purpose; hpStore.js says why.
    layoutPersonalizzato: null,
    allineamento: null,
    scalaOverlay: null,
    WL: null,
    camera: cameraHP,
    cameraByIndex: cameraByIndex,
    serieSpecifiche: null,
    specificInstances: specificInstances,
    seriesLabels: seriesLabels,
  };
  currentHangingProtocols.specificStudy[studyInstanceUIDs] = entry;
  logHangingProtocolSave('specificStudy', entry);
  remotePreferences.json.hp = currentHangingProtocols;

  const resScrittura = await writePreferencesToApi(aetitle, username, remotePreferences.json);
  if (!resScrittura) {
    return console.warn('The hanging protocol preferences could not be saved');
  }
  // And put them into localStorage
  localStorage.setItem(`userPreferences-${aetitle}`, JSON.stringify(remotePreferences.json));
  document.getElementById('menu-hp').remove();
  uiNotificationService.show({
    title: 'Hanging protocol',
    message: `Hanging protocols saved`,
    type: 'success',
  });
}

async function saveConfigExam() {
  const activeConfig = currentlySavedHangingProtocols();
  if (activeConfig.includes('examDescription')) {
    if (!confirm('Overwrite the current configuration?') == true) {
      return;
    }
  }
  const hpComposed = await componiHP('examDescription');
  if (!hpComposed?.remotePreferences?.json || !hpComposed?.currentHangingProtocols) {
    return;
  }
  const { cameraHP = {}, cameraByIndex = [], currentHangingProtocols = {}, remotePreferences = {} } = hpComposed;
  if (!Array.isArray(currentHangingProtocols.examName)) {
    currentHangingProtocols.examName = [];
  }

  const index = currentHangingProtocols.examName.findIndex(element => element?.examName === studyDescription);
  const entry = {
    examName: studyDescription,
    protocol: mdvHP,
    gridLayout: window.layout,
    // These five keep their old names on purpose; hpStore.js says why.
    layoutPersonalizzato: null,
    allineamento: null,
    scalaOverlay: null,
    WL: null,
    camera: cameraHP,
    cameraByIndex: cameraByIndex,
    serieSpecifiche: null,
    specificInstances: specificInstances,
    seriesLabels: seriesLabels,
  };
  if (index !== -1) {
    // Overwrite the entry that is there
    currentHangingProtocols.examName[index] = entry;
  } else {
    // Add the new entry to the array
    currentHangingProtocols.examName.push(entry);
  }
  logHangingProtocolSave('examDescription', entry);

  remotePreferences.json.hp = currentHangingProtocols;

  const resScrittura = await writePreferencesToApi(aetitle, username, remotePreferences.json);
  if (!resScrittura) {
    return console.warn('The hanging protocol preferences could not be saved');
  }
  // And put them into localStorage
  localStorage.setItem(`userPreferences-${aetitle}`, JSON.stringify(remotePreferences.json));
  document.getElementById('menu-hp').remove();
  uiNotificationService.show({
    title: 'Hanging protocol',
    message: `Hanging protocols saved`,
    type: 'success',
  });
}

async function saveConfigModality() {
  const activeConfig = currentlySavedHangingProtocols();
  if (activeConfig.includes('modality')) {
    if (!confirm('Overwrite the current configuration?') == true) {
      return;
    }
  }
  const hpComposed = await componiHP('modality');
  if (!hpComposed?.remotePreferences?.json || !hpComposed?.currentHangingProtocols) {
    return;
  }
  const { cameraHP = {}, cameraByIndex = [], currentHangingProtocols = {}, remotePreferences = {} } = hpComposed;
  if (!Array.isArray(currentHangingProtocols.modality)) {
    currentHangingProtocols.modality = [];
  }

  const index = currentHangingProtocols.modality.findIndex(element => element?.modalityName === modality);
  const entry = {
    modalityName: modality,
    protocol: mdvHP,
    gridLayout: window.layout,
    // These five keep their old names on purpose; hpStore.js says why.
    layoutPersonalizzato: null,
    allineamento: null,
    scalaOverlay: null,
    WL: null,
    camera: cameraHP,
    cameraByIndex: cameraByIndex,
    serieSpecifiche: null,
    specificInstances: specificInstances,
    seriesLabels: seriesLabels,
  };
  if (index !== -1) {
    // Overwrite the entry that is there
    currentHangingProtocols.modality[index] = entry;
  } else {
    // Add the new entry to the array
    currentHangingProtocols.modality.push(entry);
  }
  logHangingProtocolSave('modality', entry);

  remotePreferences.json.hp = currentHangingProtocols;

  const resScrittura = await writePreferencesToApi(aetitle, username, remotePreferences.json);
  if (!resScrittura) {
    return console.warn('The hanging protocol preferences could not be saved');
  }
  // And put them into localStorage
  localStorage.setItem(`userPreferences-${aetitle}`, JSON.stringify(remotePreferences.json));
  document.getElementById('menu-hp').remove();
  uiNotificationService.show({
    title: 'Hanging protocol',
    message: `Hanging protocols saved`,
    type: 'success',
  });
}

async function deleteConfigSpecificStudy() {
  if (!confirm('Delete the current configuration?') == true) {
    return;
  }
  // Get the hanging protocols as they stand right now
  const remotePreferencesRaw = await fetchPreferencesFromApi(aetitle, username, studyInstanceUIDs);
  if (!remotePreferencesRaw) {
    return console.warn('The hanging protocol preferences could not be fetched');
  }
  const remotePreferences = ensurePreferencesPayload(remotePreferencesRaw);
  const currentHangingProtocols = remotePreferences.json.hp;
  delete currentHangingProtocols.specificStudy[studyInstanceUIDs];
  remotePreferences.json.hp = currentHangingProtocols;

  const resScrittura = await writePreferencesToApi(aetitle, username, remotePreferences.json);
  if (!resScrittura) {
    return console.warn('The hanging protocol preferences could not be saved');
  }
  // And put them into localStorage
  localStorage.setItem(`userPreferences-${aetitle}`, JSON.stringify(remotePreferences.json));
  uiNotificationService.show({
    title: 'Hanging protocol',
    message: `Configuration deleted`,
    type: 'error',
  });
  document.getElementById('menu-hp').remove();
}

async function deleteConfigExam() {
  if (!confirm('Delete the current configuration?') == true) {
    return;
  }
  // Get the hanging protocols as they stand right now
  const remotePreferencesRaw = await fetchPreferencesFromApi(aetitle, username, studyInstanceUIDs);
  if (!remotePreferencesRaw) {
    return console.warn('The hanging protocol preferences could not be fetched');
  }
  const remotePreferences = ensurePreferencesPayload(remotePreferencesRaw);
  const currentHangingProtocols = remotePreferences.json.hp;
  if (!Array.isArray(currentHangingProtocols.examName)) {
    currentHangingProtocols.examName = [];
  }

  currentHangingProtocols.examName = currentHangingProtocols.examName.filter(item => item?.examName !== studyDescription);

  remotePreferences.json.hp = currentHangingProtocols;

  const resScrittura = await writePreferencesToApi(aetitle, username, remotePreferences.json);
  if (!resScrittura) {
    return console.warn('The hanging protocol preferences could not be saved');
  }
  // And put them into localStorage
  localStorage.setItem(`userPreferences-${aetitle}`, JSON.stringify(remotePreferences.json));
  uiNotificationService.show({
    title: 'Hanging protocol',
    message: `Configuration deleted`,
    type: 'error',
  });
  document.getElementById('menu-hp').remove();
}

async function deleteConfigModality() {
  if (!confirm('Delete the current configuration?') == true) {
    return;
  }
  // Get the hanging protocols as they stand right now
  const remotePreferencesRaw = await fetchPreferencesFromApi(aetitle, username, studyInstanceUIDs);
  if (!remotePreferencesRaw) {
    return console.warn('The hanging protocol preferences could not be fetched');
  }
  const remotePreferences = ensurePreferencesPayload(remotePreferencesRaw);
  const currentHangingProtocols = remotePreferences.json.hp;
  if (!Array.isArray(currentHangingProtocols.modality)) {
    currentHangingProtocols.modality = [];
  }
  currentHangingProtocols.modality = currentHangingProtocols.modality.filter(item => item?.modalityName !== modality);

  remotePreferences.json.hp = currentHangingProtocols;

  const resScrittura = await writePreferencesToApi(aetitle, username, remotePreferences.json);
  if (!resScrittura) {
    return console.warn('The hanging protocol preferences could not be saved');
  }
  // And put them into localStorage
  localStorage.setItem(`userPreferences-${aetitle}`, JSON.stringify(remotePreferences.json));
  uiNotificationService.show({
    title: 'Hanging protocol',
    message: `Configuration deleted`,
    type: 'error',
  });
  document.getElementById('menu-hp').remove();
}

async function writePreferencesToApi(aetitle, username, body) {
  const origin = window.location.origin;
  const apiUrl = `${origin}/viewer/userdata/${aetitle}/?user=${username}`;
  const datiDaInviare = {
    username: username,
    json: body,
  };

  try {
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify(datiDaInviare),
    });

    if (!apiResponse.ok) {
      console.error('Fetching the remote user preferences failed');
      return;
    }
    // An address the server does not know answers with the application's own page and a
    // status of 200. Without looking at the body's type the write would declare itself a
    // success, and the panel would say it had saved to the server when nothing had
    // arrived anywhere.
    if ((apiResponse.headers.get('content-type') || '').includes('text/html')) {
      console.warn('[HP] No remote preference store: the local copy stands');
      return null;
    }
    return apiResponse.text();
  } catch (err) {
    return console.error('Fetching the remote user preferences failed');
  }
}

export default saveHangingProtocol;
