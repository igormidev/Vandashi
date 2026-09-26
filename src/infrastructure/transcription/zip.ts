import { inflateRawSync } from 'node:zlib';
import { AppFault } from '../../domain/diagnostics';

/** Extract only a named executable from a digest-verified wheel, never arbitrary archive paths. */
export function wheelExecutable(archive: Buffer, name: string): Buffer {
  for (let cursor = 0; cursor + 46 <= archive.length; cursor++) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) continue;
    const nameLength = archive.readUInt16LE(cursor + 28);
    if (archive.subarray(cursor + 46, cursor + 46 + nameLength).toString() !== name) continue;
    const size = archive.readUInt32LE(cursor + 20);
    const expanded = archive.readUInt32LE(cursor + 24);
    const local = archive.readUInt32LE(cursor + 42);
    if (expanded > 100_000_000 || local + 30 > archive.length || archive.readUInt32LE(local) !== 0x04034b50)
      break;
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    if (start + size > archive.length) break;
    const data = archive.subarray(start, start + size);
    const method = archive.readUInt16LE(cursor + 10);
    const result =
      method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: 100_000_000 }) : null;
    if (!result || result.length !== expanded) break;
    return result;
  }
  throw new AppFault({ id: 'appTranscriptionSetupFailed' });
}
