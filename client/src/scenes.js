// The scene backgrounds. Every scene is the role select arrangement of organic
// forms, recoloured to suggest a place rather than paint it. Each is drawn once
// as an SVG at the role select's reference size and used as a CSS background,
// so the table, the character creator and every preview share one picture.
import {
  CONTOURS, CONTOURS_TOP, PALETTE, ROLE_BLOBS, SEEDS, blobPath,
} from './organic.js';

const W = 1280;
const H = 820;
const r1 = (v) => Math.round(v * 10) / 10;

// Colours per scene, by the same roles as the design tokens. `line` draws the
// contours and `seeds` the arc of dots.
const PALETTES = {
  organic: { ...PALETTE, line: PALETTE.ink, seeds: PALETTE.field },
  lava: {
    ground: '#2b2421',
    primary: '#7a2412',
    field: '#a8361a',
    'art-accent': '#e0782e',
    'surface-muted': '#3a2f2a',
    highlight: '#c2582a',
    line: '#f0a35a',
    seeds: '#f0a35a',
  },
  space: {
    ground: '#0d0c14',
    primary: '#2b2752',
    field: '#4a3550',
    'art-accent': '#8a6a5a',
    'surface-muted': '#1a1926',
    highlight: '#3d4a6b',
    line: '#ddd5c3',
    seeds: '#f5eddf',
  },
  ocean: {
    ground: '#1f5a85',
    primary: '#173f2f',
    field: '#123552',
    'art-accent': '#2b5e3f',
    'surface-muted': '#1a4c72',
    highlight: '#24636a',
    line: '#e6f4fb',
    seeds: '#e6f4fb',
  },
};

// A blob `size` across (its 200-unit box), centred on x, y.
function blob({ x, y, size, rot = 0, seed, lobes = 6, wobble = 0.22, stretchY = 1, fill }) {
  return `<path transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(rot)}) scale(${(size / 200).toFixed(3)}) translate(-100 -100)" d="${blobPath(seed, lobes, wobble, stretchY)}" fill="${fill}"/>`;
}

// Centre x, centre y, width and rotation of each role select blob at 1280×820.
const ROLE_PLACES = {
  terracotta: [148, 153, 92, -14],
  grass: [1107, 496, 270, 18],
  'moss-a': [1077, 717, 74, 6],
  'moss-b': [1140, 663, 36, -30],
  stone: [587, 780, 380, -6],
  clay: [73, 413, 56, 22],
  'grass-b': [654, 5, 130, -10],
};

function paint(c) {
  const lines = (paths) => paths.map((d) => `<path d="${d}"/>`).join('');
  return [
    `<rect width="${W}" height="${H}" fill="${c.ground}"/>`,
    // The two large corner forms and their offset companions.
    blob({ x: 40, y: 780, size: 450, rot: -8, seed: 5, lobes: 8, wobble: 0.08, stretchY: 0.83, fill: c.primary }),
    blob({ x: 290, y: 740, size: 175, rot: -8, seed: 13, lobes: 6, wobble: 0.1, stretchY: 0.57, fill: c.highlight }),
    blob({ x: 1240, y: 35, size: 375, rot: 12, seed: 17, lobes: 7, wobble: 0.1, stretchY: 0.83, fill: c.field }),
    blob({ x: 1030, y: 185, size: 125, rot: 12, seed: 19, lobes: 6, wobble: 0.1, stretchY: 0.5, fill: c['art-accent'] }),
    ...ROLE_BLOBS.map((b) => {
      const [x, y, size, rot] = ROLE_PLACES[b.name];
      return blob({ ...b, x, y, size, rot, fill: c[b.color] });
    }),
    `<g fill="none" stroke="${c.line}" stroke-opacity="0.22" stroke-width="1.2">`,
    `<g transform="translate(13 575)">${lines(CONTOURS)}</g>`,
    `<g transform="translate(762 41) scale(0.9375)">${lines(CONTOURS_TOP)}</g>`,
    '</g>',
    `<g transform="translate(269 66) scale(0.864)" fill="${c.seeds}" opacity="0.5">`,
    ...SEEDS.map((s) => `<circle cx="${r1(s.cx)}" cy="${r1(s.cy)}" r="${s.r}"/>`),
    '</g>',
  ].join('');
}

const cache = {};

// The CSS `background` value for a preset scene id.
export function sceneCss(id) {
  const key = id in PALETTES ? id : 'organic';
  if (!cache[key]) {
    const c = PALETTES[key];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${paint(c)}</svg>`;
    cache[key] = `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / cover no-repeat, ${c.ground}`;
  }
  return cache[key];
}
