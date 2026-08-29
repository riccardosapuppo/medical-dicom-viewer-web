import type { KeyImage } from './keyImages';
import type { KeyValueStorage } from './hangingProtocolRepository';

const storageKey = 'medical-viewer.key-images.v1';

export class KeyImageRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  list(): KeyImage[] {
    const value = this.storage.getItem(storageKey);
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(isKeyImage) : [];
    } catch {
      return [];
    }
  }

  upsert(image: KeyImage) {
    this.storage.setItem(storageKey, JSON.stringify([...this.list().filter(current => current.id !== image.id), image]));
  }

  delete(id: string) {
    this.storage.setItem(storageKey, JSON.stringify(this.list().filter(image => image.id !== id)));
  }
}

function isKeyImage(value: unknown): value is KeyImage {
  if (!value || typeof value !== 'object') return false;
  const image = value as Partial<KeyImage>;
  return typeof image.id === 'string' && typeof image.studyInstanceUID === 'string' && typeof image.sopInstanceUID === 'string' && typeof image.instanceNumber === 'number';
}

