import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import zlib from 'node:zlib';

import { listZipEntries, unzip } from './zip.mjs';

/**
 * Builds a zip by hand so the reader is tested against the byte layout rather
 * than against whatever library wrote the archive.
 */
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, contents, deflate } of files) {
    const raw = Buffer.from(contents);
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;
    const nameBytes = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);

  return Buffer.concat([localPart, centralPart, end]);
}

describe('unzip', () => {
  it('reads a stored entry', () => {
    const zip = buildZip([{ name: '1-001.dcm', contents: 'DICM stored', deflate: false }]);
    assert.deepEqual(
      unzip(zip).map(e => [e.name, e.data.toString()]),
      [['1-001.dcm', 'DICM stored']]
    );
  });

  it('reads a deflated entry', () => {
    const contents = 'DICM '.repeat(400);
    const zip = buildZip([{ name: '1-002.dcm', contents, deflate: true }]);
    const [entry] = unzip(zip);
    assert.equal(entry.data.toString(), contents);
  });

  it('reads several entries in order, mixing both methods', () => {
    const zip = buildZip([
      { name: 'a.dcm', contents: 'first', deflate: false },
      { name: 'b.dcm', contents: 'second '.repeat(80), deflate: true },
      { name: 'c.dcm', contents: 'third', deflate: true },
    ]);
    assert.deepEqual(
      unzip(zip).map(e => e.name),
      ['a.dcm', 'b.dcm', 'c.dcm']
    );
  });

  it('leaves directory entries out', () => {
    const zip = buildZip([
      { name: 'series/', contents: '', deflate: false },
      { name: 'series/a.dcm', contents: 'x', deflate: false },
    ]);
    assert.deepEqual(
      listZipEntries(zip).map(e => e.name),
      ['series/a.dcm']
    );
  });

  it('finds the record even when the archive ends with a comment', () => {
    const zip = Buffer.concat([
      buildZip([{ name: 'a.dcm', contents: 'x', deflate: false }]),
      Buffer.from('a trailing comment'),
    ]);
    // The comment length in the record is left at zero, which is what a
    // truncated or sloppily appended archive looks like; the scan still finds
    // the signature.
    assert.equal(unzip(zip)[0].data.toString(), 'x');
  });

  it('refuses something that is not a zip, instead of reading nonsense', () => {
    assert.throws(() => unzip(Buffer.alloc(200)), /no end of central directory/);
  });

  it('refuses a compression method it cannot honour', () => {
    const zip = buildZip([{ name: 'a.dcm', contents: 'x', deflate: false }]);
    zip.writeUInt16LE(99, 8);
    const central = zip.length - 22 - 46 - 5;
    zip.writeUInt16LE(99, central + 10);
    assert.throws(() => unzip(zip), /compression method 99/);
  });
});
