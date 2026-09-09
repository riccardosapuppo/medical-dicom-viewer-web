/**
 * hpStore.js: the data layer for custom hanging protocols, with no DOM in it.
 *
 * Pulled out of saveHangingProtocol.js: this holds the data logic ONLY
 * (reading and writing preferences, matching, capturing the viewport state and
 * composing the hanging protocol). Nothing here touches the DOM: the interface
 * lives in the React component HangingProtocolManager.
 *
 * Used both by the React dialog and, indirectly through the same matching rules,
 * by loadHangingProtocol.js.
 */
import { metaData, getRenderingEngine } from '@cornerstonejs/core';
import { fetchPreferencesFromApi } from './loadHangingProtocol';
import {
  deriveViewKey,
  deriveViewDimKey,
  registerMdvHPAttributes,
  MDV_VIEW_KEY_ATTR,
  MDV_VIEW_DIM_KEY_ATTR,
} from './mammoView';
import { captureFraming } from './framing';

/* ------------------------------------------------------------------ *
 * Contesto studio (globali window.mdv*)                            *
 * ------------------------------------------------------------------ */

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const getUrlParam = name => {
  try {
    return new URLSearchParams(new URL(window.location.href).search).get(name);
  } catch (err) {
    return null;
  }
};

// The "partition" (the workstation) and the AE title are the same thing in this
// system, see openPriors.js. Configurations travel per partition and user: on the
// server they are already stored under userdata/{aetitle}/{user}/preferences.json.
// The first parameter name is the one an older host page sends, and it is still
// read: the address is built by whatever page embeds the viewer.
const getAeTitle = () => window.mdvAETitle || getUrlParam('partizione') || getUrlParam('aetitle');
const getUsername = () => window.mdvUsername || getUrlParam('User');

export const getContext = () => ({
  aetitle: getAeTitle(),
  username: getUsername(),
  studyInstanceUIDs: window.mdvStudyInstanceUIDs,
  studyDescription: window.mdvStudyDescription || '',
  modality: window.mdvModality || '',
});

const tryResolveStudyInfoFromMetadata = () => {
  const displaySetService = window.servicesManager?.services?.displaySetService;
  if (!displaySetService) {
    return false;
  }
  const { studyInstanceUIDs } = getContext();

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

  if (!window.mdvStudyDescription) {
    const studyDescriptionFromMetadata =
      referenceInstance?.StudyDescription || displaySetWithInstance?.StudyDescription;
    if (studyDescriptionFromMetadata) {
      window.mdvStudyDescription = studyDescriptionFromMetadata;
      changed = true;
    }
  }
  if (!window.mdvModality) {
    const modalities = new Set();
    displaySets.forEach(ds => {
      if (ds?.Modality) {
        modalities.add(ds.Modality);
      } else if (ds?.instances?.[0]?.Modality) {
        modalities.add(ds.instances[0].Modality);
      }
    });
    if (modalities.size) {
      window.mdvModality = Array.from(modalities).join('\\');
      changed = true;
    }
  }
  return changed;
};

// Are the study's metadata already there, meaning the display sets have loaded? If
// so, a description or modality still empty is a FINAL value (a study with no name
// or no modality in its metadata), not "still loading": there is nothing to wait for.
const studyMetadataAvailable = () => {
  const displaySetService = window.servicesManager?.services?.displaySetService;
  if (!displaySetService) {
    return false;
  }
  const { studyInstanceUIDs } = getContext();
  let displaySets = [];
  if (studyInstanceUIDs && displaySetService.getDisplaySetsBy) {
    displaySets =
      displaySetService.getDisplaySetsBy(ds => ds?.StudyInstanceUID === studyInstanceUIDs) || [];
  }
  if (!displaySets.length) {
    displaySets =
      displaySetService.getActiveDisplaySets?.() || displaySetService.activeDisplaySets || [];
  }
  return displaySets.length > 0;
};

export const ensureStudyInfoFromMetadata = async () => {
  if (window.mdvStudyDescription && window.mdvModality) {
    return;
  }
  const start = Date.now();
  const timeoutMs = 4000;
  const stepMs = 200;
  while (Date.now() - start <= timeoutMs) {
    tryResolveStudyInfoFromMetadata();
    if (window.mdvStudyDescription && window.mdvModality) {
      return;
    }
    // Metadata already loaded, so everything that can be resolved is resolved. This
    // skips the full wait, which used to hold the dialog on "loading" at workstations
    // whose launch URL carries no StudyDescription or Modality, and on unnamed studies.
    if (studyMetadataAvailable()) {
      return;
    }
    await wait(stepMs);
  }
};

/* ------------------------------------------------------------------ *
 * Structure and matching helpers, shared with the interface                *
 * ------------------------------------------------------------------ */

export const normalizza = value => (value || '').toString().trim().toUpperCase();
export const normalizzaModality = value =>
  (value || '')
    .toString()
    .split('\\')
    .map(item => normalizza(item))
    .filter(Boolean);

// The IDENTITY key of an "exam description" configuration: the normalised description
// (empty, missing, or spelled with other spaces or case, all give the same key). The
// same key is used by saving, deleting, de-duplicating and the dialog, so the entry
// overwritten or removed is always the same one, with no phantoms for unnamed studies.
export const canonExamKey = value => normalizza(value);

// The IDENTITY key of a "modality" configuration: the ORDERED SET of modalities,
// case-insensitive. So 'CT\\MR' and 'MR\\CT' (the order follows the display sets and
// can differ between one opening and the next) count as the SAME configuration.
// Deliberately different from the MATCHING done at load time, which overlaps tokens
// and is more permissive because it decides which configuration applies to a study.
// Here identity is what lets an overwrite or a delete land without ambiguity.
export const canonModalityKey = value =>
  Array.from(new Set(normalizzaModality(value))).sort().join('\\');

// Collapses array entries, keeping the LAST occurrence per identity key, which is the
// most recent: saves are appended. This is needed because legacy entries saved for
// studies with NO NAME had `examName: undefined` (JSON.stringify drops the key) while
// new ones use '': saving and deleting treated them as DIFFERENT, loading treated them
// as the SAME, and the result was phantom duplicates that could not be overwritten.
const dedupByKey = (arr, keyFn) => {
  const map = new Map();
  arr.forEach(item => {
    map.set(keyFn(item), item);
  });
  return Array.from(map.values());
};

/**
 * The names these fields used to be saved under.
 *
 * They were Italian, and renaming them in the code alone would have made every
 * arrangement anybody had already saved unreadable: the entry would still be
 * there, every field would come back undefined, and the panel would show a
 * saved configuration that restores nothing. That reads as a bug in saving, and
 * the cause would be three commits behind.
 *
 * So the new name is what gets written, and the old one is still accepted on
 * the way in. One pass, at the only place a stored payload is normalised.
 */
const RENAMED = {
  performanceHP: 'protocol',
  layoutGriglia: 'gridLayout',
  serieLabels: 'seriesLabels',
  istanzeSpecifiche: 'specificInstances',
  studioSpecifico: 'specificStudy',
};

/** One entry, with any field still under its old name moved across. */
const withRenamedFields = entry => {
  if (!entry || typeof entry !== 'object') {
    return entry;
  }
  Object.entries(RENAMED).forEach(([was, now]) => {
    if (entry[now] === undefined && entry[was] !== undefined) {
      entry[now] = entry[was];
    }
  });
  return entry;
};

export const ensureHpStructure = hp => {
  const safeHp = withRenamedFields(hp && typeof hp === 'object' ? hp : {});

  // The per-study map: the entries inside it carry the old names too.
  const perStudy = safeHp.specificStudy ?? safeHp.studioSpecifico;
  if (!perStudy || typeof perStudy !== 'object' || Array.isArray(perStudy)) {
    safeHp.specificStudy = {};
  } else {
    safeHp.specificStudy = perStudy;
    Object.values(safeHp.specificStudy).forEach(withRenamedFields);
  }
  ['examName', 'modality'].forEach(where => {
    if (Array.isArray(safeHp[where])) {
      safeHp[where].forEach(withRenamedFields);
    }
  });
  safeHp.examName = dedupByKey(
    Array.isArray(safeHp.examName)
      ? safeHp.examName.filter(item => item && typeof item === 'object')
      : [],
    item => canonExamKey(item?.examName)
  );
  safeHp.modality = dedupByKey(
    Array.isArray(safeHp.modality)
      ? safeHp.modality.filter(item => item && typeof item === 'object')
      : [],
    item => canonModalityKey(item?.modalityName)
  );
  return safeHp;
};

export const ensurePreferencesPayload = preferencesPayload => {
  const safePayload =
    preferencesPayload && typeof preferencesPayload === 'object' ? preferencesPayload : {};
  if (!safePayload.json || typeof safePayload.json !== 'object') {
    safePayload.json = {};
  }
  safePayload.json.hp = ensureHpStructure(safePayload.json.hp);
  return safePayload;
};

export const parseLayout = (entry = {}) => {
  const layout =
    entry.gridLayout || entry.protocol?.stages?.[0]?.viewportStructure?.properties;
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

/**
 * Backwards-compatible default: entries saved before the flags existed have no
 * `captured` field. For those the behaviour was: grid, series, instance, and
 * zoom and pan. The window level was NEVER saved.
 */
export const LEGACY_CAPTURED = Object.freeze({
  grid: true,
  series: true,
  instance: true,
  windowLevel: false,
  zoomPan: true,
  colorLut: false,
});

export const getCaptured = entry => {
  const c = entry?.captured;
  if (c && typeof c === 'object') {
    return {
      grid: c.grid !== false,
      series: c.series !== false,
      instance: !!c.instance,
      windowLevel: !!c.windowLevel,
      zoomPan: !!c.zoomPan,
      colorLut: !!c.colorLut,
    };
  }
  return { ...LEGACY_CAPTURED };
};

/**
 * Works out which configuration actually applies to the study on screen, in the order
 * specific study, then exam description, then modality. The modality match is
 * normalised and partial.
 */
export const getAppliedHpConfig = (preferencesJson, ctx = getContext()) => {
  const hp = preferencesJson?.hp;
  if (!hp) {
    return null;
  }
  if (hp.specificStudy?.[ctx.studyInstanceUIDs]) {
    return {
      tipo: 'specificStudy',
      key: ctx.studyInstanceUIDs,
      entry: hp.specificStudy[ctx.studyInstanceUIDs],
    };
  }
  const normalisedExamName = normalizza(ctx.studyDescription);
  const matchExam = (hp.examName || []).find(
    item => normalizza(item?.examName) === normalisedExamName
  );
  if (matchExam) {
    return { tipo: 'examDescription', key: matchExam.examName, entry: matchExam };
  }
  const modalityCandidates = normalizzaModality(ctx.modality);
  const matchModality = (hp.modality || []).find(item => {
    const savedCandidates = normalizzaModality(item?.modalityName);
    return savedCandidates.some(value => modalityCandidates.includes(value));
  });
  if (matchModality) {
    return { tipo: 'modality', key: matchModality.modalityName, entry: matchModality };
  }
  return null;
};

const resolveSeriesLabelFromEntry = (entry, index) => {
  const saved = entry?.seriesLabels?.[index];
  if (saved) {
    return saved;
  }
  const protocol = entry?.protocol || {};
  const viewport = protocol?.stages?.[0]?.viewports?.[index];
  const displaySetId = viewport?.displaySets?.[0]?.id || `DisplaySet${index}`;
  const rule = protocol?.displaySetSelectors?.[displaySetId]?.seriesMatchingRules?.[0];
  if (!rule || !rule.attribute) {
    return 'Series';
  }
  const constraint = rule.constraint || {};
  let value = constraint.contains ?? constraint.equals ?? constraint.startsWith ?? '';
  if (Array.isArray(value)) {
    value = value[0];
  }
  if (rule.attribute === 'SeriesDescription' && value) {
    return `Series ${value}`;
  }
  if (rule.attribute === 'SeriesNumber' && value !== '') {
    return `Series ${value}`;
  }
  return 'Series';
};

/* ------------------------------------------------------------------ *
 * Lettura / scrittura preferences remote + cache localStorage          *
 * ------------------------------------------------------------------ */

// The local cache has to be per partition and user. Without the user, a shared
// workstation would show one person the configuration left by the one before.
const localStorageKey = () => {
  const ctx = getContext();
  return `userPreferences-${ctx.aetitle}-${ctx.username}`;
};

/**
 * Returns a normalised `{ json: { hp: {...} } }` payload, ready both for reading
 * (`payload.json.hp`) and for writing (`payload.json`).
 */
export const readPreferences = async () => {
  const ctx = getContext();
  const raw = await fetchPreferencesFromApi(ctx.aetitle, ctx.username, ctx.studyInstanceUIDs);
  if (raw && typeof raw === 'object') {
    return ensurePreferencesPayload(raw);
  }
  // Local cache fallback: localStorage holds the `json` object directly.
  let cachedJson = {};
  try {
    cachedJson = JSON.parse(localStorage.getItem(localStorageKey()) || '{}');
  } catch (err) {
    console.warn('[HP] The cached user preferences are not valid', err);
  }
  return ensurePreferencesPayload({ json: cachedJson });
};

const writePreferencesToApi = async (aetitle, username, body) => {
  const origin = window.location.origin;
  const apiUrl = `${origin}/viewer/userdata/${aetitle}/?user=${username}`;
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
      body: JSON.stringify({ username, json: body }),
    });
    if (!apiResponse.ok) {
      console.error('[HP] Writing the user preferences failed');
      return null;
    }
    // An address the server does not know answers with the application's own page
    // and a status of 200. Without looking at the body's type the write would
    // declare itself a success, and the panel would say it had saved to the
    // server when nothing had arrived anywhere.
    if ((apiResponse.headers.get('content-type') || '').includes('text/html')) {
      console.warn('[HP] No remote preference store: the local copy stands');
      return null;
    }
    return apiResponse.text();
  } catch (err) {
    console.error('[HP] Writing the user preferences failed', err);
    return null;
  }
};

/**
 * Saves the preferences.
 *
 * The local cache is ALWAYS written, even when the backend does not answer.
 * On reads the cache was already the fallback, see readPreferences, but on writes
 * it was not: with no backend the save returned false and the protocol was lost,
 * which looks like a broken feature rather than an unsynchronised one.
 *
 * The backend, when there is one, stays the shared authoritative copy across
 * workstations. The return value says whether the sync succeeded, not whether the
 * save happened.
 */
const writePreferences = async payload => {
  const ctx = getContext();

  try {
    localStorage.setItem(localStorageKey(), JSON.stringify(payload.json));
  } catch (err) {
    // A private window, or no room left: the remote attempt still stands.
    console.warn('[HP] The local preference cache could not be written', err);
  }

  const res = await writePreferencesToApi(ctx.aetitle, ctx.username, payload.json);
  return Boolean(res);
};

/* ------------------------------------------------------------------ *
 * Capturing the current state as a hanging protocol                      *
 * ------------------------------------------------------------------ */

const createBaseProtocol = ({ rows, columns }) => ({
  id: 'mdvhp',
  locked: true,
  name: 'Default',
  createdDate: '2021-02-23T19:22:08.894Z',
  modifiedDate: '2022-10-04T19:22:08.894Z',
  availableTo: {},
  editableBy: {},
  imageLoadStrategy: 'interleaveTopToBottom',
  protocolMatchingRules: [{}],
  displaySetSelectors: {},
  stages: [
    {
      id: 'mdvhp-stage',
      name: 'default',
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows, columns },
      },
      viewports: [],
      createdDate: '2021-02-23T18:32:42.850Z',
    },
  ],
  numberOfPriorsReferenced: -1,
});

const readVoiRange = viewport => {
  try {
    const props =
      typeof viewport?.getProperties === 'function' ? viewport.getProperties() : null;
    const range = props?.voiRange;
    if (range && Number.isFinite(range.lower) && Number.isFinite(range.upper)) {
      return { lower: range.lower, upper: range.upper };
    }
  } catch (err) {
    /* the viewport is not ready, or does not support this */
  }
  return null;
};

// The viewport's current colour LUT. The grey default has no colormap, so this is
// null and nothing is saved or applied. Only the name is kept; setProperties wants no more.
const readColormap = viewport => {
  try {
    const props =
      typeof viewport?.getProperties === 'function' ? viewport.getProperties() : null;
    const cm = props?.colormap;
    const name = typeof cm === 'string' ? cm : cm?.name;
    if (name && String(name).toLowerCase() !== 'grayscale') {
      return { name };
    }
  } catch (err) {
    /* the viewport is not ready, or does not support this */
  }
  return null;
};

/**
 * captureOptions = { grid, series, instance, windowLevel, zoomPan, colorLut }
 * scope = 'specificStudy' | 'examDescription' | 'modality'
 *   (for 'specificStudy' the series is pinned by SeriesInstanceUID,
 *    altrimenti via SeriesDescription / SeriesNumber).
 */
export const captureCurrentState = (scope, captureOptions) => {
  const opts = {
    grid: captureOptions?.grid !== false,
    series: captureOptions?.series !== false,
    instance: !!captureOptions?.instance,
    windowLevel: !!captureOptions?.windowLevel,
    zoomPan: !!captureOptions?.zoomPan,
    colorLut: !!captureOptions?.colorLut,
  };

  const gridLayout = window.layout || '1x1';
  const columns = Number(gridLayout.split('x')[0]) || 1;
  const rows = Number(gridLayout.split('x')[1]) || 1;

  const protocol = createBaseProtocol({ rows, columns });
  const { cornerstoneViewportService, viewportGridService, displaySetService } =
    window.servicesManager.services;
  const { viewports } = viewportGridService.getState();
  const renderingEngine = cornerstoneViewportService.getRenderingEngine();

  const cameraHP = {};
  const cameraByIndex = [];
  const voiHP = {};
  const voiByIndex = [];
  const colorHP = {};
  const colorByIndex = [];
  const specificInstances = [];
  const seriesLabels = [];
  const montageByIndex = [];

  let i = 0;
  viewports.forEach(_viewport => {
    const { viewportId } = _viewport;
    const displaySetKey = `DisplaySet${i}`;
    const hpViewportId = `mdvhp-${i}`;

    // Subgrid (montage): the cells live in their OWN engine, not the main one. To
    // read the live instance, scroll, window level and zoom or pan, this uses that
    // engine's primary cell rather than the main viewport, which does not exist.
    const montageOpt = _viewport?.viewportOptions?.montage;
    const isMontage = opts.grid && !!montageOpt?.enabled;
    const montageEngine = isMontage ? getRenderingEngine(`ohif-montage-${viewportId}`) : null;
    const viewport = isMontage
      ? montageEngine?.getViewport(viewportId) || montageEngine?.getViewports?.()?.[0] || null
      : renderingEngine.getViewport(viewportId);

    const buildMontage = (extra = {}) =>
      isMontage
        ? {
            enabled: true,
            rows: montageOpt.rows,
            cols: montageOpt.cols,
            firstImageIndex: montageOpt.firstImageIndex ?? 0,
            ...extra,
          }
        : null;

    if (!viewport || !viewport.element) {
      protocol.displaySetSelectors[displaySetKey] = { seriesMatchingRules: [{}] };
      const viewportOptionsAbsent = { viewportType: 'stack', viewportId: hpViewportId };
      const montageAbsent = buildMontage();
      if (montageAbsent) {
        viewportOptionsAbsent.montage = montageAbsent;
      }
      protocol.stages[0].viewports.push({
        viewportOptions: viewportOptionsAbsent,
        displaySets: [{ id: displaySetKey }],
      });
      montageByIndex.push(montageAbsent);
      specificInstances.push(null);
      voiByIndex.push(null);
      colorByIndex.push(null);
      seriesLabels.push('Series');
      i += 1;
      return;
    }

    const { element } = viewport;

    // --- Zoom / Pan (camera) ---
    let cameraViewPresentation = null;
    if (opts.zoomPan) {
      const cameraViewport = viewport.getCamera();
      cameraViewPresentation = viewport.getViewPresentation
        ? viewport.getViewPresentation({ pan: true, zoom: true })
        : null;
      const cameraData = {
        focalpoint: cameraViewport.focalPoint,
        parallelscale: cameraViewport.parallelScale,
        position: cameraViewport.position,
        viewPresentation: cameraViewPresentation,
      };
      // RELATIVE framing (framing.js): scale-invariant, so it still holds when the
      // protocol is applied to a cell of a different size (a prior study alongside,
      // another monitor). The absolute fields above stay as a fallback for builds
      // made before this change.
      const framingData = isMontage ? null : captureFraming(viewport);
      if (framingData) {
        cameraData.framing = framingData;
      }
      // For montages the camera belongs to the cells, in their own engine, not to the main viewport.
      if (!isMontage) {
        cameraHP[hpViewportId] = cameraData;
      }
      cameraByIndex.push(isMontage ? null : cameraData);
    } else {
      cameraByIndex.push(null);
    }

    // --- Window Level (VOI) ---
    let voiRange = null;
    if (opts.windowLevel) {
      voiRange = readVoiRange(viewport);
      if (voiRange && !isMontage) {
        voiHP[hpViewportId] = voiRange;
      }
    }
    voiByIndex.push(isMontage ? null : voiRange);

    // --- Color LUT (colormap) ---
    let colormap = null;
    if (opts.colorLut) {
      colormap = readColormap(viewport);
      if (colormap && !isMontage) {
        colorHP[hpViewportId] = colormap;
      }
    }
    colorByIndex.push(isMontage ? null : colormap);

    // --- Series ---
    const seriesDescriptionFromUi =
      element.parentElement?.querySelector('[title="Series description"]')?.textContent?.trim() ||
      '';
    const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport?.(viewportId) || [];
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

    const imageId =
      viewport.csImage?.imageId ||
      (typeof viewport.getCurrentImageId === 'function' ? viewport.getCurrentImageId() : '') ||
      '';
    const match = imageId ? imageId.match(/series\/([^/]+)/) : null;
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
      const ds = (displaySetService?.getDisplaySetsForSeries?.(seriesInstanceUID) || [])[0];
      seriesDescription = ds?.SeriesDescription || ds?.instances?.[0]?.SeriesDescription || '';
    }

    // --- The instance now open ---
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

    seriesLabels.push(
      seriesDescription && seriesNumber != null
        ? `Series ${seriesNumber} ${seriesDescription}`
        : seriesDescription
          ? `Series ${seriesDescription}`
          : seriesNumber != null
            ? `Series ${seriesNumber}`
            : 'Series'
    );

    // --- The series matching rule, which honours the "series" flag ---
    let seriesMatchingRules;
    if (!opts.series) {
      seriesMatchingRules = [{}];
    } else if (scope === 'specificStudy') {
      // Specific study: the SeriesInstanceUID is exact and enough, so nothing changes.
      seriesMatchingRules = [
        { attribute: 'SeriesInstanceUID', constraint: { contains: seriesInstanceUID } },
      ];
    } else {
      // Across studies (exam description or modality). The LEGACY rule on name and number
      // stays as a low-weight fallback, which leaves the priors behaving as they did.
      const legacyRule =
        !seriesDescription && seriesNumber != null
          ? { attribute: 'SeriesNumber', constraint: { equals: seriesNumber }, weight: 1 }
          : { attribute: 'SeriesDescription', constraint: { equals: seriesDescription }, weight: 1 };
      seriesMatchingRules = [legacyRule];
      // ...and IF this cell's series carries a VIEW identity that does not depend on
      // naming (laterality plus ViewCode; typically mammography, but true of any series
      // carrying those tags), a high-weight rule is added so it beats name and number,
      // which change between studies named by different conventions.
      // With no view tags (CT or MR, say) nothing is added, seriesMatchingRules stays
      // exactly as it was, and nothing regresses. The matcher sums the weights of the
      // rules that pass and takes the display set with the highest score.
      const viewKey = deriveViewKey(primaryDisplaySet);
      if (viewKey) {
        seriesMatchingRules.unshift({
          attribute: MDV_VIEW_KEY_ATTR,
          constraint: { equals: viewKey },
          weight: 100,
        });
        // The 2D/3D tie-break is TIED to the view (key lat|view|dim): among series of
        // the same view it prefers the type that was saved, but a series of a DIFFERENT
        // view earns nothing for merely sharing the dimension. Otherwise the weight of
        // 20 would jump over the name and number fallback when the view does not match.
        const viewDimKey = deriveViewDimKey(primaryDisplaySet);
        if (viewDimKey) {
          seriesMatchingRules.push({
            attribute: MDV_VIEW_DIM_KEY_ATTR,
            constraint: { equals: viewDimKey },
            weight: 20,
          });
        }
      }
    }
    protocol.displaySetSelectors[displaySetKey] = { seriesMatchingRules };

    // Subgrid: saves the scroll position and instance (firstImageIndex read live from
    // the primary cell), the window level and the zoom and pan inside the montage
    const montage = buildMontage(
      isMontage
        ? {
            firstImageIndex:
              instanceNumber != null ? instanceNumber - 1 : montageOpt.firstImageIndex ?? 0,
            ...(opts.windowLevel && voiRange ? { voiRange } : {}),
            ...(opts.zoomPan && cameraViewPresentation
              ? { viewPresentation: cameraViewPresentation }
              : {}),
            ...(opts.colorLut && colormap ? { colormap } : {}),
          }
        : {}
    );
    montageByIndex.push(montage);

    const viewportOptions = { viewportType: 'stack', viewportId: hpViewportId };
    // For montages the instance is handled by firstImageIndex; initialImageOptions
    // would be ignored. initialImageOptions.index is 0-based, the instance number 1-based.
    if (opts.instance && instanceNumber != null && !isMontage) {
      viewportOptions.initialImageOptions = { index: instanceNumber - 1 };
    }
    if (montage) {
      viewportOptions.montage = montage;
    }
    protocol.stages[0].viewports.push({
      viewportOptions,
      displaySets: [{ id: displaySetKey }],
    });

    i += 1;
  });

  if (window.mdvHPDebug) {
    // eslint-disable-next-line no-console
    console.log('[HP] captureCurrentState', {
      scope,
      opts,
      gridLayout,
      specificInstances,
      voiByIndex,
      montageByIndex,
      hasCamera: Object.keys(cameraHP).length,
    });
  }

  return {
    protocol: protocol,
    gridLayout,
    captured: opts,
    cameraHP,
    cameraByIndex,
    voiHP,
    voiByIndex,
    colorHP,
    colorByIndex,
    specificInstances,
    seriesLabels,
    montageByIndex,
  };
};

const buildEntry = (captureState, extra = {}) => ({
  protocol: captureState.protocol,
  gridLayout: captureState.gridLayout,
  captured: captureState.captured,
  camera: captureState.cameraHP,
  cameraByIndex: captureState.cameraByIndex,
  voi: captureState.voiHP,
  voiByIndex: captureState.voiByIndex,
  colormap: captureState.colorHP,
  colormapByIndex: captureState.colorByIndex,
  specificInstances: captureState.specificInstances,
  seriesLabels: captureState.seriesLabels,
  montageByIndex: captureState.montageByIndex,
  // Written under their old Italian names on purpose: an older build reads them
  // by those names, and a build that stopped writing them would leave it with a
  // saved arrangement it cannot parse. Nothing here reads them.
  layoutPersonalizzato: null,
  allineamento: null,
  scalaOverlay: null,
  WL: null,
  serieSpecifiche: null,
  ...extra,
});

/* ------------------------------------------------------------------ *
 * Saving and deleting                                                 *
 * ------------------------------------------------------------------ */

const SCOPE_TO_CAPTURE = {
  specificStudy: 'specificStudy',
  examDescription: 'examDescription',
  modality: 'modality',
};

/**
 * scope = 'specificStudy' | 'examDescription' | 'modality'
 * Ritorna { ok, reason? }.
 */
export const saveConfig = async (scope, captureOptions) => {
  const ctx = getContext();
  const payload = await readPreferences();
  const hp = payload.json.hp;

  if (scope === 'examDescription' && ctx.studyDescription === '') {
    // allowed, but written down: the configuration will hold for unnamed exams
  }
  if (scope === 'modality' && ctx.modality === '') {
    return { ok: false, reason: 'This study has no such modality' };
  }

  const captureState = captureCurrentState(SCOPE_TO_CAPTURE[scope], captureOptions);

  if (scope === 'specificStudy') {
    hp.specificStudy[ctx.studyInstanceUIDs] = buildEntry(captureState);
  } else if (scope === 'examDescription') {
    const entry = buildEntry(captureState, { examName: ctx.studyDescription });
    // NORMALISED comparison: overwrites the entry that is there (legacy ones with
    // examName missing or undefined, or spelled with different spaces or case) rather
    // than adding a phantom duplicate. The normalise-equal ones go, newest kept.
    const target = normalizza(ctx.studyDescription);
    hp.examName = hp.examName.filter(item => normalizza(item?.examName) !== target);
    hp.examName.push(entry);
  } else if (scope === 'modality') {
    const entry = buildEntry(captureState, { modalityName: ctx.modality });
    // CANONICAL key (the ordered set): overwrites the configuration for the SAME
    // combination of modalities, even written in another token order such as 'CT\\MR'
    // against 'MR\\CT', without making doubles. It leaves alone a different but
    // overlapping combination such as 'PT\\CT', so no data is lost. Consistent with
    // delete, de-duplication and the dialog (existsForScope).
    const target = canonModalityKey(ctx.modality);
    hp.modality = hp.modality.filter(item => canonModalityKey(item?.modalityName) !== target);
    hp.modality.push(entry);
  } else {
    return { ok: false, reason: 'The scope is not valid' };
  }

  payload.json.hp = hp;
  const ok = await writePreferences(payload);
  return { ok };
};

/**
 * scope = 'specificStudy' | 'examDescription' | 'modality'
 * key = StudyInstanceUID | examName | modalityName (la chiave REALE memorizzata).
 */
export const deleteConfig = async (scope, key) => {
  const payload = await readPreferences();
  const hp = payload.json.hp;

  if (scope === 'specificStudy') {
    delete hp.specificStudy[key];
  } else if (scope === 'examDescription') {
    // NORMALISED comparison: deletes the entry actually on screen (key '' for unnamed
    // exams) even when it was saved as undefined, empty, or in another case, without
    // hitting a neighbour by mistake. That was the "it deleted the wrong one" bug.
    const target = normalizza(key);
    hp.examName = hp.examName.filter(item => normalizza(item?.examName) !== target);
  } else if (scope === 'modality') {
    const target = canonModalityKey(key);
    hp.modality = hp.modality.filter(item => canonModalityKey(item?.modalityName) !== target);
  } else {
    return { ok: false, reason: 'The scope is not valid' };
  }

  payload.json.hp = hp;
  const ok = await writePreferences(payload);
  return { ok };
};

/* ------------------------------------------------------------------ *
 * Every saved configuration, which is what fixes the "cannot be deleted" bug *
 * ------------------------------------------------------------------ */

const SCOPE_LABEL = {
  specificStudy: 'Specific study',
  examDescription: 'Exam description',
  modality: 'Modality',
};

const getCurrentStudyDisplaySets = ctx => {
  const displaySetService = window.servicesManager?.services?.displaySetService;
  if (!displaySetService) {
    return [];
  }
  if (ctx.studyInstanceUIDs && displaySetService.getDisplaySetsBy) {
    const dss =
      displaySetService.getDisplaySetsBy(ds => ds?.StudyInstanceUID === ctx.studyInstanceUIDs) || [];
    if (dss.length) {
      return dss;
    }
  }
  return displaySetService.getActiveDisplaySets?.() || displaySetService.activeDisplaySets || [];
};

const dsField = (ds, field) => ds?.[field] ?? ds?.instances?.[0]?.[field];

// An "empty" rule [{}] always matches, and fills with the first series available.
const seriesRuleMatches = (rule, displaySets) => {
  if (!rule || !rule.attribute) {
    return true;
  }
  const constraint = rule.constraint || {};
  let value = constraint.contains ?? constraint.equals ?? constraint.startsWith ?? '';
  if (Array.isArray(value)) {
    value = value[0];
  }
  if (value === '' || value == null) {
    return true;
  }
  const attr = rule.attribute;
  return displaySets.some(ds => {
    if (attr === 'SeriesInstanceUID') {
      return dsField(ds, 'SeriesInstanceUID') === value || ds?.seriesInstanceUID === value;
    }
    if (attr === 'SeriesDescription') {
      return normalizza(dsField(ds, 'SeriesDescription')) === normalizza(value);
    }
    if (attr === 'SeriesNumber') {
      return String(dsField(ds, 'SeriesNumber')) === String(value);
    }
    // Rules based on the VIEW (mammography): applicability has to be checked by
    // recomputing the view identity against this study's display sets, rather than the
    // generic `return true` branch, which would call everything applicable and never
    // reach either "no series available" or "load the grid only".
    if (attr === MDV_VIEW_KEY_ATTR) {
      return deriveViewKey(ds) === value;
    }
    if (attr === MDV_VIEW_DIM_KEY_ATTR) {
      return deriveViewDimKey(ds) === value;
    }
    return true;
  });
};

// How many of the series the configuration pins are missing from the study on screen.
// A cell has SEVERAL weighted rules (view, plus name and number as a fallback). The real
// matcher takes the best score across ALL of them, so a cell counts as "present" when
// AT LEAST ONE rule matches, view OR name and number, not only the first. Looking at
// rule[0] alone (the view) wrongly reported "not applicable" for a study with no view
// tags but the right series by name, forcing "load the grid only" for nothing.
const computeApplicability = (entry, displaySets) => {
  const protocol = entry?.protocol || {};
  const viewports = protocol?.stages?.[0]?.viewports || [];
  const selectors = protocol?.displaySetSelectors || {};
  let total = 0;
  let missing = 0;
  viewports.forEach((vp, idx) => {
    const dsId = vp?.displaySets?.[0]?.id || `DisplaySet${idx}`;
    const rules = (selectors?.[dsId]?.seriesMatchingRules || []).filter(r => r && r.attribute);
    if (rules.length) {
      total += 1;
      if (!rules.some(rule => seriesRuleMatches(rule, displaySets))) {
        missing += 1;
      }
    }
  });
  return { total, missing, applicable: missing === 0 };
};

// Is the configuration "relevant" to the study on screen, same scope and value?
const isRelevant = (scope, key, ctx) => {
  if (scope === 'specificStudy') {
    return key === ctx.studyInstanceUIDs;
  }
  if (scope === 'examDescription') {
    return normalizza(key) === normalizza(ctx.studyDescription);
  }
  if (scope === 'modality') {
    const cur = normalizzaModality(ctx.modality);
    const saved = normalizzaModality(key);
    return saved.some(v => cur.includes(v));
  }
  return false;
};

const describeEntry = (scope, key, entry, ctx, applied, displaySets) => {
  const { rows, columns } = parseLayout(entry);
  const total = rows * columns;
  const viewports = [];
  for (let i = 0; i < total; i++) {
    viewports.push({
      label: resolveSeriesLabelFromEntry(entry, i),
      instance: entry?.specificInstances?.[i] ?? null,
    });
  }
  const isApplied =
    !!applied && applied.tipo === scope && (scope !== 'specificStudy' || applied.key === key);
  const { applicable, missing } = computeApplicability(entry, displaySets);
  return {
    scope,
    key,
    scopeLabel: SCOPE_LABEL[scope],
    title:
      scope === 'specificStudy'
        ? 'This study'
        : scope === 'examDescription'
          ? key || '(unnamed exam)'
          : key,
    layout: { rows, columns },
    captured: getCaptured(entry),
    hasMontage: (entry?.montageByIndex || []).some(m => m?.enabled),
    viewports,
    isApplied,
    relevant: isRelevant(scope, key, ctx),
    applicable,
    missingSeries: missing,
    entry,
  };
};

/**
 * Returns the list of EVERY saved entry, each with its own real delete key, so it
 * can always be removed (this is what fixed the orphaned configuration), and with
 * the flags `relevant` (same scope as the study on screen) and `applicable` (the
 * series it refers to exist in this study). The interface splits relevant from the rest.
 */
export const listSavedConfigs = (preferencesJson, ctx = getContext()) => {
  const hp = ensureHpStructure(preferencesJson?.hp);
  const applied = getAppliedHpConfig({ hp }, ctx);
  const displaySets = getCurrentStudyDisplaySets(ctx);
  const out = [];

  if (hp.specificStudy?.[ctx.studyInstanceUIDs]) {
    out.push(
      describeEntry(
        'specificStudy',
        ctx.studyInstanceUIDs,
        hp.specificStudy[ctx.studyInstanceUIDs],
        ctx,
        applied,
        displaySets
      )
    );
  }
  hp.examName.forEach(entry => {
    out.push(describeEntry('examDescription', entry?.examName ?? '', entry, ctx, applied, displaySets));
  });
  hp.modality.forEach(entry => {
    out.push(describeEntry('modality', entry?.modalityName ?? '', entry, ctx, applied, displaySets));
  });
  return out;
};

/* ------------------------------------------------------------------ *
 * Applying a saved arrangement at once                                *
 * ------------------------------------------------------------------ */

// Remaps a per-viewport source (an `mdvhp-i` map, or an array by index) to a map by id.
const remapByViewport = (byId, byIndex) => {
  const out = {};
  const map = byId && typeof byId === 'object' ? byId : {};
  if (Object.keys(map).some(k => k.startsWith('mdvhp-'))) {
    Object.entries(map).forEach(([k, v]) => {
      if (k.startsWith('mdvhp-') && v) {
        out[k] = v;
      }
    });
  } else {
    (Array.isArray(byIndex) ? byIndex : []).forEach((v, idx) => {
      if (v) {
        out[`mdvhp-${idx}`] = v;
      }
    });
  }
  return out;
};

const buildViewportSettingsFromEntry = entry => {
  const captured = getCaptured(entry);
  return {
    camera: captured.zoomPan ? remapByViewport(entry?.camera, entry?.cameraByIndex) : {},
    voi: captured.windowLevel ? remapByViewport(entry?.voi, entry?.voiByIndex) : {},
    color: captured.colorLut ? remapByViewport(entry?.colormap, entry?.colormapByIndex) : {},
  };
};

let _hpRuntimeCounter = 0;

const cloneProtocol = protocol => JSON.parse(JSON.stringify(protocol));

// "Grid only": the same cells and layout, plus the subgrid if there is one, but
// without pinning specific series or an instance, so the shape survives different series.
const toGridOnlyProtocol = protocol => {
  const clone = cloneProtocol(protocol);
  Object.values(clone.displaySetSelectors || {}).forEach(sel => {
    sel.seriesMatchingRules = [{}];
  });
  (clone.stages?.[0]?.viewports || []).forEach(vp => {
    if (vp?.viewportOptions) {
      delete vp.viewportOptions.initialImageOptions;
    }
  });
  return clone;
};

// Montage subgrids are lost by the hanging protocol, which regenerates viewportOptions.
// They go back on once the new layout is ready, through setDisplaySetsForViewports.
const reapplyMontageAfterProtocol = montageByIndex => {
  const list = Array.isArray(montageByIndex) ? montageByIndex : [];
  if (!list.some(m => m?.enabled)) {
    return;
  }
  const { viewportGridService } = window.servicesManager.services;
  const apply = () => {
    const state = viewportGridService.getState();
    list.forEach((m, idx) => {
      if (!m?.enabled) {
        return;
      }
      const vpId = `mdvhp-${idx}`;
      const vp = state.viewports.get(vpId);
      if (!vp) {
        return;
      }
      viewportGridService.setDisplaySetsForViewports([
        {
          viewportId: vpId,
          displaySetInstanceUIDs: vp.displaySetInstanceUIDs,
          viewportOptions: {
            ...vp.viewportOptions,
            montage: { ...m, firstImageIndex: m.firstImageIndex ?? 0 },
          },
          displaySetOptions: vp.displaySetOptions,
        },
      ]);
    });
  };
  let done = false;
  const runOnce = () => {
    if (done) {
      return;
    }
    done = true;
    try {
      apply();
    } catch (err) {
      console.warn('[HP] Putting the subgrid back failed', err);
    }
    sub?.unsubscribe?.();
  };
  // The new layout's viewports may not be ready the moment setProtocol returns.
  const sub = viewportGridService.subscribe?.(
    viewportGridService.EVENTS.VIEWPORTS_READY,
    runOnce
  );
  setTimeout(runOnce, 350);
};

/**
 * Applies a saved configuration AT ONCE. It receives the entry itself, so there is no
 * fragile per-key lookup and no more "Configuration not found".
 * options.gridOnly applies the grid and subgrid only, leaving the series free and
 * skipping instance, window level and zoom, which is what to do when some of the
 * series are missing from the study on screen.
 */
export const applyConfigNow = (entry, options = {}) => {
  if (!entry?.protocol) {
    return { ok: false, reason: 'The configuration is not valid' };
  }
  // Idempotent safety net: the custom view attributes have to be registered before
  // the matcher reads the saved rules. Loading registers them at startup, but this
  // path can be reached without going through it.
  registerMdvHPAttributes(window.servicesManager?.services?.hangingProtocolService);
  const gridOnly = !!options.gridOnly;
  const baseProtocol = gridOnly ? toGridOnlyProtocol(entry.protocol) : entry.protocol;

  if (gridOnly) {
    window.cameraSettingsFromHPMdv = {};
    window.voiSettingsFromHPMdv = {};
    window.colormapFromHPMdv = {};
    window.imageIndexFromHPMdv = {};
  } else {
    const { camera, voi, color } = buildViewportSettingsFromEntry(entry);
    window.cameraSettingsFromHPMdv = camera;
    window.voiSettingsFromHPMdv = voi;
    window.colormapFromHPMdv = color;
    // A specific instance per viewport (0-based), skipping montages, which firstImageIndex handles.
    const captured = getCaptured(entry);
    const imgMap = {};
    if (captured.instance) {
      (entry.specificInstances || []).forEach((n, idx) => {
        if (n == null || entry.montageByIndex?.[idx]?.enabled) {
          return;
        }
        imgMap[`mdvhp-${idx}`] = n - 1;
      });
    }
    window.imageIndexFromHPMdv = imgMap;
  }
  window.viewportsAlreadyHPApplied = [];

  // A fresh id on every apply: _setProtocol only reassigns the protocol when the id
  // changes, so reapplying 'mdvhp' while it is already active would use the OLD protocol and do nothing.
  const runtimeId = `mdvhp-load-${++_hpRuntimeCounter}`;
  const protocol = cloneProtocol(baseProtocol);
  protocol.id = runtimeId;

  const { hangingProtocolService } = window.servicesManager.services;
  try {
    hangingProtocolService.addProtocol(runtimeId, protocol);
    hangingProtocolService.setProtocol(runtimeId);
    reapplyMontageAfterProtocol(entry.montageByIndex);
    return { ok: true };
  } catch (err) {
    console.warn('[HP] Applying it at once failed', err);
    return { ok: false, reason: 'Applying it failed' };
  }
};
