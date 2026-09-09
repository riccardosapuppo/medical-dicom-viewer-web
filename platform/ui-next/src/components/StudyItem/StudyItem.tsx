import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { ThumbnailList } from '../ThumbnailList';
import { Icon } from '@ohif/ui';
import { Icons } from '@ohif/ui-next';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../Accordion';
import openPriors from '../../../../app/public/extensions/openPriors/openPriors.js';

const PRIORS_SERIES_LOADING_TIMEOUT_MS = 12000;
const INVALID_STUDY_DESCRIPTION_VALUES = new Set([
  'no data study',
  'no data study',
  'no data',
  'n/a',
  'na',
  'null',
  'undefined',
  '(vuoto)',
]);

const normalizeText = value => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
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

const getUrlStudyDescription = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const params = new URLSearchParams(window.location.search);
  return (
    params.get('StudyDescription') ||
    params.get('studyDescription') ||
    params.get('description') ||
    ''
  );
};

const getWindowStudyDescription = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const appWindow = window as Window & { mdvStudyDescription?: string };
  return appWindow.mdvStudyDescription || '';
};

const resolveStudyDescription = ({ description, isPrior, displaySets }) => {
  const fromDescription = normalizeStudyDescription(description);
  if (fromDescription) {
    return fromDescription;
  }

  const fromDisplaySets = Array.isArray(displaySets)
    ? displaySets
        .map(ds => normalizeStudyDescription(ds?.studyDescription || ds?.StudyDescription))
        .find(Boolean)
    : '';
  if (fromDisplaySets) {
    return fromDisplaySets;
  }

  if (!isPrior) {
    const fromWindow = normalizeStudyDescription(getWindowStudyDescription());
    if (fromWindow) {
      return fromWindow;
    }

    const fromUrl = normalizeStudyDescription(getUrlStudyDescription());
    if (fromUrl) {
      return fromUrl;
    }
  }

  return '';
};

const StudyItem = ({
  studyInstanceUID,
  date,
  description,
  numInstances,
  modalities,
  isActive,
  onClick,
  isExpanded,
  displaySets,
  activeDisplaySetInstanceUIDs,
  onClickThumbnail,
  onDoubleClickThumbnail,
  onClickUntrack,
  viewPreset = 'thumbnails',
  isPrior,
  ThumbnailMenuItems,
  StudyMenuItems,
  StudyInstanceUID,
  isBottomDocked = false,
}: withAppTypes) => {
  const isStudyUIDDefined =
    studyInstanceUID !== undefined && studyInstanceUID !== null && studyInstanceUID !== '';
  const resolvedDescription = resolveStudyDescription({ description, isPrior, displaySets });

  /**
   * Opens the prior study's row, showing its thumbnails.
   *
   * It used to walk three parents up from e.target and click the first button it found.
   * But e.target is whatever was actually clicked: press the drawing inside the button
   * rather than its edge and you start at the <svg>, and three parents up you are
   * somewhere else entirely. The button looked dead, and sometimes it was: it found
   * itself again.
   *
   * e.currentTarget is always the button, however it was hit. From there this walks up to
   * the group of three icons and takes the accordion's handle, which comes first in the
   * DOM.
   */
  const espandi = e => {
    const gruppo = e.currentTarget.closest('.open-priors-modes');
    const maniglia = gruppo?.parentElement?.querySelector('button');
    if (!maniglia || maniglia === e.currentTarget) {
      console.warn('[priors] maniglia di apertura non trovata');
      return;
    }
    maniglia.click();
  };

  const isLoadingPriorsDisplaySets =
    isPrior && isExpanded && isStudyUIDDefined && (!displaySets || displaySets.length === 0);
  const [priorsLoadError, setPriorsLoadError] = useState(false);

  useEffect(() => {
    if (!isLoadingPriorsDisplaySets) {
      setPriorsLoadError(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setPriorsLoadError(true);
    }, PRIORS_SERIES_LOADING_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [isLoadingPriorsDisplaySets, studyInstanceUID]);

  return (
    <Accordion
      className={classnames(
        'mdv-study-accordion',
        isBottomDocked && 'mdv-study-accordion-bottom'
      )}
      type="single"
      collapsible={!isBottomDocked}
      onClick={onClick}
      onKeyDown={() => {}}
      role="button"
      tabIndex={0}
      // The accordion is CONTROLLED by isExpanded, the panel's state. It used to be
      // uncontrolled with a defaultValue from isActive, which is read only at mount and
      // true only for the study in the viewport, while the arrow and the highlight follow
      // isExpanded. In the priors' tabs the two diverged and the first study looked open
      // while it was shut.
      value={isBottomDocked || isExpanded ? 'study-item' : ''}
    >
      <AccordionItem
        value="study-item"
        className={classnames(
          'mdv-study-accordion-item',
          isBottomDocked && 'mdv-study-accordion-item-bottom'
        )}
      >
        <AccordionTrigger
          className={classnames(
            'hover:bg-accent bg-popover group w-full rounded',
            // Highlights the open study: the thumbnails below belong to this row.
            isExpanded && 'mdv-study-expanded',
            isExpanded && !isBottomDocked && 'border-secondary-light/40 sticky top-0 z-10 border-b',
            isBottomDocked && 'mdv-study-accordion-trigger-bottom'
          )}
        >
          <div
            className={classnames(
              'flex h-[40px] w-full flex-row overflow-hidden',
              isBottomDocked && 'mdv-study-info-row-bottom'
            )}
          >
            <div className="flex w-full flex-row items-center justify-between">
              <div
                className={classnames(
                  'flex min-w-0 flex-col items-start text-[13px]',
                  isBottomDocked && 'mdv-study-info-left-bottom'
                )}
              >
                <Tooltip>
                  <TooltipContent>{date}</TooltipContent>
                  <TooltipTrigger
                    className="w-full"
                    asChild
                  >
                    <div
                      className={classnames(
                        'h-[18px] w-full max-w-[160px] overflow-hidden truncate whitespace-nowrap text-left text-white',
                        isBottomDocked && 'mdv-study-info-date-bottom'
                      )}
                    >
                      {date}
                    </div>
                  </TooltipTrigger>
                </Tooltip>
                <Tooltip>
                  <TooltipContent>{resolvedDescription}</TooltipContent>
                  <TooltipTrigger
                    className="w-full"
                    asChild
                  >
                    <div
                      className={classnames(
                        'text-muted-foreground h-[18px] w-full overflow-hidden truncate whitespace-nowrap text-left',
                        isBottomDocked && 'mdv-study-info-desc-bottom'
                      )}
                    >
                      {resolvedDescription}
                    </div>
                  </TooltipTrigger>
                </Tooltip>
              </div>
              <div
                className={classnames(
                  'text-muted-foreground flex flex-col items-end pl-[10px] text-[12px]',
                  isBottomDocked && 'mdv-study-info-right-bottom'
                )}
              >
                <div className="max-w-[150px] overflow-hidden text-ellipsis">{modalities}</div>
                <div>{numInstances}</div>
              </div>
              {StudyMenuItems && (
                <div className="ml-2 flex items-center">
                  <StudyMenuItems StudyInstanceUID={StudyInstanceUID} />
                </div>
              )}
            </div>
          </div>
        </AccordionTrigger>
        {isPrior && isStudyUIDDefined && (
          <div className="open-priors-modes">
            <Tooltip
              position="bottom"
              content="Expand and show the thumbnails"
              isDisabled={isExpanded ? true : false}
            >
              <button
                id="priors-expand"
                onClick={e => espandi(e)}
              >
                <Icon
                  style={{ transform: isExpanded && 'rotate(180deg)' }}
                  name="priorsExpand"
                ></Icon>
              </button>
            </Tooltip>
            <Tooltip
              position="bottom"
              content="Open here as a separate study"
            >
              <button
                id="priors-same-window"
                onClick={e => openPriors(e, 'stessaScheda', studyInstanceUID)}
              >
                {/* <Icon name="priors-same-window"></Icon> */}
                <Icons.LayoutCommon1x2 />
              </button>
            </Tooltip>
            <Tooltip
              position="bottom"
              content="Open in a new tab"
            >
              <button
                id="priors-new-window"
                onClick={e => openPriors(e, 'nuovaScheda', studyInstanceUID)}
              >
                <Icon name="priorsNewWindow"></Icon>
              </button>
            </Tooltip>
          </div>
        )}

        {/* {isPrior && isStudyUIDDefined && (
          <div className="open-study-new-tab">

            <button onClick={e => espandi(e)}>{isExpanded ? 'Collapse' : 'Espandi'}</button>
            <button
              style={{
                opacity: 0.2,
              }}
              disabled
              onClick={() => openPriors('stessaScheda', studyInstanceUID)}
            >
              Apri in questa scheda
            </button>
            <button onClick={() => openPriors('nuovaScheda', studyInstanceUID)}>
              Open in a new tab
            </button>
          </div>
        )} */}
        <AccordionContent
          className={classnames(isBottomDocked && 'mdv-study-accordion-content-bottom')}
          onClick={event => {
            event.stopPropagation();
          }}
        >
          {isLoadingPriorsDisplaySets ? (
            priorsLoadError ? (
              <div className="flex items-center justify-center gap-2 py-3">
                <span className="text-[12px] text-[#f87171]">
                  Errore caricamento serie. Riprova oppure apri un altro studio.
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-3">
                <Icons.LoadingSpinner className="text-primary-main h-4 w-4" />
                <span className="text-muted-foreground text-[12px]">Loading the series...</span>
              </div>
            )
          ) : (
            isExpanded &&
            displaySets && (
              <ThumbnailList
                thumbnails={displaySets}
                activeDisplaySetInstanceUIDs={activeDisplaySetInstanceUIDs}
                onThumbnailClick={onClickThumbnail}
                onThumbnailDoubleClick={onDoubleClickThumbnail}
                onClickUntrack={onClickUntrack}
                viewPreset={viewPreset}
                ThumbnailMenuItems={ThumbnailMenuItems}
                isBottomDocked={isBottomDocked}
              />
            )
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

StudyItem.propTypes = {
  studyInstanceUID: PropTypes.string.isRequired,
  date: PropTypes.string.isRequired,
  description: PropTypes.string,
  modalities: PropTypes.string.isRequired,
  numInstances: PropTypes.number.isRequired,
  isActive: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool,
  displaySets: PropTypes.array,
  activeDisplaySetInstanceUIDs: PropTypes.array,
  onClickThumbnail: PropTypes.func,
  onDoubleClickThumbnail: PropTypes.func,
  onClickUntrack: PropTypes.func,
  viewPreset: PropTypes.string,
  isPrior: PropTypes.bool,
  StudyMenuItems: PropTypes.func,
  StudyInstanceUID: PropTypes.string,
  isBottomDocked: PropTypes.bool,
};

export { StudyItem };
