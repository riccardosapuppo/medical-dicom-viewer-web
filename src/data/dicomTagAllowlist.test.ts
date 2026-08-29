// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import dcmjs from 'dcmjs';
import { dicomTagAllowlist } from './dicomTagAllowlist';

describe('generated DICOM data', () => {
  it('contains only explicitly allowed tags', () => {
    const root = path.resolve('dicom/synthetic');
    const files = fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.dcm'));
    const unexpected = new Set<string>();

    for (const file of files) {
      const bytes = fs.readFileSync(path.join(file.parentPath, file.name));
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const data = dcmjs.data.DicomMessage.readFile(arrayBuffer);
      const tags = [
        ...Object.keys(data.meta).map(tag => tag.replace('x', '').toLowerCase()),
        ...Object.keys(data.dict).map(tag => tag.replace('x', '').toLowerCase()),
      ];
      tags.filter(tag => !dicomTagAllowlist.has(tag)).forEach(tag => unexpected.add(tag));
    }

    expect(files).toHaveLength(268);
    expect([...unexpected]).toEqual([]);
  });
});
