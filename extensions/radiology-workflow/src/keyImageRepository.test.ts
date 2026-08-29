import { KeyImageRepository } from './keyImageRepository';
import type { KeyValueStorage } from './hangingProtocolRepository';
import type { KeyImage } from './keyImages';

class MemoryStorage implements KeyValueStorage {
  value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
}

const image: KeyImage = { id: 'sop', studyInstanceUID: 'study', seriesInstanceUID: 'series', sopInstanceUID: 'sop', instanceNumber: 1, patientName: 'SYNTHETIC^TEST', patientId: 'SYN-TEST', studyDescription: 'TEST', modality: 'CT', capturedAt: '2026-08-29T10:00:00Z' };

describe('key image repository', () => {
  it('updates a capture when its annotation changes', () => {
    const storage = new MemoryStorage();
    const repository = new KeyImageRepository(storage);
    repository.upsert(image);
    repository.upsert({ ...image, annotation: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, label: 'updated' } });

    expect(repository.list()).toHaveLength(1);
    expect(repository.list()[0].annotation?.label).toBe('updated');
  });
});

