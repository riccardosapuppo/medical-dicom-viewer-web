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
  // These are values an archive SENDS as a study description, not text this
  // project writes, so they stay in whatever language the archive speaks. The
  // Italian ones are here because the archive this reconstructs sent them.
  //
  // 'no data studio' was translated to 'no data study' in an earlier sweep,
  // which both collided with the entry already there and stopped the real
  // value from being recognised: a study whose description is literally
  // "no data studio" started showing that string as its name.
  'no data study',
  'no data studio',
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

// Turns into a timestamp both the raw DICOM date (YYYYMMDD) and the one already formatted
// for the interface (DD-MMM-YYYY, with the month in whatever language is current).
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
  // The dates arrive either already formatted for the interface ("27-Jun-2024", which
  // depends on the language) or raw from the DICOM ("20240627"). Date.parse returns NaN
  // on both, so the comparator was invalid and no sorting actually happened. moment reads
  // them using the active locale. The same rule for both tabs.
  const _byDate = (a, b) => {
    const dateA = _timestampStudio(a);
    const dateB = _timestampStudio(b);

    // Studies with no valid date go to the end rather than distorting the order.
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
      label: 'Current study',
      studies: primaryStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
    {
      name: 'all',
      label: 'Local priors',
      studies: allStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
  ];

  // The priors tab appears when there are priors.
  //
  // It used to be there always, and when the patient had no earlier exams it offered a
  // tab that said only "No prior studies". A tab that leads nowhere costs a click to
  // everyone who tries it, and adds nothing for anyone who already knew.
  return tabs.filter(tab => tab.name === 'primary' || tab.studies.length > 0);
}
