// Frog: a short, stiff three-joint body that sits, turns in place, crouches
// and leaps toward the target. Feet stay planted while sitting; in the air the
// hind legs kick out straight behind and the arms tuck back, then everything
// re-plants on landing.
import {
  INK, add, clamp, dist, drawEye, fillOutline, jointPoint, polar, resolveChain, solveTwoBone, strokeLimb, wrap,
} from './common.js';

const SKIN = '#7d8a52';
const SPOTS = '#4f5c33';
const LINK = 30;
const MAX_BEND = Math.PI / 10;
const BODY = [30, 40, 35]; // half-widths: head, middle, rump (unscaled)

// The frog is drawn larger than the lizard at the same canvas scale so its
// compact body reads at a similar size on screen.
const SIZE = 1.4;
const CROUCH_MS = 150;
const LAND_MS = 140;
const REST_MS = 220;

// `rest` is where the foot sits while grounded and `air` where it trails in a
// leap, each as [turn from heading, distance out from that joint's edge].
const LEGS = [
  { joint: 0, side: 1, hip: [Math.PI / 2, -10], rest: [Math.PI * 0.28, 26], air: [Math.PI * 0.72, 4], upper: 22, lower: 22, width: 11, kneeForward: false, toes: 7 },
  { joint: 0, side: -1, hip: [Math.PI / 2, -10], rest: [Math.PI * 0.28, 26], air: [Math.PI * 0.72, 4], upper: 22, lower: 22, width: 11, kneeForward: false, toes: 7 },
  { joint: 2, side: 1, hip: [Math.PI * 0.6, -12], rest: [Math.PI * 0.55, 30], air: [Math.PI * 0.93, 80], upper: 46, lower: 44, width: 15, kneeForward: true, toes: 15 },
  { joint: 2, side: -1, hip: [Math.PI * 0.6, -12], rest: [Math.PI * 0.55, 30], air: [Math.PI * 0.93, 80], upper: 46, lower: 44, width: 15, kneeForward: true, toes: 15 },
];

// Crouching widens and shortens the body a little; stretching does the opposite.
const radius = (f, i, extra) => (BODY[i] * (1 + f.squash * 0.1) + extra) * f.scale;
const bodyPoint = (f, i, turn, extra = 0) => jointPoint(f.joints, f.angles, i, turn, radius(f, i, extra));
const legPoint = (f, leg, [turn, extra]) => bodyPoint(f, leg.joint, turn * leg.side, extra);

// Lay the body out straight behind the head.
function pose(f) {
  f.angles[0] = f.heading;
  const link = f.link * (1 - f.squash * 0.12);
  for (let i = 1; i < f.joints.length; i++) {
    f.angles[i] = f.heading;
    const p = add(f.joints[i - 1], polar(f.heading, -link));
    f.joints[i].x = p.x;
    f.joints[i].y = p.y;
  }
}

function create(x, y, canvasScale, heading = 0) {
  const scale = canvasScale * SIZE;
  const f = {
    scale,
    link: LINK * scale,
    joints: [{ x, y }, { x, y }, { x, y }],
    angles: [heading, heading, heading],
    heading,
    state: 'sit',
    t: 0,
    z: 0,
    squash: 0,
    hop: null,
    legs: [],
  };
  pose(f);
  f.legs = LEGS.map((leg) => {
    const foot = legPoint(f, leg, leg.rest);
    return { ...leg, foot: { ...foot }, planted: { ...foot } };
  });
  return f;
}

function update(f, target, dt) {
  const ms = dt * (1000 / 60);
  const k = f.scale / 0.42;
  const head = f.joints[0];
  const toTarget = dist(head, target);
  const desired = Math.atan2(target.y - head.y, target.x - head.x);
  const facing = wrap(desired - f.heading);
  f.t += ms;

  if (f.state === 'sit') {
    f.squash += (0 - f.squash) * Math.min(1, 0.2 * dt);
    if (toTarget > 50 * k) {
      // Turn in place about the middle joint.
      f.heading += clamp(facing, -0.06 * dt, 0.06 * dt);
      const mid = { ...f.joints[1] };
      Object.assign(head, add(mid, polar(f.heading, f.link)));
      pose(f);
      if (Math.abs(facing) < 0.3 && f.t > REST_MS) { f.state = 'crouch'; f.t = 0; }
    }
  } else if (f.state === 'crouch') {
    f.squash = Math.min(1, f.t / CROUCH_MS);
    pose(f);
    if (f.t >= CROUCH_MS) {
      const length = clamp(toTarget - 20 * k, 30 * k, 190 * k);
      f.hop = { from: { ...head }, to: add(head, polar(f.heading, length)), length, duration: 330 + length * 0.9 / k };
      f.state = 'air';
      f.t = 0;
    }
  } else if (f.state === 'air') {
    const p = Math.min(1, f.t / f.hop.duration);
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    Object.assign(head, { x: f.hop.from.x + (f.hop.to.x - f.hop.from.x) * e, y: f.hop.from.y + (f.hop.to.y - f.hop.from.y) * e });
    f.z = 4 * p * (1 - p) * f.hop.length * 0.32;
    f.squash = -0.6 * Math.sin(p * Math.PI); // stretch out mid-air
    f.angles[0] = f.heading;
    resolveChain(f.joints, f.angles, f.link, MAX_BEND);
    if (p >= 1) { f.state = 'land'; f.t = 0; f.z = 0; }
  } else if (f.state === 'land') {
    f.squash = 0.8 * (1 - f.t / LAND_MS);
    pose(f);
    if (f.t >= LAND_MS) { f.state = 'sit'; f.t = 0; }
  }

  // Grounded feet stay put, re-planting only when turning drags them too far
  // from their resting spot. Airborne feet are carried with the body.
  const airborne = f.state === 'air';
  for (const leg of f.legs) {
    const want = legPoint(f, leg, airborne ? leg.air : leg.rest);
    if (airborne || f.state === 'land' || dist(want, leg.planted) > 16 * k) leg.planted = want;
    const ease = 1 - (airborne ? 0.55 : 0.7) ** dt;
    leg.foot.x += (leg.planted.x - leg.foot.x) * ease;
    leg.foot.y += (leg.planted.y - leg.foot.y) * ease;
  }
}

function drawLeg(ctx, f, leg) {
  const hip = legPoint(f, leg, leg.hip);
  const kneeAngle = f.angles[leg.joint] + (leg.kneeForward ? 0 : Math.PI);
  const limb = solveTwoBone(hip, leg.foot, leg.upper * f.scale, leg.lower * f.scale, kneeAngle);
  strokeLimb(ctx, limb, leg.width * f.scale, SKIN);
  // Splayed toes, continuing the line of the shin.
  const [, knee, foot] = limb;
  const dir = Math.atan2(foot.y - knee.y, foot.x - knee.x);
  for (const spread of [-0.55, 0, 0.55]) {
    strokeLimb(ctx, [foot, add(foot, polar(dir + spread, leg.toes * f.scale))], 4.5 * f.scale, SKIN);
  }
}

function draw(ctx, f) {
  for (const leg of f.legs) drawLeg(ctx, f, leg);

  const pts = [
    bodyPoint(f, 0, 0, -2),
    bodyPoint(f, 0, Math.PI * 0.3),
    bodyPoint(f, 1, Math.PI / 2),
    bodyPoint(f, 2, Math.PI * 0.6),
    bodyPoint(f, 2, Math.PI * 0.85, -4),
    bodyPoint(f, 2, -Math.PI * 0.85, -4),
    bodyPoint(f, 2, -Math.PI * 0.6),
    bodyPoint(f, 1, -Math.PI / 2),
    bodyPoint(f, 0, -Math.PI * 0.3),
  ];
  fillOutline(ctx, pts, SKIN);

  ctx.fillStyle = SPOTS;
  for (const [i, turn, out, r] of [[1, 0.5, -14, 5], [1, -2.2, -18, 4], [2, 2.6, -16, 4.5], [1, 2.1, -22, 3], [2, -0.4, -26, 3.5]]) {
    const p = bodyPoint(f, i, turn, out);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * f.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth line across the front of the head.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const m1 = bodyPoint(f, 0, Math.PI * 0.32, -7);
  const m2 = bodyPoint(f, 0, -Math.PI * 0.32, -7);
  const mc = bodyPoint(f, 0, 0, -6);
  ctx.moveTo(m1.x, m1.y);
  ctx.quadraticCurveTo(mc.x, mc.y, m2.x, m2.y);
  ctx.stroke();

  // Bulging eyes set on top of the head.
  for (const side of [1, -1]) drawEye(ctx, bodyPoint(f, 0, side * Math.PI * 0.62, -3), 10 * f.scale, f.heading, 'slit');
}

export default {
  label: 'Frog',
  create,
  update,
  draw,
  center: (f) => f.joints[1],
  footprint: (f) => 60 * f.scale,
};
