/**
 * mammoView.js: a VIEW identity that does not depend on naming, used to pin a series
 * to a cell in a hanging protocol.
 *
 * The problem: between studies named by different conventions (mammograms from
 * different years or different machines) SeriesDescription and SeriesNumber change, so
 * the series-to-cell match, which today rests on those two, puts the WRONG series in
 * the cell. The DICOM view tags, on the other hand, are standard and stable:
 * laterality (R or L) plus projection (ViewCode, CC or MLO for instance) identify the
 * series whatever it is called.
 *
 * This module exposes:
 *  - derive*(): PURE functions, which never throw, that read laterality, view and
 *    2D-or-3D off a display set. Used BOTH when capturing (hpStore.captureCurrentState)
 *    AND when loading (the custom attribute registered on HangingProtocolService), so
 *    the format is the same on both sides and the match lands.
 *  - registerMdvHPAttributes(): registers the custom attributes on the OHIF matcher.
 *
 * It depends on nothing, being a leaf module, so there is no risk of circular imports.
 */

// The names of the custom attributes used in the saved seriesMatchingRules.
export const MDV_VIEW_KEY_ATTR = 'mdvViewKey';
export const MDV_VIEW_DIM_KEY_ATTR = 'mdvViewDimKey';

const firstInstance = ds => ds?.instances?.[0] || ds?.images?.[0] || ds || {};
const up = value => (value == null ? '' : String(value).trim().toUpperCase());

/**
 * Laterality (R or L), from more than one source:
 *  - classic 2D or DX mammography: ImageLaterality (0020,0062) or Laterality (0020,0060)
 *  - tomosynthesis or enhanced: FrameLaterality inside SharedFunctionalGroupsSequence
 * Returns '' when it cannot be worked out.
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
    /* the structure is not there, so ignore it */
  }
  return '';
};

// View codes mapped to a CANONICAL token, independent of coding scheme and language.
// It holds the commonest and safest codes (CC and MLO) in both SRT and SCT; the rest
// fall back to meaning, ViewPosition or the raw code, which still match between studies
// using the SAME scheme.
const VIEW_CODE_MAP = {
  'R-10242': 'CC',
  '399162004': 'CC',
  'R-10226': 'MLO',
  '399368009': 'MLO',
};

// Canonicalising from the CodeMeaning text: semantic and cross-scheme, but it does
// depend on the language. OBLIQUE projections have to be handled BEFORE the
// non-oblique ones (MLO is "medio-lateral oblique" and contains both "medio-lateral"
// and "obliq"), but without generalising: 'OBLIQ' on its own is NOT enough for MLO,
// since LMO, SIO and others exist. Only the well-defined ones are mapped; anything else
// gives '' and falls back to ViewPosition or the raw code, which match within a scheme.
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
 * The canonical projection, independent of naming AND of coding scheme.
 * The order is fixed, so the same view gives the same token whichever field is filled
 * in: a known code, then the meaning, then ViewPosition, then the raw "SCHEME:CODE".
 * Returns '' when it cannot be worked out.
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
  // 2) The code's meaning: semantic, and it crosses schemes.
  const byMeaning = meaningToCanonical(up(vc?.CodeMeaning));
  if (byMeaning) {
    return byMeaning;
  }
  // 3) ViewPosition, already a canonical code: CC, MLO, ML, LM and so on.
  const vp = up(inst?.ViewPosition);
  if (vp) {
    return vp;
  }
  // 4) The raw "SCHEME:CODE" fallback, which matches between studies using one scheme.
  if (vc?.CodeValue) {
    const scheme = vc.CodingSchemeDesignator ? `${up(vc.CodingSchemeDesignator)}:` : '';
    return `${scheme}${up(vc.CodeValue)}`;
  }
  return '';
};

/**
 * The VIEW identity key used for matching: "LAT|VIEW", or just VIEW when there is no
 * laterality. Returns undefined when there is no view at all, and in that case NO view
 * rule is added: it falls back purely to name and number, as it did before.
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
 * Dimensionality: '2D' (synthetic or classic, single frame) against '3D' (a
 * tomosynthesis volume, multiframe). This is a TIE-BREAK for when the SAME view has two
 * series, which is typical of tomosynthesis: a synthetic 2D and a 3D volume. It is
 * deterministic, never undefined, so the tie-break works in both directions of saving
 * and loading; and it only has any effect between series of the SAME view identity,
 * carrying a low weight, so it can never make a wrong view win.
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
 * The VIEW plus DIMENSION key: "LAT|VIEW|DIM", undefined when there is no view.
 * Used as a LOW-weight rule that is TIED TO THE VIEW: it breaks the 2D against 3D tie
 * between series of the SAME view (synthetic 2D against 3D volume in tomosynthesis)
 * WITHOUT giving points to a series of another view that merely shares the dimension.
 * It has to match byte for byte between saving and loading, so it leans on the same
 * derive*() functions.
 */
export const deriveViewDimKey = ds => {
  const vk = deriveViewKey(ds);
  if (!vk) {
    return undefined;
  }
  return `${vk}|${deriveMammoDim(ds)}`;
};

// Idempotent registration of the custom attributes on the OHIF matcher.
// The callback is handed (metadataInstance = displaySet, options), so the display set
// goes to derive*(). Called both at startup (loadHangingProtocol) and in applyConfigNow
// (the dialog).
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
