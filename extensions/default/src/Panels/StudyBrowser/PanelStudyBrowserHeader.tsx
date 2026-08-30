import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ToggleGroup, ToggleGroupItem } from '@ohif/ui-next';
import { Icons } from '@ohif/ui-next';
import { actionIcon, viewPreset } from './types';

const PANEL_POSITION_MODAL_WIDTH = 180;
const PANEL_POSITION_MODAL_ESTIMATED_HEIGHT = 220;
const PANEL_POSITION_MODAL_GUTTER = 8;
const PANEL_POSITION_MODAL_TOP_GAP = 8;
const PANEL_POSITION_STORAGE_KEY = 'mdvStudyPanelPosition';

const getInitialPanelPosition = (): 'left' | 'right' | 'top' | 'bottom' => {
  if (typeof window === 'undefined') {
    return 'left';
  }
  const savedPosition = window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY);
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

function PanelStudyBrowserHeader({
  viewPresets,
  updateViewPresetValue,
  actionIcons,
  updateActionIconValue,
}: {
  viewPresets: viewPreset[];
  updateViewPresetValue: (viewPreset: viewPreset) => void;
  actionIcons: actionIcon[];
  updateActionIconValue: (actionIcon: actionIcon) => void;
}) {
  const [isPanelPositionModalOpen, setIsPanelPositionModalOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<'left' | 'right' | 'top' | 'bottom'>(
    getInitialPanelPosition
  );
  const [panelPositionModalCoords, setPanelPositionModalCoords] = useState({ top: 0, left: 0 });
  const panelPositionWrapperRef = useRef<HTMLDivElement>(null);
  const panelPositionButtonRef = useRef<HTMLButtonElement>(null);
  const panelPositionModalRef = useRef<HTMLDivElement>(null);

  const updatePanelPositionModalCoords = () => {
    if (!panelPositionButtonRef.current || typeof window === 'undefined') {
      return;
    }
    const buttonRect = panelPositionButtonRef.current.getBoundingClientRect();
    const modalHeight =
      panelPositionModalRef.current?.getBoundingClientRect().height ||
      PANEL_POSITION_MODAL_ESTIMATED_HEIGHT;
    const rawLeft = buttonRect.right - PANEL_POSITION_MODAL_WIDTH;
    const maxLeft = window.innerWidth - PANEL_POSITION_MODAL_WIDTH - PANEL_POSITION_MODAL_GUTTER;
    const left = Math.max(PANEL_POSITION_MODAL_GUTTER, Math.min(rawLeft, maxLeft));

    const belowSpace = window.innerHeight - buttonRect.bottom - PANEL_POSITION_MODAL_GUTTER;
    const aboveSpace = buttonRect.top - PANEL_POSITION_MODAL_GUTTER;
    const preferBelow = belowSpace >= modalHeight || belowSpace >= aboveSpace;
    const rawTop = preferBelow
      ? buttonRect.bottom + PANEL_POSITION_MODAL_TOP_GAP
      : buttonRect.top - modalHeight - PANEL_POSITION_MODAL_TOP_GAP;
    const maxTop = window.innerHeight - modalHeight - PANEL_POSITION_MODAL_GUTTER;
    const top = Math.max(PANEL_POSITION_MODAL_GUTTER, Math.min(rawTop, maxTop));

    setPanelPositionModalCoords({ top, left });
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!isPanelPositionModalOpen) {
        return;
      }
      const target = event.target as Node;
      const clickInsideWrapper = panelPositionWrapperRef.current?.contains(target);
      const clickInsideModal = panelPositionModalRef.current?.contains(target);
      if (!clickInsideWrapper && !clickInsideModal) {
        setIsPanelPositionModalOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isPanelPositionModalOpen]);

  useEffect(() => {
    if (!isPanelPositionModalOpen) {
      return;
    }
    updatePanelPositionModalCoords();
    const frameId = window.requestAnimationFrame(() => {
      updatePanelPositionModalCoords();
    });
    const handleViewportChange = () => updatePanelPositionModalCoords();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isPanelPositionModalOpen]);

  const panelPositionOptions = [
    { value: 'left' as const, label: 'Sinistra' },
    { value: 'bottom' as const, label: 'Basso' },
  ];

  const persistAndBroadcastPanelPosition = (position: 'left' | 'right' | 'top' | 'bottom') => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, position);
    window.dispatchEvent(
      new CustomEvent('mdv-study-panel-position-change', {
        detail: { position },
      })
    );
  };

  useEffect(() => {
    persistAndBroadcastPanelPosition(getInitialPanelPosition());
  }, []);

  return (
    <>
      <div
        className={`mdv-panel-header bg-muted flex h-[40px] select-none rounded-t p-2 ${panelPosition === 'bottom' ? 'mdv-panel-header-bottom' : ''}`}
      >
        <div className={'flex h-[24px] w-full select-none justify-center self-center text-[14px]'}>
          <div className="flex w-full items-center gap-[10px]">
            {/* ICona settings */}
            {/* <div className="flex items-center justify-center">
              <div className="text-primary-active flex items-center space-x-1">
                {actionIcons.map((icon: actionIcon, index) =>
                  React.createElement(Icons[icon.iconName] || Icons.MissingIcon, {
                    key: index,
                    onClick: () => updateActionIconValue(icon),
                    className: `cursor-pointer`,
                  })
                )}
              </div>
            </div> */}
            <div
              ref={panelPositionWrapperRef}
              className="relative ml-auto flex h-full items-center justify-center"
            >
              <ToggleGroup
                type="single"
                value={viewPresets.filter(preset => preset.selected)[0].id}
                onValueChange={value => {
                  const selectedViewPreset = viewPresets.find(preset => preset.id === value);
                  updateViewPresetValue(selectedViewPreset);
                }}
              >
                {viewPresets.map((viewPreset: viewPreset, index) => (
                  <ToggleGroupItem
                    key={index}
                    aria-label={viewPreset.id}
                    value={viewPreset.id}
                    className="text-actions-primary"
                  >
                    {React.createElement(Icons[viewPreset.iconName] || Icons.MissingIcon)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <button
                ref={panelPositionButtonRef}
                type="button"
                aria-label="panel-position-options"
                className="text-actions-primary hover:text-primary-active ml-2 flex h-[24px] w-[24px] items-center justify-center rounded transition-colors"
                onClick={event => {
                  event.stopPropagation();
                  if (isPanelPositionModalOpen) {
                    setIsPanelPositionModalOpen(false);
                    return;
                  }
                  updatePanelPositionModalCoords();
                  setIsPanelPositionModalOpen(true);
                }}
              >
                <Icons.More />
              </button>

              {isPanelPositionModalOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                  <div
                    ref={panelPositionModalRef}
                    style={{
                      position: 'fixed',
                      top: `${panelPositionModalCoords.top}px`,
                      left: `${panelPositionModalCoords.left}px`,
                      width: `${PANEL_POSITION_MODAL_WIDTH}px`,
                    }}
                    className="border-secondary-light z-[1000] rounded-md border bg-black p-2 shadow-lg"
                  >
                    <div className="text-primary-active mb-2 text-[11px] font-semibold uppercase tracking-wide">
                      Posizione pannello
                    </div>
                    <div className="flex flex-col gap-1">
                      {panelPositionOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          className={`w-full rounded px-2 py-1 text-left text-[13px] transition-colors ${panelPosition === option.value ? 'bg-primary-light text-black' : 'text-primary-light hover:bg-primary-light hover:text-black'}`}
                          onClick={() => {
                            setPanelPosition(option.value);
                            persistAndBroadcastPanelPosition(option.value);
                            setIsPanelPositionModalOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export { PanelStudyBrowserHeader };
