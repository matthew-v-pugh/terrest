// Checks uploaded images before they are stored and sent to every player.
//
// Clients send JPEG data URLs, but a modified client can send anything, so the
// bytes are parsed rather than trusted:
//   - the base64 must be well formed and actually decode to a JPEG,
//   - the dimensions in the frame header are capped, so a tiny file can't
//     declare a huge canvas and exhaust memory in every player's browser
//     (a "decompression bomb"),
//   - metadata segments (EXIF with GPS location, XMP, comments, embedded
//     thumbnails) are stripped before anyone else receives the image.
// The result is a fresh data URL built from the cleaned bytes, or null.

const PREFIX = 'data:image/jpeg;base64,';
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// Start-of-frame markers carry the image size: SOF0–3, 5–7, 9–11, 13–15.
// (0xC4 DHT, 0xC8 JPG and 0xCC DAC share the range but aren't frames.)
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
// APP1–APP15 hold EXIF, XMP, ICC, Photoshop data and the like; 0xFE is a comment.
// APP0 (JFIF) and APP14 (Adobe, which affects color decoding) are kept.
const isMetadata = (m) => (m >= 0xe1 && m <= 0xef && m !== 0xee) || m === 0xfe;

export function cleanJpegDataUrl(value, { maxSide, maxChars }) {
  if (typeof value !== 'string' || value.length > maxChars || !value.startsWith(PREFIX)) return null;
  const b64 = value.slice(PREFIX.length);
  if (b64.length % 4 !== 0 || !BASE64_RE.test(b64)) return null;
  const buf = Buffer.from(b64, 'base64');

  // SOI
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  const kept = [buf.subarray(0, 2)];
  let pos = 2;
  let size = null;
  for (;;) {
    if (pos >= buf.length || buf[pos] !== 0xff) return null;
    while (buf[pos] === 0xff) pos++; // markers may be preceded by fill bytes
    if (pos >= buf.length) return null;
    const marker = buf[pos];
    pos++;
    // Standalone markers have no length field; none are valid before SOS.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return null;
    if (pos + 2 > buf.length) return null;
    const len = buf.readUInt16BE(pos);
    if (len < 2 || pos + len > buf.length) return null;
    const segment = buf.subarray(pos - 2, pos + len); // marker + length + payload

    if (isSof(marker)) {
      if (size || len < 8) return null; // exactly one frame header
      const height = buf.readUInt16BE(pos + 3);
      const width = buf.readUInt16BE(pos + 5);
      // A height of 0 defers the real size to a later DNL marker; refuse it.
      if (!width || !height || width > maxSide || height > maxSide) return null;
      size = { width, height };
    }

    if (marker === 0xda) {
      // Start of scan: compressed image data runs from here to the end.
      if (!size) return null;
      kept.push(buf.subarray(pos - 2));
      break;
    }
    if (!isMetadata(marker)) kept.push(segment);
    pos += len;
  }

  const out = PREFIX + Buffer.concat(kept).toString('base64');
  return out.length <= maxChars ? out : null;
}
