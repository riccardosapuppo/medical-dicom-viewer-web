import moment from 'moment';

/**
 *
 * @param {string[]} primaryStudyInstanceUIDs
 * @param {object[]} studyDisplayList
 * @param {string} studyDisplayList.studyInstanceUid
 * @param {string} studyDisplayList.date
 * @param {string} studyDisplayList.description
 * @param {string} studyDisplayList.modalities
 * @param {number} studyDisplayList.numInstances
 * @param {object[]} displaySets
 * @param {number} recentTimeframe - The number of milliseconds to consider a study recent
 * @returns tabs - The prop object expected by the StudyBrowser component
 */

const INVALID_STUDY_DESCRIPTION_VALUES = new Set([
  'no data studio',
  'no data study',
  'no data',
  'n/a',
  'na',
  'null',
  'undefined',
  '(vuoto)',
]);

const normalizeText = value => {
  if (value === undefined || value === null) {
    return '';
  }
  return `${value}`.replace(/\s+/g, ' ').trim();
};

const normalizeStudyDescription = value => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  if (INVALID_STUDY_DESCRIPTION_VALUES.has(normalized.toLowerCase())) {
    return '';
  }

  return normalized;
};

const normalizeStudyDate = value => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  if (INVALID_STUDY_DESCRIPTION_VALUES.has(normalized.toLowerCase())) {
    return '';
  }

  return normalized;
};

// Converte in timestamp sia la data DICOM grezza (YYYYMMDD) sia quella gia' formattata
// per la UI (DD-MMM-YYYY, con il mese nella lingua corrente).
const _timestampStudio = value => {
  const testo = `${value === undefined || value === null ? '' : value}`.trim();
  if (!testo) {
    return NaN;
  }
  if (/^\d{8}$/.test(testo)) {
    return moment(testo, 'YYYYMMDD').valueOf();
  }
  const formattata = moment(testo, 'DD-MMM-YYYY');
  return formattata.isValid() ? formattata.valueOf() : Date.parse(testo);
};

// In build di produzione webpack forza window.isSuite = false anche sul deploy della suite:
// il flag affidabile a runtime e' window.isSuiteRuntime (impostato in config/default.js).
const inSuite = () =>
  (window as any).isSuiteRuntime !== undefined
    ? !!(window as any).isSuiteRuntime
    : !!(window as any).isSuite;

export function createStudyBrowserTabs(
  primaryStudyInstanceUIDs,
  studyDisplayList,
  displaySets,
  recentTimeframeMS = 31536000000
) {
  const primaryStudies = [];
  let allStudies = [];
  let studiRemoti = [];

  studyDisplayList.forEach(study => {
    const displaySetsForStudy = displaySets.filter(
      ds => ds.StudyInstanceUID === study.studyInstanceUid
    );
    const descriptionFromDisplaySets = displaySetsForStudy
      .map(ds => normalizeStudyDescription(ds?.studyDescription || ds?.StudyDescription))
      .find(Boolean);
    const dateFromDisplaySets = displaySetsForStudy
      .map(ds => normalizeStudyDate(ds?.studyDate || ds?.StudyDate || ds?.seriesDate))
      .find(Boolean);
    const normalizedStudyDescription = normalizeStudyDescription(study?.description);
    const normalizedStudyDate = normalizeStudyDate(study?.date);
    const tabStudy = Object.assign({}, study, {
      date: normalizedStudyDate || dateFromDisplaySets || '',
      description: normalizedStudyDescription || descriptionFromDisplaySets || '',
      displaySets: displaySetsForStudy,
    });

    if (primaryStudyInstanceUIDs.includes(study.studyInstanceUid)) {
      primaryStudies.push(tabStudy);
    } else {
      allStudies.push(tabStudy);
    }
  });

  allStudies = allStudies.filter(study => {
    const studyDescription = normalizeText(study.description);
    if (studyDescription.includes('|Remoto|')) {
      study.description = studyDescription.replace('|Remoto|', '').trim();
      studiRemoti.push(study);
      return false; // Esclude l'elemento da allStudies
    }
    return true; // Mantiene l'elemento in allStudies
  });

  // Nessun placeholder fittizio: la tab remota resta cliccabile anche a lista vuota
  // (vedi StudyBrowserViewOptions) e a comunicare lo stato ci pensa il badge.
  window.studiRemoti = JSON.parse(JSON.stringify(studiRemoti));

  const primaryStudiesTimestamps = primaryStudies
    .filter(study => study.date)
    .map(study => _timestampStudio(study.date))
    .filter(t => !Number.isNaN(t));

  const recentStudies =
    primaryStudiesTimestamps.length > 0
      ? allStudies.filter(study => {
        const oldestPrimaryTimeStamp = Math.min(...primaryStudiesTimestamps);

        if (!study.date) {
          return false;
        }
        const studyTimeStamp = _timestampStudio(study.date);
        return oldestPrimaryTimeStamp - studyTimeStamp < recentTimeframeMS;
      })
      : [];

  // Newest first.
  // Le date arrivano gia' formattate per la UI ("27-giu-2024", dipende dalla lingua) oppure
  // grezze dal DICOM ("20240627"): su entrambe Date.parse restituisce NaN, quindi il
  // comparatore era invalido e l'ordinamento di fatto non avveniva. moment le interpreta
  // usando il locale attivo. Stesso criterio per tutte le tab, remota compresa.
  const _byDate = (a, b) => {
    const dateA = _timestampStudio(a);
    const dateB = _timestampStudio(b);

    // Gli studi senza data valida finiscono in fondo invece di falsare l'ordine.
    if (Number.isNaN(dateA) && Number.isNaN(dateB)) {
      return 0;
    }
    if (Number.isNaN(dateA)) {
      return 1;
    }
    if (Number.isNaN(dateB)) {
      return -1;
    }

    return dateB - dateA;
  };
  const tabs = [
    {
      name: 'primary',
      label: 'Studio attuale',
      studies: primaryStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
    {
      name: 'all',
      label: inSuite() ? 'Storico sul cloud' : 'Storico locale',
      studies: allStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
  ];

  //Tabs con storico remoto
  const tabsStoricoRemoto = [
    {
      name: 'primary',
      label: 'Studio attuale',
      studies: primaryStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
    // {
    //   name: 'recent',
    //   label: 'Storico sul cloud',
    //   studies: recentStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    // },
    {
      name: 'all',
      label: inSuite() ? 'Storico sul cloud' : 'Storico locale',
      studies: allStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
    // {
    //   name: 'all',
    //   label: 'All',
    //   studies: allStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    // },
    {
      name: 'remoteAll',
      label: 'Storico remoto',
      studies: studiRemoti.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
  ];

  // La tab "Storico remoto" ha senso solo dalla suite (sull'installazione del centro lo
  // storico e' gia' tutto locale) E solo se per la partizione dell'URL esiste davvero un
  // centro in "remotePeers": la verifica la fa il pannello, qui si legge solo l'esito.
  if (window.storicoRemoto && inSuite() && (window as any).storicoRemotoDisponibile) {
    return tabsStoricoRemoto;
  } else {
    return tabs;
  }
}
