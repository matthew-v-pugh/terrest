// Spider: a cephalothorax leading a swinging abdomen on a three-joint chain,
// with eight legs in an alternating-tetrapod gait (L1 R2 L3 R4 step together,
// then R1 L2 R3 L4). Knees bow outward, away from the body.
import {
  INK, EYE, add, dist, fillOutline, jointPoint, polar, resolveChain, solveTwoBone, stepGait, strokeLimb, wrap,
} from './common.js';

const SKIN = '#5b4636';
const MARK = '#ad7d62';
const SIZE = 1.45;
const LINK = 26;
const MAX_BEND = Math.PI / 6;
const BODY = [17, 6, 25]; // half-widths: cephalothorax, waist, abdomen (unscaled)

// Per leg pair, front to back: where it joins the body, where the foot rests
// (both as turns from heading), and segment lengths.
const PAIRS = [
  { hip: 0.3, rest: 0.2, reach: 92, upper: 46, lower: 56 },
  { hip: 0.42, rest: 0.4, reach: 84, upper: 42, lower: 50 },
  { hip: 0.56, rest: 0.62, reach: 80, upper: 40, lower: 48 },
  { hip: 0.7, rest: 0.84, reach: 90, upper: 46, lower: 56 },
];
const LEGS = PAIRS.flatMap((p, i) => [1, -1].map((side) => ({ ...p, side, group: (i + (side > 0 ? 0 : 1)) % 2 })));

const bodyPoint = (s, i, turn, extra = 0) => jointPoint(s.joints, s.angles, i, turn, (BODY[i] + extra) * s.scale);
const hip = (s, leg) => bodyPoint(s, 0, leg.side * leg.hip * Math.PI, -5);
const restFoot = (s, leg) => jointPoint(s.joints, s.angles, 0, leg.side * leg.rest * Math.PI, leg.reach * s.scale);
const stride = (s, leg) => (leg.upper + leg.lower) * 0.45 * s.scale;

function create(x, y, canvasScale, heading = 0) {
  const scale = canvasScale * SIZE;
  const link = LINK * scale;
  const joints = [0, 1, 2].map((i) => add({ x, y }, polar(heading, -i * link)));
  const s = { scale, link, joints, angles: [heading, heading, heading], heading, speed: 0, legs: [] };
  s.legs = LEGS.map((leg) => {
    const foot = add(restFoot(s, leg), polar(heading, leg.group ? -stride(s, leg) / 2 : 0));
    return { ...leg, foot: { ...foot }, planted: { ...foot } };
  });
  return s;
}

function update(s, target, dt) {
  const k = s.scale / (0.42 * SIZE);
  const head = s.joints[0];
  const toTarget = dist(head, target);
  const turn = wrap(Math.atan2(target.y - head.y, target.x - head.x) - s.heading);
  s.heading += Math.max(-0.11 * dt, Math.min(0.11 * dt, turn));

  const wanted = toTarget < 30 * k ? 0 : Math.min(4.2 * k, toTarget * 0.06) * Math.max(0, Math.cos(turn));
  s.speed += (wanted - s.speed) * Math.min(1, 0.18 * dt);
  const move = polar(s.heading, s.speed * dt);
  head.x += move.x;
  head.y += move.y;
  s.angles[0] = s.heading;
  resolveChain(s.joints, s.angles, s.link, MAX_BEND);

  stepGait(s.legs, {
    rest: (l) => restFoot(s, l),
    stride: (l) => stride(s, l),
    plant: (l) => add(restFoot(s, l), polar(s.heading, stride(s, l) * 0.45)),
  }, k, 1 - 0.5 ** dt);
}

function draw(ctx, s) {
  for (const leg of s.legs) {
    const h = hip(s, leg);
    const outward = s.angles[0] + leg.side * leg.hip * Math.PI;
    strokeLimb(ctx, solveTwoBone(h, leg.foot, leg.upper * s.scale, leg.lower * s.scale, outward), 3.4 * s.scale, SKIN);
  }

  // Abdomen: a long oval around the rear joint.
  const abdomen = [0, 0.25, 0.5, 0.75, 1, -0.75, -0.5, -0.25].map((t) => {
    const stretch = 1 + 0.25 * Math.cos(t * Math.PI) ** 2;
    return bodyPoint(s, 2, t * Math.PI, (stretch - 1) * BODY[2]);
  });
  fillOutline(ctx, abdomen, SKIN);

  // Chevron markings pointing toward the head.
  ctx.strokeStyle = MARK;
  ctx.lineWidth = 2.4 * s.scale;
  ctx.lineCap = 'round';
  for (const along of [-12, -1, 10]) {
    const c = add(s.joints[2], polar(s.angles[2], along * s.scale));
    const left = add(c, polar(s.angles[2] + Math.PI * 0.78, 8 * s.scale));
    const right = add(c, polar(s.angles[2] - Math.PI * 0.78, 8 * s.scale));
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }

  // Pedipalps, then the cephalothorax over them.
  for (const side of [1, -1]) {
    const base = bodyPoint(s, 0, side * 0.16 * Math.PI, -3);
    strokeLimb(ctx, [base, add(base, polar(s.angles[0] + side * 0.22, 11 * s.scale))], 3.6 * s.scale, SKIN);
  }
  const thorax = [0, 0.3, 0.6, 0.85, 1, -0.85, -0.6, -0.3].map((t) => bodyPoint(s, 0, t * Math.PI, t === 0 ? 1 : 0));
  fillOutline(ctx, thorax, SKIN);

  // Eight eyes: a large front pair and a smaller arc behind.
  ctx.fillStyle = EYE;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  const eyes = [[0.1, -5, 2.6], [-0.1, -5, 2.6], [0.28, -7, 1.6], [-0.28, -7, 1.6], [0.42, -9, 1.4], [-0.42, -9, 1.4], [0.18, -10, 1.3], [-0.18, -10, 1.3]];
  for (const [turn, out, r] of eyes) {
    const p = bodyPoint(s, 0, turn * Math.PI, out);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * s.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export default {
  label: 'Spider',
  create,
  update,
  draw,
  center: (s) => s.joints[1],
  footprint: (s) => 52 * s.scale,
};
