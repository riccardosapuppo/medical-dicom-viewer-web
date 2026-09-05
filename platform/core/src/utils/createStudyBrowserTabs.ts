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

export function createStudyBrowserTabs(
  primaryStudyInstanceUIDs,
  studyDisplayList,
  displaySets,
  recentTimeframeMS = 31536000000
) {
  const primaryStudies = [];
  const allStudies = [];

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
  // usando il locale attivo. Stesso criterio per entrambe le tab.
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
      label: 'Storico locale',
      studies: allStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
  ];

  // La tab dello storico compare se lo storico c e.
  //
  // Prima c era sempre, e quando il paziente non aveva esami precedenti
  // offriva una scheda che diceva solo "Nessuno storico". Una linguetta che
  // non porta da nessuna parte fa perdere un click a tutti quelli che la
  // provano, e non aggiunge niente a chi lo sapeva gia.
  return tabs.filter(tab => tab.name === 'primary' || tab.studies.length > 0);
}
