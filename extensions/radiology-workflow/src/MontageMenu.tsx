import { montageLayouts, type MontageLayoutId } from './montage';

interface MontageMenuProps {
  activeLayout: MontageLayoutId;
  onSelect(layout: MontageLayoutId): void;
}

export function MontageMenu({ activeLayout, onSelect }: MontageMenuProps) {
  return (
    <div className="montage-menu" role="menu" aria-label="Montage layouts">
      <header><strong>Viewport montage</strong><small>Subdivide the active viewport</small></header>
      <div className="montage-options">
        {montageLayouts.map(layout => (
          <button key={layout.id} type="button" role="menuitem" className={activeLayout === layout.id ? 'active' : ''} onClick={() => onSelect(layout.id)}>
            <span className="layout-glyph" style={{ gridTemplateRows: `repeat(${layout.rows}, 1fr)`, gridTemplateColumns: `repeat(${layout.columns}, 1fr)` }}>
              {Array.from({ length: layout.rows * layout.columns }, (_, index) => <i key={index} />)}
            </span>
            {layout.label}
          </button>
        ))}
      </div>
      <button className="montage-off" type="button" onClick={() => onSelect('off')}>Return to standard viewport</button>
    </div>
  );
}

