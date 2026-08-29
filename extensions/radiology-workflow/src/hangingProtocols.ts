import type { Study } from '../../../src/domain/study';
import type { MontageLayoutId } from './montage';
import type { RelativeFraming } from './relativeFraming';

export type ProtocolScope = 'studyDescription' | 'modality';
export type ViewportGridLayoutId = '1x1' | '1x2' | '2x2';

export interface ViewerPresentationState {
  gridLayout: ViewportGridLayoutId;
  montageLayout: MontageLayoutId;
  sliceIndex: number;
  windowCenter: number;
  windowWidth: number;
  colormap: 'grayscale' | 'inverse';
  framing: RelativeFraming;
}

export interface SavedHangingProtocol {
  id: string;
  name: string;
  scope: ProtocolScope;
  matching: {
    studyDescription?: string;
    modality?: string;
  };
  presentation: ViewerPresentationState;
  createdAt: string;
}

export const viewportGridLayouts: Record<ViewportGridLayoutId, { rows: number; columns: number; label: string }> = {
  '1x1': { rows: 1, columns: 1, label: '1 × 1' },
  '1x2': { rows: 1, columns: 2, label: '1 × 2' },
  '2x2': { rows: 2, columns: 2, label: '2 × 2' },
};

export function captureHangingProtocol(
  id: string,
  name: string,
  scope: ProtocolScope,
  study: Study,
  presentation: ViewerPresentationState,
  createdAt = new Date().toISOString()
): SavedHangingProtocol {
  return {
    id,
    name: name.trim(),
    scope,
    matching:
      scope === 'studyDescription'
        ? { studyDescription: study.description }
        : { modality: study.modality },
    presentation: structuredClone(presentation),
    createdAt,
  };
}

export function protocolRelevance(protocol: SavedHangingProtocol, study: Study) {
  if (protocol.matching.studyDescription === study.description) return 200;
  if (protocol.matching.modality === study.modality) return 100;
  return 0;
}

export function applicableHangingProtocols(protocols: SavedHangingProtocol[], study: Study) {
  return protocols
    .map(protocol => ({ protocol, relevance: protocolRelevance(protocol, study) }))
    .filter(result => result.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance || right.protocol.createdAt.localeCompare(left.protocol.createdAt));
}

export function applyHangingProtocol(
  current: ViewerPresentationState,
  protocol: SavedHangingProtocol,
  mode: 'full' | 'gridOnly'
): ViewerPresentationState {
  if (mode === 'full') return structuredClone(protocol.presentation);
  return {
    ...current,
    gridLayout: protocol.presentation.gridLayout,
    montageLayout: protocol.presentation.montageLayout,
  };
}

