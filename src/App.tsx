import extension from '../extensions/radiology-workflow/src';
import mode from '../modes/radiology-workflow/src';

export function App() {
  return (
    <main className="launch-shell">
      <section className="launch-card">
        <p className="eyebrow">OHIF distribution</p>
        <h1>Radiology Workflow Viewer</h1>
        <p>
          The local host is ready for the <strong>{mode.displayName}</strong> mode and the{' '}
          <strong>{extension.id}</strong> extension.
        </p>
        <div className="launch-status" role="status">
          <span aria-hidden="true" />
          Synthetic worklist loading
        </div>
      </section>
    </main>
  );
}

