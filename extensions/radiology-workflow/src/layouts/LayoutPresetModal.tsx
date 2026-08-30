import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSystem } from '@ohif/core';

import LayoutPresetService from '../services/LayoutPresetService';
import type { AvailableSeries, LayoutPreset } from './layoutPresets';

/** What the grid currently shows, in the order the viewports are laid out. */
function readCurrentLayout(servicesManager: AppTypes.ServicesManager) {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const state = viewportGridService.getState();
  const viewportIds = [...state.viewports.keys()];

  const slots = viewportIds.map(viewportId => {
    const uid = state.viewports.get(viewportId)?.displaySetInstanceUIDs?.[0];
    const displaySet = uid ? displaySetService.getDisplaySetByUID(uid) : undefined;
    return { seriesDescription: displaySet?.SeriesDescription ?? '' };
  });

  return {
    rows: state.layout?.numRows ?? 1,
    columns: state.layout?.numCols ?? 1,
    slots,
    viewportIds,
  };
}

/** Every series of the study on screen, as candidates for a saved layout. */
function readAvailableSeries(servicesManager: AppTypes.ServicesManager): AvailableSeries[] {
  const { displaySetService } = servicesManager.services;
  return displaySetService.getActiveDisplaySets().map(displaySet => ({
    displaySetInstanceUID: displaySet.displaySetInstanceUID,
    seriesDescription: displaySet.SeriesDescription ?? '',
  }));
}

function studyContext(servicesManager: AppTypes.ServicesManager) {
  const { displaySetService } = servicesManager.services;
  const first = displaySetService.getActiveDisplaySets()[0];
  return {
    studyDescription: first?.StudyDescription || 'Study',
    modality: first?.Modality || '',
  };
}

/**
 * Saving and re-applying how a study is arranged on screen.
 *
 * What is stored is the grid and the series description in each viewport, not
 * the identifiers of those series: that is what lets a layout saved on one
 * study apply to the next study acquired under the same protocol, which is the
 * only reason to save one at all.
 */
function LayoutPresetModal({ hide }: { hide: () => void }) {
  const { servicesManager } = useSystem();
  const { layoutPresetService, viewportGridService, uiNotificationService } =
    servicesManager.services as {
      layoutPresetService: LayoutPresetService;
      viewportGridService: AppTypes.ViewportGridService;
      uiNotificationService: AppTypes.UINotificationService;
    };

  const study = useMemo(() => studyContext(servicesManager), [servicesManager]);
  const available = useMemo(() => readAvailableSeries(servicesManager), [servicesManager]);
  const current = useMemo(() => readCurrentLayout(servicesManager), [servicesManager]);

  const [name, setName] = useState('');
  const [saved, setSaved] = useState<LayoutPreset[]>(() => layoutPresetService.getForStudy(study));

  useEffect(() => {
    const { unsubscribe } = layoutPresetService.subscribe(LayoutPresetService.EVENTS.CHANGED, () =>
      setSaved(layoutPresetService.getForStudy(study))
    );
    return unsubscribe;
  }, [layoutPresetService, study]);

  const onSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    layoutPresetService.save({
      name: trimmed,
      rows: current.rows,
      columns: current.columns,
      slots: current.slots,
      studyDescription: study.studyDescription,
      modality: study.modality,
    });
    setName('');
  }, [current, layoutPresetService, name, study]);

  const onApply = useCallback(
    async (preset: LayoutPreset) => {
      const resolved = layoutPresetService.resolve(preset, available);

      await viewportGridService.setLayout({ numRows: preset.rows, numCols: preset.columns });

      // The viewport identifiers only exist once the new grid does, so the
      // resolved series are placed after the layout has been applied.
      const viewportIds = [...viewportGridService.getState().viewports.keys()];
      const updates = viewportIds
        .map((viewportId, index) => ({ viewportId, uid: resolved[index] }))
        .filter(update => update.uid)
        .map(update => ({
          viewportId: update.viewportId,
          displaySetInstanceUIDs: [update.uid as string],
        }));

      if (updates.length > 0) {
        await viewportGridService.setDisplaySetsForViewports(updates);
      }

      const missing = preset.slots.length - resolved.filter(Boolean).length;
      if (missing > 0) {
        uiNotificationService?.show({
          title: preset.name,
          message: `${missing} of ${preset.slots.length} viewports were left empty: this study has no series matching them.`,
          type: 'info',
          duration: 5000,
        });
      }
      hide();
    },
    [available, hide, layoutPresetService, uiNotificationService, viewportGridService]
  );

  return (
    <div className="text-foreground flex max-h-[70vh] flex-col gap-4 text-sm">
      <section>
        <h3 className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
          Save the current arrangement
        </h3>
        <p className="text-muted-foreground mb-2 text-xs">
          {current.rows} &times; {current.columns}
          {current.slots.some(slot => slot.seriesDescription)
            ? ` — ${current.slots.map(slot => slot.seriesDescription || 'empty').join(', ')}`
            : ''}
        </p>
        <div className="flex gap-2">
          <input
            className="bg-popover text-popover-foreground placeholder:text-muted-foreground flex-1 rounded px-2 py-1 outline-none"
            placeholder="A name, for studies like this one"
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && onSave()}
            aria-label="Name for this arrangement"
          />
          <button
            type="button"
            className="bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-40"
            onClick={onSave}
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto">
        <h3 className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
          Saved for {study.studyDescription}
          {study.modality ? ` (${study.modality})` : ''}
        </h3>

        {saved.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nothing saved yet. Arrange the viewports as you want them, then save that above; it will
            be offered again on the next study of this kind.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {saved.map(preset => {
              const { filled, total } = layoutPresetService.coverage(preset, available);
              return (
                <li
                  key={preset.id}
                  className="bg-muted flex items-center gap-2 rounded px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{preset.name}</div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {preset.rows} &times; {preset.columns} &middot; {filled} of {total} series
                      present
                    </div>
                  </div>
                  <button
                    type="button"
                    className="bg-primary text-primary-foreground rounded px-2 py-1 text-xs disabled:opacity-40"
                    onClick={() => onApply(preset)}
                    disabled={filled === 0}
                    title={
                      filled === 0 ? 'No series of this study match this arrangement' : undefined
                    }
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground px-1 text-xs"
                    onClick={() => layoutPresetService.remove(preset.id)}
                    aria-label={`Delete ${preset.name}`}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default LayoutPresetModal;
