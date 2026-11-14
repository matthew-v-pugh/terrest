// Turtle: a rigid shell on a short three-joint chain (neck base, shell centre,
// tail base), plodding on four stubby legs in a diagonal gait. The head leads
// on its neck, turning to look toward the target and bobbing as it walks.
import {
  INK, add, bendTwoBone, clamp, dist, drawEye, fillOutline, polar, resolveChain, stepGait, strokeLimb, wrap,
} from './common.js';

// Looks: the colours, how thick the legs are, and whether the shell shows
// growth rings on its plates (the high-domed tortoise).
export const TURTLE = { label: 'Turtle', skin: '#9ea67a', shell: '#6e6440', plate: '#8c8256', leg: 13, paw: 1, rings: false };
export const TORTOISE = { label: 'Tortoise', skin: '#8f8672', shell: '#4f3b28', plate: '#8a6a3e', leg: 17, paw: 1.3, rings: true };
const SIZE = 1.9;
const LINK = 36;
const MAX_BEND = Math.PI / 40;
const SHELL_LONG = 50; // half-length and half-width of the shell (unscaled)
const SHELL_WIDE = 42;
const NECK = 24;
const UPPER = 20; // leg segments: long enough to reach a foot a full stride past its rest
const LOWER = 20;
// Hips sit under the shell rim: `along` the body and `across` it. Feet rest
// `out` from the hip at `rest` (a turn from the heading).
const LEGS = [
  { side: 1, group: 0, along: 26, across: 30, rest: 0.32, out: 24, paw: 8 },
  { side: -1, group: 1, along: 26, across: 30, rest: 0.32, out: 24, paw: 8 },
  { side: 1, group: 1, along: -26, across: 28, rest: 0.72, out: 20, paw: 7 },
  { side: -1, group: 0, along: -26, across: 28, rest: 0.72, out: 20, paw: 7 },
];

const shellCenter = (t) => t.joints[1];
function hip(t, leg) {
  const a = t.angles[1];
  return add(add(shellCenter(t), polar(a, leg.along * t.scale)), polar(a + leg.side * Math.PI / 2, leg.across * t.scale));
}
const restFoot = (t, leg) => add(hip(t, leg), polar(t.angles[1] + leg.side * leg.rest * Math.PI, leg.out * t.scale));
const stride = (t) => 16 * t.scale;

// Distance from the shell centre to its rim at `turn` from the heading.
function rim(turn, shrink = 1) {
  const r = (SHELL_LONG * SHELL_WIDE) / Math.hypot(SHELL_WIDE * Math.cos(turn), SHELL_LONG * Math.sin(turn));
  return r * shrink;
}

function create(x, y, canvasScale, heading = 0) {
  const scale = canvasScale * SIZE;
  const link = LINK * scale;
  const joints = [0, 1, 2].map((i) => add({ x, y }, polar(heading, -i * link)));
  const t = { scale, link, joints, angles: [heading, heading, heading], heading, speed: 0, look: 0, phase: 0, legs: [] };
  t.legs = LEGS.map((leg) => {
    const foot = add(restFoot(t, leg), polar(heading, leg.group ? -stride(t) / 2 : 0));
    return { ...leg, foot: { ...foot }, planted: { ...foot } };
  });
  return t;
}

function update(t, target, dt) {
  const k = t.scale / (0.42 * SIZE);
  const head = t.joints[0];
  const toTarget = dist(head, target);
  const desired = Math.atan2(target.y - head.y, target.x - head.x);
  const turn = wrap(desired - t.heading);
  t.heading += clamp(turn, -0.035 * dt, 0.035 * dt);

  const wanted = toTarget < 40 * k ? 0 : Math.min(1.8 * k, toTarget * 0.02) * Math.max(0, Math.cos(turn));
  t.speed += (wanted - t.speed) * Math.min(1, 0.08 * dt);
  // The shell is rigid, so it turns about its own middle rather than the neck.
  Object.assign(head, add(t.joints[1], polar(t.heading, t.link)));
  const move = polar(t.heading, t.speed * dt);
  head.x += move.x;
  head.y += move.y;
  t.angles[0] = t.heading;
  resolveChain(t.joints, t.angles, t.link, MAX_BEND);
  t.phase += (t.speed / k) * dt * 0.25;

  // The head turns ahead of the shell to look where it's going.
  const lookWanted = clamp(wrap(desired - t.angles[0]), -0.6, 0.6);
  t.look += (lookWanted - t.look) * Math.min(1, 0.1 * dt);

  stepGait(t.legs, {
    rest: (l) => restFoot(t, l),
    stride: () => stride(t),
    // Walking, feet land ahead so the body passes over them; turning on the
    // spot, they land back at rest.
    plant: (l) => add(restFoot(t, l), polar(t.heading, stride(t) * 0.5 * Math.min(1, t.speed / k))),
  }, k, 1 - 0.6 ** dt);
}

function drawShell(ctx, t, look) {
  const c = shellCenter(t);
  const a = t.angles[1];
  const around = (shrink, scallop) => Array.from({ length: 16 }, (_, i) => {
    const turn = (i / 16) * Math.PI * 2;
    return add(c, polar(a + turn, (rim(turn, shrink) + (i % 2 ? scallop : 0)) * t.scale));
  });
  fillOutline(ctx, around(1, 2.5), look.shell);
  const inner = around(0.64, 0);
  fillOutline(ctx, inner, look.plate);

  // Marginal plates: seams from the inner plates out to the rim.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const turn of [0, 0.25, 0.5, 0.75, 1, -0.25, -0.5, -0.75].map((f) => f * Math.PI)) {
    const from = add(c, polar(a + turn, rim(turn, 0.64) * t.scale));
    const to = add(c, polar(a + turn, rim(turn, 0.97) * t.scale));
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  // The central plates, split across the spine.
  for (const along of [-0.3, 0.3]) {
    const mid = add(c, polar(a, along * SHELL_LONG * t.scale));
    const half = SHELL_WIDE * 0.64 * Math.sqrt(1 - (along / 0.64) ** 2) * t.scale;
    const l = add(mid, polar(a + Math.PI / 2, half));
    const r = add(mid, polar(a - Math.PI / 2, half));
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
  }
  const front = add(c, polar(a, SHELL_LONG * 0.64 * t.scale));
  const back = add(c, polar(a, -SHELL_LONG * 0.64 * t.scale));
  ctx.moveTo(front.x, front.y);
  ctx.lineTo(back.x, back.y);
  ctx.stroke();

  // Growth rings: a smaller copy of each plate edge, inset.
  if (look.rings) {
    ctx.strokeStyle = look.shell;
    ctx.lineWidth = 1.6;
    for (const shrink of [0.5, 0.36]) {
      const ring = around(shrink, 0);
      ctx.beginPath();
      ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
    }
  }
}

function draw(ctx, t, look) {
  const { skin } = look;
  for (const leg of t.legs) {
    const h = hip(t, leg);
    // Each joint bends one way only, so it can't flip as the foot swings:
    // front elbows point back toward the tail, back knees forward.
    const limb = bendTwoBone(h, leg.foot, UPPER * t.scale, LOWER * t.scale, leg.side * Math.sign(leg.along));
    strokeLimb(ctx, limb, look.leg * t.scale, skin);
    fillOutline(ctx, [0, 1, 2, 3, 4, 5].map((i) => add(leg.foot, polar(t.angles[1] + i * Math.PI / 3, leg.paw * look.paw * t.scale * (i % 2 ? 0.85 : 1)))), skin);
  }

  // Short pointed tail.
  const tailBase = t.joints[2];
  strokeLimb(ctx, [tailBase, add(tailBase, polar(t.angles[2] + Math.PI, 30 * t.scale))], 6 * t.scale, skin);

  // Neck and head, bobbing slightly with each step.
  const lookAngle = t.angles[0] + t.look;
  const neck = NECK * (1 + 0.08 * Math.sin(t.phase * 2)) * t.scale;
  const headAt = add(t.joints[0], polar(lookAngle, neck));
  strokeLimb(ctx, [t.joints[0], headAt], 15 * t.scale, skin);
  const headPts = [0, 0.25, 0.5, 0.75, 1, -0.75, -0.5, -0.25].map((f) => {
    const turn = f * Math.PI;
    const r = 14 * 11 / Math.hypot(11 * Math.cos(turn), 14 * Math.sin(turn));
    return add(headAt, polar(lookAngle + turn, (r + (f === 0 ? -1 : 0)) * t.scale));
  });
  fillOutline(ctx, headPts, skin);
  for (const side of [1, -1]) drawEye(ctx, add(headAt, polar(lookAngle + side * 0.75, 8.5 * t.scale)), 3.6 * t.scale, lookAngle);

  drawShell(ctx, t, look);
}

export function makeTurtle(look) {
  return {
    label: look.label,
    create,
    update,
    draw: (ctx, t) => draw(ctx, t, look),
    center: (t) => t.joints[1],
    footprint: (t) => 56 * t.scale,
  };
}

export default makeTurtle(TURTLE);
