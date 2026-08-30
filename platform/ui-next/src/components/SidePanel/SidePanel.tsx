import classnames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { Icons } from '../Icons';
import { TooltipTrigger, TooltipContent, Tooltip } from '../Tooltip';

/**
 * SidePanel component properties.
 * Note that the component monitors changes to the various widths and border sizes and will resize dynamically
 * @property {boolean} isExpanded - boolean indicating if the side panel is expanded/open or collapsed
 * @property {number} expandedWidth - the width of this side panel when expanded not including any borders or margins
 * @property {number} collapsedWidth - the width of this side panel when collapsed not including any borders or margins
 * @property {number} expandedInsideBorderSize - the width of the space between the expanded side panel content and viewport grid
 * @property {number} collapsedInsideBorderSize - the width of the space between the collapsed side panel content and the viewport grid
 * @property {number} collapsedOutsideBorderSize - the width of the space between the collapsed side panel content and the edge of the browser window
 */
type SidePanelProps = {
  side: 'left' | 'right';
  className: string;
  activeTabIndex: number;
  onOpen: () => void;
  onClose: () => void;
  onActiveTabIndexChange: () => void;
  isExpanded: boolean;
  expandedWidth: number;
  collapsedWidth: number;
  expandedInsideBorderSize: number;
  collapsedInsideBorderSize: number;
  collapsedOutsideBorderSize: number;
  tabs: SidePanelTab[];
};

type SidePanelTab = {
  name: string;
  label: string;
  iconName: string;
  disabled?: boolean;
  content: React.ComponentType;
};

type StyleMap = {
  open: {
    left: {
      marginLeft: string; // the space between the expanded/open left side panel and the browser window left edge
      marginRight: string; // the space between the expanded/open left side panel and the viewport grid
    };
    right: {
      marginLeft: string; // the space between the expanded/open right side panel and the viewport grid
      marginRight: string; // the space between the expanded/open right side panel and the browser window right edge
    };
  };
  closed: {
    left: {
      marginLeft: string; // the space between the collapsed/closed left panel and the browser window left edge
      marginRight: string; // the space between the collapsed/closed left panel and the viewport grid
      alignItems: 'flex-end'; // the flexbox layout align-items property
    };
    right: {
      marginLeft: string; // the space between the collapsed/closed right panel and the viewport grid
      marginRight: string; // the space between the collapsed/closed right panel and the browser window right edge
      alignItems: 'flex-start'; // the flexbox layout align-items property
    };
  };
};
const closeIconWidth = 30;
const gridHorizontalPadding = 10;
const tabSpacerWidth = 2;
let primoAvvio = true;
const STUDY_BROWSER_PANEL_POSITION_STORAGE_KEY = 'mdvStudyPanelPosition';
const STUDY_BROWSER_BOTTOM_HEIGHT_PX = 107;

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

const baseClasses =
  'mdv-new-panel transition-all duration-300 ease-in-out bg-black border-black justify-start box-content flex flex-col';

const classesMap = {
  open: {
    left: `mr-1 open`,
    right: `ml-1 open`,
  },
  closed: {
    left: `mr-2 items-end closed`,
    right: `ml-2 items-start `,
  },
};

const openStateIconName = {
  left: 'SidePanelCloseLeft',
  right: 'SidePanelCloseRight',
};

const getTabWidth = (numTabs: number) => {
  if (numTabs < 3) {
    return 68;
  } else {
    return 40;
  }
};

const getGridWidth = (numTabs: number, gridAvailableWidth: number) => {
  const spacersWidth = (numTabs - 1) * tabSpacerWidth;
  const tabsWidth = getTabWidth(numTabs) * numTabs;

  if (gridAvailableWidth > tabsWidth + spacersWidth) {
    return tabsWidth + spacersWidth;
  }

  return gridAvailableWidth;
};

const getNumGridColumns = (numTabs: number, gridWidth: number) => {
  if (numTabs === 1) {
    return 1;
  }

  // Start by calculating the number of tabs assuming each tab was accompanied by a spacer.
  const tabWidth = getTabWidth(numTabs);
  const numTabsWithOneSpacerEach = Math.floor(gridWidth / (tabWidth + tabSpacerWidth));

  // But there is always one less spacer than tabs, so now check if an extra tab with one less spacer fits.
  if (
    (numTabsWithOneSpacerEach + 1) * tabWidth + numTabsWithOneSpacerEach * tabSpacerWidth <=
    gridWidth
  ) {
    return numTabsWithOneSpacerEach + 1;
  }

  return numTabsWithOneSpacerEach;
};

const getTabClassNames = (
  numColumns: number,
  numTabs: number,
  tabIndex: number,
  isActiveTab: boolean,
  isTabDisabled: boolean
) =>
  classnames('h-[28px] mb-[2px] cursor-pointer text-white bg-black', {
    'hover:text-primary-active': !isActiveTab && !isTabDisabled,
    'rounded-l': tabIndex % numColumns === 0,
    'rounded-r': (tabIndex + 1) % numColumns === 0 || tabIndex === numTabs - 1,
  });

const getTabStyle = (numTabs: number) => {
  return {
    width: `${getTabWidth(numTabs)}px`,
  };
};

const getTabIconClassNames = (numTabs: number, isActiveTab: boolean) => {
  return classnames('h-full w-full flex items-center justify-center', {
    'bg-customblue-40': isActiveTab,
    rounded: isActiveTab,
  });
};
const createStyleMap = (
  expandedWidth: number,
  expandedInsideBorderSize: number,
  collapsedWidth: number,
  collapsedInsideBorderSize: number,
  collapsedOutsideBorderSize: number
): StyleMap => {
  const collapsedHideWidth = expandedWidth - collapsedWidth - collapsedOutsideBorderSize;

  return {
    open: {
      left: { marginLeft: '0px', marginRight: `${expandedInsideBorderSize}px` },
      right: { marginLeft: `${expandedInsideBorderSize}px`, marginRight: '0px' },
    },
    closed: {
      left: {
        marginLeft: `-${collapsedHideWidth}px`,
        marginRight: `${collapsedInsideBorderSize}px`,
        alignItems: `flex-end`,
      },
      right: {
        marginLeft: `${collapsedInsideBorderSize}px`,
        marginRight: `-${collapsedHideWidth}px`,
        alignItems: `flex-start`,
      },
    },
  };
};

const getToolTipContent = (label: string, disabled: boolean) => {
  return (
    <>
      <div>{label}</div>
      {disabled && <div className="text-white">{'Not available based on current context'}</div>}
    </>
  );
};

const createBaseStyle = (expandedWidth: number) => {
  return {
    maxWidth: `${expandedWidth}px`,
    width: `${expandedWidth}px`,
    // To align the top of the side panel with the top of the viewport grid, use position relative and offset the
    // top by the same top offset as the viewport grid. Also adjust the height so that there is no overflow.
    position: 'relative',
    top: '0.2%',
    height: '99.8%',
  };
};

const isBottomPanelReady = () => {
  if (typeof document === 'undefined') {
    return false;
  }

  const hasThumbnails = Boolean(
    document.querySelector(
      '[data-cy="study-browser-thumbnail"], [data-cy="study-browser-thumbnail-no-image"]'
    )
  );

  const hasInitialGridLoading =
    document.body.classList.contains('loading-spinner-into-grid') ||
    Boolean(document.querySelector('.mdv-scrolling-loading'));

  return hasThumbnails && !hasInitialGridLoading;
};

const SidePanel = ({
  side,
  className,
  activeTabIndex: activeTabIndexProp,
  isExpanded,
  tabs,
  onOpen,
  onClose,
  onActiveTabIndexChange,
  expandedWidth = 280,
  collapsedWidth = 25,
  expandedInsideBorderSize = 4,
  collapsedInsideBorderSize = 8,
  collapsedOutsideBorderSize = 4,
}: SidePanelProps) => {
  const [panelOpen, setPanelOpen] = useState(isExpanded);
  const [activeTabIndex, setActiveTabIndex] = useState(activeTabIndexProp ?? 0);
  const [studyBrowserPanelPosition, setStudyBrowserPanelPosition] = useState<
    'left' | 'right' | 'top' | 'bottom'
  >(getInitialStudyBrowserPanelPosition);
  const [bottomDockReady, setBottomDockReady] = useState(isBottomPanelReady);

  const [styleMap, setStyleMap] = useState(
    createStyleMap(
      expandedWidth,
      expandedInsideBorderSize,
      collapsedWidth,
      collapsedInsideBorderSize,
      collapsedOutsideBorderSize
    )
  );

  const [baseStyle, setBaseStyle] = useState(createBaseStyle(expandedWidth));

  const [gridAvailableWidth, setGridAvailableWidth] = useState(
    expandedWidth - closeIconWidth - gridHorizontalPadding
  );

  const [gridWidth, setGridWidth] = useState(getGridWidth(tabs.length, gridAvailableWidth));
  const openStatus = panelOpen ? 'open' : 'closed';
  const isBottomDocked = side === 'left' && studyBrowserPanelPosition === 'bottom';
  const showBottomDockPanel = !isBottomDocked || bottomDockReady;
  const bottomDockStyle = isBottomDocked
    ? {
      position: 'fixed',
      left: '0px',
      right: 'var(--mdv-study-panel-right-offset, 0px)',
      bottom: '0px',
      top: 'auto',
      width: 'auto',
      maxWidth: 'none',
      height: `var(--mdv-study-panel-bottom-height, ${STUDY_BROWSER_BOTTOM_HEIGHT_PX}px)`,
      marginLeft: '0px',
      marginRight: '0px',
      zIndex: 90,
      display: showBottomDockPanel ? 'flex' : 'none',
    }
    : {};
  const style = Object.assign({}, styleMap[openStatus][side], baseStyle, bottomDockStyle);

  const updatePanelOpen = useCallback(
    (isOpen: boolean) => {
      if (isBottomDocked && side === 'left' && !isOpen) {
        return;
      }
      setPanelOpen(isOpen);
      const event = new CustomEvent('panelOpen', { detail: { isOpen, side } });
      window.dispatchEvent(event);
      if (isOpen !== panelOpen) {
        // only fire events for changes
        if (isOpen && onOpen) {
          onOpen();
        } else if (onClose && !isOpen) {
          onClose();
        }
      }
    },
    [panelOpen, onOpen, onClose, side, isBottomDocked]
  );

  const updateActiveTabIndex = useCallback(
    (activeTabIndex: number, forceOpen: boolean = false) => {
      if (forceOpen) {
        updatePanelOpen(true);
      }

      setActiveTabIndex(activeTabIndex);

      if (onActiveTabIndexChange) {
        onActiveTabIndexChange({ activeTabIndex });
      }
    },
    [onActiveTabIndexChange, updatePanelOpen]
  );

  useEffect(() => {
    //Evito loop infiniti scatenati dal primo handleOnMobile
    if (window.matchMedia('(max-width: 768px)').matches) {
      return;
    }
    updatePanelOpen(isExpanded);
  }, [isExpanded, updatePanelOpen]);

  useEffect(() => {
    setStyleMap(
      createStyleMap(
        expandedWidth,
        expandedInsideBorderSize,
        collapsedWidth,
        collapsedInsideBorderSize,
        collapsedOutsideBorderSize
      )
    );
    setBaseStyle(createBaseStyle(expandedWidth));

    const gridAvailableWidth = expandedWidth - closeIconWidth - gridHorizontalPadding;
    setGridAvailableWidth(gridAvailableWidth);
    setGridWidth(getGridWidth(tabs.length, gridAvailableWidth));
  }, [
    collapsedInsideBorderSize,
    collapsedWidth,
    expandedWidth,
    expandedInsideBorderSize,
    tabs.length,
    collapsedOutsideBorderSize,
  ]);

  useEffect(() => {
    updateActiveTabIndex(activeTabIndexProp ?? 0);
  }, [activeTabIndexProp, updateActiveTabIndex]);

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
    if (!isBottomDocked || side !== 'left') {
      setBottomDockReady(true);
      return;
    }

    const syncBottomDockReady = () => {
      setBottomDockReady(prev => prev || isBottomPanelReady());
    };

    syncBottomDockReady();

    const observer = new MutationObserver(() => {
      syncBottomDockReady();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
    };
  }, [isBottomDocked, side]);

  useEffect(() => {
    if (!isBottomDocked || side !== 'left' || !showBottomDockPanel) {
      return;
    }

    const updateBottomDockOffset = () => {
      const rightPanel = document.querySelector(
        '[data-panel-id="viewerLayoutResizableRightPanel"]'
      );
      const rightOffset = rightPanel
        ? Math.max(0, Math.round((rightPanel as HTMLElement).getBoundingClientRect().width))
        : 0;
      document.body.style.setProperty('--mdv-study-panel-right-offset', `${rightOffset}px`);
    };

    document.body.classList.add('mdv-study-panel-bottom');
    document.body.style.setProperty(
      '--mdv-study-panel-bottom-height',
      `${STUDY_BROWSER_BOTTOM_HEIGHT_PX}px`
    );
    updateBottomDockOffset();
    window.addEventListener('resize', updateBottomDockOffset);
    window.addEventListener('panelOpen', updateBottomDockOffset as EventListener);

    return () => {
      window.removeEventListener('resize', updateBottomDockOffset);
      window.removeEventListener('panelOpen', updateBottomDockOffset as EventListener);
      document.body.classList.remove('mdv-study-panel-bottom');
      document.body.style.removeProperty('--mdv-study-panel-right-offset');
      document.body.style.removeProperty('--mdv-study-panel-bottom-height');
    };
  }, [isBottomDocked, side, showBottomDockPanel]);

  useEffect(() => {
    if (isBottomDocked && side === 'left' && !panelOpen) {
      setPanelOpen(true);
    }
  }, [isBottomDocked, side, panelOpen]);

  const getCloseStateComponent = () => {
    const _childComponents = Array.isArray(tabs) ? tabs : [tabs];
    return (
      <>
        <div
          className={classnames(
            'bg-secondary-dark flex h-[28px] w-full cursor-pointer items-center rounded-md',
            side === 'left' ? 'justify-end pr-2' : 'justify-start pl-2'
          )}
          onClick={() => {
            updatePanelOpen(!panelOpen);
          }}
          data-cy={`side-panel-header-${side}`}
        >
          <Icons.NavigationPanelReveal
            className={classnames('text-primary-active', side === 'left' && 'rotate-180 transform')}
          />
        </div>
        <div className={classnames('mt-3 flex flex-col space-y-3')}>
          {_childComponents.map((childComponent, index) => (
            <Tooltip key={index}>
              <TooltipTrigger>
                <div
                  id={`${childComponent.name}-btn`}
                  data-cy={`${childComponent.name}-btn`}
                  className="text-primary-active hover:cursor-pointer"
                  onClick={() => {
                    return childComponent.disabled ? null : updateActiveTabIndex(index, true);
                  }}
                >
                  {React.createElement(Icons[childComponent.iconName] || Icons.MissingIcon, {
                    className: classnames({
                      'text-primary-active': true,
                      'ohif-disabled': childComponent.disabled,
                    }),
                    style: {
                      width: '22px',
                      height: '22px',
                    },
                  })}
                </div>
              </TooltipTrigger>
              <TooltipContent side={side === 'left' ? 'right' : 'left'}>
                <div
                  className={classnames(
                    'flex items-center',
                    side === 'left' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {getToolTipContent(childComponent.label, childComponent.disabled)}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </>
    );
  };

  const getCloseIcon = () => {
    return (
      <div
        className={classnames(
          'absolute flex cursor-pointer items-center justify-center',
          side === 'left' ? 'right-0' : 'left-0'
        )}
        style={{ width: `${closeIconWidth}px` }}
        onClick={() => {
          updatePanelOpen(!panelOpen);
        }}
        data-cy={`side-panel-header-${side}`}
      >
        {React.createElement(Icons[openStateIconName[side]] || Icons.MissingIcon, {
          className: 'text-primary-active',
        })}
      </div>
    );
  };

  const getTabGridComponent = () => {
    const numCols = getNumGridColumns(tabs.length, gridWidth);

    return (
      <>
        {getCloseIcon()}
        <div className={classnames('flex grow justify-center')}>
          <div className={classnames('bg-primary-dark text-primary-active flex flex-wrap')}>
            {tabs.map((tab, tabIndex) => {
              const { disabled } = tab;
              return (
                <React.Fragment key={tabIndex}>
                  {tabIndex % numCols !== 0 && (
                    <div
                      className={classnames(
                        'flex h-[28px] w-[2px] items-center bg-black',
                        tabSpacerWidth
                      )}
                    >
                      <div className="bg-primary-dark h-[20px] w-full"></div>
                    </div>
                  )}
                  <Tooltip key={tabIndex}>
                    <TooltipTrigger>
                      <div
                        className={getTabClassNames(
                          numCols,
                          tabs.length,
                          tabIndex,
                          tabIndex === activeTabIndex,
                          disabled
                        )}
                        style={getTabStyle(tabs.length)}
                        onClick={() => {
                          return disabled ? null : updateActiveTabIndex(tabIndex);
                        }}
                        data-cy={`${tab.name}-btn`}
                      >
                        <div
                          className={getTabIconClassNames(tabs.length, tabIndex === activeTabIndex)}
                        >
                          {React.createElement(Icons[tab.iconName] || Icons.MissingIcon, {
                            className: classnames({
                              'text-primary-active': true,
                              'ohif-disabled': disabled,
                            }),
                            style: {
                              width: '22px',
                              height: '22px',
                            },
                          })}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {getToolTipContent(tab.label, disabled)}
                    </TooltipContent>
                  </Tooltip>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  const getOneTabComponent = () => {
    return (
      <div
        className={classnames(
          'text-primary-active flex grow cursor-pointer select-none justify-center self-center text-[13px]'
        )}
        data-cy={`${tabs[0].name}-btn`}
        onClick={() => updatePanelOpen(!panelOpen)}
      >
        {getCloseIcon()}
        <span>{tabs[0].label}</span>
      </div>
    );
  };

  const getOpenStateComponent = () => {
    return (
      <>
        <div className="bg-bkg-med flex h-[40px] flex-shrink-0 select-none rounded-t p-2">
          {tabs.length === 1 ? getOneTabComponent() : getTabGridComponent()}
        </div>
        {/* <Separator
          orientation="horizontal"
          className="bg-black"
          thickness="2px"
        /> */}
      </>
    );
  };

  const handleOnMobile = () => {
    if (isBottomDocked) {
      primoAvvio = false;
      return;
    }

    if (window.matchMedia('(max-width: 768px)').matches) {
      updatePanelOpen(!panelOpen); // Chiude il pannello
      isExpanded = false;

      const mainArea = document.querySelector('.mdv-main-area');
      const barraHeaderInBasso = document.querySelector('.mdv-bar');
      const posizioneYBarraHeaderInBasso = barraHeaderInBasso.getBoundingClientRect().y;
      mainArea.style.height = posizioneYBarraHeaderInBasso - 2 + 'px';
      mainArea.style.top = '2px';
    }
    primoAvvio = false; // Imposta `primoAvvio` a false per evitare chiamate successive
  };

  //Al primo avvio verifico se sono su mobile, se lo fossi al primo avvio chiudo di default il pannello e adatto l'altezza dell'intera area
  //sopra la barra header in basso
  useEffect(() => {
    if (primoAvvio) {
      handleOnMobile(); // Verifica se chiudere il pannello
    }
  }, []);

  return (
    <div
      className={classnames(className, side, baseClasses, classesMap[openStatus][side])}
      style={style}
    >
      {panelOpen ? (
        <>
          {getOpenStateComponent()}
          {tabs.map((tab, tabIndex) => {
            if (tabIndex === activeTabIndex) {
              return <tab.content key={tabIndex} />;
            }
            return null;
          })}
        </>
      ) : (
        <React.Fragment>{getCloseStateComponent()}</React.Fragment>
      )}
    </div>
  );
};

export { SidePanel };
