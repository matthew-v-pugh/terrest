// Limits for uploaded images, shared so the client's resizer and the server's
// validator can't drift apart. The client always re-encodes uploads as JPEG
// data URLs that fit within these limits; the server rejects anything else.
export const UPLOAD_LIMITS = {
  background: { maxSide: 1600, maxChars: 450_000 },
  table: { maxSide: 720, maxChars: 200_000 },
  portrait: { maxSide: 160, maxChars: 150_000 },
};

// The largest file the browser will even try to decode before resizing.
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;
