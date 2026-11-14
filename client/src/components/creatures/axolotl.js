// Axolotl: a soft, stubby-legged salamander. Walks on a bending spine in the
// lizard's diagonal gait, with three feathery gills either side of its broad
// head that sway as it goes, and a pale fin running round its tail.
import {
  INK, add, dist, fillOutline, jointPoint, polar, resolveChain, solveTwoBone, stepGait, strokeLimb, wrap,
} from './common.js';

const SKIN = '#e8b4ad';
const SPECK = '#c98a86';
const GILL = '#c4566a';
const FIN = '#f4d3cc';
const SIZE = 1.2;
const JOINTS = 12;
const LINK = 36;
const MAX_BEND = Math.PI / 8;
const BODY = [28, 30, 21, 23, 24, 23.5, 21, 17, 13, 9, 6, 3.5]; // half-widths, head first (unscaled)
const TAIL_FIN = [0, 0, 0, 0, 0, 0, 24, 25, 23, 19, 14, 8]; // fin half-widths along the tail
const LEGS = [
  { joint: 2, side: 1, group: 0 },
  { joint: 2, side: -1, group: 1 },
  { joint: 6, side: 1, group: 1 },
  { joint: 6, side: -1, group: 0 },
];
const UPPER = 25;
const LOWER = 22;
// Three gills a side, fanning out from the back of the head: where each leaves
// the head and which way it points (both as fractions of π from the heading),
// and how long it is.
const GILLS = [[0.5, 0.42, 30], [0.58, 0.56, 36], [0.66, 0.7, 30]];

const bodyPoint = (s, i, turn, extra = 0) => jointPoint(s.joints, s.angles, i, turn, (BODY[i] + extra) * s.scale);
const footTarget = (s, leg) => bodyPoint(s, leg.joint, leg.side * Math.PI / 3.5, 34);
const shoulder = (s, leg) => bodyPoint(s, leg.joint, leg.side * Math.PI / 2, -5);
const stride = (s) => (UPPER + LOWER) * 0.9 * s.scale;

function create(x, y, canvasScale, heading = 0) {
  const scale = canvasScale * SIZE;
  const link = LINK * scale;
  const joints = Array.from({ length: JOINTS }, (_, i) => add({ x, y }, polar(heading, -i * link)));
  const s = { scale, link, joints, angles: new Array(JOINTS).fill(heading), heading, speed: 0, t: 0, legs: [] };
  s.legs = LEGS.map((leg) => {
    const foot = add(footTarget(s, leg), polar(heading, leg.group ? -stride(s) / 2 : 0));
    return { ...leg, foot: { ...foot }, planted: { ...foot } };
  });
  return s;
}

function update(s, target, dt) {
  const k = s.scale / (0.42 * SIZE);
  s.t += dt / 60;
  const head = s.joints[0];
  const toTarget = dist(head, target);
  const turn = wrap(Math.atan2(target.y - head.y, target.x - head.x) - s.heading);
  s.heading += Math.max(-0.06 * dt, Math.min(0.06 * dt, turn));

  const wanted = toTarget < 26 * k ? 0 : Math.min(2.6 * k, toTarget * 0.04) * Math.max(0, Math.cos(turn));
  s.speed += (wanted - s.speed) * Math.min(1, 0.1 * dt);
  const move = polar(s.heading, s.speed * dt);
  head.x += move.x;
  head.y += move.y;
  s.angles[0] = s.heading;
  resolveChain(s.joints, s.angles, s.link, MAX_BEND);

  stepGait(s.legs, {
    rest: (l) => footTarget(s, l),
    stride: () => stride(s),
    plant: (l) => add(footTarget(s, l), polar(s.angles[l.joint], stride(s) * 0.4)),
  }, k, 1 - 0.6 ** dt);
}

function drawGills(ctx, s) {
  ctx.lineCap = 'round';
  for (const side of [1, -1]) {
    GILLS.forEach(([at, point, length], j) => {
      const sway = 0.05 * Math.sin(s.t * 2.4 + j * 0.9 + side);
      const dir = s.angles[0] + side * (point + sway) * Math.PI;
      const base = bodyPoint(s, 0, side * at * Math.PI, -4);
      const tip = add(base, polar(dir, length * s.scale));
      // Feathery filaments either side of each gill stalk.
      ctx.strokeStyle = GILL;
      ctx.lineWidth = 1.8 * s.scale;
      ctx.beginPath();
      for (const f of [0.35, 0.55, 0.75, 0.95]) {
        const at = add(base, polar(dir, length * f * s.scale));
        for (const spread of [0.9, -0.9]) {
          const end = add(at, polar(dir + spread, 5 * s.scale));
          ctx.moveTo(at.x, at.y);
          ctx.lineTo(end.x, end.y);
        }
      }
      ctx.stroke();
      strokeLimb(ctx, [base, tip], 3.6 * s.scale, GILL);
    });
  }
}

function drawLeg(ctx, s, leg) {
  const limb = solveTwoBone(shoulder(s, leg), leg.foot, UPPER * s.scale, LOWER * s.scale, s.angles[leg.joint] + Math.PI);
  strokeLimb(ctx, limb, 11 * s.scale, SKIN);
  const [, knee, foot] = limb;
  const dir = Math.atan2(foot.y - knee.y, foot.x - knee.x);
  for (const spread of [-0.6, -0.2, 0.2, 0.6]) {
    strokeLimb(ctx, [foot, add(foot, polar(dir + spread, 6 * s.scale))], 3 * s.scale, SKIN);
  }
}

function draw(ctx, s) {
  // Tail fin, as a pale fringe under the body.
  const fin = [];
  for (let i = 5; i < JOINTS; i++) fin.push(jointPoint(s.joints, s.angles, i, Math.PI / 2, Math.max(TAIL_FIN[i], BODY[i]) * s.scale));
  fin.push(jointPoint(s.joints, s.angles, JOINTS - 1, Math.PI, TAIL_FIN[JOINTS - 1] * s.scale));
  for (let i = JOINTS - 1; i >= 5; i--) fin.push(jointPoint(s.joints, s.angles, i, -Math.PI / 2, Math.max(TAIL_FIN[i], BODY[i]) * s.scale));
  fillOutline(ctx, fin, FIN);

  for (const leg of s.legs) drawLeg(ctx, s, leg);

  const pts = [];
  for (let i = 0; i < JOINTS; i++) pts.push(bodyPoint(s, i, Math.PI / 2));
  pts.push(bodyPoint(s, JOINTS - 1, Math.PI));
  for (let i = JOINTS - 1; i >= 0; i--) pts.push(bodyPoint(s, i, -Math.PI / 2));
  // Broad, rounded snout.
  pts.push(bodyPoint(s, 0, -Math.PI / 5, -3));
  pts.push(bodyPoint(s, 0, 0, -5));
  pts.push(bodyPoint(s, 0, Math.PI / 5, -3));
  fillOutline(ctx, pts, SKIN);

  ctx.fillStyle = SPECK;
  for (const [i, turn, out, r] of [[3, 0.4, -12, 2.6], [4, -0.3, -9, 2], [5, 0.2, -16, 2.2], [6, -0.5, -11, 1.8], [8, 0.3, -7, 1.6], [2, -0.6, -10, 1.8]]) {
    const p = bodyPoint(s, i, turn, out);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * s.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGills(ctx, s);

  // Small dark eyes set wide, and a gentle smile across the snout.
  ctx.fillStyle = INK;
  for (const side of [1, -1]) {
    const eye = bodyPoint(s, 0, side * Math.PI * 0.4, -9);
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 3.4 * s.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  const m1 = bodyPoint(s, 0, Math.PI * 0.27, -7);
  const m2 = bodyPoint(s, 0, -Math.PI * 0.27, -7);
  const mc = bodyPoint(s, 0, 0, -11);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(m1.x, m1.y);
  ctx.quadraticCurveTo(mc.x, mc.y, m2.x, m2.y);
  ctx.stroke();
}

export default {
  label: 'Axolotl',
  create,
  update,
  draw,
  center: (s) => s.joints[4],
  footprint: (s) => 50 * s.scale,
};
