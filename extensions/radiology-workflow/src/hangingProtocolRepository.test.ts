import { HangingProtocolRepository, type KeyValueStorage } from './hangingProtocolRepository';
import type { SavedHangingProtocol } from './hangingProtocols';

class MemoryStorage implements KeyValueStorage {
  value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
}

const protocol: SavedHangingProtocol = {
  id: 'one', name: 'CT reading', scope: 'modality', matching: { modality: 'CT' }, createdAt: '2026-08-29T10:00:00Z',
  presentation: { gridLayout: '1x1', montageLayout: 'off', sliceIndex: 0, windowCenter: 40, windowWidth: 400, colormap: 'grayscale', framing: { fillRatio: 1, offsetXRatio: 0, offsetYRatio: 0 } },
};

describe('local hanging protocol repository', () => {
  it('persists, replaces and deletes saved protocols', () => {
    const storage = new MemoryStorage();
    const repository = new HangingProtocolRepository(storage);
    repository.save(protocol);
    repository.save({ ...protocol, name: 'Updated' });

    expect(repository.list()).toEqual([{ ...protocol, name: 'Updated' }]);
    repository.delete(protocol.id);
    expect(repository.list()).toEqual([]);
  });

  it('ignores corrupt local preferences', () => {
    const storage = new MemoryStorage();
    storage.value = '{not-json';
    expect(new HangingProtocolRepository(storage).list()).toEqual([]);
  });
});

