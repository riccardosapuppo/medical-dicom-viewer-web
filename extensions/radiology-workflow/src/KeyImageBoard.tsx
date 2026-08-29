import { syntheticStudies } from './syntheticStudies';
import { formatPatientName } from './format';
import type { KeyImage } from './keyImages';
import { AnnotationOverlay } from './AnnotationOverlay';
import { SyntheticImage } from './SyntheticImage';

interface KeyImageBoardProps {
  images: KeyImage[];
  onDelete(id: string): void;
  onClose(): void;
}

export function KeyImageBoard({ images, onDelete, onClose }: KeyImageBoardProps) {
  return (
    <div className="modal-backdrop key-image-backdrop" role="presentation">
      <section className="key-image-board" role="dialog" aria-modal="true" aria-labelledby="key-image-title">
        <header><div><p className="eyebrow">Reading output</p><h2 id="key-image-title">Key image board</h2><span>{images.length} selected images from the local session</span></div><div><button type="button" onClick={() => window.print()} disabled={!images.length}>Print preview</button><button type="button" aria-label="Close key image board" onClick={onClose}>×</button></div></header>
        <div className="print-heading"><strong>Radiology key images</strong><span>Synthetic demonstration · Not for diagnosis</span></div>
        <div className="key-image-grid">
          {!images.length && <div className="key-image-empty"><span>☆</span><strong>No key images selected</strong><small>Return to the viewer and mark an image from the toolbar.</small></div>}
          {images.map(image => {
            const study = syntheticStudies.find(candidate => candidate.studyInstanceUID === image.studyInstanceUID);
            if (!study) return null;
            return (
              <article className="key-image-card" key={image.id}>
                <div className="key-image-canvas"><SyntheticImage study={study} slice={image.instanceNumber - 1} /><AnnotationOverlay annotation={image.annotation} /><span>{image.modality} · IM {image.instanceNumber}</span></div>
                <div className="key-image-caption"><div><strong>{formatPatientName(image.patientName)}</strong><span>{image.patientId} · {image.studyDescription}</span></div><button type="button" aria-label={`Remove image ${image.instanceNumber}`} onClick={() => onDelete(image.id)}>Remove</button></div>
              </article>
            );
          })}
        </div>
        <footer><span>Images and annotation overlays are composed by this extension.</span><button type="button" onClick={onClose}>Return to viewer</button></footer>
      </section>
    </div>
  );
}
