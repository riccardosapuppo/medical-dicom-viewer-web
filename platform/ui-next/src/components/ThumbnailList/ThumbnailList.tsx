import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

import { Thumbnail } from '../Thumbnail';

const ThumbnailList = ({
  thumbnails,
  onThumbnailClick,
  onThumbnailDoubleClick,
  onClickUntrack,
  activeDisplaySetInstanceUIDs = [],
  viewPreset,
  ThumbnailMenuItems,
  isBottomDocked = false,
}) => {
  const isBottomDockedByBodyClass =
    typeof document !== 'undefined' &&
    document.body?.classList?.contains('mdv-study-panel-bottom');
  const isBottomDockedByStorage =
    typeof window !== 'undefined' &&
    window.localStorage?.getItem('mdvStudyPanelPosition') === 'bottom';
  const isBottomDockedEffective =
    isBottomDocked || isBottomDockedByBodyClass || isBottomDockedByStorage;

  // Filter thumbnails into list items and thumbnail items
  const listItems = thumbnails?.filter(
    ({ componentType }) => componentType === 'thumbnailNoImage' || viewPreset === 'list'
  );

  const thumbnailItems = thumbnails?.filter(
    ({ componentType }) => componentType !== 'thumbnailNoImage' && viewPreset === 'thumbnails'
  );

  const bottomStripRef = useRef<HTMLDivElement>(null);

  const shouldUseSingleBottomRow = isBottomDockedEffective;
  const bottomRowItems = shouldUseSingleBottomRow
    ? [...(thumbnailItems || []), ...(listItems || [])]
    : [];
  const listContainerClass = isBottomDockedEffective
    ? 'flex flex-col gap-0 p-0 h-full min-h-0'
    : 'flex flex-col gap-[4px] pt-[4px] pr-[2.5px] pl-[5px] pb-[4px]';

  useEffect(() => {
    const el = bottomStripRef.current;
    if (!el || !isBottomDockedEffective) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isBottomDockedEffective, bottomRowItems.length]);

  // Auto-scroll alla serie attiva (bottom: orizzontale, sinistra: verticale)
  useEffect(() => {
    if (!activeDisplaySetInstanceUIDs?.length) return;
    const activeId = activeDisplaySetInstanceUIDs[0];
    const timer = setTimeout(() => {
      const activeThumbnail = document.getElementById(`thumbnail-${activeId}`);
      if (!activeThumbnail) return;

      if (isBottomDockedEffective) {
        // Bottom mode: scroll orizzontale nel thumbnail strip
        const strip = bottomStripRef.current;
        if (!strip) return;
        const stripRect = strip.getBoundingClientRect();
        const thumbRect = activeThumbnail.getBoundingClientRect();
        if (thumbRect.left < stripRect.left || thumbRect.right > stripRect.right) {
          strip.scrollTo({
            left: activeThumbnail.offsetLeft - strip.clientWidth / 2 + activeThumbnail.offsetWidth / 2,
            behavior: 'smooth',
          });
        }
      } else {
        // Pannello sinistro: scroll verticale nel container .ohif-scrollbar
        const scrollContainer = activeThumbnail.closest('[data-cy="studyBrowser-panel"]')?.querySelector('.ohif-scrollbar') as HTMLElement;
        if (!scrollContainer) return;
        const containerRect = scrollContainer.getBoundingClientRect();
        const thumbRect = activeThumbnail.getBoundingClientRect();
        if (thumbRect.top < containerRect.top || thumbRect.bottom > containerRect.bottom) {
          const thumbOffsetTop = activeThumbnail.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
          scrollContainer.scrollTo({
            top: thumbOffsetTop - scrollContainer.clientHeight / 2 + activeThumbnail.offsetHeight / 2,
            behavior: 'smooth',
          });
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeDisplaySetInstanceUIDs, isBottomDockedEffective]);

  return (
    <div className={listContainerClass}>
      {/* Bottom mode: single horizontal strip for all series */}
      {shouldUseSingleBottomRow && bottomRowItems.length > 0 && (
        <div
          ref={bottomStripRef}
          id="ohif-thumbnail-list"
          className="mdv-bottom-thumbnail-strip ohif-scrollbar bg-bkg-low flex h-full min-h-0 flex-row items-stretch gap-[4px] overflow-x-scroll overflow-y-hidden px-[4px] py-[2px]"
        >
          {bottomRowItems.map(item => {
            const { displaySetInstanceUID, componentType, numInstances, ...rest } = item;
            const isActive = activeDisplaySetInstanceUIDs.includes(displaySetInstanceUID);
            return (
              <Thumbnail
                key={displaySetInstanceUID}
                {...rest}
                displaySetInstanceUID={displaySetInstanceUID}
                numInstances={numInstances || 1}
                isActive={isActive}
                thumbnailType={componentType}
                viewPreset="thumbnails"
                isBottomDocked={isBottomDockedEffective}
                onClick={onThumbnailClick.bind(null, displaySetInstanceUID)}
                onDoubleClick={onThumbnailDoubleClick.bind(null, displaySetInstanceUID)}
                onClickUntrack={onClickUntrack.bind(null, displaySetInstanceUID)}
                ThumbnailMenuItems={ThumbnailMenuItems}
              />
            );
          })}
        </div>
      )}

      {/* Thumbnail Items */}
      {!shouldUseSingleBottomRow && thumbnailItems.length > 0 && (
        <div
          id="ohif-thumbnail-list"
          className={`ohif-scrollbar bg-bkg-low grid place-items-center overflow-y-hidden pt-[4px] pr-[2.5px] pl-[2.5px] ${viewPreset === 'thumbnails' ? 'grid-cols-2 gap-[4px] pb-[12px]' : 'grid-cols-1 gap-[2px]'}`}
        >
          {thumbnailItems.map(item => {
            const { displaySetInstanceUID, componentType, numInstances, ...rest } = item;

            const isActive = activeDisplaySetInstanceUIDs.includes(displaySetInstanceUID);
            return (
              <Thumbnail
                key={displaySetInstanceUID}
                {...rest}
                displaySetInstanceUID={displaySetInstanceUID}
                numInstances={numInstances || 1}
                isActive={isActive}
                thumbnailType={componentType}
                viewPreset="thumbnails"
                isBottomDocked={isBottomDockedEffective}
                onClick={onThumbnailClick.bind(null, displaySetInstanceUID)}
                onDoubleClick={onThumbnailDoubleClick.bind(null, displaySetInstanceUID)}
                onClickUntrack={onClickUntrack.bind(null, displaySetInstanceUID)}
                ThumbnailMenuItems={ThumbnailMenuItems}
              />
            );
          })}
        </div>
      )}
      {/* List Items */}
      {!shouldUseSingleBottomRow && listItems.length > 0 && (
        <div
          id="ohif-thumbnail-list"
          className={`ohif-scrollbar bg-bkg-low grid place-items-center overflow-y-hidden pt-[4px] pr-[2.5px] pl-[2.5px] ${viewPreset === 'thumbnails' ? 'grid-cols-2 gap-[4px] pb-[12px]' : 'grid-cols-1 gap-[2px]'}`}
        >
          {listItems.map(item => {
            const { displaySetInstanceUID, componentType, numInstances, ...rest } = item;
            const onClickMdv = displaySetInstanceUID => {
              onThumbnailClick(displaySetInstanceUID);
              //Se sono su mobile chiudo in automatico il pannello di selezione serie
              if (window.matchMedia('(max-width: 768px)').matches) {
                try {
                  // document.querySelector('[data-cy="side-panel-header-left"]').click()
                } catch (err) {
                  console.error(
                    'Impossibile chiudere in aumatico il pannello di selezione serie',
                    err
                  );
                }
              }
            };
            const isActive = activeDisplaySetInstanceUIDs.includes(displaySetInstanceUID);
            return (
              <Thumbnail
                key={displaySetInstanceUID}
                {...rest}
                displaySetInstanceUID={displaySetInstanceUID}
                numInstances={numInstances || 1}
                isActive={isActive}
                thumbnailType={componentType}
                viewPreset="list"
                isBottomDocked={isBottomDockedEffective}
                onClick={() => onClickMdv(displaySetInstanceUID)}
                onDoubleClick={onThumbnailDoubleClick.bind(null, displaySetInstanceUID)}
                onClickUntrack={onClickUntrack.bind(null, displaySetInstanceUID)}
                ThumbnailMenuItems={ThumbnailMenuItems}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

ThumbnailList.propTypes = {
  thumbnails: PropTypes.arrayOf(
    PropTypes.shape({
      displaySetInstanceUID: PropTypes.string.isRequired,
      imageSrc: PropTypes.string,
      imageAltText: PropTypes.string,
      seriesDate: PropTypes.string,
      seriesNumber: PropTypes.any,
      numInstances: PropTypes.number,
      description: PropTypes.string,
      componentType: PropTypes.any,
      isTracked: PropTypes.bool,
      /**
       * Data the thumbnail should expose to a receiving drop target. Use a matching
       * `dragData.type` to identify which targets can receive this draggable item.
       * If this is not set, drag-n-drop will be disabled for this thumbnail.
       *
       * Ref: https://react-dnd.github.io/react-dnd/docs/api/use-drag#specification-object-members
       */
      dragData: PropTypes.shape({
        /** Must match the "type" a dropTarget expects */
        type: PropTypes.string.isRequired,
      }),
    })
  ),
  activeDisplaySetInstanceUIDs: PropTypes.arrayOf(PropTypes.string),
  onThumbnailClick: PropTypes.func.isRequired,
  onThumbnailDoubleClick: PropTypes.func.isRequired,
  onClickUntrack: PropTypes.func.isRequired,
  viewPreset: PropTypes.string,
  ThumbnailMenuItems: PropTypes.any,
  isBottomDocked: PropTypes.bool,
};

export { ThumbnailList };
