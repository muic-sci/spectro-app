/**
 * A tiny, dependency-free ZIP reader/writer using the STORE (no-compression)
 * method. Our payloads are a JSON text file plus already-compressed image
 * binaries (PNG/JPEG), so DEFLATE would buy almost nothing — STORE keeps this
 * module small and avoids pulling a zip dependency into a deliberately lean app.
 *
 * Only what the export/import bundle needs is implemented: build an archive
 * from named byte entries, and read STORE entries back out via the central
 * directory. Compressed (non-STORE) entries are not inflated.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// Standard CRC-32 (polynomial 0xEDB88320), table built once.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Build a STORE-method ZIP archive from named byte entries. */
export function zipSync(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const files = entries.map((e) => {
    const nameBytes = encoder.encode(e.name);
    return { nameBytes, data: e.data, crc: crc32(e.data), offset: 0 };
  });

  let size = 0;
  for (const f of files) size += 30 + f.nameBytes.length + f.data.length; // local headers + data
  for (const f of files) size += 46 + f.nameBytes.length; // central directory
  size += 22; // end of central directory

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let off = 0;

  // Local file headers + data.
  for (const f of files) {
    f.offset = off;
    view.setUint32(off, LOCAL_SIG, true);
    view.setUint16(off + 4, 20, true); // version needed
    view.setUint16(off + 6, 0, true); // flags
    view.setUint16(off + 8, 0, true); // method = STORE
    view.setUint16(off + 10, 0, true); // mod time
    view.setUint16(off + 12, 0, true); // mod date
    view.setUint32(off + 14, f.crc, true);
    view.setUint32(off + 18, f.data.length, true); // compressed size
    view.setUint32(off + 22, f.data.length, true); // uncompressed size
    view.setUint16(off + 26, f.nameBytes.length, true);
    view.setUint16(off + 28, 0, true); // extra length
    off += 30;
    out.set(f.nameBytes, off);
    off += f.nameBytes.length;
    out.set(f.data, off);
    off += f.data.length;
  }

  // Central directory.
  const cdStart = off;
  for (const f of files) {
    view.setUint32(off, CENTRAL_SIG, true);
    view.setUint16(off + 4, 20, true); // version made by
    view.setUint16(off + 6, 20, true); // version needed
    view.setUint16(off + 8, 0, true); // flags
    view.setUint16(off + 10, 0, true); // method = STORE
    view.setUint16(off + 12, 0, true); // mod time
    view.setUint16(off + 14, 0, true); // mod date
    view.setUint32(off + 16, f.crc, true);
    view.setUint32(off + 20, f.data.length, true); // compressed size
    view.setUint32(off + 24, f.data.length, true); // uncompressed size
    view.setUint16(off + 28, f.nameBytes.length, true);
    view.setUint16(off + 30, 0, true); // extra length
    view.setUint16(off + 32, 0, true); // comment length
    view.setUint16(off + 34, 0, true); // disk number
    view.setUint16(off + 36, 0, true); // internal attrs
    view.setUint32(off + 38, 0, true); // external attrs
    view.setUint32(off + 42, f.offset, true); // local header offset
    off += 46;
    out.set(f.nameBytes, off);
    off += f.nameBytes.length;
  }

  // End of central directory.
  view.setUint32(off, EOCD_SIG, true);
  view.setUint16(off + 4, 0, true); // disk number
  view.setUint16(off + 6, 0, true); // disk with central directory
  view.setUint16(off + 8, files.length, true); // entries on this disk
  view.setUint16(off + 10, files.length, true); // total entries
  view.setUint32(off + 12, off - cdStart, true); // central directory size
  view.setUint32(off + 16, cdStart, true); // central directory offset
  view.setUint16(off + 20, 0, true); // comment length

  return out;
}

/** True if the bytes begin with a ZIP local-file-header signature. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Read STORE-method entries from a ZIP archive via its central directory.
 * Throws if an entry uses an unsupported compression method.
 */
export function unzipSync(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view, bytes.length);
  if (eocd < 0) throw new Error("Not a ZIP archive (no end-of-central-directory record).");

  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true); // central directory offset
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(off, true) !== CENTRAL_SIG) throw new Error("Corrupt ZIP central directory.");
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    if (method !== 0) throw new Error(`Unsupported ZIP compression for "${name}".`);

    const lhNameLen = view.getUint16(localOff + 26, true);
    const lhExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    entries.push({ name, data: bytes.subarray(dataStart, dataStart + compSize) });

    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function findEocd(view: DataView, length: number): number {
  // EOCD is 22 bytes plus an optional comment (≤ 65535). Scan back from the end.
  const minStart = Math.max(0, length - (22 + 0xffff));
  for (let i = length - 22; i >= minStart; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}
