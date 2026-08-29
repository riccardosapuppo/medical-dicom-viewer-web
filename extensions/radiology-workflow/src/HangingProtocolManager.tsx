import { useMemo, useState } from 'react';
import type { Study } from './study';
import {
  applicableHangingProtocols,
  captureHangingProtocol,
  viewportGridLayouts,
  type ProtocolScope,
  type SavedHangingProtocol,
  type ViewerPresentationState,
} from './hangingProtocols';

interface HangingProtocolManagerProps {
  study: Study;
  presentation: ViewerPresentationState;
  protocols: SavedHangingProtocol[];
  onSave(protocol: SavedHangingProtocol): void;
  onDelete(id: string): void;
  onApply(protocol: SavedHangingProtocol, mode: 'full' | 'gridOnly'): void;
  onClose(): void;
}

export function HangingProtocolManager({ study, presentation, protocols, onSave, onDelete, onApply, onClose }: HangingProtocolManagerProps) {
  const [name, setName] = useState(`${study.modality} ${study.bodyPart.toLocaleLowerCase()} reading`);
  const [scope, setScope] = useState<ProtocolScope>('studyDescription');
  const applicable = useMemo(() => applicableHangingProtocols(protocols, study), [protocols, study]);
  const save = () => {
    if (!name.trim()) return;
    const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    onSave(captureHangingProtocol(randomId, name, scope, study, presentation));
    setName('');
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="protocol-manager" role="dialog" aria-modal="true" aria-labelledby="protocol-manager-title">
        <header><div><p className="eyebrow">Adaptive layout</p><h2 id="protocol-manager-title">Hanging Protocol Manager</h2></div><button type="button" aria-label="Close Hanging Protocol Manager" onClick={onClose}>×</button></header>
        <div className="protocol-current">
          <span>Current viewer state</span>
          <div><strong>{viewportGridLayouts[presentation.gridLayout].label}</strong><small>Main grid</small></div>
          <div><strong>{presentation.montageLayout === 'off' ? 'Off' : presentation.montageLayout}</strong><small>Montage</small></div>
          <div><strong>{presentation.sliceIndex + 1}</strong><small>Exact image</small></div>
          <div><strong>W {presentation.windowWidth} / L {presentation.windowCenter}</strong><small>VOI</small></div>
        </div>
        <div className="protocol-capture">
          <label>Protocol name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. CT head reading" /></label>
          <label>Apply to<select value={scope} onChange={event => setScope(event.target.value as ProtocolScope)}><option value="studyDescription">This exam description</option><option value="modality">All {study.modality} studies</option></select></label>
          <button type="button" onClick={save} disabled={!name.trim()}>Capture current arrangement</button>
        </div>
        <div className="protocol-list-heading"><div><strong>Applicable protocols</strong><small>Exact exam matches are shown before modality matches.</small></div><span>{applicable.length}</span></div>
        <div className="protocol-list">
          {applicable.length === 0 && <div className="protocol-empty"><strong>No saved protocol applies to this study</strong><span>Capture the current arrangement to create one.</span></div>}
          {applicable.map(({ protocol, relevance }) => (
            <article key={protocol.id} className="protocol-card">
              <div><span className={relevance === 200 ? 'match exact' : 'match'}>{relevance === 200 ? 'Exact exam' : `${study.modality} modality`}</span><strong>{protocol.name}</strong><small>{viewportGridLayouts[protocol.presentation.gridLayout].label} grid · Montage {protocol.presentation.montageLayout} · Image {protocol.presentation.sliceIndex + 1}</small></div>
              <div className="protocol-actions"><button type="button" onClick={() => onApply(protocol, 'full')}>Apply full</button><button type="button" onClick={() => onApply(protocol, 'gridOnly')}>Grid only</button><button className="delete" type="button" aria-label={`Delete ${protocol.name}`} onClick={() => onDelete(protocol.id)}>Delete</button></div>
            </article>
          ))}
        </div>
        <footer>Stored only in this browser profile. No account or external preference service is used.</footer>
      </section>
    </div>
  );
}
