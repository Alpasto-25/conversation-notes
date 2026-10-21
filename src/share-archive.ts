function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
// PNG is already compressed; stored ZIP entries keep every exported pixel unchanged.
export function imageArchive(entries: { name: string; bytes: Uint8Array }[]) {
  const encoder = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0, centralSize = 0;
  if (!entries.length || entries.length > 1000) throw new Error('图片数量需在 1～1000 张之间。');
  if (new Set(entries.map(e => e.name)).size !== entries.length) throw new Error('图片文件名重复。');
  for (const entry of entries) {
    if (!/^page-\d{1,5}\.png$/.test(entry.name)) throw new Error('图片文件名无效。');
    const name = encoder.encode(entry.name), crc = crc32(entry.bytes);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, crc, true); view.setUint32(18, entry.bytes.length, true); view.setUint32(22, entry.bytes.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
    const index = new Uint8Array(46 + name.length), cv = new DataView(index.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, entry.bytes.length, true); cv.setUint32(24, entry.bytes.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); index.set(name, 46);
    local.push(header, entry.bytes); central.push(index); offset += header.length + entry.bytes.length; centralSize += index.length;
    if (offset + centralSize + 22 > 64 * 1024 * 1024) throw new Error('图片包超过 64 MB，请减少所选范围后导出。');
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const archive = new Uint8Array(offset + centralSize + end.length); let at = 0;
  for (const part of [...local, ...central, end]) { archive.set(part, at); at += part.length; }
  return archive;
}
