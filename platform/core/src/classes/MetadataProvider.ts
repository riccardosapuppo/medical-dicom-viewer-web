import queryString from 'query-string';
import dicomParser from 'dicom-parser';
import { imageIdToURI } from '../utils';
import getPixelSpacingInformation from '../utils/metadataProvider/getPixelSpacingInformation';
import DicomMetadataStore from '../services/DicomMetadataStore';
import fetchPaletteColorLookupTableData from '../utils/metadataProvider/fetchPaletteColorLookupTableData';
import toNumber from '../utils/toNumber';
import combineFrameInstance from '../utils/combineFrameInstance';
import formatPN from '../utils/formatPN';

const PALETTE_DEBUG_LOGGED_SOPS = new Set();

function getPaletteDataSourceInfo(paletteData) {
  return {
    present: Boolean(paletteData),
    inlineBinary: Boolean(paletteData?.InlineBinary),
    inlineBinaryLength: paletteData?.InlineBinary?.length ?? null,
    bulkDataURI: paletteData?.BulkDataURI ?? null,
    retrieveBulkData: typeof paletteData?.retrieveBulkData === 'function',
    cachedPaletteLength: Array.isArray(paletteData?.palette) ? paletteData.palette.length : null,
  };
}

function getPaletteLutInfo(lutValue) {
  if (Array.isArray(lutValue)) {
    return {
      kind: 'array',
      length: lutValue.length,
      sample: lutValue.slice(0, 8),
    };
  }

  if (lutValue && typeof lutValue.then === 'function') {
    return { kind: 'promise' };
  }

  if (lutValue === undefined) {
    return { kind: 'undefined' };
  }

  if (lutValue === null) {
    return { kind: 'null' };
  }

  return { kind: typeof lutValue };
}

function analyzePaletteLuts(metadata) {
  const r = metadata?.redPaletteColorLookupTableData;
  const g = metadata?.greenPaletteColorLookupTableData;
  const b = metadata?.bluePaletteColorLookupTableData;
  const descriptor = metadata?.redPaletteColorLookupTableDescriptor;

  if (!Array.isArray(r) || !Array.isArray(g) || !Array.isArray(b)) {
    return { ready: false };
  }

  const length = Math.min(r.length, g.length, b.length);
  const bits = Array.isArray(descriptor) ? descriptor[2] : undefined;
  const shift = bits === 8 ? 0 : 8;

  let equalRG = true;
  let equalRB = true;
  let equalGB = true;
  let firstDiffRG = -1;
  let firstDiffRB = -1;
  let firstDiffGB = -1;

  let minR = Infinity;
  let minG = Infinity;
  let minB = Infinity;
  let maxR = -Infinity;
  let maxG = -Infinity;
  let maxB = -Infinity;

  for (let i = 0; i < length; i++) {
    const rv = r[i] >> shift;
    const gv = g[i] >> shift;
    const bv = b[i] >> shift;

    if (rv < minR) minR = rv;
    if (gv < minG) minG = gv;
    if (bv < minB) minB = bv;
    if (rv > maxR) maxR = rv;
    if (gv > maxG) maxG = gv;
    if (bv > maxB) maxB = bv;

    if (equalRG && rv !== gv) {
      equalRG = false;
      firstDiffRG = i;
    }
    if (equalRB && rv !== bv) {
      equalRB = false;
      firstDiffRB = i;
    }
    if (equalGB && gv !== bv) {
      equalGB = false;
      firstDiffGB = i;
    }
  }

  const sampleLength = Math.min(16, length);
  const to8BitSample = lut => lut.slice(0, sampleLength).map(v => v >> shift);

  return {
    ready: true,
    length,
    bits,
    shift,
    equalRG,
    equalRB,
    equalGB,
    allChannelsEqual: equalRG && equalRB && equalGB,
    firstDiffRG,
    firstDiffRB,
    firstDiffGB,
    minMax8bit: {
      r: [Number.isFinite(minR) ? minR : null, Number.isFinite(maxR) ? maxR : null],
      g: [Number.isFinite(minG) ? minG : null, Number.isFinite(maxG) ? maxG : null],
      b: [Number.isFinite(minB) ? minB : null, Number.isFinite(maxB) ? maxB : null],
    },
    sample8bit: {
      r: to8BitSample(r),
      g: to8BitSample(g),
      b: to8BitSample(b),
    },
  };
}

function logPaletteDebugIfNeeded(instance, metadata) {
  if (typeof window === 'undefined') {
    return;
  }

  if (window?.localStorage?.getItem('ohifPaletteDebug') !== '1') {
    return;
  }

  const photometric = metadata?.photometricInterpretation;
  const isPalettePhotometric =
    typeof photometric === 'string' && photometric.toUpperCase().includes('PALETTE');
  const hasPaletteTags = Boolean(
    instance?.RedPaletteColorLookupTableDescriptor ||
      instance?.GreenPaletteColorLookupTableDescriptor ||
      instance?.BluePaletteColorLookupTableDescriptor ||
      instance?.RedPaletteColorLookupTableData ||
      instance?.GreenPaletteColorLookupTableData ||
      instance?.BluePaletteColorLookupTableData
  );

  if (!isPalettePhotometric && !hasPaletteTags) {
    return;
  }

  const sopInstanceUID = instance?.SOPInstanceUID || 'unknown';
  if (PALETTE_DEBUG_LOGGED_SOPS.has(sopInstanceUID)) {
    return;
  }
  PALETTE_DEBUG_LOGGED_SOPS.add(sopInstanceUID);

  // eslint-disable-next-line no-console
  console.log('[ohifPaletteDebug:imagePixelModule]', {
    studyInstanceUID: instance?.StudyInstanceUID ?? null,
    seriesInstanceUID: instance?.SeriesInstanceUID ?? null,
    sopInstanceUID,
    instanceNumber: instance?.InstanceNumber ?? null,
    sopClassUID: instance?.SOPClassUID ?? null,
    transferSyntaxUID: instance?.TransferSyntaxUID ?? instance?.TransferSyntax ?? null,
    photometricInterpretationRaw: instance?.PhotometricInterpretation ?? null,
    photometricInterpretationNormalized: metadata?.photometricInterpretation ?? null,
    samplesPerPixel: metadata?.samplesPerPixel ?? null,
    bitsAllocated: metadata?.bitsAllocated ?? null,
    bitsStored: metadata?.bitsStored ?? null,
    highBit: metadata?.highBit ?? null,
    pixelRepresentation: metadata?.pixelRepresentation ?? null,
    planarConfiguration: metadata?.planarConfiguration ?? null,
    rows: metadata?.rows ?? null,
    columns: metadata?.columns ?? null,
    descriptors: {
      red: metadata?.redPaletteColorLookupTableDescriptor ?? null,
      green: metadata?.greenPaletteColorLookupTableDescriptor ?? null,
      blue: metadata?.bluePaletteColorLookupTableDescriptor ?? null,
    },
    rawDataSource: {
      red: getPaletteDataSourceInfo(instance?.RedPaletteColorLookupTableData),
      green: getPaletteDataSourceInfo(instance?.GreenPaletteColorLookupTableData),
      blue: getPaletteDataSourceInfo(instance?.BluePaletteColorLookupTableData),
      inlineBinaryEquality: {
        redEqualsGreen:
          instance?.RedPaletteColorLookupTableData?.InlineBinary != null &&
          instance?.RedPaletteColorLookupTableData?.InlineBinary ===
            instance?.GreenPaletteColorLookupTableData?.InlineBinary,
        redEqualsBlue:
          instance?.RedPaletteColorLookupTableData?.InlineBinary != null &&
          instance?.RedPaletteColorLookupTableData?.InlineBinary ===
            instance?.BluePaletteColorLookupTableData?.InlineBinary,
        greenEqualsBlue:
          instance?.GreenPaletteColorLookupTableData?.InlineBinary != null &&
          instance?.GreenPaletteColorLookupTableData?.InlineBinary ===
            instance?.BluePaletteColorLookupTableData?.InlineBinary,
      },
    },
    resolvedLut: {
      red: getPaletteLutInfo(metadata?.redPaletteColorLookupTableData),
      green: getPaletteLutInfo(metadata?.greenPaletteColorLookupTableData),
      blue: getPaletteLutInfo(metadata?.bluePaletteColorLookupTableData),
    },
    lutAnalysis: analyzePaletteLuts(metadata),
  });
}

class MetadataProvider {
  private readonly imageURIToUIDs: Map<string, any> = new Map();
  // Can be used to store custom metadata for a specific type.
  // For instance, the scaling metadata for PET can be stored here
  // as type "scalingModule"
  private readonly customMetadata: Map<string, any> = new Map();

  addImageIdToUIDs(imageId, uids) {
    if (!imageId) {
      throw new Error('MetadataProvider::Empty imageId');
    }

    // This method is a fallback for when you don't have WADO-URI or WADO-RS.
    // You can add instances fetched by any method by calling addInstance, and hook an imageId to point at it here.
    // An example would be dicom hosted at some random site.
    const imageURI = imageIdToURI(imageId);
    this.imageURIToUIDs.set(imageURI, uids);
  }

  addCustomMetadata(imageId, type, metadata) {
    const imageURI = imageIdToURI(imageId);
    if (!this.customMetadata.has(type)) {
      this.customMetadata.set(type, {});
    }

    this.customMetadata.get(type)[imageURI] = metadata;
  }

  _getInstance(imageId) {
    if (!imageId) {
      throw new Error('MetadataProvider::Empty imageId');
    }

    const uids = this.getUIDsFromImageID(imageId);

    if (!uids) {
      return;
    }

    const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID, frameNumber } = uids;

    const instance = DicomMetadataStore.getInstance(
      StudyInstanceUID,
      SeriesInstanceUID,
      SOPInstanceUID
    );

    if (!instance) {
      return;
    }

    return (frameNumber && combineFrameInstance(frameNumber, instance)) || instance;
  }

  get(query, imageId, options = { fallback: false }) {
    if (Array.isArray(imageId)) {
      return;
    }
    const instance = this._getInstance(imageId);

    if (query === INSTANCE) {
      return instance;
    }

    // check inside custom metadata
    if (this.customMetadata.has(query)) {
      const customMetadata = this.customMetadata.get(query);
      const imageURI = imageIdToURI(imageId);
      if (customMetadata[imageURI]) {
        return customMetadata[imageURI];
      }
    }

    return this.getTagFromInstance(query, instance, options);
  }

  getTag(query, imageId, options) {
    return this.get(query, imageId, options);
  }

  getInstance(imageId) {
    return this.get(INSTANCE, imageId);
  }

  getTagFromInstance(naturalizedTagOrWADOImageLoaderTag, instance, options = { fallback: false }) {
    if (!instance) {
      return;
    }

    // If its a naturalized dcmjs tag present on the instance, return.
    if (instance[naturalizedTagOrWADOImageLoaderTag]) {
      return instance[naturalizedTagOrWADOImageLoaderTag];
    }

    // Maybe its a legacy dicomImageLoader tag then:
    return this._getCornerstoneDICOMImageLoaderTag(naturalizedTagOrWADOImageLoaderTag, instance);
  }

  /**
   * Adds a new handler for the given tag.  The handler will be provided an
   * instance object that it can read values from.
   */
  public addHandler(wadoImageLoaderTag: string, handler) {
    WADO_IMAGE_LOADER[wadoImageLoaderTag] = handler;
  }

  _getCornerstoneDICOMImageLoaderTag(wadoImageLoaderTag, instance) {
    let metadata = WADO_IMAGE_LOADER[wadoImageLoaderTag]?.(instance);
    if (metadata) {
      return metadata;
    }

    switch (wadoImageLoaderTag) {
      case WADO_IMAGE_LOADER_TAGS.GENERAL_SERIES_MODULE:
        const { SeriesDate, SeriesTime } = instance;

        let seriesDate;
        let seriesTime;

        if (SeriesDate) {
          seriesDate = dicomParser.parseDA(SeriesDate);
        }

        if (SeriesTime) {
          seriesTime = dicomParser.parseTM(SeriesTime);
        }

        metadata = {
          modality: instance.Modality,
          seriesInstanceUID: instance.SeriesInstanceUID,
          seriesNumber: toNumber(instance.SeriesNumber),
          studyInstanceUID: instance.StudyInstanceUID,
          seriesDate,
          seriesTime,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.PATIENT_STUDY_MODULE:
        metadata = {
          patientAge: toNumber(instance.PatientAge),
          patientSize: toNumber(instance.PatientSize),
          patientWeight: toNumber(instance.PatientWeight),
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.PATIENT_DEMOGRAPHIC_MODULE:
        metadata = {
          patientSex: instance.PatientSex,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.IMAGE_PIXEL_MODULE:
        const photometricInterpretation =
          typeof instance.PhotometricInterpretation === 'string'
            ? instance.PhotometricInterpretation.trim().replace(/\s+/g, ' ')
            : instance.PhotometricInterpretation;

        metadata = {
          samplesPerPixel: toNumber(instance.SamplesPerPixel),
          photometricInterpretation,
          rows: toNumber(instance.Rows),
          columns: toNumber(instance.Columns),
          bitsAllocated: toNumber(instance.BitsAllocated),
          bitsStored: toNumber(instance.BitsStored),
          highBit: toNumber(instance.HighBit),
          pixelRepresentation: toNumber(instance.PixelRepresentation),
          planarConfiguration: toNumber(instance.PlanarConfiguration),
          pixelAspectRatio: toNumber(instance.PixelAspectRatio),
          smallestPixelValue: toNumber(instance.SmallestPixelValue),
          largestPixelValue: toNumber(instance.LargestPixelValue),
          redPaletteColorLookupTableDescriptor: toNumber(
            instance.RedPaletteColorLookupTableDescriptor
          ),
          greenPaletteColorLookupTableDescriptor: toNumber(
            instance.GreenPaletteColorLookupTableDescriptor
          ),
          bluePaletteColorLookupTableDescriptor: toNumber(
            instance.BluePaletteColorLookupTableDescriptor
          ),
          redPaletteColorLookupTableData: fetchPaletteColorLookupTableData(
            instance,
            'RedPaletteColorLookupTableData',
            'RedPaletteColorLookupTableDescriptor'
          ),
          greenPaletteColorLookupTableData: fetchPaletteColorLookupTableData(
            instance,
            'GreenPaletteColorLookupTableData',
            'GreenPaletteColorLookupTableDescriptor'
          ),
          bluePaletteColorLookupTableData: fetchPaletteColorLookupTableData(
            instance,
            'BluePaletteColorLookupTableData',
            'BluePaletteColorLookupTableDescriptor'
          ),
        };

        logPaletteDebugIfNeeded(instance, metadata);

        break;
      case WADO_IMAGE_LOADER_TAGS.VOI_LUT_MODULE:
        const { WindowCenter, WindowWidth, VOILUTFunction } = instance;
        if (WindowCenter == null || WindowWidth == null) {
          // [MDV-DEBUG-ADC] log quando VOI manca su serie multiframe ADC
          if (
            (instance.NumberOfFrames > 1 || instance.PerFrameFunctionalGroupsSequence) &&
            /ADC/i.test(instance.SeriesDescription || '')
          ) {
            console.warn('[MDV][VOI_LUT_MODULE] missing WC/WW on multiframe ADC', {
              SeriesDescription: instance.SeriesDescription,
              SOPClassUID: instance.SOPClassUID,
              NumberOfFrames: instance.NumberOfFrames,
              frameNumber: instance.frameNumber,
              hasPerFrame: !!instance.PerFrameFunctionalGroupsSequence,
              hasShared: !!instance.SharedFunctionalGroupsSequence,
              instanceKeys: Object.keys(instance).slice(0, 40),
            });
          }
          return;
        }
        const windowCenter = Array.isArray(WindowCenter) ? WindowCenter : [WindowCenter];
        const windowWidth = Array.isArray(WindowWidth) ? WindowWidth : [WindowWidth];

        if (instance.WindowCenter && instance.WindowWidth) {
          // inizializzo window.MdvDicomLuts se non esiste
          window.MdvDicomLuts ??= {};

          const dicomLuts = window.MdvDicomLuts;
          const seriesUID = instance.SeriesInstanceUID;

          // se non esiste un oggetto per la SeriesInstanceUID lo creo
          dicomLuts[seriesUID] ??= {
            WindowCenter: instance.WindowCenter,
            WindowWidth: instance.WindowWidth,
            ...(instance.WindowCenterWidthExplanation && {
              WindowCenterWidthExplanation: instance.WindowCenterWidthExplanation,
            }),
          };
        }

        let wcOut = toNumber(windowCenter);
        let wwOut = toNumber(windowWidth);

        // [MDV-FIX-VOI-MISMATCH] Auto-window quando la VOI fornita dal DICOM non copre
        // il dynamic range del pixel data dopo modality LUT (rescale).
        //
        // Caso tipico (osservato su Philips Enhanced MR ADC, ma applicabile a qualsiasi
        // serie con VOI mal calibrata): WC/WW espressi nel dominio rescalato lasciano
        // la maggior parte dei pixel rescalati sopra l'high del window → saturazione
        // a bianco dell'intera immagine.
        //
        // Strategia agnostica al SeriesDescription / ImageType:
        // - Calcoliamo il range pixel-rescaled reale [dataLow, dataHigh] dai tag
        //   SmallestImagePixelValue / LargestImagePixelValue + RescaleSlope/Intercept.
        // - Misuriamo quanta parte del range pixel ricade DENTRO la VOI fornita.
        // - Se la VOI copre meno del 50% del range pixel (entrambi i lati), la
        //   consideriamo non-utile e ricalcoliamo WC/WW come fit del range completo.
        // Questo evita falsi positivi su serie con VOI legittimamente "narrow" che
        // satura solo le code (CSF, bolle), e cattura il caso mal-calibrato in cui
        // sostanzialmente tutto il dataset finisce fuori finestra.
        const slopeForFit = Number(instance.RescaleSlope);
        const interceptForFit = Number(instance.RescaleIntercept);
        const smallestPx = Number(instance.SmallestImagePixelValue);
        const largestPx = Number(instance.LargestImagePixelValue);
        if (
          Number.isFinite(slopeForFit) &&
          Number.isFinite(interceptForFit) &&
          Number.isFinite(smallestPx) &&
          Number.isFinite(largestPx) &&
          largestPx > smallestPx
        ) {
          const wcPrimary = Array.isArray(wcOut) ? Number(wcOut[0]) : Number(wcOut);
          const wwPrimary = Array.isArray(wwOut) ? Number(wwOut[0]) : Number(wwOut);
          if (Number.isFinite(wcPrimary) && Number.isFinite(wwPrimary) && wwPrimary > 0) {
            const windowLow = wcPrimary - wwPrimary / 2;
            const windowHigh = wcPrimary + wwPrimary / 2;
            const dataLow = smallestPx * slopeForFit + interceptForFit;
            const dataHigh = largestPx * slopeForFit + interceptForFit;
            const dataRange = dataHigh - dataLow;
            // Intersezione tra finestra e range pixel (in unità rescalate).
            const overlapLow = Math.max(windowLow, dataLow);
            const overlapHigh = Math.min(windowHigh, dataHigh);
            const overlap = Math.max(0, overlapHigh - overlapLow);
            const coverage = dataRange > 0 ? overlap / dataRange : 1;
            // Quanta parte del range pixel cade FUORI dalla finestra, su ciascun
            // lato (normalizzata sul range). Servono a distinguere una finestra
            // CENTRATA (dati su entrambi i lati) da una schiacciata su un estremo.
            const fractionAbove = dataRange > 0 ? Math.max(0, dataHigh - windowHigh) / dataRange : 0;
            const fractionBelow = dataRange > 0 ? Math.max(0, windowLow - dataLow) / dataRange : 0;
            //
            // [MDV-FIX-VOI-MISMATCH] Trigger SOLO sul caso patologico "saturazione
            // a tinta unita": la finestra è del tutto fuori dai dati (overlap nullo)
            // oppure è un filo sottile (coverage bassa) schiacciato contro un estremo
            // del range — quindi quasi tutti i pixel finiscono dallo stesso lato e
            // l'immagine diventa uniformemente bianca/nera, illeggibile (il caso MR
            // ADC Philips per cui il fix era nato, ma agnostico alla modalità).
            //
            // NON scatta su una finestra diagnostica STRETTA ma CENTRATA: la TAC con
            // window molli (WW~350 su range HU ~2700) ha dati abbondanti su entrambi
            // i lati → fractionAbove e fractionBelow entrambe non trascurabili. Il
            // vecchio test coverage<0.5 le sparava nel mucchio e riscriveva la WL del
            // radiologo (immagine slavata): questa versione le rispetta.
            //
            // NON scatta nemmeno su finestre TAC larghe legittimamente "uno-lato"
            // (es. polmone WC=-600/WW=1500: tutto il denso a bianco): lì la coverage
            // resta alta (~0.45), quindi il gate `coverage < COV` la protegge.
            const EDGE = 0.05; // un lato è praticamente senza dati (finestra a filo/oltre il bordo)
            const BULK = 0.6; // l'altro lato concentra la grande maggioranza dei pixel
            const COV = 0.25; // la finestra è un filo sottile sul range complessivo
            const oneSidedSaturation =
              (fractionBelow < EDGE && fractionAbove > BULK) ||
              (fractionAbove < EDGE && fractionBelow > BULK);
            if (overlap <= 0 || (coverage < COV && oneSidedSaturation)) {
              // Per il bordo basso scegliamo il minimo tra: low della VOI fornita,
              // dataLow, e 0 (zero naturale per scale rescalate tipo ADC). Questo
              // evita di troncare i valori bassi visivamente importanti (es. il
              // gradiente del prostata che si estende sotto SmallestImagePixelValue
              // perché 1080 è il min del dataset ma il "vero" zero dell'unità è 0).
              // Per il bordo alto prendiamo il massimo tra high della VOI e dataHigh,
              // mantenendo l'intento originale ma estendendolo se serve.
              const fitLow = Math.min(windowLow, dataLow, 0);
              const fitHigh = Math.max(windowHigh, dataHigh);
              const newWW = fitHigh - fitLow;
              const newWC = (fitHigh + fitLow) / 2;
              // Diagnostica (console.debug = livello "Verbose", nascosto di
              // default): la correzione è voluta, non è un errore. Evita il flood
              // di warning a ogni frame su serie mal calibrate.
              console.debug('[MDV][VOI_LUT_MODULE] auto-window override (VOI saturates to one tone)', {
                series: instance.SeriesDescription,
                modality: instance.Modality,
                frame: instance.frameNumber,
                providedWC: wcPrimary,
                providedWW: wwPrimary,
                dataLow,
                dataHigh,
                coverage: Number(coverage.toFixed(3)),
                fractionAbove: Number(fractionAbove.toFixed(3)),
                fractionBelow: Number(fractionBelow.toFixed(3)),
                overlap: Number(overlap.toFixed(1)),
                fitLow,
                fitHigh,
                newWC,
                newWW,
              });
              wcOut = [newWC];
              wwOut = [newWW];
            }
          }
        }

        metadata = {
          windowCenter: wcOut,
          windowWidth: wwOut,
          voiLUTFunction: VOILUTFunction,
        };

        // [MDV-DEBUG-ADC] log VOI_LUT per serie multiframe ADC (una volta per serie+frame)
        if (
          (instance.NumberOfFrames > 1 || instance.PerFrameFunctionalGroupsSequence) &&
          /ADC/i.test(instance.SeriesDescription || '')
        ) {
          window.MdvAdcDebug ??= { voi: {}, modality: {} };
          const key = `${instance.SeriesInstanceUID}#${instance.frameNumber ?? 1}`;
          if (!window.MdvAdcDebug.voi[key]) {
            window.MdvAdcDebug.voi[key] = {
              SeriesDescription: instance.SeriesDescription,
              SOPClassUID: instance.SOPClassUID,
              frameNumber: instance.frameNumber,
              WindowCenter,
              WindowWidth,
              VOILUTFunction,
              metadataReturned: metadata,
              RescaleSlope: instance.RescaleSlope,
              RescaleIntercept: instance.RescaleIntercept,
              RescaleType: instance.RescaleType,
              SmallestImagePixelValue: instance.SmallestImagePixelValue,
              LargestImagePixelValue: instance.LargestImagePixelValue,
              BitsStored: instance.BitsStored,
              PixelRepresentation: instance.PixelRepresentation,
            };
            console.log('[MDV][VOI_LUT_MODULE][ADC]', key, window.MdvAdcDebug.voi[key]);
          }
        }

        break;
      case WADO_IMAGE_LOADER_TAGS.MODALITY_LUT_MODULE:
        const { RescaleIntercept, RescaleSlope } = instance;
        if (RescaleIntercept === undefined || RescaleSlope === undefined) {
          // [MDV-DEBUG-ADC] log quando rescale manca su serie multiframe ADC -> render saturato bianco
          if (
            (instance.NumberOfFrames > 1 || instance.PerFrameFunctionalGroupsSequence) &&
            /ADC/i.test(instance.SeriesDescription || '')
          ) {
            console.warn('[MDV][MODALITY_LUT_MODULE] missing RescaleSlope/Intercept on multiframe ADC', {
              SeriesDescription: instance.SeriesDescription,
              frameNumber: instance.frameNumber,
              hasPerFrame: !!instance.PerFrameFunctionalGroupsSequence,
              hasShared: !!instance.SharedFunctionalGroupsSequence,
              RescaleSlope,
              RescaleIntercept,
            });
          }
          return;
        }

        metadata = {
          rescaleIntercept: toNumber(instance.RescaleIntercept),
          rescaleSlope: toNumber(instance.RescaleSlope),
          rescaleType: instance.RescaleType,
        };

        // [MDV-DEBUG-ADC] log Modality LUT per serie multiframe ADC (una volta per serie+frame)
        if (
          (instance.NumberOfFrames > 1 || instance.PerFrameFunctionalGroupsSequence) &&
          /ADC/i.test(instance.SeriesDescription || '')
        ) {
          window.MdvAdcDebug ??= { voi: {}, modality: {} };
          const key = `${instance.SeriesInstanceUID}#${instance.frameNumber ?? 1}`;
          if (!window.MdvAdcDebug.modality[key]) {
            window.MdvAdcDebug.modality[key] = {
              SeriesDescription: instance.SeriesDescription,
              frameNumber: instance.frameNumber,
              RescaleSlope,
              RescaleIntercept,
              RescaleType: instance.RescaleType,
              metadataReturned: metadata,
            };
            console.log('[MDV][MODALITY_LUT_MODULE][ADC]', key, window.MdvAdcDebug.modality[key]);
          }
        }
        break;
      case WADO_IMAGE_LOADER_TAGS.SOP_COMMON_MODULE:
        metadata = {
          sopClassUID: instance.SOPClassUID,
          sopInstanceUID: instance.SOPInstanceUID,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.PET_IMAGE_MODULE:
        metadata = {
          frameReferenceTime: instance.FrameReferenceTime,
          actualFrameDuration: instance.ActualFrameDuration,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.PET_ISOTOPE_MODULE:
        const { RadiopharmaceuticalInformationSequence } = instance;

        if (RadiopharmaceuticalInformationSequence) {
          const RadiopharmaceuticalInformation = Array.isArray(
            RadiopharmaceuticalInformationSequence
          )
            ? RadiopharmaceuticalInformationSequence[0]
            : RadiopharmaceuticalInformationSequence;

          const { RadiopharmaceuticalStartTime, RadionuclideTotalDose, RadionuclideHalfLife } =
            RadiopharmaceuticalInformation;

          const radiopharmaceuticalInfo = {
            radiopharmaceuticalStartTime: dicomParser.parseTM(RadiopharmaceuticalStartTime),
            radionuclideTotalDose: RadionuclideTotalDose,
            radionuclideHalfLife: RadionuclideHalfLife,
          };
          metadata = {
            radiopharmaceuticalInfo,
          };
        }

        break;
      case WADO_IMAGE_LOADER_TAGS.OVERLAY_PLANE_MODULE:
        const overlays = [];

        for (let overlayGroup = 0x00; overlayGroup <= 0x1e; overlayGroup += 0x02) {
          let groupStr = `60${overlayGroup.toString(16)}`;

          if (groupStr.length === 3) {
            groupStr = `600${overlayGroup.toString(16)}`;
          }

          const OverlayDataTag = `${groupStr}3000`;
          const OverlayData = instance[OverlayDataTag];

          if (!OverlayData) {
            continue;
          }

          const OverlayRowsTag = `${groupStr}0010`;
          const OverlayColumnsTag = `${groupStr}0011`;
          const OverlayType = `${groupStr}0040`;
          const OverlayOriginTag = `${groupStr}0050`;
          const OverlayDescriptionTag = `${groupStr}0022`;
          const OverlayLabelTag = `${groupStr}1500`;
          const ROIAreaTag = `${groupStr}1301`;
          const ROIMeanTag = `${groupStr}1302`;
          const ROIStandardDeviationTag = `${groupStr}1303`;
          const OverlayOrigin = instance[OverlayOriginTag];

          let rows = 0;
          if (instance[OverlayRowsTag] instanceof Array) {
            // The DICOM VR for overlay rows is US (unsigned short).
            const rowsInt16Array = new Uint16Array(instance[OverlayRowsTag][0]);
            rows = rowsInt16Array[0];
          } else {
            rows = instance[OverlayRowsTag];
          }

          let columns = 0;
          if (instance[OverlayColumnsTag] instanceof Array) {
            // The DICOM VR for overlay columns is US (unsigned short).
            const columnsInt16Array = new Uint16Array(instance[OverlayColumnsTag][0]);
            columns = columnsInt16Array[0];
          } else {
            columns = instance[OverlayColumnsTag];
          }

          let x = 0;
          let y = 0;
          if (OverlayOrigin.length === 1) {
            // The DICOM VR for overlay origin is SS (signed short) with a multiplicity of 2.
            const originInt16Array = new Int16Array(OverlayOrigin[0]);
            x = originInt16Array[0];
            y = originInt16Array[1];
          } else {
            x = OverlayOrigin[0];
            y = OverlayOrigin[1];
          }

          const overlay = {
            rows: rows,
            columns: columns,
            type: instance[OverlayType],
            x,
            y,
            pixelData: OverlayData,
            description: instance[OverlayDescriptionTag],
            label: instance[OverlayLabelTag],
            roiArea: instance[ROIAreaTag],
            roiMean: instance[ROIMeanTag],
            roiStandardDeviation: instance[ROIStandardDeviationTag],
          };

          overlays.push(overlay);
        }

        metadata = {
          overlays,
        };

        break;

      case WADO_IMAGE_LOADER_TAGS.PATIENT_MODULE:
        const { PatientName } = instance;

        let patientName;
        if (PatientName) {
          patientName = formatPN(PatientName);
        }

        metadata = {
          patientName,
          patientId: instance.PatientID,
        };

        break;

      case WADO_IMAGE_LOADER_TAGS.GENERAL_IMAGE_MODULE:
        metadata = {
          sopInstanceUID: instance.SOPInstanceUID,
          instanceNumber: toNumber(instance.InstanceNumber),
          lossyImageCompression: instance.LossyImageCompression,
          lossyImageCompressionRatio: instance.LossyImageCompressionRatio,
          lossyImageCompressionMethod: instance.LossyImageCompressionMethod,
        };

        break;
      case WADO_IMAGE_LOADER_TAGS.GENERAL_STUDY_MODULE:
        metadata = {
          studyDescription: instance.StudyDescription,
          studyDate: instance.StudyDate,
          studyTime: instance.StudyTime,
          accessionNumber: instance.AccessionNumber,
        };

        break;
      case WADO_IMAGE_LOADER_TAGS.CINE_MODULE:
        metadata = {
          frameTime: instance.FrameTime,
          numberOfFrames: instance.NumberOfFrames ? Number(instance.NumberOfFrames) : 1,
        };

        break;
      case WADO_IMAGE_LOADER_TAGS.PET_SERIES_MODULE:
        metadata = {
          correctedImage: instance.CorrectedImage,
          units: instance.Units,
          decayCorrection: instance.DecayCorrection,
        };
        break;
      case WADO_IMAGE_LOADER_TAGS.CALIBRATION_MODULE:
        // map the DICOM tags to the cornerstone tags since cornerstone tags
        // are camelCase and instance tags are all caps
        metadata = {
          sequenceOfUltrasoundRegions: instance.SequenceOfUltrasoundRegions?.map(region => {
            return {
              regionSpatialFormat: region.RegionSpatialFormat,
              regionDataType: region.RegionDataType,
              regionFlags: region.RegionFlags,
              regionLocationMinX0: region.RegionLocationMinX0,
              regionLocationMinY0: region.RegionLocationMinY0,
              regionLocationMaxX1: region.RegionLocationMaxX1,
              regionLocationMaxY1: region.RegionLocationMaxY1,
              referencePixelX0: region.ReferencePixelX0,
              referencePixelY0: region.ReferencePixelY0,
              referencePixelPhysicalValueX: region.ReferencePixelPhysicalValueX,
              referencePixelPhysicalValueY: region.ReferencePixelPhysicalValueY,
              physicalUnitsXDirection: region.PhysicalUnitsXDirection,
              physicalUnitsYDirection: region.PhysicalUnitsYDirection,
              physicalDeltaX: region.PhysicalDeltaX,
              physicalDeltaY: region.PhysicalDeltaY,
            };
          }),
        };
        break;

      /**
       * Below are the tags and not the modules since they are not really
       * consistent with the modules above
       */
      case 'temporalPositionIdentifier':
        metadata = {
          temporalPositionIdentifier: instance.TemporalPositionIdentifier,
        };
        break;

      default:
        return;
    }

    return metadata;
  }

  /**
   * Retrieves the frameNumber information, depending on the url style
   * wadors /frames/1
   * wadouri &frame=1
   * @param {*} imageId
   * @returns
   */
  getFrameInformationFromURL(imageId) {
    function getInformationFromURL(informationString, separator) {
      let result = '';
      const splittedStr = imageId.split(informationString)[1];
      if (splittedStr.includes(separator)) {
        result = splittedStr.split(separator)[0];
      } else {
        result = splittedStr;
      }
      return result;
    }

    if (imageId.includes('/frames')) {
      return getInformationFromURL('/frames', '/');
    }
    if (imageId.includes('&frame=')) {
      return getInformationFromURL('&frame=', '&');
    }
    return;
  }

  getUIDsFromImageID(imageId) {
    if (imageId.startsWith('wadors:')) {
      const strippedImageId = imageId.split('/studies/')[1];
      const splitImageId = strippedImageId.split('/');

      return {
        StudyInstanceUID: splitImageId[0], // Note: splitImageId[1] === 'series'
        SeriesInstanceUID: splitImageId[2], // Note: splitImageId[3] === 'instances'
        SOPInstanceUID: splitImageId[4],
        frameNumber: splitImageId[6],
      };
    } else if (imageId.includes('?requestType=WADO')) {
      const qs = queryString.parse(imageId);

      return {
        StudyInstanceUID: qs.studyUID,
        SeriesInstanceUID: qs.seriesUID,
        SOPInstanceUID: qs.objectUID,
        frameNumber: qs.frameNumber,
      };
    }

    // Maybe its a non-standard imageId
    // check if the imageId starts with http:// or https:// using regex
    // Todo: handle non http imageIds
    let imageURI;
    const urlRegex = /^(http|https|dicomfile):\/\//;
    if (urlRegex.test(imageId)) {
      imageURI = imageId;
    } else {
      imageURI = imageIdToURI(imageId);
    }

    // remove &frame=number from imageId
    imageURI = imageURI.split('&frame=')[0];

    const uids = this.imageURIToUIDs.get(imageURI);
    const frameNumber = this.getFrameInformationFromURL(imageId) || '1';

    if (uids && frameNumber !== undefined) {
      return { ...uids, frameNumber };
    }
    return uids;
  }
}

const metadataProvider = new MetadataProvider();

export default metadataProvider;

const WADO_IMAGE_LOADER = {
  imagePlaneModule: instance => {
    const { ImageOrientationPatient, ImagePositionPatient } = instance;

    // Fallback for DX images.
    // TODO: We should use the rest of the results of this function
    // to update the UI somehow
    const { PixelSpacing } = getPixelSpacingInformation(instance);

    let rowPixelSpacing;
    let columnPixelSpacing;

    let rowCosines;
    let columnCosines;

    let usingDefaultValues = false;
    let isDefaultValueSetForRowCosine = false;
    let isDefaultValueSetForColumnCosine = false;
    let imageOrientationPatient;
    if (PixelSpacing) {
      [rowPixelSpacing, columnPixelSpacing] = PixelSpacing;
    } else {
      rowPixelSpacing = columnPixelSpacing = 1;
      usingDefaultValues = true;
    }

    if (ImageOrientationPatient) {
      rowCosines = ImageOrientationPatient.slice(0, 3);
      columnCosines = ImageOrientationPatient.slice(3, 6);
      imageOrientationPatient = ImageOrientationPatient;
    } else {
      rowCosines = [1, 0, 0];
      columnCosines = [0, 1, 0];
      imageOrientationPatient = [1, 0, 0, 0, 1, 0];
      usingDefaultValues = true;
      isDefaultValueSetForRowCosine = true;
      isDefaultValueSetForColumnCosine = true;
    }

    const imagePositionPatient = ImagePositionPatient || [0, 0, 0];
    if (!ImagePositionPatient) {
      usingDefaultValues = true;
    }

    return {
      frameOfReferenceUID: instance.FrameOfReferenceUID,
      rows: toNumber(instance.Rows),
      columns: toNumber(instance.Columns),
      spacingBetweenSlices: toNumber(instance.SpacingBetweenSlices),
      imageOrientationPatient,
      rowCosines,
      isDefaultValueSetForRowCosine,
      columnCosines,
      isDefaultValueSetForColumnCosine,
      imagePositionPatient,
      sliceThickness: toNumber(instance.SliceThickness),
      sliceLocation: toNumber(instance.SliceLocation),
      pixelSpacing: toNumber(PixelSpacing || 1),
      rowPixelSpacing,
      columnPixelSpacing,
      usingDefaultValues,
    };
  },
};

const WADO_IMAGE_LOADER_TAGS = {
  // dicomImageLoader specific
  GENERAL_SERIES_MODULE: 'generalSeriesModule',
  PATIENT_STUDY_MODULE: 'patientStudyModule',
  IMAGE_PIXEL_MODULE: 'imagePixelModule',
  VOI_LUT_MODULE: 'voiLutModule',
  MODALITY_LUT_MODULE: 'modalityLutModule',
  SOP_COMMON_MODULE: 'sopCommonModule',
  PET_IMAGE_MODULE: 'petImageModule',
  PET_ISOTOPE_MODULE: 'petIsotopeModule',
  PET_SERIES_MODULE: 'petSeriesModule',
  OVERLAY_PLANE_MODULE: 'overlayPlaneModule',
  PATIENT_DEMOGRAPHIC_MODULE: 'patientDemographicModule',

  // react-cornerstone-viewport specific
  PATIENT_MODULE: 'patientModule',
  GENERAL_IMAGE_MODULE: 'generalImageModule',
  GENERAL_STUDY_MODULE: 'generalStudyModule',
  CINE_MODULE: 'cineModule',
  CALIBRATION_MODULE: 'calibrationModule',
};

const INSTANCE = 'instance';
