import type { SavedHangingProtocol } from './hangingProtocols';

const storageKey = 'medical-viewer.saved-hanging-protocols.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class HangingProtocolRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  list(): SavedHangingProtocol[] {
    const value = this.storage.getItem(storageKey);
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSavedHangingProtocol);
    } catch {
      return [];
    }
  }

  save(protocol: SavedHangingProtocol) {
    const protocols = this.list().filter(current => current.id !== protocol.id);
    this.storage.setItem(storageKey, JSON.stringify([...protocols, protocol]));
  }

  delete(id: string) {
    this.storage.setItem(storageKey, JSON.stringify(this.list().filter(protocol => protocol.id !== id)));
  }
}

function isSavedHangingProtocol(value: unknown): value is SavedHangingProtocol {
  if (!value || typeof value !== 'object') return false;
  const protocol = value as Partial<SavedHangingProtocol>;
  return (
    typeof protocol.id === 'string' &&
    typeof protocol.name === 'string' &&
    (protocol.scope === 'studyDescription' || protocol.scope === 'modality') &&
    typeof protocol.createdAt === 'string' &&
    Boolean(protocol.matching) &&
    Boolean(protocol.presentation)
  );
}

