/**
 * mammoView.js — Identità di VISTA nomenclatura-indipendente per l'aggancio
 * serie→cella negli Hanging Protocol.
 *
 * Problema: fra studi con nomenclatura diversa (es. mammografie di anni/apparecchi
 * diversi) SeriesDescription e SeriesNumber cambiano, quindi il match serie→cella
 * (che oggi si basa su quei due) finisce nella cella la serie SBAGLIATA. I tag DICOM
 * di vista, invece, sono standard e stabili: lateralità (R/L) + proiezione (ViewCode,
 * es. CC/MLO) identificano la serie a prescindere dal nome.
 *
 * Questo modulo espone:
 *  - derive*(): funzioni PURE (mai throw) che ricavano lateralità/vista/2D-3D da un
 *    displaySet. Usate SIA in cattura (hpStore.captureCurrentState) SIA in caricamento
 *    (attributo custom registrato sull'HangingProtocolService) → stesso formato in
 *    entrambi i lati, quindi il match combacia.
 *  - registerMdvHPAttributes(): registra gli attributi custom sul matcher OHIF.
 *
 * NB: nessuna dipendenza (modulo foglia) → nessun rischio di import circolari.
 */

// Nomi degli attributi custom usati nelle seriesMatchingRules salvate.
export const MDV_VIEW_KEY_ATTR = 'mdvViewKey';
export const MDV_VIEW_DIM_KEY_ATTR = 'mdvViewDimKey';

const firstInstance = ds => ds?.instances?.[0] || ds?.images?.[0] || ds || {};
const up = value => (value == null ? '' : String(value).trim().toUpperCase());

/**
 * Lateralità (R / L) multi-sorgente:
 *  - mammografia 2D classica / DX → ImageLaterality (0020,0062) o Laterality (0020,0060)
 *  - tomosintesi / enhanced → FrameLaterality dentro SharedFunctionalGroupsSequence
 * Ritorna '' se non determinabile.
 */
export const deriveLaterality = ds => {
  const inst = firstInstance(ds);
  const direct = up(inst?.ImageLaterality || inst?.Laterality || ds?.Laterality);
  if (direct) {
    return direct;
  }
  try {
    const fl = inst?.SharedFunctionalGroupsSequence?.[0]?.FrameAnatomySequence?.[0]?.FrameLaterality;
    const flu = up(fl);
    if (flu) {
      return flu;
    }
  } catch (err) {
    /* struttura non presente → ignoro */
  }
  return '';
};

// Mappa codici vista → token CANONICO (indipendente da schema di codifica e lingua).
// Include i codici più comuni e sicuri (CC/MLO) sia SRT sia SCT; gli altri ricadono su
// significato/ViewPosition/raw (che per studi con lo STESSO schema combaciano comunque).
const VIEW_CODE_MAP = {
  'R-10242': 'CC',
  '399162004': 'CC',
  'R-10226': 'MLO',
  '399368009': 'MLO',
};

// Canonicalizzazione dal testo del CodeMeaning (semantica, cross-schema, ma lingua-dipendente).
// Le proiezioni OBLIQUE vanno gestite PRIMA delle non-oblique (MLO = "medio-lateral oblique"
// contiene sia "medio-lateral" sia "obliq"), ma SENZA generalizzare: 'OBLIQ' da solo NON basta
// per MLO (esistono LMO latero-medial oblique, SIO, ecc.) → mappo solo quelle ben definite,
// altrimenti '' (fallback a ViewPosition/codice grezzo, che per stesso schema combacia).
const meaningToCanonical = m => {
  if (!m) {
    return '';
  }
  if (m.includes('CRANIO') && m.includes('CAUD')) {
    return 'CC';
  }
  if (m.includes('OBLIQ')) {
    if (m.includes('MEDIO') && m.includes('LATERAL')) {
      return 'MLO'; // medio-lateral oblique
    }
    if (m.includes('LATERO') && m.includes('MEDIAL')) {
      return 'LMO'; // latero-medial oblique
    }
    return ''; // altra obliqua non standard → non indovinare
  }
  if (m.includes('LATERO') && m.includes('MEDIAL')) {
    return 'LM';
  }
  if (m.includes('MEDIO') && m.includes('LATERAL')) {
    return 'ML';
  }
  return '';
};

/**
 * Proiezione canonica, indipendente dalla nomenclatura E dallo schema di codifica.
 * Precedenza deterministica (così la stessa vista dà lo stesso token qualunque sia il
 * campo popolato): codice noto → significato → ViewPosition → "SCHEMA:CODICE" grezzo.
 * Ritorna '' se non determinabile.
 */
export const deriveViewCode = ds => {
  const inst = firstInstance(ds);
  let vc;
  try {
    vc = inst?.ViewCodeSequence?.[0];
  } catch (err) {
    vc = undefined;
  }
  // 1) Codice noto → canonico (indipendente da lingua e schema).
  const byCode = vc?.CodeValue ? VIEW_CODE_MAP[up(vc.CodeValue)] : '';
  if (byCode) {
    return byCode;
  }
  // 2) Significato del codice (semantico, cross-schema).
  const byMeaning = meaningToCanonical(up(vc?.CodeMeaning));
  if (byMeaning) {
    return byMeaning;
  }
  // 3) ViewPosition (già un codice canonico: CC/MLO/ML/LM/...).
  const vp = up(inst?.ViewPosition);
  if (vp) {
    return vp;
  }
  // 4) Fallback grezzo "SCHEMA:CODICE" (combacia tra studi con lo stesso schema).
  if (vc?.CodeValue) {
    const scheme = vc.CodingSchemeDesignator ? `${up(vc.CodingSchemeDesignator)}:` : '';
    return `${scheme}${up(vc.CodeValue)}`;
  }
  return '';
};

/**
 * Chiave d'identità della VISTA usata per il match: "LAT|VIEW" (o solo VIEW se manca
 * la lateralità). Ritorna undefined se non c'è alcuna vista → in tal caso NON si
 * aggiunge alcuna regola per vista (fallback puro a nome/numero, come prima).
 */
export const deriveViewKey = ds => {
  const view = deriveViewCode(ds);
  if (!view) {
    return undefined;
  }
  const lat = deriveLaterality(ds);
  return lat ? `${lat}|${view}` : view;
};

/**
 * Dimensionalità: '2D' (sintetico/classico, monoframe) vs '3D' (volume tomosintesi,
 * multiframe). Serve come SPAREGGIO quando, per la STESSA vista, esistono due serie
 * (tipico della tomosintesi: 2D sintetico + volume 3D). Deterministico (mai undefined)
 * così lo spareggio funziona in entrambe le direzioni di salvataggio/caricamento; ha
 * effetto solo tra serie con la STESSA identità di vista (peso basso), quindi non può
 * far vincere una vista sbagliata.
 */
export const deriveMammoDim = ds => {
  const inst = firstInstance(ds);
  const itStr = up(Array.isArray(inst?.ImageType) ? inst.ImageType.join('\\') : inst?.ImageType);
  if (itStr.includes('GENERATED_2D')) {
    return '2D';
  }
  const nf = Number(inst?.NumberOfFrames || 1);
  return nf > 1 ? '3D' : '2D';
};

/**
 * Chiave VISTA+DIMENSIONE: "LAT|VIEW|DIM" (undefined se non c'è vista).
 * Usata come regola a peso BASSO ma ACCOPPIATA ALLA VISTA: fa da spareggio 2D/3D fra
 * serie della STESSA vista (es. tomo: 2D sintetico vs volume 3D) SENZA dare punti a una
 * serie di vista diversa che condivide solo la dimensione. Deve combaciare byte-a-byte
 * tra salvataggio e caricamento → si appoggia alle stesse derive*().
 */
export const deriveViewDimKey = ds => {
  const vk = deriveViewKey(ds);
  if (!vk) {
    return undefined;
  }
  return `${vk}|${deriveMammoDim(ds)}`;
};

// Registrazione idempotente degli attributi custom sul matcher OHIF.
// Il callback riceve (metadataInstance = displaySet, options) → passiamo il displaySet
// alle derive*(). Chiamata sia all'avvio (caricamentoHP) sia in applyConfigNow (modale).
let _registered = false;
export const registerMdvHPAttributes = hangingProtocolService => {
  if (_registered || typeof hangingProtocolService?.addCustomAttribute !== 'function') {
    return;
  }
  try {
    hangingProtocolService.addCustomAttribute(
      MDV_VIEW_KEY_ATTR,
      'Mdv view identity (laterality|viewcode)',
      deriveViewKey
    );
    hangingProtocolService.addCustomAttribute(
      MDV_VIEW_DIM_KEY_ATTR,
      'Mdv view+dimensionality identity',
      deriveViewDimKey
    );
    _registered = true;
    if (window.mdvHPDebug) {
      // eslint-disable-next-line no-console
      console.log('[HP] Attributi vista mdv registrati:', MDV_VIEW_KEY_ATTR, MDV_VIEW_DIM_KEY_ATTR);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[HP] Registrazione attributi vista mdv fallita', err);
  }
};
