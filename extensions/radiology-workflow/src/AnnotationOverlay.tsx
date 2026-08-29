import type { LengthAnnotation } from './keyImages';

export function AnnotationOverlay({ annotation }: { annotation?: LengthAnnotation }) {
  if (!annotation) return null;
  return (
    <svg className="annotation-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={annotation.label}>
      <line x1={annotation.start.x * 100} y1={annotation.start.y * 100} x2={annotation.end.x * 100} y2={annotation.end.y * 100} />
      <circle cx={annotation.start.x * 100} cy={annotation.start.y * 100} r="0.9" />
      <circle cx={annotation.end.x * 100} cy={annotation.end.y * 100} r="0.9" />
      <text x={annotation.end.x * 100 + 1.5} y={annotation.end.y * 100 - 1.5}>{annotation.label}</text>
    </svg>
  );
}

