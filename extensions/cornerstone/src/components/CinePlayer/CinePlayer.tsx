import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useCine, InputRange } from '@ohif/ui';
import {
  Enums,
  eventTarget,
  cache,
  getEnabledElement,
  metaData,
  triggerEvent,
  imageLoadPoolManager,
  imageLoader,
} from '@cornerstonejs/core';
import { useAppConfig } from '@state';

function WrappedCinePlayer({
  enabledVPElement,
  viewportId,
  servicesManager,
}: withAppTypes<{
  enabledVPElement: HTMLElement;
  viewportId: string;
}>) {
  const { customizationService, displaySetService, viewportGridService } = servicesManager.services;
  const [{ isCineEnabled, cines }, cineService] = useCine();
  const [newStackFrameRate, setNewStackFrameRate] = useState(24);
  const [dynamicInfo, setDynamicInfo] = useState(null);
  const [stack2DInfo, setStack2DInfo] = useState(null);
  const [appConfig] = useAppConfig();
  const isMountedRef = useRef(null);

  // The MIP viewport in the PT/CT fusion hanging protocol is a static
  // sagittal MIP, not a stack/time series. Cine doesn't apply there, so
  // skip mounting any cine controls or playback for it.
  const isMipViewport = viewportId === 'mipSagittal';

  const cineHandler = () => {
    if (!cines?.[viewportId] || !enabledVPElement) {
      return;
    }

    const { isPlaying = false, frameRate = 24 } = cines[viewportId];
    const validFrameRate = Math.max(frameRate, 1);

    return isPlaying
      ? cineService.playClip(enabledVPElement, { framesPerSecond: validFrameRate, viewportId })
      : cineService.stopClip(enabledVPElement);
  };

  const newDisplaySetHandler = useCallback(() => {
    if (!enabledVPElement) {
      return;
    }

    const { viewports } = viewportGridService.getState();
    const { displaySetInstanceUIDs } = viewports.get(viewportId);
    let frameRate = 24;
    let isPlaying = cines[viewportId]?.isPlaying || false;
    displaySetInstanceUIDs.forEach(displaySetInstanceUID => {
      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

      if (displaySet.FrameRate) {
        // displaySet.FrameRate corresponds to DICOM tag (0018,1063) which is defined as the the frame time in milliseconds
        // So a bit of math to get the actual frame rate.
        frameRate = Math.round(1000 / displaySet.FrameRate);
        isPlaying ||= !!appConfig.autoPlayCine;
      }

      // check if the displaySet is dynamic and set the dynamic info
      if (displaySet.isDynamicVolume) {
        const { dynamicVolumeInfo } = displaySet;
        const numDimensionGroups = dynamicVolumeInfo.timePoints.length;
        const label = dynamicVolumeInfo.splittingTag;
        const dimensionGroupNumber = dynamicVolumeInfo.dimensionGroupNumber || 1;
        setDynamicInfo({
          volumeId: displaySet.displaySetInstanceUID,
          dimensionGroupNumber,
          numDimensionGroups,
          label,
        });
        setStack2DInfo(null);
      } else {
        setDynamicInfo(null);

        // Serie 2D con più "gruppi di dimensione" (es. in/out phase, DWI multi-b):
        // NON è caricata come volume, ma dynamicVolumeInfo.timePoints contiene gli
        // imageId GIÀ raggruppati per diffusione/echo (es. 80 istanze = gruppo
        // 1-40 e 41-80). Mostriamo una barra per spostarci tra i gruppi restando
        // su una viewport stack 2D (nessuna ricostruzione): la barra cambia gruppo
        // mantenendo la stessa fetta, e la rotella scorre le fette del gruppo attivo.
        const groups = displaySet.dynamicVolumeInfo?.timePoints;
        if (Array.isArray(groups) && groups.length > 1) {
          setStack2DInfo({
            displaySetInstanceUID: displaySet.displaySetInstanceUID,
            groups,
            numGroups: groups.length,
            label: displaySet.dynamicVolumeInfo.splittingTag,
          });
        } else {
          setStack2DInfo(null);
        }
      }
    });

    if (isPlaying) {
      cineService.setIsCineEnabled(isPlaying);
    }
    cineService.setCine({ id: viewportId, isPlaying, frameRate });
    setNewStackFrameRate(frameRate);
  }, [displaySetService, viewportId, viewportGridService, cines, enabledVPElement]);

  useEffect(() => {
    isMountedRef.current = true;

    newDisplaySetHandler();

    return () => {
      isMountedRef.current = false;
    };
  }, [isCineEnabled, newDisplaySetHandler]);

  useEffect(() => {
    if (!isCineEnabled) {
      return;
    }

    cineHandler();
  }, [isCineEnabled, cineHandler, enabledVPElement]);

  /**
   * Use effect for handling new display set
   */
  useEffect(() => {
    if (!enabledVPElement) {
      return;
    }

    enabledVPElement.addEventListener(Enums.Events.VIEWPORT_NEW_IMAGE_SET, newDisplaySetHandler);
    // this doesn't makes sense that we are listening to this event on viewport element
    enabledVPElement.addEventListener(
      Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
      newDisplaySetHandler
    );

    return () => {
      cineService.setCine({ id: viewportId, isPlaying: false });

      enabledVPElement.removeEventListener(
        Enums.Events.VIEWPORT_NEW_IMAGE_SET,
        newDisplaySetHandler
      );
      enabledVPElement.removeEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        newDisplaySetHandler
      );
    };
  }, [enabledVPElement, newDisplaySetHandler, viewportId]);

  useEffect(() => {
    if (!cines || !cines[viewportId] || !enabledVPElement || !isMountedRef.current) {
      return;
    }

    cineHandler();

    return () => {
      cineService.stopClip(enabledVPElement, { viewportId });
    };
  }, [cines, viewportId, cineService, enabledVPElement, cineHandler]);

  if (isMipViewport) {
    return null;
  }

  if (!isCineEnabled) {
    if (dynamicInfo) {
      return <RenderDynamicVolumeSlider dynamicInfo={dynamicInfo} />;
    }
    if (stack2DInfo) {
      return <Render2DDimensionSlider info={stack2DInfo} enabledVPElement={enabledVPElement} />;
    }
    return null;
  }

  const cine = cines[viewportId];
  const isPlaying = cine?.isPlaying || false;

  return (
    <RenderCinePlayer
      viewportId={viewportId}
      cineService={cineService}
      newStackFrameRate={newStackFrameRate}
      isPlaying={isPlaying}
      dynamicInfo={dynamicInfo}
      customizationService={customizationService}
    />
  );
}

function RenderDynamicVolumeSlider({ dynamicInfo: dynamicInfoProp }) {
  const [dynamicInfo, setDynamicInfo] = useState(dynamicInfoProp);

  useEffect(() => {
    setDynamicInfo(dynamicInfoProp);
  }, [dynamicInfoProp]);

  useEffect(() => {
    if (!dynamicInfo) {
      return;
    }

    const handleDimensionGroupChange = evt => {
      const { volumeId, dimensionGroupNumber, numDimensionGroups, splittingTag } = evt.detail;
      setDynamicInfo({
        volumeId,
        dimensionGroupNumber,
        numDimensionGroups,
        label: splittingTag,
      });
    };

    eventTarget.addEventListener(
      Enums.Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
      handleDimensionGroupChange
    );

    return () => {
      eventTarget.removeEventListener(
        Enums.Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
        handleDimensionGroupChange
      );
    };
  }, [dynamicInfo]);

  useEffect(() => {
    if (!dynamicInfo) {
      return;
    }

    const { volumeId, dimensionGroupNumber } = dynamicInfo || {};
    const volume = cache.getVolume(volumeId, true);
    if (volume) {
      volume.dimensionGroupNumber = dimensionGroupNumber;
    }
  }, []);

  const updateDynamicInfo = useCallback(props => {
    const { volumeId, dimensionGroupNumber } = props;
    const volume = cache.getVolume(volumeId, true);
    if (volume) {
      volume.dimensionGroupNumber = dimensionGroupNumber;
    }
    setDynamicInfo(prev =>
      prev ? { ...prev, dimensionGroupNumber } : prev
    );
  }, []);

  if (!dynamicInfo) {
    return null;
  }

  return (
    <div className="absolute left-1/2 bottom-3 w-56 -translate-x-1/2">
      <InputRange
        value={dynamicInfo.dimensionGroupNumber}
        onChange={dimensionGroupNumber =>
          updateDynamicInfo({ ...dynamicInfo, dimensionGroupNumber })
        }
        minValue={1}
        maxValue={dynamicInfo.numDimensionGroups}
        step={1}
        containerClassName="w-full"
        labelClassName="text-xs text-white"
        leftColor="#3a3f99"
        rightColor="#3a3f99"
        trackHeight="4px"
        thumbColor="#38bdf8"
        thumbColorOuter="#000000"
        showLabel={false}
      />
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-white">
        <span>{`${dynamicInfo.dimensionGroupNumber}/${dynamicInfo.numDimensionGroups}`}</span>
        {dynamicInfo.label ? (
          <span className="text-aqua-pale">{dynamicInfo.label}</span>
        ) : null}
      </div>
    </div>
  );
}

// voiRange (lower/upper) del W/L di DEFAULT di un'immagine, letto dai metadati
// DICOM (WindowCenter/WindowWidth). È la stessa base a cui torna il reset della
// toolbar (viewport.resetProperties), quindi confrontare il VOI corrente con
// questo default permette di ricavare la regolazione manuale come semplice delta.
function getMetaVoiRange(imageId) {
  const voiLut = metaData.get('voiLutModule', imageId);
  let ww = voiLut?.windowWidth;
  let wc = voiLut?.windowCenter;
  ww = Array.isArray(ww) ? ww[0] : ww;
  wc = Array.isArray(wc) ? wc[0] : wc;
  if (Number.isFinite(ww) && Number.isFinite(wc) && ww > 0) {
    return { lower: wc - ww / 2, upper: wc + ww / 2 };
  }
  return null;
}

/**
 * Barra "diffusione" per serie 2D con gruppi di dimensione (in/out phase,
 * DWI multi-b, ...). Comportamento identico allo slider 4D ma SENZA volume:
 * la viewport resta uno stack 2D e la barra scambia il gruppo di imageId
 * attivo (es. fette 1-40 ↔ 41-80) mantenendo la fetta corrente. La rotella
 * scorre solo le fette del gruppo selezionato.
 *
 * W/L: ogni gruppo mantiene la sua differenza intrinseca (default dai metadati),
 * ma l'eventuale regolazione manuale viene portata sugli altri gruppi come DELTA
 * condiviso rispetto al loro default. Il reset dalla toolbar riporta tutti i
 * gruppi al default (il delta si ricalcola dal VOI live ad ogni cambio → 0).
 */
function Render2DDimensionSlider({ info, enabledVPElement }) {
  const [groupIndex, setGroupIndex] = useState(0);
  const groupIndexRef = useRef(0);
  groupIndexRef.current = groupIndex;
  // Offset W/L manuale condiviso tra i gruppi, in voiRange (lower/upper).
  const manualDeltaRef = useRef({ lower: 0, upper: 0 });

  const getViewport = useCallback(() => {
    if (!enabledVPElement) {
      return null;
    }
    const viewport = getEnabledElement(enabledVPElement)?.viewport;
    // Solo su viewport stack (setStack esiste solo lì).
    return viewport && typeof viewport.setStack === 'function' ? viewport : null;
  }, [enabledVPElement]);

  const applyGroup = useCallback(
    (newIdx, { keepSlice = true, captureDelta = false } = {}) => {
      const viewport = getViewport();
      if (!viewport) {
        return;
      }
      const newGroup = info.groups[newIdx];
      if (!newGroup?.length) {
        return;
      }

      const currentSlice =
        typeof viewport.getCurrentImageIdIndex === 'function'
          ? viewport.getCurrentImageIdIndex() || 0
          : 0;
      const sliceIndex = keepSlice ? Math.min(currentSlice, newGroup.length - 1) : 0;

      // Cattura la regolazione W/L manuale come DELTA rispetto al default
      // dell'immagine ATTUALMENTE mostrata (robusto anche se lo stack non è
      // ancora ridotto al gruppo). Dopo un reset toolbar il VOI è già il default
      // → delta 0 → tutti i gruppi tornano al default.
      if (captureDelta) {
        const currentVoi = viewport.getProperties?.()?.voiRange;
        const currentImageId = viewport.getCurrentImageId?.();
        const prevDefault = currentImageId ? getMetaVoiRange(currentImageId) : null;
        if (currentVoi && prevDefault) {
          manualDeltaRef.current = {
            lower: currentVoi.lower - prevDefault.lower,
            upper: currentVoi.upper - prevDefault.upper,
          };
        }
      }

      const finalize = () => {
        // setStack a indice invariato NON emette STACK_VIEWPORT_SCROLL: senza
        // questo l'overlay "x/N" resterebbe fermo al conteggio vecchio (es. 80)
        // finché non si scrolla. Lo emetto io per rinfrescare subito il conteggio.
        // STACK_VIEWPORT_SCROLL però accende anche il pallino "loading"; emetto
        // subito dopo STACK_NEW_IMAGE (le immagini sono già in cache via prefetch)
        // per spegnerlo, così non lampeggia ad ogni cambio gruppo.
        try {
          triggerEvent(viewport.element, Enums.Events.STACK_VIEWPORT_SCROLL, {
            imageIndex: sliceIndex,
            newImageIdIndex: sliceIndex,
          });
          triggerEvent(viewport.element, Enums.Events.STACK_NEW_IMAGE, {
            imageId: newGroup[sliceIndex],
            imageIdIndex: sliceIndex,
            viewportId: viewport.id,
            renderingEngineId: viewport.renderingEngineId,
          });
        } catch (e) {
          /* no-op */
        }
        // Default del nuovo gruppo + delta manuale condiviso: resta la differenza
        // W/L intrinseca del gruppo E la regolazione manuale fatta dall'utente.
        const newDefault = getMetaVoiRange(newGroup[sliceIndex]);
        const delta = manualDeltaRef.current;
        if (newDefault) {
          viewport.setProperties?.({
            voiRange: {
              lower: newDefault.lower + delta.lower,
              upper: newDefault.upper + delta.upper,
            },
          });
        }
        viewport.render();
      };

      const result = viewport.setStack(newGroup, sliceIndex);
      if (result?.then) {
        result.then(finalize);
      } else {
        finalize();
      }
    },
    [getViewport, info.groups]
  );

  // Al cambio serie: parti dal gruppo 0, azzera il delta e riduci lo stack al
  // gruppo. Se OHIF ripristina lo stack completo (reload viewport), ri-applica
  // il gruppo attivo mantenendo il delta W/L corrente.
  useEffect(() => {
    manualDeltaRef.current = { lower: 0, upper: 0 };
    setGroupIndex(0);
    groupIndexRef.current = 0;
    // captureDelta:true così un eventuale W/L applicato dall'HP viene preservato
    // e portato anche sugli altri gruppi come delta condiviso.
    applyGroup(0, { keepSlice: false, captureDelta: true });

    const onNewImageSet = () => {
      const viewport = getViewport();
      if (!viewport) {
        return;
      }
      const currentLen = viewport.getImageIds?.().length ?? 0;
      const groupLen = info.groups[groupIndexRef.current]?.length ?? 0;
      if (currentLen && groupLen && currentLen !== groupLen) {
        applyGroup(groupIndexRef.current, { keepSlice: false, captureDelta: false });
      }
    };

    enabledVPElement?.addEventListener(Enums.Events.VIEWPORT_NEW_IMAGE_SET, onNewImageSet);
    return () => {
      enabledVPElement?.removeEventListener(Enums.Events.VIEWPORT_NEW_IMAGE_SET, onNewImageSet);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.displaySetInstanceUID, enabledVPElement]);

  // Precarica in background gli imageId di TUTTI i gruppi, INTERLACCIATI per
  // fetta: appena è pronta la fetta k del gruppo attivo lo sono anche le fette k
  // corrispondenti degli altri gruppi. Così cambiando gruppo con lo slider non
  // c'è schermo nero né il pallino di caricamento (le immagini sono già in cache).
  // Il pool manager di Cornerstone throttla le richieste; salto quelle già caricate.
  useEffect(() => {
    const groups = info.groups || [];
    const maxLen = groups.reduce((m, g) => Math.max(m, g?.length || 0), 0);
    for (let s = 0; s < maxLen; s++) {
      for (let g = 0; g < groups.length; g++) {
        const imageId = groups[g]?.[s];
        if (!imageId || cache.isLoaded?.(imageId)) {
          continue;
        }
        imageLoadPoolManager.addRequest(
          () =>
            imageLoader.loadAndCacheImage(imageId, {
              requestType: Enums.RequestType.Prefetch,
              priority: 5,
              preScale: { enabled: true },
            }),
          Enums.RequestType.Prefetch,
          { imageId },
          5
        );
      }
    }
  }, [info.displaySetInstanceUID]);

  const onChange = useCallback(
    value => {
      const idx = Math.min(Math.max(value - 1, 0), info.numGroups - 1);
      if (idx === groupIndexRef.current) {
        return;
      }
      // applyGroup cattura il delta W/L dal VOI/immagine correnti PRIMA di
      // cambiare stack, quindi va chiamato prima di aggiornare l'indice/render.
      applyGroup(idx, { keepSlice: true, captureDelta: true });
      setGroupIndex(idx);
    },
    [applyGroup, info.numGroups]
  );

  return (
    <div className="absolute left-1/2 bottom-3 w-56 -translate-x-1/2">
      <InputRange
        value={groupIndex + 1}
        onChange={onChange}
        minValue={1}
        maxValue={info.numGroups}
        step={1}
        containerClassName="w-full"
        labelClassName="text-xs text-white"
        leftColor="#3a3f99"
        rightColor="#3a3f99"
        trackHeight="4px"
        thumbColor="#38bdf8"
        thumbColorOuter="#000000"
        showLabel={false}
      />
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-white">
        <span>{`${groupIndex + 1}/${info.numGroups}`}</span>
        {info.label ? <span className="text-aqua-pale">{info.label}</span> : null}
      </div>
    </div>
  );
}

function RenderCinePlayer({
  viewportId,
  cineService,
  newStackFrameRate,
  isPlaying,
  dynamicInfo: dynamicInfoProp,
  customizationService,
}) {
  const CinePlayerComponent = customizationService.getCustomization('cinePlayer');

  const [dynamicInfo, setDynamicInfo] = useState(dynamicInfoProp);

  useEffect(() => {
    setDynamicInfo(dynamicInfoProp);
  }, [dynamicInfoProp]);

  /**
   * Use effect for handling 4D time index changed
   */
  useEffect(() => {
    if (!dynamicInfo) {
      return;
    }

    const handleDimensionGroupChange = evt => {
      const { volumeId, dimensionGroupNumber, numDimensionGroups, splittingTag } = evt.detail;
      setDynamicInfo({ volumeId, dimensionGroupNumber, numDimensionGroups, label: splittingTag });
    };

    eventTarget.addEventListener(
      Enums.Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
      handleDimensionGroupChange
    );

    return () => {
      eventTarget.removeEventListener(
        Enums.Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED,
        handleDimensionGroupChange
      );
    };
  }, [dynamicInfo]);

  useEffect(() => {
    if (!dynamicInfo) {
      return;
    }

    const { volumeId, dimensionGroupNumber, numDimensionGroups, splittingTag } = dynamicInfo || {};
    const volume = cache.getVolume(volumeId, true);
    volume.dimensionGroupNumber = dimensionGroupNumber;

    setDynamicInfo({ volumeId, dimensionGroupNumber, numDimensionGroups, label: splittingTag });
  }, []);

  const updateDynamicInfo = useCallback(props => {
    const { volumeId, dimensionGroupNumber } = props;
    const volume = cache.getVolume(volumeId, true);
    volume.dimensionGroupNumber = dimensionGroupNumber;
  }, []);

  return (
    <CinePlayerComponent
      className="absolute left-1/2 bottom-3 -translate-x-1/2"
      frameRate={newStackFrameRate}
      isPlaying={isPlaying}
      onClose={() => {
        // also stop the clip
        cineService.setCine({
          id: viewportId,
          isPlaying: false,
        });
        cineService.setIsCineEnabled(false);
        cineService.setViewportCineClosed(viewportId);
      }}
      onPlayPauseChange={isPlaying => {
        cineService.setCine({
          id: viewportId,
          isPlaying,
        });
      }}
      onFrameRateChange={frameRate =>
        cineService.setCine({
          id: viewportId,
          frameRate,
        })
      }
      dynamicInfo={dynamicInfo}
      updateDynamicInfo={updateDynamicInfo}
    />
  );
}

export default WrappedCinePlayer;
