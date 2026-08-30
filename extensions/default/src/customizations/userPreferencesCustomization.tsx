import React, { useEffect, useMemo, useState, useRef } from 'react';
import dcmjs from 'dcmjs';
import { useSystem, hotkeys as hotkeysModule } from '@ohif/core';
import {
  UserPreferencesModal,
  FooterAction,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Combobox,
  Switch,
  Input,
  Label,
  Button,
} from '@ohif/ui-next';
import { useTranslation } from 'react-i18next';
import i18n from '@ohif/i18n';

const { availableLanguages, defaultLanguage, currentLanguage: currentLanguageFn } = i18n;

interface HotkeyDefinition {
  keys: string;
  label: string;
}

interface HotkeyDefinitions {
  [key: string]: HotkeyDefinition;
}

type OverlayTagConfig =
  | string
  | {
      tag?: string;
      keyword?: string;
      attribute?: string;
      format?: string;
      prefix?: string;
      suffixTag?: string;
      suffix?: string;
      suffixTemplate?: string;
      source?: string;
      suffixSource?: string;
      suffixFormat?: string;
    };

interface OverlayTagOption {
  key: string;
  label: string;
  config: OverlayTagConfig | null;
}

interface OverlaySelections {
  cornerTopLeft: string[];
  cornerTopRight: string[];
  cornerBottomLeft: string[];
  cornerBottomRight: string[];
}

type ViewportOverlayTagsConfig = {
  cornerTopLeft?: OverlayTagConfig[];
  cornerTopRight?: OverlayTagConfig[];
  cornerBottomLeft?: OverlayTagConfig[];
  cornerBottomRight?: OverlayTagConfig[];
};

const NONE_KEY = '__none__';
const FIXED_WL_KEY = '__fixed_wl__';
const FIXED_ZOOM_KEY = '__fixed_zoom__';
const FIXED_INSTANCE_KEY = '__fixed_instance__';
const MAX_TAG_RESULTS = 200;

const { DicomMetaDictionary } = dcmjs?.data || {};

const BASE_OVERLAY_OPTIONS: OverlayTagOption[] = [
  {
    key: NONE_KEY,
    label: 'Nessuno',
    config: null,
  },
  {
    key: '0008,0020|date',
    label: 'Study Date (0008,0020)',
    config: { tag: '0008,0020', format: 'date' },
  },
  {
    key: '0008,0030|time',
    label: 'Study Time (0008,0030)',
    config: { tag: '0008,0030', format: 'time' },
  },
  {
    key: '0008,0021|date',
    label: 'Series Date (0008,0021)',
    config: { tag: '0008,0021', format: 'date' },
  },
  {
    key: '0008,0031|time',
    label: 'Series Time (0008,0031)',
    config: { tag: '0008,0031', format: 'time' },
  },
  {
    key: '0008,0022|date',
    label: 'Acquisition Date (0008,0022)',
    config: { tag: '0008,0022', format: 'date' },
  },
  {
    key: '0008,0032|time',
    label: 'Acquisition Time (0008,0032)',
    config: { tag: '0008,0032', format: 'time' },
  },
  {
    key: '0008,0060',
    label: 'Modality (0008,0060)',
    config: { tag: '0008,0060' },
  },
  {
    key: '0008,1030',
    label: 'Study Description (0008,1030)',
    config: { tag: '0008,1030' },
  },
  {
    key: '0008,103E',
    label: 'Series Description (0008,103E)',
    config: { tag: '0008,103E' },
  },
  {
    key: '0020,0011|S: ',
    label: 'Series Number (0020,0011)',
    config: { tag: '0020,0011', prefix: 'S: ' },
  },
  {
    key: '0010,0010|pn|0010,0040',
    label: 'Patient Name (+ Sex) (0010,0010)',
    config: { tag: '0010,0010', format: 'pn', suffixTag: '0010,0040' },
  },
  {
    key: '0010,0020|ID: ',
    label: 'Patient ID (0010,0020)',
    config: { tag: '0010,0020', prefix: 'ID: ' },
  },
  {
    key: '0010,0040',
    label: 'Patient Sex (0010,0040)',
    config: { tag: '0010,0040' },
  },
  {
    key: '0008,0050',
    label: 'Accession Number (0008,0050)',
    config: { tag: '0008,0050' },
  },
  {
    key: '0020,0060',
    label: 'Laterality (0020,0060)',
    config: { tag: '0020,0060' },
  },
  {
    key: '0018,0015',
    label: 'Body Part Examined (0018,0015)',
    config: { tag: '0018,0015' },
  },
  {
    key: '0018,5101',
    label: 'View Position (0018,5101)',
    config: { tag: '0018,5101' },
  },
  {
    key: '0008,0070',
    label: 'Manufacturer (0008,0070)',
    config: { tag: '0008,0070' },
  },
  {
    key: '0008,0080',
    label: 'Institution Name (0008,0080)',
    config: { tag: '0008,0080' },
  },
  {
    key: '0008,1010',
    label: 'Station Name (0008,1010)',
    config: { tag: '0008,1010' },
  },
  {
    key: '0018,0050',
    label: 'Slice Thickness (0018,0050)',
    config: { tag: '0018,0050' },
  },
  {
    key: '0028,0030',
    label: 'Pixel Spacing (0028,0030)',
    config: { tag: '0028,0030' },
  },
];

const FIXED_OVERLAY_ITEMS: Record<
  keyof OverlaySelections,
  { key: string; label: string }[]
> = {
  cornerTopLeft: [],
  cornerTopRight: [],
  cornerBottomLeft: [
    { key: FIXED_WL_KEY, label: 'Window/Level (fisso)' },
    { key: FIXED_ZOOM_KEY, label: 'Zoom (fisso)' },
  ],
  cornerBottomRight: [{ key: FIXED_INSTANCE_KEY, label: 'Istanza (fissa)' }],
};

const getFixedKeysForCorner = (cornerKey: keyof OverlaySelections) =>
  FIXED_OVERLAY_ITEMS[cornerKey]?.map(item => item.key) || [];

const buildAllDicomOptions = (): OverlayTagOption[] => {
  if (!DicomMetaDictionary?.dictionary) {
    return [];
  }

  const optionsMap = new Map<string, OverlayTagOption>();

  const addOption = (rawTag: string, name?: string, vr?: string) => {
    if (!rawTag) {
      return;
    }
    const cleaned = String(rawTag).replace(/[^0-9A-Fa-f]/g, '');
    const punctuated =
      cleaned.length === 8 && DicomMetaDictionary.punctuateTag
        ? DicomMetaDictionary.punctuateTag(cleaned)
        : rawTag;
    if (!punctuated || optionsMap.has(punctuated)) {
      return;
    }
    const labelName = name || punctuated;
    const label = vr ? `${labelName} (${punctuated}) - ${vr}` : `${labelName} (${punctuated})`;
    optionsMap.set(punctuated, {
      key: punctuated,
      label,
      config: { tag: punctuated },
    });
  };

  Object.entries(DicomMetaDictionary.dictionary).forEach(([rawKey, entry]) => {
    const rawTag = (entry as any)?.tag || rawKey;
    const name = (entry as any)?.name;
    const vr = (entry as any)?.vr;
    addOption(rawTag, name, vr);
  });

  if (DicomMetaDictionary.nameMap) {
    Object.entries(DicomMetaDictionary.nameMap).forEach(([keyword, entry]) => {
      const rawTag = (entry as any)?.tag;
      const vr = (entry as any)?.vr;
      addOption(rawTag, keyword, vr);
    });
  }

  return Array.from(optionsMap.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const ALL_DICOM_OPTIONS = buildAllDicomOptions();

const CORNER_CONFIGS = [
  { key: 'cornerTopLeft', label: 'Angolo alto sinistra' },
  { key: 'cornerTopRight', label: 'Angolo alto destra' },
  { key: 'cornerBottomLeft', label: 'Angolo basso sinistra' },
  { key: 'cornerBottomRight', label: 'Angolo basso destra' },
];

const normalizeTagItem = (item: OverlayTagConfig | null) => {
  if (!item) {
    return null;
  }
  if (typeof item === 'string') {
    return { tag: item };
  }
  return item;
};

const buildOptionKey = (item: OverlayTagConfig | null) => {
  if (!item) {
    return NONE_KEY;
  }
  const normalized = normalizeTagItem(item);
  const tag =
    normalized?.tag || normalized?.keyword || normalized?.attribute || NONE_KEY;
  const parts = [
    tag,
    normalized?.format,
    normalized?.prefix,
    normalized?.suffixTag,
    normalized?.suffix,
    normalized?.suffixTemplate,
    normalized?.source,
    normalized?.suffixSource,
    normalized?.suffixFormat,
  ].filter(Boolean);
  return parts.join('|') || tag;
};

const getCornerConfig = (config, cornerKey: string) => {
  if (!config) {
    return [];
  }
  const direct = config[cornerKey];
  if (Array.isArray(direct)) {
    return direct;
  }
  const legacyKey = `corner${cornerKey[0].toUpperCase()}${cornerKey.slice(1)}`;
  return Array.isArray(config[legacyKey]) ? config[legacyKey] : [];
};

const buildOverlayOptions = (config): OverlayTagOption[] => {
  const options = [...BASE_OVERLAY_OPTIONS];
  const keys = new Set(options.map(opt => opt.key));

  ALL_DICOM_OPTIONS.forEach(option => {
    if (!keys.has(option.key)) {
      keys.add(option.key);
      options.push(option);
    }
  });

  const addCustomOption = item => {
    const normalized = normalizeTagItem(item);
    if (!normalized) {
      return;
    }
    const key = buildOptionKey(normalized);
    if (!key || keys.has(key)) {
      return;
    }
    keys.add(key);
    const labelBase =
      normalized.tag || normalized.keyword || normalized.attribute || key;
    options.push({
      key,
      label: `Custom: ${labelBase}`,
      config: normalized,
    });
  };

  CORNER_CONFIGS.forEach(corner => {
    const normalizedKey = corner.key.replace('corner', '');
    const items = getCornerConfig(config, `${normalizedKey[0].toLowerCase()}${normalizedKey.slice(1)}`);
    (items || []).forEach(addCustomOption);
  });

  return options;
};

const buildSelectionsFromConfig = (config, options: OverlayTagOption[]): OverlaySelections => {
  const optionKeys = new Set(options.map(opt => opt.key));
  const toSelection = items => {
    const list = Array.isArray(items) ? items : [];
    const result = [];
    for (let i = 0; i < 4; i++) {
      const key = buildOptionKey(list[i] ?? null);
      result.push(optionKeys.has(key) ? key : NONE_KEY);
    }
    return result;
  };

  const selections: OverlaySelections = {
    cornerTopLeft: toSelection(getCornerConfig(config, 'topLeft')),
    cornerTopRight: toSelection(getCornerConfig(config, 'topRight')),
    cornerBottomLeft: toSelection(getCornerConfig(config, 'bottomLeft')),
    cornerBottomRight: toSelection(getCornerConfig(config, 'bottomRight')),
  };

  const applyFixedSelections = (cornerKey: keyof OverlaySelections) => {
    const fixedKeys = getFixedKeysForCorner(cornerKey);
    if (!fixedKeys.length) {
      return;
    }
    const existing = selections[cornerKey].filter(key => !fixedKeys.includes(key));
    const cleaned = existing.filter(key => key && key !== NONE_KEY);
    const merged = [...fixedKeys, ...cleaned];
    while (merged.length < 4) {
      merged.push(NONE_KEY);
    }
    selections[cornerKey] = merged.slice(0, 4);
  };

  applyFixedSelections('cornerBottomLeft');
  applyFixedSelections('cornerBottomRight');

  return selections;
};

// Base URL del backend del viewer (coerente col resto del file).
const getViewerApiBase = () =>
  window?.isSuite ? 'http://localhost:3000' : window.location.origin;

// L'utente admin si riconosce dal parametro URL ?User=admin (gia' salvato in
// window.mdvUsername dal config). Solo per lui compare la tab "Impostazioni Globali".
const isAdminUser = () =>
  (window.mdvUsername || new URLSearchParams(window.location.search).get('User')) === 'admin';

// Sblocco della tab admin: persiste finche' la pagina non viene ricaricata
// (variabile a livello di modulo -> si azzera al reload, come richiesto).
const adminGlobalSession = { unlocked: false, password: '' };

// Flag globali configurabili dalla tab admin. La chiave deve combaciare con
// quella in app-config.js; etichette e descrizioni sono in italiano.
const GLOBAL_CONFIG_OPTIONS: { key: string; label: string; description: string }[] = [
  {
    key: 'showStudyList',
    label: 'Mostra elenco studi',
    description: 'Mostra tutti gli studi presenti nel PACS, con apertura in una nuova scheda.',
  },
];

function UserPreferencesModalDefault({ hide }: { hide: () => void }) {
  const { hotkeysManager, servicesManager } = useSystem();
  const { t } = useTranslation('UserPreferencesModal');

  const { hotkeyDefinitions = {}, hotkeyDefaults = {} } = hotkeysManager;

  const currentLanguage = currentLanguageFn();

  const [state, setState] = useState({
    hotkeyDefinitions: hotkeyDefinitions as HotkeyDefinitions,
    languageValue: currentLanguage.value,
  });

  const [overlayOptions, setOverlayOptions] = useState<OverlayTagOption[]>(BASE_OVERLAY_OPTIONS);
  const [overlaySelections, setOverlaySelections] = useState<OverlaySelections>({
    cornerTopLeft: [NONE_KEY, NONE_KEY, NONE_KEY, NONE_KEY],
    cornerTopRight: [NONE_KEY, NONE_KEY, NONE_KEY, NONE_KEY],
    cornerBottomLeft: [NONE_KEY, NONE_KEY, NONE_KEY, NONE_KEY],
    cornerBottomRight: [NONE_KEY, NONE_KEY, NONE_KEY, NONE_KEY],
  });
  const [overlayFilterBySelect, setOverlayFilterBySelect] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('hotkeys');
  const defaultOverlayConfigRef = useRef<ViewportOverlayTagsConfig | null>(null);

  // --- Tab admin "Impostazioni Globali" ---
  const isAdmin = isAdminUser();
  const [adminUnlocked, setAdminUnlocked] = useState(adminGlobalSession.unlocked);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminVerifying, setAdminVerifying] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<Record<string, boolean>>({});
  const [globalSettingsLoaded, setGlobalSettingsLoaded] = useState(false);

  const overlayOptionsMap = useMemo(() => {
    const map = new Map<string, OverlayTagOption>();
    overlayOptions.forEach(option => {
      map.set(option.key, option);
    });
    return map;
  }, [overlayOptions]);

  const getOverlayFilter = (selectKey: string) => overlayFilterBySelect[selectKey] || '';

  const getFilteredOverlayOptions = (selectKey: string) => {
    const overlayFilter = getOverlayFilter(selectKey);
    const selectedKeys = new Set(
      Object.values(overlaySelections).flat().filter(Boolean)
    );
    const baseKeys = new Set(BASE_OVERLAY_OPTIONS.map(option => option.key));
    const ensureSelectedOptions = () => {
      const selected = [];
      selectedKeys.forEach(key => {
        if (!baseKeys.has(key)) {
          const option = overlayOptionsMap.get(key);
          if (option) {
            selected.push(option);
          }
        }
      });
      return selected;
    };

    if (!overlayFilter) {
      return [...BASE_OVERLAY_OPTIONS, ...ensureSelectedOptions()];
    }

    const query = overlayFilter.toLowerCase();
    const matches = overlayOptions.filter(option => {
      const label = option.label?.toLowerCase() || '';
      const key = option.key?.toLowerCase() || '';
      return label.includes(query) || key.includes(query);
    });
    const limited = matches.slice(0, MAX_TAG_RESULTS);
    const noneOption = BASE_OVERLAY_OPTIONS.find(option => option.key === NONE_KEY);
    const withoutNone = limited.filter(option => option.key !== NONE_KEY);
    return noneOption ? [noneOption, ...withoutNone] : withoutNone;
  };

  const isOverlayResultsTruncated = (selectKey: string) => {
    const overlayFilter = getOverlayFilter(selectKey);
    if (!overlayFilter) {
      return false;
    }
    const query = overlayFilter.toLowerCase();
    const matchesCount = overlayOptions.filter(option => {
      const label = option.label?.toLowerCase() || '';
      const key = option.key?.toLowerCase() || '';
      return label.includes(query) || key.includes(query);
    }).length;
    return matchesCount > MAX_TAG_RESULTS;
  };

  useEffect(() => {
    let cancelled = false;

    const getViewerApiBase = () => {
      if (window?.isSuite) {
        return 'http://localhost:3000';
      }
      return window.location.origin;
    };

    const loadOverlayPreferences = async () => {
      const defaultConfig =
        window?.mdvDefaultViewportOverlayTags || window?.config?.viewportOverlayTags;
      if (!defaultOverlayConfigRef.current && defaultConfig) {
        try {
          defaultOverlayConfigRef.current = JSON.parse(JSON.stringify(defaultConfig));
        } catch (err) {
          defaultOverlayConfigRef.current = defaultConfig;
        }
      }
      let loadedConfig = defaultConfig;

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const username = window.mdvUsername || urlParams.get('User');
        const aetitle = window.mdvAETitle || urlParams.get('aetitle');
        if (username && aetitle) {
          const apiUrl = `${getViewerApiBase()}/viewer/userdata/${aetitle}/viewport-overlay?user=${username}&cacheBuster=${Date.now()}`;
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.json();
            if (data?.viewportOverlayTags) {
              loadedConfig = data.viewportOverlayTags;
            }
          }
        }
      } catch (err) {
        console.warn('Impossibile caricare le preferenze viewport', err);
      }

      if (cancelled) {
        return;
      }

      const options = buildOverlayOptions(loadedConfig);
      const selections = buildSelectionsFromConfig(loadedConfig, options);
      setOverlayOptions(options);
      setOverlaySelections(selections);
    };

    loadOverlayPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  // Carica i flag globali dal backend una volta sbloccata la tab admin.
  useEffect(() => {
    if (!isAdmin || !adminUnlocked || globalSettingsLoaded) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const apiUrl = `${getViewerApiBase()}/viewer/userdata/admin/global-config?cacheBuster=${Date.now()}`;
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (!cancelled && data?.settings) {
            setGlobalSettings(data.settings);
            setGlobalSettingsLoaded(true);
          }
        }
      } catch (err) {
        console.warn('Impossibile caricare le impostazioni globali', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, adminUnlocked, globalSettingsLoaded]);

  const verifyAdminPassword = async () => {
    if (!adminPasswordInput) {
      return;
    }
    setAdminVerifying(true);
    setAdminError('');
    try {
      const response = await fetch(`${getViewerApiBase()}/viewer/userdata/admin/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput }),
      });
      if (response.ok) {
        adminGlobalSession.unlocked = true;
        adminGlobalSession.password = adminPasswordInput;
        setAdminUnlocked(true);
        setAdminPasswordInput('');
      } else {
        setAdminError('Password non valida');
      }
    } catch (err) {
      setAdminError('Errore di connessione');
    } finally {
      setAdminVerifying(false);
    }
  };

  const onGlobalSettingChange = (key: string, value: boolean) => {
    setGlobalSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveGlobalSettings = async () => {
    const uiNotificationService = servicesManager?.services?.uiNotificationService;
    try {
      const response = await fetch(`${getViewerApiBase()}/viewer/userdata/admin/global-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminGlobalSession.password, settings: globalSettings }),
      });
      if (!response.ok) {
        uiNotificationService?.show?.({
          title: 'Impostazioni Globali',
          message:
            response.status === 401
              ? 'Password scaduta: ricarica la pagina e riprova'
              : 'Errore durante il salvataggio',
          type: 'error',
        });
        return;
      }
      // Aggiorno anche window.config per coerenza, ma alcune opzioni hanno
      // effetto solo dopo il ricaricamento della pagina.
      const win = window as any;
      if (win.config) {
        Object.entries(globalSettings).forEach(([key, value]) => {
          win.config[key] = value;
        });
      }
      uiNotificationService?.show?.({
        title: 'Impostazioni Globali',
        message: 'Impostazioni salvate. Ricarica la pagina per applicarle.',
        type: 'success',
      });
    } catch (err) {
      console.warn('Impossibile salvare le impostazioni globali', err);
      uiNotificationService?.show?.({
        title: 'Impostazioni Globali',
        message: 'Errore durante il salvataggio',
        type: 'error',
      });
    }
  };

  const onLanguageChangeHandler = (value: string) => {
    setState(state => ({ ...state, languageValue: value }));
  };

  const onHotkeyChangeHandler = (id: string, newKeys: string) => {
    setState(state => ({
      ...state,
      hotkeyDefinitions: {
        ...state.hotkeyDefinitions,
        [id]: {
          ...state.hotkeyDefinitions[id],
          keys: newKeys,
        },
      },
    }));
  };

  const resetViewportPreferences = () => {
    const baseConfig =
      defaultOverlayConfigRef.current || window?.config?.viewportOverlayTags || {};
    const options = buildOverlayOptions(baseConfig);
    const selections = buildSelectionsFromConfig(baseConfig, options);
    setOverlayOptions(options);
    setOverlaySelections(selections);
    setOverlayFilterBySelect({});
    applyViewportOverlayTags(baseConfig);
  };

  const onResetHandler = () => {
    if (activeTab === 'viewport') {
      resetViewportPreferences();
      return;
    }

    if (activeTab === 'global') {
      // Ricarica i valori salvati sul server, annullando le modifiche non salvate.
      setGlobalSettingsLoaded(false);
      return;
    }

    setState(state => ({
      ...state,
      languageValue: defaultLanguage.value,
      hotkeyDefinitions: hotkeyDefaults as HotkeyDefinitions,
    }));

    hotkeysManager.restoreDefaultBindings();
  };

  const updateOverlaySelection = (
    cornerKey: keyof OverlaySelections,
    index: number,
    value: string
  ) => {
    const fixedKeys = getFixedKeysForCorner(cornerKey);
    if (index < fixedKeys.length) {
      return;
    }
    setOverlaySelections(prev => ({
      ...prev,
      [cornerKey]: prev[cornerKey].map((item, idx) => (idx === index ? value : item)),
    }));
  };

  const buildOverlayTagsConfig = () => {
    const toCornerConfig = (keys, cornerKey: keyof OverlaySelections) => {
      const fixedKeys = getFixedKeysForCorner(cornerKey);
      return (keys || [])
        .filter(key => key && key !== NONE_KEY && !fixedKeys.includes(key))
        .map(key => overlayOptionsMap.get(key)?.config)
        .filter(Boolean);
    };

    return {
      cornerTopLeft: toCornerConfig(overlaySelections.cornerTopLeft, 'cornerTopLeft'),
      cornerTopRight: toCornerConfig(overlaySelections.cornerTopRight, 'cornerTopRight'),
      cornerBottomLeft: toCornerConfig(overlaySelections.cornerBottomLeft, 'cornerBottomLeft'),
      cornerBottomRight: toCornerConfig(overlaySelections.cornerBottomRight, 'cornerBottomRight'),
    };
  };

  const applyViewportOverlayTags = overlayTags => {
    if (!overlayTags) {
      return;
    }
    if (!window.config) {
      window.config = {};
    }
    window.config.viewportOverlayTags = overlayTags;

    const customizationService = servicesManager?.services?.customizationService;
    const builder = window.mdvBuildViewportOverlayCustomizations;
    if (customizationService && typeof builder === 'function') {
      const customizations = builder(overlayTags);
      const scope = customizationService.Scope?.Global || customizationService.Scope?.Mode;
      customizationService.setCustomizations(customizations, scope);
    }
  };

  const saveViewportOverlayTags = async overlayTags => {
    const uiNotificationService = servicesManager?.services?.uiNotificationService;
    const getViewerApiBase = () => {
      if (window?.isSuite) {
        return 'http://localhost:3000';
      }
      return window.location.origin;
    };

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const username = window.mdvUsername || urlParams.get('User');
      const aetitle = window.mdvAETitle || urlParams.get('aetitle');
      if (!username || !aetitle) {
        if (uiNotificationService?.show) {
          uiNotificationService.show({
            title: 'Preferenze viewport',
            message: 'Username o AETitle mancante',
            type: 'error',
          });
        }
        return;
      }
      const apiUrl = `${getViewerApiBase()}/viewer/userdata/${aetitle}/viewport-overlay?user=${username}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, viewportOverlayTags: overlayTags }),
      });

      if (!response.ok) {
        if (uiNotificationService?.show) {
          uiNotificationService.show({
            title: 'Preferenze viewport',
            message: `Errore salvataggio (HTTP ${response.status})`,
            type: 'error',
          });
        }
        return;
      }

      const cacheKey = `preferenzeUtente-${aetitle}`;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
        cached.viewportOverlayTags = overlayTags;
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      } catch (err) {
        console.warn('Impossibile aggiornare la cache locale delle preferenze', err);
      }

      if (uiNotificationService?.show) {
        uiNotificationService.show({
          title: 'Preferenze viewport',
          message: 'Preferenze salvate',
          type: 'success',
        });
      }
    } catch (err) {
      console.warn('Impossibile salvare le preferenze viewport', err);
      const uiNotificationService = servicesManager?.services?.uiNotificationService;
      if (uiNotificationService?.show) {
        uiNotificationService.show({
          title: 'Preferenze viewport',
          message: 'Errore salvataggio',
          type: 'error',
        });
      }
    }
  };

  const onSaveHandler = async () => {
    if (state.languageValue !== currentLanguage.value) {
      i18n.changeLanguage(state.languageValue);
    }
    hotkeysManager.setHotkeys(state.hotkeyDefinitions);

    const overlayTags = buildOverlayTagsConfig();
    applyViewportOverlayTags(overlayTags);
    await saveViewportOverlayTags(overlayTags);

    if (isAdmin && adminUnlocked && globalSettingsLoaded) {
      await saveGlobalSettings();
    }

    hotkeysModule.stopRecord();
    hotkeysModule.unpause();
    hide();
  };

  return (
    <UserPreferencesModal>
      <UserPreferencesModal.Body>
        {/* Language Section */}
        {/* <div className="mb-3 flex items-center space-x-14">
          <UserPreferencesModal.SubHeading>{t('Language')}</UserPreferencesModal.SubHeading>
          <Select
            defaultValue={state.languageValue}
            onValueChange={onLanguageChangeHandler}
          >
            <SelectTrigger
              className="w-60"
              aria-label="Language"
            >
              <SelectValue placeholder={t('Select language')} />
            </SelectTrigger>
            <SelectContent>
              {availableLanguages.map(lang => (
                <SelectItem
                  key={lang.value}
                  value={lang.value}
                >
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div> */}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start gap-2">
            <TabsTrigger
              value="hotkeys"
              data-cy="hotkeys"
            >
              {t('Scorciatoie tastiera')}
            </TabsTrigger>
            <TabsTrigger
              value="viewport"
              data-cy="viewport"
            >
              Preferenze Viewport
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger
                value="global"
                data-cy="global"
              >
                Impostazioni Globali
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="hotkeys">
            <UserPreferencesModal.SubHeading>
              {t('Scorciatoie tastiera')}
            </UserPreferencesModal.SubHeading>
            <UserPreferencesModal.HotkeysGrid>
              {Object.entries(state.hotkeyDefinitions).map(([id, definition]) => (
                <UserPreferencesModal.Hotkey
                  key={id}
                  label={t(definition.label, { nsSeparator: false, keySeparator: false })}
                  value={definition.keys}
                  onChange={newKeys => onHotkeyChangeHandler(id, newKeys)}
                  placeholder={definition.keys}
                  hotkeys={hotkeysModule}
                />
              ))}
            </UserPreferencesModal.HotkeysGrid>
          </TabsContent>

          <TabsContent value="viewport">
            <UserPreferencesModal.SubHeading>Preferenze Viewport</UserPreferencesModal.SubHeading>
            <div className="flex flex-col gap-4 text-sm text-muted-foreground">
              <div>
                Seleziona fino a 4 tag DICOM per ogni angolo.
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {CORNER_CONFIGS.map(corner => (
                  <div key={corner.key} className="flex flex-col gap-2">
                    <div className="text-base text-foreground">{corner.label}</div>
                    {overlaySelections[corner.key as keyof OverlaySelections].map((value, index) => {
                      const selectKey = `${corner.key}-${index}`;
                      const fixedItems =
                        FIXED_OVERLAY_ITEMS[corner.key as keyof OverlaySelections] || [];
                      const fixedItem = fixedItems[index];
                      const filteredOptions = getFilteredOverlayOptions(selectKey);
                      const isTruncated = isOverlayResultsTruncated(selectKey);
                      return (
                        <div key={selectKey} className="flex items-center gap-2">
                          <div className="w-16 text-xs text-muted-foreground">Voce {index + 1}</div>
                          <Combobox
                            data={
                              fixedItem
                                ? [
                                    {
                                      value: fixedItem.key,
                                      label: fixedItem.label,
                                      disabled: true,
                                    },
                                  ]
                                : filteredOptions.map(option => ({
                                    value: option.key,
                                    label: option.label,
                                  }))
                            }
                            placeholder="Seleziona tag"
                            value={fixedItem ? fixedItem.key : value}
                            onValueChange={newValue =>
                              updateOverlaySelection(
                                corner.key as keyof OverlaySelections,
                                index,
                                newValue
                              )
                            }
                            searchValue={overlayFilterBySelect[selectKey] || ''}
                            onSearchChange={newValue =>
                              setOverlayFilterBySelect(prev => ({
                                ...prev,
                                [selectKey]: newValue,
                              }))
                            }
                            buttonClassName="w-full justify-between"
                            contentClassName="w-[320px] p-0"
                            emptyLabel="Nessun tag trovato."
                            disabled={Boolean(fixedItem)}
                          />
                          {isTruncated && (
                            <div className="text-xs text-muted-foreground">
                              Risultati limitati a {MAX_TAG_RESULTS}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="global">
              <UserPreferencesModal.SubHeading>Impostazioni Globali</UserPreferencesModal.SubHeading>
              {!adminUnlocked ? (
                <form
                  className="flex max-w-sm flex-col gap-3 pt-2"
                  onSubmit={event => {
                    event.preventDefault();
                    verifyAdminPassword();
                  }}
                >
                  <div className="text-muted-foreground text-sm">
                    Inserisci la password amministratore per accedere alle impostazioni globali.
                  </div>
                  <Input
                    type="password"
                    autoFocus
                    placeholder="Password"
                    value={adminPasswordInput}
                    onChange={event => setAdminPasswordInput(event.target.value)}
                  />
                  {adminError && <div className="text-sm text-red-500">{adminError}</div>}
                  <Button
                    type="submit"
                    disabled={adminVerifying || !adminPasswordInput}
                    className="self-start"
                  >
                    {adminVerifying ? 'Verifica...' : 'Sblocca'}
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col gap-2 pt-2">
                  <div className="text-muted-foreground mb-1 text-sm">
                    Abilita o disabilita le funzionalità globali di questa installazione. Alcune
                    opzioni richiedono il ricaricamento della pagina per avere effetto.
                  </div>
                  <div className="divide-input flex flex-col divide-y">
                    {GLOBAL_CONFIG_OPTIONS.map(option => (
                      <div
                        key={option.key}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="flex flex-col">
                          <Label className="text-foreground text-base">{option.label}</Label>
                          <span className="text-muted-foreground text-xs">
                            {option.description}
                          </span>
                        </div>
                        <Switch
                          checked={Boolean(globalSettings[option.key])}
                          onCheckedChange={value => onGlobalSettingChange(option.key, value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </UserPreferencesModal.Body>
      <FooterAction className="border-input -mx-4 -mb-4 rounded-b-lg border-t bg-black/20 px-4 pb-4 pt-3">
        <FooterAction.Left>
          <FooterAction.Auxiliary onClick={onResetHandler}>
            {t('Reset to defaults')}
          </FooterAction.Auxiliary>
        </FooterAction.Left>
        <FooterAction.Right>
          <FooterAction.Secondary
            onClick={() => {
              hotkeysModule.stopRecord();
              hotkeysModule.unpause();
              hide();
            }}
          >
            {t('Cancel')}
          </FooterAction.Secondary>
          <FooterAction.Primary
            onClick={onSaveHandler}
          >
            {t('Save')}
          </FooterAction.Primary>
        </FooterAction.Right>
      </FooterAction>
    </UserPreferencesModal>
  );
}

export default {
  'ohif.userPreferencesModal': UserPreferencesModalDefault,
};
