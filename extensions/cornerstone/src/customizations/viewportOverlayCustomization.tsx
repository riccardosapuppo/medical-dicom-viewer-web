import dcmjs from 'dcmjs';
import { metaData } from '@cornerstonejs/core';

const { DicomMetaDictionary } = dcmjs.data;

const DEFAULT_CLASSNAME = 'overlay-info-dicom';

const getTagConfig = overlayConfig => {
  if (overlayConfig && typeof overlayConfig === 'object') {
    return overlayConfig;
  }
  return typeof window !== 'undefined' ? window?.config?.viewportOverlayTags || {} : {};
};

const getCornerConfig = (tagConfig, cornerKey) => {
  return (
    tagConfig?.[cornerKey] ??
    tagConfig?.[`corner${cornerKey[0].toUpperCase()}${cornerKey.slice(1)}`]
  );
};

const hasCornerConfig = (tagConfig, cornerKey) =>
  Array.isArray(getCornerConfig(tagConfig, cornerKey));

const resolveTagDefinition = tagOrKeyword => {
  if (!tagOrKeyword) {
    return null;
  }

  const raw = String(tagOrKeyword).trim();
  if (!raw) {
    return null;
  }

  const nameMapEntry = DicomMetaDictionary?.nameMap?.[raw];
  if (nameMapEntry) {
    return {
      keyword: raw,
      tag: nameMapEntry.tag,
      vr: nameMapEntry.vr,
    };
  }

  const cleaned = raw.replace(/[^0-9A-Fa-f]/g, '');
  const punctuatedTag =
    cleaned.length === 8 ? DicomMetaDictionary?.punctuateTag?.(cleaned) : raw;

  const dictionaryEntry =
    punctuatedTag && DicomMetaDictionary?.dictionary?.[punctuatedTag];

  if (dictionaryEntry) {
    return {
      keyword: dictionaryEntry.name,
      tag: dictionaryEntry.tag,
      vr: dictionaryEntry.vr,
    };
  }

  if (cleaned.length === 8) {
    return {
      keyword: cleaned,
      tag: punctuatedTag,
    };
  }

  return { keyword: raw };
};

const formatFromVR = vr => {
  if (!vr) {
    return null;
  }

  if (vr === 'DA') {
    return 'date';
  }
  if (vr === 'TM') {
    return 'time';
  }
  if (vr === 'PN') {
    return 'pn';
  }
  if (vr === 'DT') {
    return 'dateTime';
  }

  return null;
};

// Lettura piatta di un attributo/tag da un "bag" naturalizzato (keyword o hex).
const readFromBag = (bag: any, attribute: any, tag: any) => {
  if (!bag) {
    return undefined;
  }
  if (attribute && bag[attribute] !== undefined) {
    return bag[attribute];
  }
  if (tag) {
    const cleanedTag = String(tag).replace(/[^0-9A-Fa-f]/g, '');
    if (cleanedTag && bag[cleanedTag] !== undefined) {
      return bag[cleanedTag];
    }
    if (bag[tag] !== undefined) {
      return bag[tag];
    }
  }
  return undefined;
};

// imageId dell'immagine ATTUALMENTE mostrata nella viewport: si aggiorna allo
// scroll. Per gli stack e' imageIds[indiceCorrente] (per un multiframe l'imageId
// codifica gia' il frame, .../frames/N); per i volume/MPR e' la source imageId
// geometricamente piu' vicina (best-effort fuori dal piano di acquisizione).
// Puo' essere undefined durante i cambi layout / il primo render.
const getCurrentImageId = (props: any) => {
  const cornerstoneViewportService =
    props?.servicesManager?.services?.cornerstoneViewportService;
  const viewport = cornerstoneViewportService?.getCornerstoneViewport?.(props?.viewportId);
  const liveImageId = viewport?.getCurrentImageId?.();
  if (liveImageId) {
    return liveImageId;
  }
  const datum = props?.viewportData?.data?.[0];
  const imageIndex = props?.imageSliceData?.imageIndex ?? 0;
  const imageIds = datum?.imageIds || datum?.volume?.imageIds;
  return imageIds ? imageIds[imageIndex] : undefined;
};

const isPresent = (value: any) => value !== undefined && value !== null && value !== '';

const getTagValue = (props: any, { attribute, tag, source }: any) => {
  const displaySet = props?.displaySet ?? props?.displaySets?.[0];

  // source:'reference' = valore CONGELATO alla prima istanza (opt-out esplicito,
  // utile per intestazioni stabili). Ogni altro valore risolve sul frame corrente.
  if (source !== 'reference') {
    // metaData.get('instance', imageId) passa dal MetadataProvider OHIF, che per
    // un imageId con frame appiattisce Shared/PerFrame FunctionalGroups (via
    // combineFrameInstance): cosi' i tag per-frame dei multiframe (es. 0018,9327
    // Table Position) diventano attributi piatti e cambiano frame per frame.
    const imageId = getCurrentImageId(props);
    if (imageId) {
      let liveInstance;
      try {
        liveInstance = metaData.get('instance', imageId);
      } catch (err) {
        liveInstance = undefined;
      }
      const liveValue = readFromBag(liveInstance, attribute, tag);
      if (isPresent(liveValue)) {
        return liveValue;
      }
    }

    // Fallback: istanza per-slice dello stack (instances[imageIndex]).
    const instanceValue = readFromBag(props?.instance, attribute, tag);
    if (isPresent(instanceValue)) {
      return instanceValue;
    }
  }

  // Fallback comune: prima istanza (referenceInstance) -> displaySet.
  const refValue = readFromBag(props?.referenceInstance ?? props?.instance, attribute, tag);
  if (isPresent(refValue)) {
    return refValue;
  }
  return readFromBag(displaySet, attribute, tag);
};

const formatTagValue = (value, format, formatters) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (format === 'pn') {
    const pnValue = value?.Alphabetic ?? value;
    return formatters?.formatPN ? formatters.formatPN(pnValue) : pnValue;
  }

  if (format === 'date') {
    return formatters?.formatDate ? formatters.formatDate(value) : value;
  }

  if (format === 'time') {
    return formatters?.formatTime ? formatters.formatTime(value) : value;
  }

  if (format === 'dateTime') {
    const date = formatters?.formatDate ? formatters.formatDate(value) : value;
    const time = formatters?.formatTime ? formatters.formatTime(value) : '';
    return time ? `${date} ${time}` : date;
  }

  if (Array.isArray(value)) {
    return value.join('\\');
  }

  if (typeof value === 'object') {
    if (value.Alphabetic) {
      return formatters?.formatPN ? formatters.formatPN(value.Alphabetic) : value.Alphabetic;
    }
  }

  return String(value);
};

const buildTagItemsFromConfig = configItems => {
  if (!Array.isArray(configItems)) {
    return [];
  }

  return configItems
    .map((item, index) => {
      const definition = typeof item === 'string' ? { tag: item } : item;
      if (!definition) {
        return null;
      }

      const resolved = resolveTagDefinition(
        definition.tag || definition.keyword || definition.attribute
      );
      const suffixResolved = definition.suffixTag
        ? resolveTagDefinition(definition.suffixTag)
        : null;
      const attribute = definition.attribute || resolved?.keyword;
      const format = definition.format || formatFromVR(resolved?.vr);
      // 'auto' = risolvi sull'immagine/frame corrente (si aggiorna allo scroll).
      // Usa source:'reference' per congelare esplicitamente il valore alla 1a istanza.
      const source = definition.source || 'auto';
      const suffixSource = definition.suffixSource || source;
      const suffixFormat = definition.suffixFormat || formatFromVR(suffixResolved?.vr);
      const title = definition.title || resolved?.keyword || resolved?.tag || definition.tag;
      const id = definition.id || attribute || resolved?.tag || `tag_${index}`;

      return {
        id,
        inheritsFrom: 'ohif.overlayItem',
        label: definition.label ?? '',
        title,
        className: definition.className || DEFAULT_CLASSNAME,
        color: definition.color,
        condition: props => {
          const value = getTagValue(props, { attribute, tag: resolved?.tag, source });
          return value !== undefined && value !== null && value !== '';
        },
        contentF: props => {
          const value = getTagValue(props, { attribute, tag: resolved?.tag, source });
          if (value === undefined || value === null || value === '') {
            return null;
          }
          const formatted = formatTagValue(value, format, props.formatters);
          if (formatted === undefined || formatted === null || formatted === '') {
            return null;
          }
          let text = formatted;
          if (definition.prefix) {
            text = `${definition.prefix}${text}`;
          }
          if (suffixResolved) {
            const suffixValue = getTagValue(props, {
              attribute: suffixResolved.keyword,
              tag: suffixResolved.tag,
              source: suffixSource,
            });
            const suffixFormatted = formatTagValue(suffixValue, suffixFormat, props.formatters);
            if (suffixFormatted) {
              const template = definition.suffixTemplate || ' ({value})';
              text = `${text}${template.replace('{value}', suffixFormatted)}`;
            }
          }
          if (definition.suffix) {
            text = `${text}${definition.suffix}`;
          }
          return text;
        },
      };
    })
    .filter(Boolean);
};

const dedupeItems = items => {
  const seen = new Set();
  const result = [];

  items.forEach(item => {
    if (!item) {
      return;
    }
    const key = item.id || item.attribute || item.tag;
    if (key && seen.has(key)) {
      return;
    }
    if (key) {
      seen.add(key);
    }
    result.push(item);
  });

  return result;
};

const baseTopLeftItems = [
  // Top Left
  {
    id: 'StudyDate',
    inheritsFrom: 'ohif.overlayItem',
    label: '',
    title: 'Study date',
    className: DEFAULT_CLASSNAME,
    condition: ({ referenceInstance }) => referenceInstance?.StudyDate,
    contentF: ({ referenceInstance, formatters: { formatDate } }) =>
      formatDate(referenceInstance.StudyDate),
  },
  {
    id: 'SeriesNumber',
    inheritsFrom: 'ohif.overlayItem',
    label: '',
    title: 'SeriesNumber',
    className: DEFAULT_CLASSNAME,
    condition: ({ referenceInstance }) => {
      return referenceInstance && referenceInstance.SeriesNumber;
    },
    contentF: ({ referenceInstance }) => 'S: ' + referenceInstance.SeriesNumber,
  },
  {
    id: 'SeriesDescription',
    inheritsFrom: 'ohif.overlayItem',
    label: '',
    title: 'Series description',
    className: DEFAULT_CLASSNAME,
    condition: ({ referenceInstance }) => {
      return referenceInstance && referenceInstance.SeriesDescription;
    },
    contentF: ({ referenceInstance }) => referenceInstance.SeriesDescription,
  },
];

const baseTopRightItems = [
  {
    id: 'PatientName',
    inheritsFrom: 'ohif.overlayItem',
    label: '',
    title: 'PatientName',
    className: DEFAULT_CLASSNAME,
    condition: ({ referenceInstance }) => {
      return (
        referenceInstance &&
        referenceInstance.PatientName &&
        referenceInstance.PatientName.Alphabetic
      );
    },
    contentF: ({ referenceInstance, formatters: { formatPN } }) =>
      `${formatPN(referenceInstance.PatientName.Alphabetic)} ${referenceInstance.PatientSex ? '(' + referenceInstance.PatientSex + ')' : ''}`,
  },
  {
    id: 'PatientID',
    inheritsFrom: 'ohif.overlayItem',
    label: '',
    title: 'PatientID',
    className: DEFAULT_CLASSNAME,
    condition: ({ referenceInstance }) => {
      return referenceInstance && referenceInstance.PatientID;
    },
    contentF: ({ referenceInstance }) => 'ID: ' + referenceInstance.PatientID,
  },
  {
    id: 'Accession',
    inheritsFrom: 'ohif.overlayItem',
    label: '',
    title: 'Accession',
    className: DEFAULT_CLASSNAME,
    condition: ({ referenceInstance }) => {
      return referenceInstance && referenceInstance.AccessionNumber;
    },
    contentF: ({ referenceInstance }) => referenceInstance.AccessionNumber,
  },
];

const storicoLabelItem = {
  id: 'StoricoLabel',
  inheritsFrom: 'ohif.overlayItem',
  label: '',
  title: 'Storico Label',
  color: '#81d4fa',
  condition: ({ referenceInstance }) => {
    if (window.portableVersion) {
      return false;
    }
    if (window.sonoUnoStorico === true) {
      return true;
    }

    // Gli studi aperti si leggono dall indirizzo ADESSO, non da una variabile
    // fissata al caricamento della pagina.
    //
    // Quella variabile viene scritta una volta sola, quando il file di
    // configurazione viene valutato. Arrivando dalla lista studi la navigazione
    // avviene dentro la pagina: l indirizzo cambia, la variabile no, e resta
    // vuota. Confrontando con il vuoto ogni serie risultava "di un altro
    // studio", e lo studio corrente si marchiava STORICO da solo.
    const aperti = new URLSearchParams(window.location.search).get('StudyInstanceUIDs');
    if (!aperti) {
      return false;
    }
    const suo = referenceInstance?.StudyInstanceUID;
    return Boolean(suo) && !aperti.split(',').includes(suo);
  },
  contentF: ({ referenceInstance }) => 'STORICO',
};

const linkedSeriesBadgeItem = {
  id: 'LinkedSeriesBadge',
  inheritsFrom: 'ohif.overlayItem.linkedSeries',
};

const buildViewportOverlayCustomizations = overlayConfig => {
  const tagConfig = getTagConfig(overlayConfig);

  const configuredTopLeftItems = buildTagItemsFromConfig(getCornerConfig(tagConfig, 'topLeft'));
  const configuredTopRightItems = buildTagItemsFromConfig(
    getCornerConfig(tagConfig, 'topRight')
  );
  const configuredBottomLeftItems = buildTagItemsFromConfig(
    getCornerConfig(tagConfig, 'bottomLeft')
  );
  const configuredBottomRightItems = buildTagItemsFromConfig(
    getCornerConfig(tagConfig, 'bottomRight')
  );

  const topLeftItems = dedupeItems(
    [
      linkedSeriesBadgeItem,
      ...(hasCornerConfig(tagConfig, 'topLeft') ? configuredTopLeftItems : baseTopLeftItems),
      storicoLabelItem,
    ].filter(Boolean)
  );

  const topRightItems = dedupeItems(
    hasCornerConfig(tagConfig, 'topRight') ? configuredTopRightItems : baseTopRightItems
  );

  const bottomLeftItems = dedupeItems([
    //Bottom Left
    {
      id: 'WindowLevel',
      inheritsFrom: 'ohif.overlayItem.windowLevel',
      className: DEFAULT_CLASSNAME,
    },
    {
      id: 'ZoomLevel',
      inheritsFrom: 'ohif.overlayItem.zoomLevel',
      className: DEFAULT_CLASSNAME,
    },
    ...configuredBottomLeftItems,
  ]);

  const bottomRightItems = dedupeItems([
    //Bottom Right
    {
      id: 'InstanceNumber',
      inheritsFrom: 'ohif.overlayItem.instanceNumber',
      className: DEFAULT_CLASSNAME,
    },
    ...configuredBottomRightItems,
  ]);

  return {
    'viewportOverlay.topLeft': topLeftItems,
    //Top Right
    'viewportOverlay.topRight': topRightItems,
    'viewportOverlay.bottomLeft': bottomLeftItems,
    'viewportOverlay.bottomRight': bottomRightItems,
  };
};

if (typeof window !== 'undefined') {
  window.mdvBuildViewportOverlayCustomizations = buildViewportOverlayCustomizations;
  window.mdvApplyViewportOverlayIfReady = () => {
    const pending =
      window.mdvViewportOverlayPending || window?.config?.viewportOverlayTags;
    if (!pending) {
      return false;
    }
    const customizationService = window.servicesManager?.services?.customizationService;
    if (!customizationService || typeof buildViewportOverlayCustomizations !== 'function') {
      return false;
    }
    try {
      const customizations = buildViewportOverlayCustomizations(pending);
      const scope =
        customizationService.Scope?.Global || customizationService.Scope?.Mode;
      customizationService.setCustomizations(customizations, scope);
      window.mdvViewportOverlayPending = null;
      return true;
    } catch (err) {
      console.warn('Overlay viewport: impossibile applicare le preferenze', err);
      return false;
    }
  };
  setTimeout(() => {
    window.mdvApplyViewportOverlayIfReady?.();
  }, 0);
}

const defaultCustomizations = buildViewportOverlayCustomizations();

export { buildViewportOverlayCustomizations };
export default defaultCustomizations;
