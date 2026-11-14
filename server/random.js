// Randomness from the Web Crypto API, which Cloudflare Workers and Node share.

export const randomUUID = () => crypto.randomUUID();

// A uniform integer in [min, max). Values from the top of the 32-bit range that
// would skew the result (modulo bias) are thrown away and redrawn.
export function randomInt(min, max) {
  const range = max - min;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return min + (buf[0] % range);
}
