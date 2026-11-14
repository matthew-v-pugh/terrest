// Shared pieces of the organic art: a seeded PRNG, the blob generator, and the
// role select arrangement (also painted into the Organic scene background).

// Small deterministic PRNG (mulberry32) so shapes are stable between renders.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A smooth closed blob in a 200×200 box: radial points jittered by `wobble`,
// joined with a Catmull-Rom spline.
export function blobPath(seed, lobes, wobble, stretchY = 1) {
  const rand = rng(seed);
  const pts = Array.from({ length: lobes }, (_, i) => {
    const angle = (i / lobes) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const r = 80 * (1 - wobble + rand() * wobble * 2) / (1 + wobble);
    return [100 + Math.cos(angle) * r, 100 + Math.sin(angle) * r * stretchY];
  });
  const n = pts.length;
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[(i - 1 + n) % n];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const [x3, y3] = pts[(i + 2) % n];
    d += ` C${f(x1 + (x2 - x0) / 6)},${f(y1 + (y2 - y0) / 6)} ${f(x2 - (x3 - x1) / 6)},${f(y2 - (y3 - y1) / 6)} ${f(x2)},${f(y2)}`;
  }
  return `${d} Z`;
}

// Design token values, for art that can't read CSS variables (data-URI SVG).
export const PALETTE = {
  ground: '#eee6d6',
  primary: '#35422d',
  field: '#694737',
  'art-accent': '#ad7d62',
  'surface-muted': '#ddd5c3',
  highlight: '#b9b28b',
  ink: '#29251d',
};

export const ROLE_BLOBS = [
  { name: 'terracotta', color: 'art-accent', seed: 3, lobes: 6, wobble: 0.24 },
  { name: 'grass', color: 'highlight', seed: 11, lobes: 5, wobble: 0.2, stretchY: 0.38 },
  { name: 'moss-a', color: 'primary', seed: 7, lobes: 7, wobble: 0.16 },
  { name: 'moss-b', color: 'primary', seed: 41, lobes: 5, wobble: 0.3 },
  { name: 'stone', color: 'surface-muted', seed: 23, lobes: 8, wobble: 0.14, stretchY: 0.62 },
  { name: 'clay', color: 'field', seed: 31, lobes: 6, wobble: 0.28 },
  { name: 'grass-b', color: 'highlight', seed: 57, lobes: 6, wobble: 0.22 },
];

// Contour lines: the lower set in a 420×220 box, the upper set in 320×160.
export const CONTOURS = [
  'M10 190 C70 120 150 170 210 110 S330 60 410 90',
  'M30 210 C90 150 165 196 230 138 S345 92 415 118',
  'M60 218 C110 182 180 214 248 166 S352 128 414 146',
];
export const CONTOURS_TOP = [
  'M5 30 C60 70 120 10 180 52 S280 96 315 40',
  'M15 58 C70 92 128 40 186 78 S282 118 312 72',
];

// A gentle arc of seeds in a 220×120 box.
export const SEEDS = Array.from({ length: 9 }, (_, i) => {
  const t = i / 8;
  return { cx: 10 + t * 200, cy: 95 - Math.sin(t * Math.PI) * 70, r: 3 + (i % 3) };
});
