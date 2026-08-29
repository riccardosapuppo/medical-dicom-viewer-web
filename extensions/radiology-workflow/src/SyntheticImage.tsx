import { useEffect, useRef } from 'react';
import type { Study } from '../../../src/domain/study';

interface SyntheticImageProps {
  study: Study;
  slice?: number;
  compact?: boolean;
}

export function SyntheticImage({ study, slice = Math.floor(study.slices / 2), compact = false }: SyntheticImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(size, size);
    const phase = slice / Math.max(1, study.slices - 1);
    const bodyScale = study.bodyPart === 'CHEST' ? 0.86 : 0.72;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const nx = (x - size / 2) / (size / 2);
        const ny = (y - size / 2) / (size / 2);
        const radial = (nx * nx) / bodyScale ** 2 + (ny * ny) / 0.78 ** 2;
        const tissue = radial < 1 ? 95 + 78 * Math.cos(radial * Math.PI * 0.72) : 3;
        const feature =
          64 * Math.exp(-((nx + 0.25) ** 2 + (ny - 0.08) ** 2) * 42) +
          48 * Math.exp(-((nx - 0.28) ** 2 + (ny + 0.12) ** 2) * 48) -
          52 * Math.exp(-((nx * 1.8) ** 2 + (ny + 0.08) ** 2) * 18);
        const texture = ((x * 17 + y * 31 + slice * 13) % 17) - 8;
        const intensity = Math.max(0, Math.min(255, tissue + feature + texture + phase * 20));
        const offset = (y * size + x) * 4;
        image.data[offset] = intensity;
        image.data[offset + 1] = intensity;
        image.data[offset + 2] = study.modality === 'MR' ? Math.min(255, intensity * 1.07) : intensity;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [slice, study]);

  return <canvas ref={canvasRef} className={compact ? 'synthetic-image compact' : 'synthetic-image'} aria-label={`Synthetic ${study.modality} slice`} />;
}

