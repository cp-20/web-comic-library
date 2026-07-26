export type ProfileIconUpload = Readonly<{
  bytes: Uint8Array;
  contentType: string;
}>;

export interface ProfileIconStorage {
  put(userUuid: string, contentType: 'image/png', bytes: Uint8Array): Promise<string>;
}

const maxBytes = 2 * 1024 * 1024;
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const decoder = new TextDecoder('ascii', { fatal: true });

const readUint32 = (bytes: Uint8Array, offset: number): number => {
  return (
    bytes[offset]! * 2 ** 24 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
};

export const sanitizeProfileIcon = (upload: ProfileIconUpload): Uint8Array => {
  if (upload.contentType !== 'image/png') throw new Error('profile icon must be a PNG image');
  if (upload.bytes.byteLength < 33 || upload.bytes.byteLength > maxBytes) {
    throw new Error('profile icon size is invalid');
  }
  if (!pngSignature.every((value, index) => upload.bytes[index] === value)) {
    throw new Error('profile icon PNG signature is invalid');
  }
  const chunks: Uint8Array[] = [upload.bytes.slice(0, 8)];
  let offset = 8;
  let width = 0;
  let height = 0;
  let seenData = false;
  let seenHeader = false;
  let seenEnd = false;
  while (offset + 12 <= upload.bytes.byteLength) {
    const length = readUint32(upload.bytes, offset);
    const end = offset + length + 12;
    if (end > upload.bytes.byteLength) throw new Error('profile icon PNG is truncated');
    const type = decoder.decode(upload.bytes.slice(offset + 4, offset + 8));
    if (type === 'IHDR') {
      if (seenHeader || length !== 13 || offset !== 8) {
        throw new Error('profile icon PNG header is invalid');
      }
      width = readUint32(upload.bytes, offset + 8);
      height = readUint32(upload.bytes, offset + 12);
      if (width < 1 || height < 1 || width > 512 || height > 512) {
        throw new Error('profile icon dimensions must be between 1 and 512 pixels');
      }
      seenHeader = true;
    }
    if (type === 'IDAT') {
      if (!seenHeader || seenEnd) throw new Error('profile icon PNG data is invalid');
      seenData = true;
    }
    if (type === 'IHDR' || type === 'IDAT' || type === 'IEND')
      chunks.push(upload.bytes.slice(offset, end));
    if (type === 'IEND') {
      if (!seenHeader || !seenData || length !== 0 || end !== upload.bytes.byteLength) {
        throw new Error('profile icon PNG has trailing bytes');
      }
      seenEnd = true;
      break;
    }
    offset = end;
  }
  if (!seenHeader || !seenData || !seenEnd) throw new Error('profile icon PNG is incomplete');
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const sanitized = new Uint8Array(length);
  let writeOffset = 0;
  for (const chunk of chunks) {
    sanitized.set(chunk, writeOffset);
    writeOffset += chunk.byteLength;
  }
  return sanitized;
};

export const uploadProfileIcon = async (
  storage: ProfileIconStorage,
  userUuid: string,
  upload: ProfileIconUpload,
): Promise<string> => storage.put(userUuid, 'image/png', sanitizeProfileIcon(upload));
