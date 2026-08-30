import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Enums, RenderingEngine, Types as csTypes, metaData } from '@cornerstonejs/core';
import { ToolGroupManager } from '@cornerstonejs/tools';

import { setEnabledElement } from '../../state';
import {
  captureImageFromImageId,
  captureImageWithAnnotationsFromElement,
} from '../../components/Preferiti/Preferiti';

/**
 * Una singola cella della sottogriglia montage.
 *
 * Crea un enabled-element Cornerstone STACK sul RenderingEngine PRINCIPALE,
 * ci carica la serie (stesso array imageIds di tutte le celle → cache pixel
 * condivisa) e si posiziona sull'immagine `imageIndex`. La cella entra nello
 * stesso toolGroup ('default') delle altre viewport, così gli strumenti della
 * toolbar funzionano. NON viene registrata in ViewportGridService: è interna
 * alla viewport OHIF ospitante.
 */
function MontageCell(props: {
  cellId: string;
  ohifViewportId?: string;
  renderingEngine: RenderingEngine;
  renderingEngineId: string;
  toolGroupId: string;
  syncGroupService: any;
  voiSyncId: string;
  zoomPanSyncId: string;
  imageIds: string[];
  imageIndex: number;
  total: number;
  instanceNumber?: number | string | null;
  isPrimary?: boolean;
  // Info per i Preferiti (stellina): identificano l'istanza mostrata nella cella.
  seriesInstanceUID?: string;
  sopInstanceUID?: string;
  seriesNumber?: number | string | null;
  seriesDescription?: string | null;
  uiNotificationService?: any;
}) {
  const {
    cellId,
    ohifViewportId,
    renderingEngine,
    renderingEngineId,
    toolGroupId,
    syncGroupService,
    voiSyncId,
    zoomPanSyncId,
    imageIds,
    imageIndex,
    total,
    instanceNumber,
    isPrimary,
    seriesInstanceUID,
    sopInstanceUID,
    seriesNumber,
    seriesDescription,
    uiNotificationService,
  } = props;

  const elementRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const isEmpty = imageIndex < 0 || imageIndex >= total;

  // Identificativo del FRAME mostrato nella cella. Per i multiframe tutti i frame
  // condividono lo stesso SOPInstanceUID, quindi serve questo per distinguerli nei
  // preferiti (salvato come NumeroIstanza). Uso imageIndex+1 (la POSIZIONE nello
  // stack), come fanno i preferiti delle viewport normali (`activeElementIndex+1`):
  // identità univoca per frame, niente collisioni, e match cross-viewport coerente.
  const frameNumber = imageIndex + 1;

  // Ciclo di vita dell'enabled-element: si (ri)crea quando cambia la cella o
  // quando la cella passa da vuota a piena (es. scorrendo verso l'ultimo blocco).
  useEffect(() => {
    const element = elementRef.current;
    if (isEmpty || !element) {
      return undefined;
    }

    renderingEngine.enableElement({
      viewportId: cellId,
      element,
      type: Enums.ViewportType.STACK,
      defaultOptions: { background: [0, 0, 0] as csTypes.Point3 },
    });

    const viewport = renderingEngine.getViewport(cellId) as csTypes.IStackViewport;

    viewport
      .setStack(imageIds, imageIndex)
      .then(() => {
        // Rifit alla dimensione corrente del canvas della cella: evita immagini
        // stirate quando il canvas viene (ri)dimensionato all'attivazione della
        // montage. resetCamera mantiene il rapporto d'aspetto corretto.
        viewport.resetCamera();
        viewport.render();
      })
      .catch(() => {
        /* viewport potrebbe essere stato distrutto durante un cambio layout */
      });

    // La cella primaria registra il proprio enabled-element nello state OHIF
    // SOTTO l'id della viewport OHIF attiva (ohifViewportId): così i comandi
    // della toolbar che agiscono sulla viewport attiva (getActiveViewportEnabled-
    // Element) trovano una cella su cui operare (invert/rotate/flip/reset, che
    // poi propaghiamo a tutte le celle in commandsModule).
    if (isPrimary && ohifViewportId) {
      setEnabledElement(ohifViewportId, element);
    }

    // Collega strumenti e sincronizzatori DOPO l'abilitazione dell'elemento.
    ToolGroupManager.getToolGroup(toolGroupId)?.addViewport(cellId, renderingEngineId);
    syncGroupService.addViewportToSyncGroup(cellId, renderingEngineId, [
      {
        type: 'voi',
        id: voiSyncId,
        source: true,
        target: true,
        options: { syncInvertState: true, syncColormap: true },
      },
      {
        type: 'zoompan',
        id: zoomPanSyncId,
        source: true,
        target: true,
      },
    ]);

    return () => {
      try {
        if (isPrimary && ohifViewportId) {
          setEnabledElement(ohifViewportId, null as any);
        }
        syncGroupService.removeViewportFromSyncGroup(cellId, renderingEngineId, voiSyncId);
        syncGroupService.removeViewportFromSyncGroup(cellId, renderingEngineId, zoomPanSyncId);
        ToolGroupManager.getToolGroup(toolGroupId)?.removeViewports(renderingEngineId, cellId);
        renderingEngine.disableElement(cellId);
      } catch (e) {
        /* noop: teardown best-effort */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellId, isEmpty]);

  // Aggiornamento dell'indice immagine durante lo scroll a blocchi o il cambio
  // di prima immagine, senza ri-abilitare l'elemento.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (isEmpty) {
      return;
    }
    const viewport = renderingEngine.getViewport(cellId) as csTypes.IStackViewport;
    if (!viewport) {
      return;
    }
    viewport
      .setImageIdIndex(imageIndex)
      .then(() => viewport.render())
      .catch(() => {
        /* indice non valido / viewport distrutto */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageIndex]);

  // ── Preferiti (stellina) ────────────────────────────────────────────────
  // Risolve il SOPInstanceUID dell'istanza attualmente mostrata nella cella:
  // prima dai metadati dell'imageId corrente (sempre allineato a ciò che si
  // vede), con fallback alla prop passata dal viewport ospitante.
  const resolveSopUID = useCallback((): string | undefined => {
    const imageId = imageIds[imageIndex];
    if (imageId) {
      try {
        const sop = (metaData.get('sopCommonModule', imageId) as { sopInstanceUID?: string })
          ?.sopInstanceUID;
        if (sop) {
          return sop;
        }
      } catch (e) {
        /* fallback sotto */
      }
    }
    return sopInstanceUID;
  }, [imageIds, imageIndex, sopInstanceUID]);

  const computeIsFav = useCallback((): boolean => {
    const list = (window as any).preferiti as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(list) || !list.length || !seriesInstanceUID) {
      return false;
    }
    const sopUID = resolveSopUID();
    if (!sopUID) {
      return false;
    }
    // Match per SOP + frame: senza il frame, su un multiframe (stesso SOP per
    // tutti i frame) la stellina si accenderebbe su TUTTE le celle.
    return list.some(
      p =>
        p.SeriesInstanceUID === seriesInstanceUID &&
        p.SOPInstanceUID === sopUID &&
        String(p.NumeroIstanza) === String(frameNumber)
    );
  }, [seriesInstanceUID, resolveSopUID, frameNumber]);

  const [isFav, setIsFav] = useState(false);

  // Riallinea lo stato della stellina al cambio immagine della cella e quando
  // i preferiti cambiano altrove (altre celle, pannello WW/WL, lista preferiti).
  useEffect(() => {
    if (isEmpty) {
      setIsFav(false);
      return undefined;
    }
    setIsFav(computeIsFav());
    const handler = () => setIsFav(computeIsFav());
    window.addEventListener('mdv-preferiti-updated', handler);
    return () => window.removeEventListener('mdv-preferiti-updated', handler);
  }, [isEmpty, computeIsFav]);

  const onToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const sopUID = resolveSopUID();
      const imageId = imageIds[imageIndex];
      const viewport = renderingEngine.getViewport(cellId) as csTypes.IStackViewport | undefined;
      if (!sopUID || !seriesInstanceUID || !imageId || !viewport) {
        return;
      }

      if (!(window as any).preferiti) {
        (window as any).preferiti = [];
      }
      const list = (window as any).preferiti as Array<Record<string, unknown>>;

      // Allinea il "pulse" del pulsante preferiti globale (indica che ci sono
      // preferiti da stampare), come fanno i preferiti delle viewport normali.
      const syncPreferitiPulse = () => {
        const btn = document.getElementById('preferiti-btn');
        if (!btn) {
          return;
        }
        if (((window as any).preferiti?.length || 0) > 0) {
          btn.classList.add('pulse');
        } else {
          btn.classList.remove('pulse');
        }
      };

      const matchesThisFrame = p =>
        p.SeriesInstanceUID === seriesInstanceUID &&
        p.SOPInstanceUID === sopUID &&
        String(p.NumeroIstanza) === String(frameNumber);
      const already = list.some(matchesThisFrame);

      // ── Rimozione ──
      if (already) {
        (window as any).preferiti = list.filter(p => !matchesThisFrame(p));
        setIsFav(false);
        syncPreferitiPulse();
        uiNotificationService?.show?.({
          title: 'Preferiti',
          message: 'Preferito rimosso',
          type: 'error',
        });
        window.dispatchEvent(new Event('mdv-preferiti-updated'));
        return;
      }

      // ── Aggiunta ──
      // Stesse 4 versioni catturate dai preferiti delle viewport normali
      // (clean / printBase / overlay / annotated) così il print builder le usa
      // in modo identico.
      const element = elementRef.current;
      const cleanUrl =
        (await captureImageFromImageId(imageId, viewport)) ||
        (element?.querySelector('canvas') as HTMLCanvasElement | null)?.toDataURL('image/png');
      if (!cleanUrl) {
        return;
      }
      const printBase =
        (await captureImageWithAnnotationsFromElement(element, {
          drawBase: true,
          drawAnnotations: false,
          viewport,
        })) || cleanUrl;
      const overlay = await captureImageWithAnnotationsFromElement(element, {
        drawBase: false,
        drawAnnotations: true,
        viewport,
      });
      const annotated =
        (await captureImageWithAnnotationsFromElement(element, {
          drawBase: true,
          drawAnnotations: true,
          viewport,
        })) || printBase;

      list.push({
        SeriesInstanceUID: seriesInstanceUID,
        SOPInstanceUID: sopUID,
        DataUrl: cleanUrl,
        DataUrlPrintBase: printBase,
        DataUrlAnnotated: annotated,
        DataUrlAnnotationOverlay: overlay || null,
        NumeroSerie: seriesNumber,
        DescrizioneSerie: seriesDescription,
        NumeroIstanza: frameNumber,
      });
      setIsFav(true);
      syncPreferitiPulse();
      uiNotificationService?.show?.({
        title: 'Preferiti',
        message: 'Aggiunto ai preferiti',
        type: 'success',
      });
      window.dispatchEvent(new Event('mdv-preferiti-updated'));
    },
    [
      resolveSopUID,
      imageIds,
      imageIndex,
      renderingEngine,
      cellId,
      seriesInstanceUID,
      seriesNumber,
      seriesDescription,
      instanceNumber,
      frameNumber,
      uiNotificationService,
    ]
  );

  return (
    <div className="montage-cell">
      <div
        ref={elementRef}
        className="montage-cell-element"
        onContextMenu={e => e.preventDefault()}
      />
      {isEmpty ? (
        <div className="montage-cell-empty" />
      ) : (
        <>
          <button
            type="button"
            className={`montage-cell-fav${isFav ? ' is-fav' : ''}`}
            title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            aria-label={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            onClick={onToggleFavorite}
            onPointerDown={e => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 2.5l2.81 6.06 6.69.62-5.04 4.43 1.49 6.39L12 16.98 6.05 20.4l1.49-6.39L2.5 9.18l6.69-.62L12 2.5z" />
            </svg>
          </button>
          <div className="montage-cell-overlay overlay-info-dicom">
            {instanceNumber != null && instanceNumber !== ''
              ? `I: ${instanceNumber} (${imageIndex + 1}/${total})`
              : `${imageIndex + 1}/${total}`}
          </div>
        </>
      )}
    </div>
  );
}

export default MontageCell;
