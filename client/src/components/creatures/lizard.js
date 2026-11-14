// Lizard: a long bending spine that walks toward the target, with four legs
// in a diagonal gait whose feet stay planted until the body pulls too far.
import {
  add, dist, drawEye, fillOutline, jointPoint, polar, resolveChain, solveTwoBone, stepGait, strokeLimb, wrap,
} from './common.js';

const SKIN = '#ad7d62';
const SPOTS = '#694737';
const JOINTS = 14;
const MAX_BEND = Math.PI / 8;
// Half-width of the body at each spine joint, head first (unscaled).
const BODY = [26, 29, 20, 30, 34, 35.5, 32.5, 25, 14, 7.5, 5.5, 4.5, 3.5, 3.5];
const LINK = 64;
// Diagonal gait: legs in the same `group` (front-left + back-right, then
// front-right + back-left) step together, and the two groups alternate.
const LEGS = [
  { joint: 3, side: 1, group: 0, reach: Math.PI / 4, upper: 52, lower: 46, width: 20 },
  { joint: 3, side: -1, group: 1, reach: Math.PI / 4, upper: 52, lower: 46, width: 20 },
  { joint: 7, side: 1, group: 1, reach: Math.PI / 3, upper: 44, lower: 40, width: 17 },
  { joint: 7, side: -1, group: 0, reach: Math.PI / 3, upper: 44, lower: 40, width: 17 },
];

const bodyPoint = (lz, i, turn, extra = 0) => jointPoint(lz.joints, lz.angles, i, turn, (BODY[i] + extra) * lz.scale);
const footTarget = (lz, leg) => bodyPoint(lz, leg.joint, leg.reach * leg.side, 46);
const shoulder = (lz, leg) => bodyPoint(lz, leg.joint, (Math.PI / 2) * leg.side, -12);
const stride = (lz, leg) => (leg.upper + leg.lower) * 0.9 * lz.scale;

// New foothold: the resting spot plus a lead along the body, so the foot lands
// ahead and then drifts back as the body walks over it.
function plantAhead(lz, leg) {
  return add(footTarget(lz, leg), polar(lz.angles[leg.joint], stride(lz, leg) * 0.4));
}

function create(x, y, scale, heading = 0) {
  const link = LINK * scale;
  const joints = Array.from({ length: JOINTS }, (_, i) => add({ x, y }, polar(heading, -i * link)));
  const lz = { scale, link, joints, angles: new Array(JOINTS).fill(heading), heading, speed: 0, legs: [] };
  lz.legs = LEGS.map((leg) => {
    // Start the second pair half a stride behind so the two pairs are out of phase.
    const foot = add(footTarget(lz, leg), polar(heading, leg.group ? -stride(lz, leg) / 2 : 0));
    return { ...leg, foot: { ...foot }, planted: { ...foot } };
  });
  return lz;
}

function update(lz, target, dt) {
  const head = lz.joints[0];
  const toTarget = dist(head, target);
  const desired = Math.atan2(target.y - head.y, target.x - head.x);
  const turn = wrap(desired - lz.heading);
  lz.heading += Math.max(-0.07 * dt, Math.min(0.07 * dt, turn));

  // Slow down near the target and when facing away, so it settles rather than circling.
  const k = lz.scale / 0.42;
  const wanted = toTarget < 24 * k ? 0 : Math.min(3.4 * k, toTarget * 0.045) * Math.max(0, Math.cos(turn));
  lz.speed += (wanted - lz.speed) * Math.min(1, 0.12 * dt);

  const move = polar(lz.heading, lz.speed * dt);
  head.x += move.x;
  head.y += move.y;
  lz.angles[0] = lz.heading;
  resolveChain(lz.joints, lz.angles, lz.link, MAX_BEND);

  stepGait(lz.legs, {
    rest: (l) => footTarget(lz, l),
    stride: (l) => stride(lz, l),
    plant: (l) => plantAhead(lz, l),
  }, k, 1 - 0.62 ** dt);
}

function draw(ctx, lz) {
  for (const leg of lz.legs) {
    const limb = solveTwoBone(shoulder(lz, leg), leg.foot, leg.upper * lz.scale, leg.lower * lz.scale, lz.angles[leg.joint] + Math.PI);
    strokeLimb(ctx, limb, leg.width * lz.scale, SKIN);
  }

  const pts = [];
  for (let i = 0; i < JOINTS; i++) pts.push(bodyPoint(lz, i, Math.PI / 2));
  pts.push(bodyPoint(lz, JOINTS - 1, Math.PI));
  for (let i = JOINTS - 1; i >= 0; i--) pts.push(bodyPoint(lz, i, -Math.PI / 2));
  // Rounded snout.
  pts.push(bodyPoint(lz, 0, -Math.PI / 6, -8));
  pts.push(bodyPoint(lz, 0, 0, -6));
  pts.push(bodyPoint(lz, 0, Math.PI / 6, -8));
  fillOutline(ctx, pts, SKIN);

  ctx.fillStyle = SPOTS;
  for (let i = 3; i <= 9; i++) {
    ctx.beginPath();
    ctx.arc(lz.joints[i].x, lz.joints[i].y, Math.max(1.4, BODY[i] * lz.scale * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const side of [1, -1]) drawEye(ctx, bodyPoint(lz, 0, side * Math.PI * 0.42, -9), 7.5 * lz.scale, lz.heading);
}

export default {
  label: 'Lizard',
  create,
  update,
  draw,
  center: (lz) => lz.joints[5],
  footprint: (lz) => 70 * lz.scale,
  helmet: (lz) => ({ at: bodyPoint(lz, 0, 0, -22), r: 42 * lz.scale, heading: lz.angles[0] }),
};
