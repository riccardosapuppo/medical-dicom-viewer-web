import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';

import { StudyItem } from '../StudyItem';
import { StudyBrowserSort } from '../StudyBrowserSort';
import { StudyBrowserViewOptions } from '../StudyBrowserViewOptions';

const noop = () => {};
const STUDY_BROWSER_PANEL_POSITION_STORAGE_KEY = 'mdvStudyPanelPosition';

const getInitialStudyBrowserPanelPosition = (): 'left' | 'right' | 'top' | 'bottom' => {
  if (typeof window === 'undefined') {
    return 'left';
  }

  const savedPosition = window.localStorage.getItem(STUDY_BROWSER_PANEL_POSITION_STORAGE_KEY);
  if (
    savedPosition === 'left' ||
    savedPosition === 'right' ||
    savedPosition === 'top' ||
    savedPosition === 'bottom'
  ) {
    return savedPosition;
  }

  return 'left';
};

const disableMPRView = () => {
  (document.querySelector('[data-cy="LayoutMPR"]') as HTMLElement)?.click();
};

const StudyBrowser = ({
  tabs,
  activeTabName,
  expandedStudyInstanceUIDs,
  onClickTab = noop,
  onClickStudy = noop,
  onClickThumbnail = noop,
  onDoubleClickThumbnail = noop,
  onClickUntrack = noop,
  activeDisplaySetInstanceUIDs,
  servicesManager,
  showSettings,
  viewPresets,
  ThumbnailMenuItems,
  StudyMenuItems,
}: withAppTypes) => {
  const [studyBrowserPanelPosition, setStudyBrowserPanelPosition] = useState<
    'left' | 'right' | 'top' | 'bottom'
  >(getInitialStudyBrowserPanelPosition);
  const isBottomDocked = studyBrowserPanelPosition === 'bottom';
  const [storicoPickerOpen, setStoricoPickerOpen] = useState(false);
  const storicoPickerRef = useRef<HTMLDivElement>(null);
  const skipAutoExpandRef = useRef(false);
  const [bottomSelectedStudyUid, setBottomSelectedStudyUid] = useState<string | null>(null);

  useEffect(() => {
    const onStudyPanelPositionChanged = (event: CustomEvent<{ position?: string }>) => {
      const nextPosition = event?.detail?.position;
      if (
        nextPosition === 'left' ||
        nextPosition === 'right' ||
        nextPosition === 'top' ||
        nextPosition === 'bottom'
      ) {
        setStudyBrowserPanelPosition(nextPosition);
      }
    };

    window.addEventListener(
      'mdv-study-panel-position-change',
      onStudyPanelPositionChanged as EventListener
    );

    return () => {
      window.removeEventListener(
        'mdv-study-panel-position-change',
        onStudyPanelPositionChanged as EventListener
      );
    };
  }, []);

  useEffect(() => {
    if (!isBottomDocked) {
      return;
    }

    if (skipAutoExpandRef.current) {
      skipAutoExpandRef.current = false;
      return;
    }

    const tabData = (tabs as any[]).find(tab => tab.name === activeTabName);
    const studies = tabData?.studies ?? [];
    const expandedStudy = studies.find(({ studyInstanceUid }) =>
      (expandedStudyInstanceUIDs as string[]).includes(studyInstanceUid)
    );
    const selectedStudy = expandedStudy || studies[0];

    if (
      selectedStudy?.studyInstanceUid &&
      !(expandedStudyInstanceUIDs as string[]).includes(selectedStudy.studyInstanceUid)
    ) {
      (onClickStudy as Function)(selectedStudy.studyInstanceUid);
    }
  }, [activeTabName, expandedStudyInstanceUIDs, isBottomDocked, onClickStudy, tabs]);

  // Chiudi popover storico quando clicco fuori
  useEffect(() => {
    if (!storicoPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (storicoPickerRef.current && !storicoPickerRef.current.contains(e.target as Node)) {
        setStoricoPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [storicoPickerOpen]);

  // Dati storico per il popover bottom
  const storicoTab = (tabs as any[]).find(tab => tab.name !== 'primary');
  const storicoStudies: any[] = storicoTab?.studies ?? [];
  const isStoricoActive = activeTabName !== 'primary';

  // In bottom mode, quando clicco "Storico sul cloud" con più studi, apri popover
  const handleBottomTabClick = (tabName: string) => {
    if (isBottomDocked && tabName !== 'primary') {
      const tab = (tabs as any[]).find(t => t.name === tabName);
      const studies = tab?.studies ?? [];
      if (studies.length > 1) {
        (onClickTab as Function)(tabName);
        setStoricoPickerOpen(prev => !prev);
        return;
      }
    }
    setStoricoPickerOpen(false);
    (onClickTab as Function)(tabName);
  };

  const getTabContent = () => {
    const tabData = (tabs as any[]).find(tab => tab.name === activeTabName);
    const viewPreset = viewPresets
      ? (viewPresets as any[]).filter(preset => preset.selected)[0]?.id
      : 'thumbnails';
    const studies = tabData?.studies ?? [];

    const studiesToRender = isBottomDocked
      ? (() => {
          // Priorità: studio selezionato dal popover, poi expanded, poi primo
          if (bottomSelectedStudyUid) {
            const picked = studies.find(s => s.studyInstanceUid === bottomSelectedStudyUid);
            if (picked) return [picked];
          }
          const expandedStudy = studies.find(({ studyInstanceUid }) =>
            (expandedStudyInstanceUIDs as string[]).includes(studyInstanceUid)
          );
          if (expandedStudy) {
            return [expandedStudy];
          }
          return studies.slice(0, 1);
        })()
      : studies;

    return studiesToRender.map(
      ({ studyInstanceUid, date, description, numInstances, modalities, displaySets }) => {
        const isExpanded = isBottomDocked || (expandedStudyInstanceUIDs as string[]).includes(studyInstanceUid);
        const isStorico =
          studyInstanceUid !== (window as any).mdvStudyInstanceUIDs && !(window as any).portableVersion;

        return (
          <React.Fragment key={studyInstanceUid}>
            <StudyItem
              studyInstanceUID={studyInstanceUid}
              date={date}
              description={description}
              numInstances={numInstances}
              isExpanded={isExpanded}
              displaySets={displaySets}
              modalities={modalities}
              isActive={isExpanded}
              onClick={() => (onClickStudy as Function)(studyInstanceUid)}
              onClickThumbnail={onClickThumbnail}
              onDoubleClickThumbnail={onDoubleClickThumbnail}
              onClickUntrack={onClickUntrack}
              activeDisplaySetInstanceUIDs={activeDisplaySetInstanceUIDs}
              data-cy="thumbnail-list"
              viewPreset={viewPreset}
              ThumbnailMenuItems={ThumbnailMenuItems}
              StudyMenuItems={StudyMenuItems}
              StudyInstanceUID={studyInstanceUid}
              isStorico={isStorico}
              isBottomDocked={isBottomDocked}
            />
          </React.Fragment>
        );
      }
    );
  };

  return (
    <div
      className={`bg-bkg-low flex h-full min-h-0 flex-1 flex-col ${isBottomDocked ? 'mdv-study-browser-bottom-layout' : ''}`}
      data-cy={'studyBrowser-panel'}
    >
      {/* {showSettings && ( */}
      {true && (
        <div
          className={`bg-bkg-low shrink-0 ${isBottomDocked ? 'mdv-study-browser-options' : ''}`}
        >
          <div
            className={`tab-studio-mdv w-100 bg-bkg-low flex h-[48px] items-center justify-center gap-[10px] py-[10px] ${isBottomDocked ? 'mdv-study-browser-options-tabs' : ''}`}
          >
            <>
              <StudyBrowserViewOptions
                tabs={tabs}
                onSelectTab={isBottomDocked ? handleBottomTabClick : onClickTab}
                activeTabName={activeTabName}
              />
              <StudyBrowserSort servicesManager={servicesManager} />
            </>
          </div>
          <div id="info-mpr-attivo">
            🟢 Vista MPR{' '}
            <span
              onClick={() => disableMPRView()}
              className="chiudi-modalita-mpr float-right"
            >
              Chiudi
            </span>
          </div>
        </div>
      )}

      {/* Popover storico studi — solo in bottom mode con più studi */}
      {isBottomDocked && storicoPickerOpen && isStoricoActive && storicoStudies.length > 1 && (
        <div
          ref={storicoPickerRef}
          className="mdv-storico-picker"
          style={{
            position: 'fixed',
            left: 0,
            bottom: `var(--mdv-study-panel-bottom-height, 107px)`,
            width: 'var(--mdv-study-panel-controls-width, 320px)',
            maxHeight: '340px',
            overflowY: 'auto',
            background: '#1a1f26',
            border: '1px solid #3a3a3a',
            borderBottom: 'none',
            borderRadius: '8px 8px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
            zIndex: 100,
            padding: '6px 0',
          }}
        >
          <div style={{ padding: '4px 12px 6px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Studi disponibili ({storicoStudies.length})
          </div>
          {storicoStudies.map((study: any) => {
            const isSelected = bottomSelectedStudyUid
              ? study.studyInstanceUid === bottomSelectedStudyUid
              : (expandedStudyInstanceUIDs as string[]).includes(study.studyInstanceUid);
            return (
              <div
                key={study.studyInstanceUid}
                onClick={() => {
                  setBottomSelectedStudyUid(study.studyInstanceUid);
                  skipAutoExpandRef.current = true;
                  // Espandi lo studio se non già espanso
                  if (!(expandedStudyInstanceUIDs as string[]).includes(study.studyInstanceUid)) {
                    (onClickStudy as Function)(study.studyInstanceUid);
                  }
                  setStoricoPickerOpen(false);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  borderLeft: isSelected ? '3px solid rgb(56, 189, 248)' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#212832';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent';
                }}
              >
                <div style={{ minWidth: 0, flex: 1, position: 'relative' }}
                  className="mdv-storico-study-row"
                >
                  <div
                    style={{ fontSize: '12px', color: '#e5e5e5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget;
                      if (el.scrollWidth <= el.clientWidth) return;
                      const tip = document.createElement('div');
                      tip.className = 'mdv-custom-tooltip';
                      tip.textContent = study.description;
                      tip.style.cssText = 'position:fixed;z-index:10000;background:#222;color:#eee;padding:6px 10px;border-radius:6px;font-size:12px;max-width:360px;word-wrap:break-word;box-shadow:0 4px 12px rgba(0,0,0,0.4);pointer-events:none;';
                      document.body.appendChild(tip);
                      const rect = el.getBoundingClientRect();
                      tip.style.left = rect.left + 'px';
                      tip.style.top = (rect.top - tip.offsetHeight - 6) + 'px';
                      (el as any)._tooltip = tip;
                    }}
                    onMouseLeave={(e) => {
                      const tip = (e.currentTarget as any)._tooltip;
                      if (tip) { tip.remove(); (e.currentTarget as any)._tooltip = null; }
                    }}
                  >
                    {study.description || 'Studio senza descrizione'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                    {study.date || '-'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '11px', color: '#aaa' }}>{study.modalities || '-'}</div>
                  <div style={{ fontSize: '10px', color: '#666' }}>{study.numInstances || 0}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className={`ohif-scrollbar min-h-0 flex-1 overflow-auto ${isBottomDocked ? 'mdv-study-browser-scroll-area' : 'invisible-scrollbar'}`}
      >
        <div className="flex flex-col gap-[4px] pb-[4px]">{getTabContent()}</div>
      </div>
    </div>
  );
};

StudyBrowser.propTypes = {
  onClickTab: PropTypes.func.isRequired,
  onClickStudy: PropTypes.func,
  onClickThumbnail: PropTypes.func,
  onDoubleClickThumbnail: PropTypes.func,
  onClickUntrack: PropTypes.func,
  activeTabName: PropTypes.string.isRequired,
  expandedStudyInstanceUIDs: PropTypes.arrayOf(PropTypes.string).isRequired,
  activeDisplaySetInstanceUIDs: PropTypes.arrayOf(PropTypes.string),
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      studies: PropTypes.arrayOf(
        PropTypes.shape({
          studyInstanceUid: PropTypes.string.isRequired,
          date: PropTypes.string,
          numInstances: PropTypes.number,
          modalities: PropTypes.string,
          description: PropTypes.string,
          displaySets: PropTypes.arrayOf(
            PropTypes.shape({
              displaySetInstanceUID: PropTypes.string.isRequired,
              imageSrc: PropTypes.string,
              imageAltText: PropTypes.string,
              seriesDate: PropTypes.string,
              seriesNumber: PropTypes.any,
              numInstances: PropTypes.number,
              description: PropTypes.string,
              componentType: PropTypes.oneOf(['thumbnail', 'thumbnailTracked', 'thumbnailNoImage'])
                .isRequired,
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
        })
      ).isRequired,
    })
  ),
  StudyMenuItems: PropTypes.func,
};

export { StudyBrowser };
