/**
 * hpStore.js — Data-layer (no-DOM) per la gestione degli Hanging Protocol custom.
 *
 * Estratto/rifattorizzato da salvataggioHP.js: contiene SOLO logica dati
 * (lettura/scrittura preferenze, matching, cattura dello stato viewport e
 * composizione dell'Hanging Protocol). Nessuna manipolazione del DOM: la UI
 * vive nel componente React HangingProtocolManager.
 *
 * Riusato sia dalla modale React sia (indirettamente, per le stesse regole di
 * matching) da caricamentoHP.js.
 */
import { metaData, getRenderingEngine } from '@cornerstonejs/core';
import { letturaPreferenzeAPI } from './caricamentoHP';
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

// La "partizione" (postazione) e l'aetitle sono sinonimi in questo sistema
// (vedi aperturaStorico.js). Le config viaggiano per (partizione, utente):
// lato server sono già salvate in userdata/{aetitle}/{user}/preferenze.json.
const getPartizione = () => window.mdvAETitle || getUrlParam('partizione') || getUrlParam('aetitle');
const getUsername = () => window.mdvUsername || getUrlParam('User');

export const getContext = () => ({
  aetitle: getPartizione(),
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

// I metadati dello studio sono già disponibili (displaySets caricati)? In tal caso
// qualunque descrizione/modality ancora vuota è un valore DEFINITIVO (studio senza nome
// / senza modality nei metadati), non un "sto ancora caricando": inutile aspettare oltre.
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
    // Metadati già caricati → abbiamo risolto tutto il possibile. Evita l'attesa piena
    // (che bloccava la modale "in caricamento" su postazioni il cui URL di lancio non
    // contiene i parametri StudyDescription/Modality, o sugli studi senza nome).
    if (studyMetadataAvailable()) {
      return;
    }
    await wait(stepMs);
  }
};

/* ------------------------------------------------------------------ *
 * Helper struttura / matching (riusati anche dalla UI)               *
 * ------------------------------------------------------------------ */

export const normalizza = value => (value || '').toString().trim().toUpperCase();
export const normalizzaModality = value =>
  (value || '')
    .toString()
    .split('\\')
    .map(item => normalizza(item))
    .filter(Boolean);

// Chiave d'IDENTITÀ di una config "descrizione esame": la descrizione normalizzata.
// (vuoto/assente/spazi/maiuscole diverse → stessa chiave). Usata identica da
// salvataggio, eliminazione, de-duplica e dalla modale, così si sovrascrive/elimina
// sempre la stessa entry (nessun duplicato "fantasma" per gli studi senza nome).
export const canonEsameKey = value => normalizza(value);

// Chiave d'IDENTITÀ di una config "modality": l'INSIEME ORDINATO delle modalità
// (case-insensitive). Così 'CT\MR' e 'MR\CT' (l'ordine dipende dall'ordine dei
// displaySet e può variare tra un'apertura e l'altra) contano come la STESSA config.
// NB: è volutamente diversa dal MATCHING di caricamento (che è a sovrapposizione di
// token, più permissivo, per decidere quale config si applica a uno studio): qui serve
// l'IDENTITÀ per sovrascrivere/eliminare/deduplicare senza ambiguità né perdita di dati.
export const canonModalityKey = value =>
  Array.from(new Set(normalizzaModality(value))).sort().join('\\');

// Collassa le entry array tenendo l'ULTIMA occorrenza per chiave d'identità (la più
// recente: i salvataggi vengono aggiunti in coda). Serve perché le entry legacy salvate
// per studi SENZA NOME avevano `nomeEsame: undefined` (chiave sparita dal JSON con
// JSON.stringify) mentre le nuove usano '': erano trattate come DIVERSE dal salvataggio/
// eliminazione ma UGUALI dal caricamento → duplicati "fantasma" non sovrascrivibili.
const dedupByKey = (arr, keyFn) => {
  const map = new Map();
  arr.forEach(item => {
    map.set(keyFn(item), item);
  });
  return Array.from(map.values());
};

export const ensureHpStructure = hp => {
  const safeHp = hp && typeof hp === 'object' ? hp : {};
  if (
    !safeHp.studioSpecifico ||
    typeof safeHp.studioSpecifico !== 'object' ||
    Array.isArray(safeHp.studioSpecifico)
  ) {
    safeHp.studioSpecifico = {};
  }
  safeHp.nomeEsame = dedupByKey(
    Array.isArray(safeHp.nomeEsame)
      ? safeHp.nomeEsame.filter(item => item && typeof item === 'object')
      : [],
    item => canonEsameKey(item?.nomeEsame)
  );
  safeHp.modality = dedupByKey(
    Array.isArray(safeHp.modality)
      ? safeHp.modality.filter(item => item && typeof item === 'object')
      : [],
    item => canonModalityKey(item?.nomeModality)
  );
  return safeHp;
};

export const ensurePreferenzePayload = preferenzePayload => {
  const safePayload =
    preferenzePayload && typeof preferenzePayload === 'object' ? preferenzePayload : {};
  if (!safePayload.json || typeof safePayload.json !== 'object') {
    safePayload.json = {};
  }
  safePayload.json.hp = ensureHpStructure(safePayload.json.hp);
  return safePayload;
};

export const parseLayout = (entry = {}) => {
  const layout =
    entry.layoutGriglia || entry.performanceHP?.stages?.[0]?.viewportStructure?.properties;
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
 * Default retro-compatibile: le entry salvate prima dell'introduzione dei flag
 * non hanno il campo `captured`. In quel caso il comportamento storico era:
 * griglia + serie + istanza + zoom/pan (il window level non veniva MAI salvato).
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
 * Determina la configurazione effettivamente applicabile allo studio corrente,
 * con priorità studio specifico > descrizione esame > modality.
 * (match normalizzato / parziale per modality).
 */
export const getAppliedHpConfig = (preferenzeJson, ctx = getContext()) => {
  const hp = preferenzeJson?.hp;
  if (!hp) {
    return null;
  }
  if (hp.studioSpecifico?.[ctx.studyInstanceUIDs]) {
    return {
      tipo: 'studioSpecifico',
      key: ctx.studyInstanceUIDs,
      entry: hp.studioSpecifico[ctx.studyInstanceUIDs],
    };
  }
  const nomeEsameNormalizzato = normalizza(ctx.studyDescription);
  const matchEsame = (hp.nomeEsame || []).find(
    item => normalizza(item?.nomeEsame) === nomeEsameNormalizzato
  );
  if (matchEsame) {
    return { tipo: 'descrizioneEsame', key: matchEsame.nomeEsame, entry: matchEsame };
  }
  const modalityCandidates = normalizzaModality(ctx.modality);
  const matchModality = (hp.modality || []).find(item => {
    const savedCandidates = normalizzaModality(item?.nomeModality);
    return savedCandidates.some(value => modalityCandidates.includes(value));
  });
  if (matchModality) {
    return { tipo: 'modality', key: matchModality.nomeModality, entry: matchModality };
  }
  return null;
};

const resolveSeriesLabelFromEntry = (entry, index) => {
  const saved = entry?.serieLabels?.[index];
  if (saved) {
    return saved;
  }
  const performanceHP = entry?.performanceHP || {};
  const viewport = performanceHP?.stages?.[0]?.viewports?.[index];
  const displaySetId = viewport?.displaySets?.[0]?.id || `DisplaySet${index}`;
  const rule = performanceHP?.displaySetSelectors?.[displaySetId]?.seriesMatchingRules?.[0];
  if (!rule || !rule.attribute) {
    return 'Serie';
  }
  const constraint = rule.constraint || {};
  let value = constraint.contains ?? constraint.equals ?? constraint.startsWith ?? '';
  if (Array.isArray(value)) {
    value = value[0];
  }
  if (rule.attribute === 'SeriesDescription' && value) {
    return `Serie ${value}`;
  }
  if (rule.attribute === 'SeriesNumber' && value !== '') {
    return `Serie ${value}`;
  }
  return 'Serie';
};

/* ------------------------------------------------------------------ *
 * Lettura / scrittura preferenze remote + cache localStorage          *
 * ------------------------------------------------------------------ */

// La cache locale deve essere per (partizione, utente): senza l'utente, su una
// postazione condivisa un altro utente leggerebbe la config di chi l'ha preceduto.
const localStorageKey = () => {
  const ctx = getContext();
  return `preferenzeUtente-${ctx.aetitle}-${ctx.username}`;
};

/**
 * Ritorna un payload normalizzato `{ json: { hp: {...} } }` pronto sia per la
 * lettura (`payload.json.hp`) sia per la scrittura (`payload.json`).
 */
export const readPreferenze = async () => {
  const ctx = getContext();
  const raw = await letturaPreferenzeAPI(ctx.aetitle, ctx.username, ctx.studyInstanceUIDs);
  if (raw && typeof raw === 'object') {
    return ensurePreferenzePayload(raw);
  }
  // Fallback cache locale: la localStorage memorizza direttamente l'oggetto `json`.
  let cachedJson = {};
  try {
    cachedJson = JSON.parse(localStorage.getItem(localStorageKey()) || '{}');
  } catch (err) {
    console.warn('[HP] Preferenze utente in cache locale non valide', err);
  }
  return ensurePreferenzePayload({ json: cachedJson });
};

const scritturaPreferenzeAPI = async (aetitle, username, body) => {
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
      console.error('[HP] Errore durante la scrittura delle preferenze utente');
      return null;
    }
    // Un indirizzo che il server non conosce risponde con la pagina
    // dell'applicazione e stato 200. Senza guardare il tipo del corpo la
    // scrittura si dichiarerebbe riuscita, e il pannello direbbe salvato
    // sul server quando non e arrivato niente da nessuna parte.
    if ((apiResponse.headers.get('content-type') || '').includes('text/html')) {
      console.warn('[HP] Nessun archivio remoto delle preferenze: resta la copia locale');
      return null;
    }
    return apiResponse.text();
  } catch (err) {
    console.error('[HP] Errore durante la scrittura delle preferenze utente', err);
    return null;
  }
};

/**
 * Salva le preferenze.
 *
 * La cache locale viene scritta SEMPRE, anche quando il backend non risponde.
 * In lettura la cache era gia il ripiego (vedi readPreferenze), ma in scrittura
 * non lo era: senza backend il salvataggio tornava false e il protocollo andava
 * perso, cioe la funzione sembrava rotta invece che non sincronizzata.
 *
 * Il backend, quando c e, resta la copia autorevole e condivisa fra postazioni.
 * Il valore restituito dice se la sincronizzazione e riuscita, non se il
 * salvataggio e avvenuto.
 */
const writePreferenze = async payload => {
  const ctx = getContext();

  try {
    localStorage.setItem(localStorageKey(), JSON.stringify(payload.json));
  } catch (err) {
    // Finestra privata, o spazio esaurito: resta il tentativo remoto.
    console.warn('[HP] Impossibile scrivere la cache locale delle preferenze', err);
  }

  const res = await scritturaPreferenzeAPI(ctx.aetitle, ctx.username, payload.json);
  return Boolean(res);
};

/* ------------------------------------------------------------------ *
 * Cattura dello stato corrente → Hanging Protocol                     *
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
    /* viewport non pronto / non supportato */
  }
  return null;
};

// Color LUT (colormap) corrente del viewport. Il default grigio non ha colormap
// → null (non salvato/applicato). Salvo solo il nome (basta a setProperties).
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
    /* viewport non pronto / non supportato */
  }
  return null;
};

/**
 * captureOptions = { grid, series, instance, windowLevel, zoomPan, colorLut }
 * scope = 'specificStudy' | 'descrizioneEsame' | 'modality'
 *   (per 'specificStudy' la serie viene agganciata via SeriesInstanceUID,
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

  const layoutGriglia = window.layout || '1x1';
  const columns = Number(layoutGriglia.split('x')[0]) || 1;
  const rows = Number(layoutGriglia.split('x')[1]) || 1;

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
  const istanzeSpecifiche = [];
  const serieLabels = [];
  const montageByIndex = [];

  let i = 0;
  viewports.forEach(_viewport => {
    const { viewportId } = _viewport;
    const displaySetKey = `DisplaySet${i}`;
    const hpViewportId = `mdvhp-${i}`;

    // Sottogriglia (Montage): le celle vivono nell'engine DEDICATO (non nel
    // principale). Per leggere istanza/scroll, WL e zoom/pan LIVE uso la cella
    // primaria di quell'engine, non il viewport principale (che non esiste).
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
      istanzeSpecifiche.push(null);
      voiByIndex.push(null);
      colorByIndex.push(null);
      serieLabels.push('Serie');
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
      // Inquadratura RELATIVA (framing.js): scala-invariante, quindi valida anche
      // quando l'HP verra' applicato in una cella di dimensioni diverse (storico
      // affiancato, altri monitor). I campi assoluti sopra restano come fallback
      // per le build precedenti a questa modifica.
      const framingData = isMontage ? null : captureFraming(viewport);
      if (framingData) {
        cameraData.framing = framingData;
      }
      // Per le montage il camera va alle celle (engine dedicato), non al viewport principale.
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

    // --- Serie ---
    const descrizioneSerieFromUi =
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
    const descrizioneSerieFromMeta = instanceMeta?.SeriesDescription || '';
    let descrizioneSerie =
      descrizioneSerieFromUi || descrizioneSerieFromMeta || displaySetSeriesDescription;
    if (typeof descrizioneSerie === 'string') {
      descrizioneSerie = descrizioneSerie.trim();
    }
    if (!descrizioneSerie && seriesInstanceUID) {
      const ds = (displaySetService?.getDisplaySetsForSeries?.(seriesInstanceUID) || [])[0];
      descrizioneSerie = ds?.SeriesDescription || ds?.instances?.[0]?.SeriesDescription || '';
    }

    // --- Istanza corrente ---
    let numeroIstanza = null;
    if (Number.isFinite(viewport?.currentImageIdIndex)) {
      numeroIstanza = viewport.currentImageIdIndex + 1;
    } else if (typeof viewport?.getCurrentImageIdIndex === 'function') {
      const idx = viewport.getCurrentImageIdIndex();
      if (Number.isFinite(idx)) {
        numeroIstanza = idx + 1;
      }
    }
    istanzeSpecifiche.push(numeroIstanza);

    serieLabels.push(
      descrizioneSerie && seriesNumber != null
        ? `Serie ${seriesNumber} ${descrizioneSerie}`
        : descrizioneSerie
          ? `Serie ${descrizioneSerie}`
          : seriesNumber != null
            ? `Serie ${seriesNumber}`
            : 'Serie'
    );

    // --- Regola di matching serie (rispetta il flag "series") ---
    let seriesMatchingRules;
    if (!opts.series) {
      seriesMatchingRules = [{}];
    } else if (scope === 'specificStudy') {
      // Studio specifico: la SeriesInstanceUID e' esatta e sufficiente (stesso studio) → invariato.
      seriesMatchingRules = [
        { attribute: 'SeriesInstanceUID', constraint: { contains: seriesInstanceUID } },
      ];
    } else {
      // Cross-studio (descrizione esame / modality). La regola LEGACY su nome/numero
      // serie resta come FALLBACK a peso basso (comportamento storico invariato)...
      const legacyRule =
        !descrizioneSerie && seriesNumber != null
          ? { attribute: 'SeriesNumber', constraint: { equals: seriesNumber }, weight: 1 }
          : { attribute: 'SeriesDescription', constraint: { equals: descrizioneSerie }, weight: 1 };
      seriesMatchingRules = [legacyRule];
      // ...e, SE la serie di questa cella ha un'identita' di VISTA nomenclatura-
      // indipendente (lateralita' + ViewCode; tipicamente mammografia, ma vale per
      // qualunque serie che porti quei tag), si aggiunge una regola a peso ALTO cosi'
      // vince sul nome/numero (che cambiano fra studi con nomenclature diverse).
      // Se i tag vista NON ci sono (es. CT/MR), non si aggiunge nulla → seriesMatchingRules
      // resta identica a prima ⇒ nessuna regressione. Il matcher somma i pesi delle regole
      // che passano e sceglie il displaySet col punteggio piu' alto.
      const viewKey = deriveViewKey(primaryDisplaySet);
      if (viewKey) {
        seriesMatchingRules.unshift({
          attribute: MDV_VIEW_KEY_ATTR,
          constraint: { equals: viewKey },
          weight: 100,
        });
        // Spareggio 2D/3D ACCOPPIATO alla vista (chiave lat|view|dim): fra serie della
        // stessa vista preferisce lo stesso tipo salvato, ma una serie di vista DIVERSA
        // non prende punti solo perche' condivide la dimensione (evita che il peso 20
        // scavalchi il fallback nome/numero quando la vista non combacia).
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

    // Sottogriglia: salva scroll/istanza (firstImageIndex LIVE dalla cella primaria),
    // window level e zoom/pan dentro l'oggetto montage (riapplicati alle celle in riapertura).
    const montage = buildMontage(
      isMontage
        ? {
            firstImageIndex:
              numeroIstanza != null ? numeroIstanza - 1 : montageOpt.firstImageIndex ?? 0,
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
    // Per le montage l'istanza è gestita da firstImageIndex (initialImageOptions sarebbe ignorato).
    // initialImageOptions.index è 0-based, mentre numeroIstanza è 1-based.
    if (opts.instance && numeroIstanza != null && !isMontage) {
      viewportOptions.initialImageOptions = { index: numeroIstanza - 1 };
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
      layoutGriglia,
      istanzeSpecifiche,
      voiByIndex,
      montageByIndex,
      hasCamera: Object.keys(cameraHP).length,
    });
  }

  return {
    performanceHP: protocol,
    layoutGriglia,
    captured: opts,
    cameraHP,
    cameraByIndex,
    voiHP,
    voiByIndex,
    colorHP,
    colorByIndex,
    istanzeSpecifiche,
    serieLabels,
    montageByIndex,
  };
};

const buildEntry = (captureState, extra = {}) => ({
  performanceHP: captureState.performanceHP,
  layoutGriglia: captureState.layoutGriglia,
  captured: captureState.captured,
  camera: captureState.cameraHP,
  cameraByIndex: captureState.cameraByIndex,
  voi: captureState.voiHP,
  voiByIndex: captureState.voiByIndex,
  colormap: captureState.colorHP,
  colormapByIndex: captureState.colorByIndex,
  istanzeSpecifiche: captureState.istanzeSpecifiche,
  serieLabels: captureState.serieLabels,
  montageByIndex: captureState.montageByIndex,
  // campi legacy mantenuti per retro-compatibilità con lo schema esistente
  layoutPersonalizzato: null,
  allineamento: null,
  scalaOverlay: null,
  WL: null,
  serieSpecifiche: null,
  ...extra,
});

/* ------------------------------------------------------------------ *
 * Operazioni di salvataggio / eliminazione                            *
 * ------------------------------------------------------------------ */

const SCOPE_TO_CAPTURE = {
  studioSpecifico: 'specificStudy',
  descrizioneEsame: 'descrizioneEsame',
  modality: 'modality',
};

/**
 * scope = 'studioSpecifico' | 'descrizioneEsame' | 'modality'
 * Ritorna { ok, reason? }.
 */
export const saveConfig = async (scope, captureOptions) => {
  const ctx = getContext();
  const payload = await readPreferenze();
  const hp = payload.json.hp;

  if (scope === 'descrizioneEsame' && ctx.studyDescription === '') {
    // consentito ma documentato: la config varrà per gli esami senza nome
  }
  if (scope === 'modality' && ctx.modality === '') {
    return { ok: false, reason: 'Modality non disponibile per questo studio' };
  }

  const captureState = captureCurrentState(SCOPE_TO_CAPTURE[scope], captureOptions);

  if (scope === 'studioSpecifico') {
    hp.studioSpecifico[ctx.studyInstanceUIDs] = buildEntry(captureState);
  } else if (scope === 'descrizioneEsame') {
    const entry = buildEntry(captureState, { nomeEsame: ctx.studyDescription });
    // Confronto NORMALIZZATO: sovrascrive l'entry esistente (anche legacy con nomeEsame
    // assente/undefined, o con spazi/maiuscole diverse) invece di crearne un duplicato
    // "fantasma". Rimuove tutte le normalize-uguali e ne tiene una sola, la più recente.
    const target = normalizza(ctx.studyDescription);
    hp.nomeEsame = hp.nomeEsame.filter(item => normalizza(item?.nomeEsame) !== target);
    hp.nomeEsame.push(entry);
  } else if (scope === 'modality') {
    const entry = buildEntry(captureState, { nomeModality: ctx.modality });
    // Chiave CANONICA (insieme ordinato): sovrascrive la config della STESSA combinazione
    // di modality (anche con ordine token diverso, es. 'CT\MR' vs 'MR\CT') senza creare
    // doppioni; NON tocca config di combinazioni diverse ma sovrapposte (es. 'PT\CT') →
    // niente perdita di dati. Coerente con delete/dedup/modale (existsForScope).
    const target = canonModalityKey(ctx.modality);
    hp.modality = hp.modality.filter(item => canonModalityKey(item?.nomeModality) !== target);
    hp.modality.push(entry);
  } else {
    return { ok: false, reason: 'Ambito non valido' };
  }

  payload.json.hp = hp;
  const ok = await writePreferenze(payload);
  return { ok };
};

/**
 * scope = 'studioSpecifico' | 'descrizioneEsame' | 'modality'
 * key = StudyInstanceUID | nomeEsame | nomeModality (la chiave REALE memorizzata).
 */
export const deleteConfig = async (scope, key) => {
  const payload = await readPreferenze();
  const hp = payload.json.hp;

  if (scope === 'studioSpecifico') {
    delete hp.studioSpecifico[key];
  } else if (scope === 'descrizioneEsame') {
    // Confronto NORMALIZZATO: elimina l'entry mostrata (chiave '' per gli esami senza
    // nome) anche se salvata come undefined/vuota/case diverso, senza colpire per errore
    // un'altra entry (bug "elimina quella sbagliata / quella salvata in precedenza").
    const target = normalizza(key);
    hp.nomeEsame = hp.nomeEsame.filter(item => normalizza(item?.nomeEsame) !== target);
  } else if (scope === 'modality') {
    const target = canonModalityKey(key);
    hp.modality = hp.modality.filter(item => canonModalityKey(item?.nomeModality) !== target);
  } else {
    return { ok: false, reason: 'Ambito non valido' };
  }

  payload.json.hp = hp;
  const ok = await writePreferenze(payload);
  return { ok };
};

/* ------------------------------------------------------------------ *
 * Elenco di TUTTE le config salvate (risolve il bug "non eliminabile")*
 * ------------------------------------------------------------------ */

const SCOPE_LABEL = {
  studioSpecifico: 'Studio specifico',
  descrizioneEsame: 'Descrizione esame',
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

// Una regola "vuota" [{}] combacia sempre (riempie con la prima serie disponibile).
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
    // Regole basate sulla VISTA (mammografia): l'applicabilità va verificata
    // ricalcolando l'identità di vista sui displaySet dello studio corrente, non con
    // il ramo generico `return true` (che darebbe sempre applicabile → niente avviso
    // "serie non disponibili" né "Carica solo griglia").
    if (attr === MDV_VIEW_KEY_ATTR) {
      return deriveViewKey(ds) === value;
    }
    if (attr === MDV_VIEW_DIM_KEY_ATTR) {
      return deriveViewDimKey(ds) === value;
    }
    return true;
  });
};

// Quante delle serie vincolate dalla config NON esistono nello studio corrente.
// NB: una cella ha PIU' regole pesate (vista + nome/numero di fallback). Il matcher reale
// sceglie il miglior punteggio tra TUTTE le regole, quindi la cella è "presente" se
// ALMENO UNA regola combacia (vista OPPURE nome/numero) — non solo la prima. Guardare solo
// la regola[0] (la vista) segnalerebbe erroneamente "non applicabile" uno studio privo dei
// tag-vista ma con la serie giusta per nome, forzando inutilmente il "Carica solo griglia".
const computeApplicability = (entry, displaySets) => {
  const performanceHP = entry?.performanceHP || {};
  const viewports = performanceHP?.stages?.[0]?.viewports || [];
  const selectors = performanceHP?.displaySetSelectors || {};
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

// La config è "rilevante" per lo studio corrente (stesso ambito/valore)?
const isRelevant = (scope, key, ctx) => {
  if (scope === 'studioSpecifico') {
    return key === ctx.studyInstanceUIDs;
  }
  if (scope === 'descrizioneEsame') {
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
      istanza: entry?.istanzeSpecifiche?.[i] ?? null,
    });
  }
  const isApplied =
    !!applied && applied.tipo === scope && (scope !== 'studioSpecifico' || applied.key === key);
  const { applicable, missing } = computeApplicability(entry, displaySets);
  return {
    scope,
    key,
    scopeLabel: SCOPE_LABEL[scope],
    title:
      scope === 'studioSpecifico'
        ? 'Questo studio'
        : scope === 'descrizioneEsame'
          ? key || '(esame senza nome)'
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
 * Ritorna l'elenco di TUTTE le entry salvate, ognuna con la propria chiave reale
 * di delete (sempre eliminabile, risolve il bug della config "orfana") e con i
 * flag `relevant` (stesso ambito dello studio corrente) e `applicable` (le serie
 * referenziate esistono nello studio corrente). La UI separa rilevanti vs gestione.
 */
export const listSavedConfigs = (preferenzeJson, ctx = getContext()) => {
  const hp = ensureHpStructure(preferenzeJson?.hp);
  const applied = getAppliedHpConfig({ hp }, ctx);
  const displaySets = getCurrentStudyDisplaySets(ctx);
  const out = [];

  if (hp.studioSpecifico?.[ctx.studyInstanceUIDs]) {
    out.push(
      describeEntry(
        'studioSpecifico',
        ctx.studyInstanceUIDs,
        hp.studioSpecifico[ctx.studyInstanceUIDs],
        ctx,
        applied,
        displaySets
      )
    );
  }
  hp.nomeEsame.forEach(entry => {
    out.push(describeEntry('descrizioneEsame', entry?.nomeEsame ?? '', entry, ctx, applied, displaySets));
  });
  hp.modality.forEach(entry => {
    out.push(describeEntry('modality', entry?.nomeModality ?? '', entry, ctx, applied, displaySets));
  });
  return out;
};

/* ------------------------------------------------------------------ *
 * Applicazione immediata di una config ("Carica")                     *
 * ------------------------------------------------------------------ */

// Rimappa una sorgente per-viewport (mappa `mdvhp-i` oppure array per-indice) → mappa per-id.
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

// "Solo griglia": stesse celle/layout (+ eventuale sottogriglia) ma senza vincolare
// le serie specifiche né l'istanza → riproduce lo schema anche se le serie differiscono.
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

// Le sottogriglie Montage vengono perse dall'Hanging Protocol (rigenera viewportOptions):
// le riapplichiamo dopo che il nuovo layout è pronto, via setDisplaySetsForViewports.
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
      console.warn('[HP] Riapplicazione sottogriglia fallita', err);
    }
    sub?.unsubscribe?.();
  };
  // I viewport del nuovo layout possono non essere pronti subito dopo setProtocol.
  const sub = viewportGridService.subscribe?.(
    viewportGridService.EVENTS.VIEWPORTS_READY,
    runOnce
  );
  setTimeout(runOnce, 350);
};

/**
 * Applica SUBITO una config salvata. Riceve direttamente l'entry (niente re-match
 * fragile per chiave → niente più "Configurazione non trovata").
 * options.gridOnly = applica solo griglia/sottogriglia (serie libere, no istanza/WL/zoom),
 * usato quando alcune serie non esistono nello studio corrente.
 */
export const applyConfigNow = (entry, options = {}) => {
  if (!entry?.performanceHP) {
    return { ok: false, reason: 'Configurazione non valida' };
  }
  // Rete di sicurezza idempotente: gli attributi custom di vista devono essere
  // registrati prima che il matcher valuti le regole salvate (il caricamento
  // automatico li registra già all'avvio).
  registerMdvHPAttributes(window.servicesManager?.services?.hangingProtocolService);
  const gridOnly = !!options.gridOnly;
  const baseProtocol = gridOnly ? toGridOnlyProtocol(entry.performanceHP) : entry.performanceHP;

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
    // Istanza specifica per-viewport (0-based), saltando le montage (gestite da firstImageIndex).
    const captured = getCaptured(entry);
    const imgMap = {};
    if (captured.instance) {
      (entry.istanzeSpecifiche || []).forEach((n, idx) => {
        if (n == null || entry.montageByIndex?.[idx]?.enabled) {
          return;
        }
        imgMap[`mdvhp-${idx}`] = n - 1;
      });
    }
    window.imageIndexFromHPMdv = imgMap;
  }
  window.viewportsAlreadyHPApplied = [];

  // Id univoco a ogni apply: _setProtocol riassegna il protocollo SOLO se l'id cambia,
  // altrimenti ri-applicare 'mdvhp' (già attivo) userebbe il protocollo VECCHIO → nessun cambiamento.
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
    console.warn('[HP] Applicazione immediata fallita', err);
    return { ok: false, reason: 'Applicazione fallita' };
  }
};
