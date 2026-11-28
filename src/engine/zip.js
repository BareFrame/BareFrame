const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Create a standard PKZIP 2.0 archive buffer from [{ name, data }].
 * Compatible with Windows Explorer, PowerShell Expand-Archive, 7-Zip, and extractZip().
 */
function createZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanName = String(entry.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanName || cleanName.includes('..') || cleanName.includes(':')) {
      throw new Error(`Unsafe zip entry path: ${entry.name}`);
    }
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const deflated = zlib.deflateRawSync(rawBuf, { level: 9 });
    const useDeflate = deflated.length < rawBuf.length;
    const payload = useDeflate ? deflated : rawBuf;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(rawBuf);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // Local file header signature
    lfh.writeUInt16LE(20, 4);         // Version needed (2.0)
    lfh.writeUInt16LE(0x0800, 6);     // UTF-8 filename flag
    lfh.writeUInt16LE(method, 8);     // Compression method
    lfh.writeUInt16LE(0, 10);         // Mod time
    lfh.writeUInt16LE(0x5421, 12);    // Mod date (2022-01-01 deterministic)
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(payload.length, 18);
    lfh.writeUInt32LE(rawBuf.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);         // Extra length

    localChunks.push(lfh, nameBuf, payload);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    cdh.writeUInt16LE(20, 4);         // Version made by
    cdh.writeUInt16LE(20, 6);         // Version needed
    cdh.writeUInt16LE(0x0800, 8);     // UTF-8 filename flag
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x5421, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(payload.length, 20);
    cdh.writeUInt32LE(rawBuf.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);         // Extra length
    cdh.writeUInt16LE(0, 32);         // Comment length
    cdh.writeUInt16LE(0, 34);         // Disk start
    cdh.writeUInt16LE(0, 36);         // Internal attrs
    cdh.writeUInt32LE(0, 38);         // External attrs
    cdh.writeUInt32LE(offset, 42);    // Local header offset

    centralChunks.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralBuf, eocd]);
}

/**
 * Extract a standard ZIP archive safely into destDir with Zip-Slip protection and CRC32 verification.
 */
function extractZip(zipBuf, destDir) {
  if (!Buffer.isBuffer(zipBuf) || zipBuf.length < 22) {
    throw new Error('Invalid or truncated ZIP archive');
  }

  // Locate End of Central Directory (EOCD)
  const minPos = Math.max(0, zipBuf.length - 65557);
  let eocdPos = -1;
  for (let i = zipBuf.length - 22; i >= minPos; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) {
    throw new Error('ZIP End-of-Central-Directory record not found');
  }

  const entryCount = zipBuf.readUInt16LE(eocdPos + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdPos + 16);
  const resolvedRoot = path.resolve(destDir);
  fs.mkdirSync(resolvedRoot, { recursive: true });

  const extracted = [];
  let cursor = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > zipBuf.length || zipBuf.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Corrupted ZIP central directory');
    }

    const method = zipBuf.readUInt16LE(cursor + 10);
    const expectedCrc = zipBuf.readUInt32LE(cursor + 16);
    const compSize = zipBuf.readUInt32LE(cursor + 20);
    const uncompSize = zipBuf.readUInt32LE(cursor + 24);
    const nameLen = zipBuf.readUInt16LE(cursor + 28);
    const extraLen = zipBuf.readUInt16LE(cursor + 30);
    const commentLen = zipBuf.readUInt16LE(cursor + 32);
    const localOffset = zipBuf.readUInt32LE(cursor + 42);

    const rawName = zipBuf.slice(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    cursor += 46 + nameLen + extraLen + commentLen;

    const normName = rawName.replace(/\\/g, '/');
    if (normName.endsWith('/')) continue;

    if (
      !normName ||
      normName.startsWith('/') ||
      normName.includes('\0') ||
      normName.includes(':') ||
      normName.split('/').includes('..')
    ) {
      throw new Error(`Rejected unsafe ZIP entry path: ${rawName}`);
    }

    const targetPath = path.resolve(resolvedRoot, normName);
    if (!targetPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Path traversal blocked: ${rawName}`);
    }

    if (localOffset + 30 > zipBuf.length || zipBuf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local file header for ${rawName}`);
    }

    const lfhNameLen = zipBuf.readUInt16LE(localOffset + 26);
    const lfhExtraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lfhNameLen + lfhExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > zipBuf.length) {
      throw new Error(`Truncated ZIP entry data for ${rawName}`);
    }

    const compSlice = zipBuf.slice(dataStart, dataEnd);
    let data;
    if (method === 0) {
      data = compSlice;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compSlice);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${rawName}`);
    }

    if (data.length !== uncompSize) {
      throw new Error(`Size mismatch extracting ${rawName}`);
    }
    if (crc32(data) !== expectedCrc) {
      throw new Error(`CRC32 checksum mismatch for ${rawName}`);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, data);
    extracted.push(normName);
  }

  return extracted;
}

module.exports = { createZip, extractZip, crc32 };
