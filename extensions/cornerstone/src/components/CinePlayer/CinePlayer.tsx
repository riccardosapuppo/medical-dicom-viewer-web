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

        // A 2D series with more than one "dimension group" (in and out of phase,
        // multi-b DWI): it is NOT loaded as a volume, but dynamicVolumeInfo.timePoints
        // holds the imageIds ALREADY grouped by diffusion or echo (80 instances become
        // groups 1-40 and 41-80). A bar is shown for moving between groups while
        // staying on a 2D stack viewport, with no reconstruction: the bar changes group
        // and keeps the slice, and the wheel scrolls the slices of the active group.
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

// The voiRange (lower and upper) of an image's DEFAULT window level, read from the
// DICOM metadata (WindowCenter and WindowWidth). It is the same base the toolbar's
// reset returns to (viewport.resetProperties), so comparing the current VOI against it
// gives the reader's own adjustment as a plain delta.
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
 * The "diffusion" bar, for 2D series with dimension groups (in and out of phase,
 * multi-b DWI, and so on). It behaves exactly like the 4D slider but WITHOUT a volume:
 * the viewport stays a 2D stack and the bar swaps which group of imageIds is active
 * (slices 1-40 against 41-80, say) while keeping the current slice. The wheel scrolls
 * only the slices of the selected group.
 *
 * Window level: each group keeps its own intrinsic difference, the default from the
 * metadata, but any manual adjustment is carried to the other groups as a shared DELTA
 * from their own default. A reset from the toolbar returns every group to its default,
 * because the delta is recomputed from the live VOI on every change and comes out zero.
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
    // Stack viewports only: setStack exists nowhere else.
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

      // Capture the manual window level adjustment as a DELTA from the default of the
      // image CURRENTLY on screen, which holds even when the stack has not yet been
      // narrowed to the group. After a toolbar reset the VOI is already the default,
      // so the delta is zero and every group goes back to its default.
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
        // setStack at an unchanged index does NOT emit STACK_VIEWPORT_SCROLL: without
        // this, the "x/N" overlay would sit at the old count (80, say) until somebody
        // scrolled. Emitting it here refreshes the count at once.
        // But STACK_VIEWPORT_SCROLL also turns the "loading" dot on, so STACK_NEW_IMAGE
        // is emitted right after to turn it off. The images are already cached by the
        // prefetch, so nothing flashes on every change of group.
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
        // The new group's default plus the shared manual delta: the group's intrinsic
        // window level difference stays, AND so does the reader's own adjustment.
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

  // On a change of series: start at group 0, clear the delta, and narrow the stack to
  // the group. If OHIF restores the whole stack (a viewport reload), apply the active
  // group again, keeping the current window level delta.
  useEffect(() => {
    manualDeltaRef.current = { lower: 0, upper: 0 };
    setGroupIndex(0);
    groupIndexRef.current = 0;
    // captureDelta:true, so a window level applied by the hanging protocol survives and
    // is carried to the other groups as the shared delta.
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

  // Prefetches the imageIds of EVERY group in the background, INTERLEAVED by slice: as
  // soon as slice k of the active group is ready, so are the matching slice k of the
  // others. Changing group with the slider therefore gives neither a black screen nor
  // the loading dot, because the images are already cached.
  // Cornerstone's pool manager throttles the requests, and anything already loaded is skipped.
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
      // applyGroup captures the window level delta from the current VOI and image
      // BEFORE the stack changes, so it has to be called before the index and render update.
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
