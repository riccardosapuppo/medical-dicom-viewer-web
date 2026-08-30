/**
 * Just enough of the ZIP format to unpack what the archive sends back.
 *
 * The alternative was a dependency, and this repository has none: the only
 * archives it ever opens are the ones the imaging archive produces, which are a
 * flat list of files that are either stored or deflated. Anything outside that
 * is refused loudly rather than half-read.
 */
import zlib from 'node:zlib';

const SIGNATURE = {
  endOfCentralDirectory: 0x06054b50,
  centralFileHeader: 0x02014b50,
  localFileHeader: 0x04034b50,
};

const METHOD = { stored: 0, deflated: 8 };

/** The end of central directory record, found by scanning back past any comment. */
function findEndOfCentralDirectory(buffer) {
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let at = buffer.length - 22; at >= earliest; at--) {
    if (buffer.readUInt32LE(at) === SIGNATURE.endOfCentralDirectory) {
      return at;
    }
  }
  throw new Error('not a zip file: no end of central directory record');
}

/**
 * Lists the files in a zip, without decompressing them. Directory entries are
 * left out: the archive stores paths in the file names anyway.
 */
export function listZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);

  if (at === 0xffffffff || entryCount === 0xffff) {
    throw new Error('zip64 archives are not supported');
  }

  const entries = [];
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(at) !== SIGNATURE.centralFileHeader) {
      throw new Error(`corrupt zip: expected a central file header at byte ${at}`);
    }
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const uncompressedSize = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localHeaderOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);

    if (!name.endsWith('/')) {
      entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Decompresses one entry returned by listZipEntries. */
export function readZipEntry(buffer, entry) {
  const { localHeaderOffset, method, compressedSize, uncompressedSize, name } = entry;

  if (buffer.readUInt32LE(localHeaderOffset) !== SIGNATURE.localFileHeader) {
    throw new Error(`corrupt zip: no local header for ${name}`);
  }
  // The local header repeats the name and extra field, and their lengths can
  // differ from the ones in the central directory, so they are read again here.
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const start = localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + compressedSize);

  if (method === METHOD.stored) {
    return Buffer.from(compressed);
  }
  if (method === METHOD.deflated) {
    const data = zlib.inflateRawSync(compressed);
    if (data.length !== uncompressedSize) {
      throw new Error(`${name} unpacked to ${data.length} bytes, expected ${uncompressedSize}`);
    }
    return data;
  }
  throw new Error(`${name} uses compression method ${method}, which is not supported`);
}

/** Every file in the archive, as name and contents. */
export function unzip(buffer) {
  return listZipEntries(buffer).map(entry => ({
    name: entry.name,
    data: readZipEntry(buffer, entry),
  }));
}
