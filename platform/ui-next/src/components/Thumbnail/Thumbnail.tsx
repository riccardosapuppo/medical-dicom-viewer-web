import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { useDrag } from 'react-dnd';
import { Icons } from '../Icons';
import { DisplaySetMessageListTooltip } from '../DisplaySetMessageListTooltip';
import { TooltipTrigger, TooltipContent, Tooltip } from '../Tooltip';

/**
 * Display a thumbnail for a display set.
 */
const Thumbnail = ({
  displaySetInstanceUID,
  className,
  imageSrc,
  imageAltText,
  description,
  seriesNumber,
  numInstances,
  loadingProgress,
  countIcon,
  messages,
  isActive,
  onClick,
  onDoubleClick,
  modality,
  viewPreset = 'thumbnails',
  isHydratedForDerivedDisplaySet = false,
  isTracked = false,
  canReject = false,
  dragData = {},
  onReject = () => {},
  thumbnailType = 'thumbnail',
  onClickUntrack = () => {},
  ThumbnailMenuItems = () => {},
  isBottomDocked = false,
}: withAppTypes): React.ReactNode => {
  const debug =
    typeof window !== 'undefined' && window?.localStorage?.getItem('ohifThumbDebug') === '1';
  const didLogRef = useRef(false);

  useEffect(() => {
    if (!debug || didLogRef.current) {
      return;
    }
    const shouldLog = modality === 'OT' || !imageSrc;
    if (!shouldLog) {
      return;
    }
    didLogRef.current = true;
    // eslint-disable-next-line no-console
    console.warn('[thumb-ui]', {
      displaySetInstanceUID,
      modality,
      hasImageSrc: Boolean(imageSrc),
      imageSrcPrefix: imageSrc ? imageSrc.slice(0, 32) : null,
      seriesNumber,
      numInstances,
      viewPreset,
      thumbnailType,
    });
  }, [
    debug,
    modality,
    imageSrc,
    displaySetInstanceUID,
    seriesNumber,
    numInstances,
    viewPreset,
    thumbnailType,
  ]);

  // TODO: We should wrap our thumbnail to create a "DraggableThumbnail", as
  // this will still allow for "drag", even if there is no drop target for the
  // specified item.
  const [, drag] = useDrag({
    type: 'displayset',
    item: () => {
      const dd = dragData as Record<string, unknown>;
      if (dd?.modality) {
        document.body.dataset.dragModality = String(dd.modality);
      }
      // Dispatch a custom event so ViewportGrid (which has access to
      // hangingProtocolService) can validate each viewport and mark
      // compatible ones. Pure modality matching isn't enough — the HP
      // has extra rules like isReconstructable.
      document.dispatchEvent(
        new CustomEvent('mdv-drag-start', {
          detail: { displaySetInstanceUID: dd?.displaySetInstanceUID },
        })
      );
      return { ...dd };
    },
    end: () => {
      delete document.body.dataset.dragModality;
      document.dispatchEvent(new CustomEvent('mdv-drag-end'));
    },
    canDrag: function (monitor) {
      return Object.keys(dragData).length !== 0;
    },
  });

  const [lastTap, setLastTap] = useState(0);

  const handleTouchEnd = e => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 300 && tapLength > 0) {
      onDoubleClick(e);
    } else {
      onClick(e);
    }
    setLastTap(currentTime);
  };

  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [imageSrc]);

  const renderThumbnailPreset = () => {
    const noImageModalities = ['PR', 'SR', 'SEG', 'SM', 'RTSTRUCT', 'RTPLAN', 'RTDOSE'];
    const modalityUpper = modality?.toUpperCase?.() || '';
    const isNoImageSeries =
      thumbnailType === 'thumbnailNoImage' || noImageModalities.includes(modalityUpper);
    const isDocSeries = modalityUpper === 'DOC';
    // Show a DOC placeholder when the modality is DOC or the thumbnail image
    // failed to load (broken image). This is friendlier than the default
    // broken-image icon for encapsulated PDFs and similar documents.
    const useDocPlaceholder = isDocSeries || imgError;
    const showSpinner = !isNoImageSeries && !imageSrc && !useDocPlaceholder;
    const presetContainerClass = isBottomDocked
      ? 'flex h-[96px] w-[86px] shrink-0 flex-col items-start justify-start gap-0 p-[2px]'
      : 'flex h-full w-full flex-col items-center justify-center gap-[2px] p-[4px]';
    const presetImageSizeClass = isBottomDocked ? 'h-[58px] w-[82px]' : 'h-[114px] w-[128px]';
    const presetImageWrapperClass = isBottomDocked ? 'h-[58px] w-[82px] shrink-0' : presetImageSizeClass;
    const presetRelativeClass = isBottomDocked ? 'relative h-[58px] w-[82px] overflow-hidden' : 'relative';
    const presetTextClass = isBottomDocked
      ? 'flex h-[34px] w-[82px] flex-col justify-start overflow-hidden pt-[1px]'
      : 'flex min-h-[52px] w-[128px] flex-col';
    const presetDescriptionClass = isBottomDocked
      ? 'max-w-[82px] overflow-hidden truncate whitespace-nowrap text-[12px] leading-[13px] text-white'
      : 'max-w-[128px] overflow-hidden truncate whitespace-nowrap text-[12px] text-white';
    const presetSeriesRowClass = isBottomDocked
      ? 'flex h-[12px] items-center gap-[4px] overflow-hidden whitespace-nowrap'
      : 'flex h-[12px] items-center gap-[7px] overflow-hidden';
    return (
      <div className={classnames(presetContainerClass, isActive && 'bg-popover')}>
        <div className={presetImageWrapperClass}>
          <div className={presetRelativeClass}>
            {useDocPlaceholder ? (
              <div
                className={classnames(
                  'bg-background flex flex-col items-center justify-center rounded border border-white/10',
                  presetImageSizeClass
                )}
              >
                <div className="text-[28px] leading-none">📄</div>
                <div className="mt-[2px] text-[10px] font-semibold tracking-wide text-white/80">
                  DOC
                </div>
              </div>
            ) : imageSrc ? (
              <img
                src={imageSrc}
                alt={imageAltText}
                className={classnames(
                  `${presetImageSizeClass} rounded`,
                  isNoImageSeries && 'opacity-60'
                )}
                crossOrigin="anonymous"
                onError={() => setImgError(true)}
              />
            ) : (
              <div
                className={classnames(
                  'bg-background flex items-center justify-center rounded',
                  presetImageSizeClass
                )}
              >
                {showSpinner && thumbnailType !== 'thumbnailNoImage' && (
                  <div className="border-primary/60 h-[18px] w-[18px] animate-spin rounded-full border-2 border-t-transparent" />
                )}
              </div>
            )}
            {isNoImageSeries && null}

            {/* bottom left */}
            <div className="absolute bottom-0 left-0 flex h-[14px] items-center gap-[4px] rounded-tr pt-[10px] pb-[8px] pr-[6px] pl-[3px]">
              <div
                className={classnames(
                  'h-[10px] w-[10px] rounded-[2px]',
                  isActive || isHydratedForDerivedDisplaySet ? 'bg-highlight' : 'bg-primary/65',
                  loadingProgress && loadingProgress < 1 && 'bg-primary/25'
                )}
              ></div>
              <div className="text-[11px] font-semibold text-white">{modality}</div>
            </div>

            {/* top right */}
            <div className="absolute top-0 right-0 flex items-center gap-[4px]">
              <DisplaySetMessageListTooltip
                messages={messages}
                id={`display-set-tooltip-${displaySetInstanceUID}`}
              />
              {isTracked && (
                <Tooltip>
                  <TooltipTrigger>
                    <div className="group">
                      <Icons.StatusTracking className="text-primary-light h-[15px] w-[15px] group-hover:hidden" />
                      <Icons.Cancel
                        className="text-primary-light hidden h-[15px] w-[15px] group-hover:block"
                        onClick={onClickUntrack}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="flex flex-1 flex-row">
                      <div className="flex-2 flex items-center justify-center pr-4">
                        <Icons.InfoLink className="text-primary-active" />
                      </div>
                      <div className="flex flex-1 flex-col">
                        <span>
                          <span className="text-white">
                            {isTracked ? 'Series is tracked' : 'Series is untracked'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {/* bottom right */}
            <div className="absolute bottom-0 right-0 flex items-center gap-[4px] p-[4px]">
              <ThumbnailMenuItems
                displaySetInstanceUID={displaySetInstanceUID}
                canReject={canReject}
                onReject={onReject}
              />
            </div>
          </div>
        </div>
        <div className={presetTextClass}>
          {(() => {
            const descText = (description as string) || '';
            return (
              <div
                className={presetDescriptionClass}
                title={descText}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  if (el.scrollWidth <= el.clientWidth) return;
                  el.removeAttribute('title');
                  const tip = document.createElement('div');
                  tip.className = 'mdv-custom-tooltip';
                  tip.textContent = descText;
                  tip.style.cssText =
                    'position:fixed;z-index:10000;background:#222;color:#eee;padding:6px 10px;border-radius:6px;font-size:12px;max-width:360px;word-wrap:break-word;box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:none;';
                  document.body.appendChild(tip);
                  const rect = el.getBoundingClientRect();
                  tip.style.left = rect.left + 'px';
                  tip.style.top = rect.top - tip.offsetHeight - 6 + 'px';
                  (el as any)._tooltip = tip;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  const tip = (el as any)._tooltip;
                  if (tip) {
                    tip.remove();
                    (el as any)._tooltip = null;
                  }
                  if (descText) el.setAttribute('title', descText);
                }}
              >
                {descText}
              </div>
            );
          })()}
          <div className={presetSeriesRowClass}>
            <div
              className={classnames(
                'text-muted-foreground text-[11px] leading-[12px]',
                isBottomDocked ? 'pl-0' : 'pl-1'
              )}
            >
              S:{seriesNumber}
            </div>
            <div
              className={classnames(
                'text-muted-foreground text-[11px] leading-[12px]',
                isBottomDocked && 'shrink-0'
              )}
            >
              <div className="flex items-center gap-[4px]">
                {countIcon ? (
                  React.createElement(Icons[countIcon] || Icons.MissingIcon, { className: 'w-3' })
                ) : (
                  <Icons.InfoSeries className="w-3" />
                )}
                <div>{numInstances}</div>
              </div>
            </div>
          </div>
          {isNoImageSeries && !isBottomDocked && (
            <div className="mt-[2px]">
              <span
                className="inline-flex w-[128px] items-center justify-center whitespace-nowrap rounded-full px-2 py-[1px] text-[9px] uppercase tracking-wide"
                style={{
                  backgroundColor: 'var(--warning-bg)',
                  color: 'var(--warning-text)',
                  border: '1px solid var(--warning-border)',
                }}
              >
                Serie senza immagini
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderListPreset = () => {
    const noImageModalities = ['PR', 'SR', 'SEG', 'SM', 'RTSTRUCT', 'RTPLAN', 'RTDOSE'];
    const modalityUpper = modality?.toUpperCase?.() || '';
    const isNoImageSeries =
      thumbnailType === 'thumbnailNoImage' || noImageModalities.includes(modalityUpper);
    const showSpinner = !isNoImageSeries && !imageSrc;
    return (
      <div className="flex h-full w-full items-center justify-between pr-[8px] pl-[8px] pt-[8px] pb-[4px]">
        <div className="relative flex h-full items-center gap-[8px]">
          <div
            className={classnames(
              'h-full w-[4px] rounded-[2px]',
              isActive || isHydratedForDerivedDisplaySet ? 'bg-highlight' : 'bg-primary/65',
              loadingProgress && loadingProgress < 1 && 'bg-primary/25'
            )}
          ></div>
          <div className="flex h-full flex-col">
            <div className="flex h-[12px] items-center gap-[7px] overflow-hidden">
              <div className="text-muted-foreground series-foreground-text text-[12px]">
                {' '}
                <span>S:</span>
                {seriesNumber}
              </div>
              <div className="text-muted-foreground instances-foreground-text text-[12px]">
                <div className="flex items-center gap-[4px]">
                  {' '}
                  {countIcon ? (
                    React.createElement(Icons[countIcon] || Icons.MissingIcon, { className: 'w-3' })
                  ) : (
                    <Icons.InfoSeries className="w-3" />
                  )}
                  <div>{numInstances}</div>
                </div>
              </div>
              <div className="max-w-[160px] overflow-hidden overflow-ellipsis whitespace-nowrap text-[13px] text-white">
                {description}
              </div>
            </div>
            {isNoImageSeries && !isBottomDocked && (
              <div className="mt-[2px]">
                <span
                  className="inline-flex w-[128px] items-center justify-center whitespace-nowrap rounded-full px-2 py-[1px] text-[9px] uppercase tracking-wide"
                  style={{
                    backgroundColor: 'var(--warning-bg)',
                    color: 'var(--warning-text)',
                    border: '1px solid var(--warning-border)',
                  }}
                >
                  Serie senza immagini
                </span>
              </div>
            )}

            {/* <div className="flex items-center gap-[7px]">
              <div className="text-[13px] text-white">{modality}</div>

              <div className="max-w-[160px] overflow-hidden overflow-ellipsis whitespace-nowrap text-[13px] text-white">
                {description}
              </div>
            </div> */}

            <div className="relative my-2">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={imageAltText}
                  className={classnames(
                    'h-[114px] w-[128px] rounded',
                    isNoImageSeries && 'opacity-60'
                  )}
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="bg-background flex h-[114px] w-[128px] items-center justify-center rounded">
                  {showSpinner && thumbnailType !== 'thumbnailNoImage' && (
                    <div className="border-primary/60 h-[18px] w-[18px] animate-spin rounded-full border-2 border-t-transparent" />
                  )}
                </div>
              )}
              {isNoImageSeries && null}
            </div>
          </div>
        </div>
        <div className="flex h-full items-center gap-[4px]">
          <DisplaySetMessageListTooltip
            messages={messages}
            id={`display-set-tooltip-${displaySetInstanceUID}`}
          />
          {canReject && (
            <Icons.Trash
              className="h-[20px] w-[20px] text-red-500"
              onClick={onReject}
            />
          )}
          {isTracked && (
            <Tooltip>
              <TooltipTrigger>
                <div className="group">
                  <Icons.StatusTracking className="text-primary-light h-[20px] w-[20px] group-hover:hidden" />
                  <Icons.Cancel
                    className="text-primary-light hidden h-[15px] w-[15px] group-hover:block"
                    onClick={onClickUntrack}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="flex flex-1 flex-row">
                  <div className="flex-2 flex items-center justify-center pr-4">
                    <Icons.InfoLink className="text-primary-active" />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span>
                      <span className="text-white">
                        {isTracked ? 'Series is tracked' : 'Series is untracked'}
                      </span>
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={classnames(
        className,
        `bg-muted hover:bg-primary/30 group flex cursor-pointer select-none flex-col outline-none ${isActive && 'series-is-active'} ${countIcon && countIcon === 'icon-mpr' ? 'mpr-thumbnail' : 'no-mpr-thumbnail'} ${modality === 'PT' || modality === 'CT' ? 'ptct-thumbnail' : 'no-ptct-thumbnail'}`,
        viewPreset === 'thumbnails' &&
          (isBottomDocked ? 'h-full w-[86px] shrink-0' : 'h-[170px] w-[135px]'),
        viewPreset === 'list' && 'w-[275px]'
      )}
      id={`thumbnail-${displaySetInstanceUID}`}
      data-cy={
        thumbnailType === 'thumbnailNoImage'
          ? 'study-browser-thumbnail-no-image'
          : 'study-browser-thumbnail'
      }
      data-series={seriesNumber}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onTouchEnd={handleTouchEnd}
      role="button"
    >
      <div
        ref={drag}
        className="h-full w-full"
      >
        {viewPreset === 'thumbnails' && renderThumbnailPreset()}
        {viewPreset === 'list' && renderListPreset()}
      </div>
    </div>
  );
};

Thumbnail.propTypes = {
  displaySetInstanceUID: PropTypes.string.isRequired,
  className: PropTypes.string,
  imageSrc: PropTypes.string,
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
  imageAltText: PropTypes.string,
  description: PropTypes.string.isRequired,
  seriesNumber: PropTypes.any,
  numInstances: PropTypes.number.isRequired,
  loadingProgress: PropTypes.number,
  messages: PropTypes.object,
  isActive: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  onDoubleClick: PropTypes.func.isRequired,
  viewPreset: PropTypes.string,
  modality: PropTypes.string,
  isHydratedForDerivedDisplaySet: PropTypes.bool,
  isTracked: PropTypes.bool,
  onClickUntrack: PropTypes.func,
  countIcon: PropTypes.string,
  thumbnailType: PropTypes.oneOf(['thumbnail', 'thumbnailTracked', 'thumbnailNoImage']),
  isBottomDocked: PropTypes.bool,
};

export { Thumbnail };
