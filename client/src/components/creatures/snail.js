// Snail: a soft, slowly bending foot that glides with a ripple running down
// it, eye-stalks that sway, and a coiled shell riding on its back. It reports
// a trail point so the canvas host can lay down a lasting slime trail.
import {
  INK, add, clamp, dist, fillOutline, jointPoint, polar, resolveChain, strokeLimb, wrap,
} from './common.js';

// Looks: body, shell and spiral colours, an optional glow on the spiral, and
// the slime trail as [colour, share of trail width] strokes, widest first.
export const SNAIL = {
  label: 'Snail',
  skin: '#c8b896',
  shell: '#a4774e',
  band: '#694737',
  trail: [['rgba(150, 144, 108, 0.28)', 1], ['rgba(245, 237, 223, 0.32)', 0.12]],
};
// Molten body under a cooled-rock shell whose seams still glow.
export const LAVA_SNAIL = {
  label: 'Lava snail',
  skin: '#b8461c',
  shell: '#2f2622',
  band: '#f08a35',
  glow: '#ff9a3c',
  trail: [['rgba(201, 74, 27, 0.32)', 1], ['rgba(255, 190, 90, 0.5)', 0.16]],
};
const SIZE = 2;
const JOINTS = 7;
const LINK = 15;
const MAX_BEND = Math.PI / 12;
const BODY = [12, 14.5, 15.5, 16, 15, 12, 7]; // half-widths, head first (unscaled)

// The foot swells and thins in a wave that travels down the body as it moves.
const radius = (s, i, extra = 0) => (BODY[i] * (1 + 0.07 * Math.sin(s.phase - i * 0.9)) + extra) * s.scale;
const bodyPoint = (s, i, turn, extra = 0) => jointPoint(s.joints, s.angles, i, turn, radius(s, i, extra));

function create(x, y, canvasScale, heading = 0) {
  const scale = canvasScale * SIZE;
  const link = LINK * scale;
  const joints = Array.from({ length: JOINTS }, (_, i) => add({ x, y }, polar(heading, -i * link)));
  return { scale, link, joints, angles: new Array(JOINTS).fill(heading), heading, speed: 0, phase: 0, t: 0 };
}

function update(s, target, dt) {
  const k = s.scale / (0.42 * SIZE);
  s.t += dt / 60;
  const head = s.joints[0];
  const toTarget = dist(head, target);
  const turn = wrap(Math.atan2(target.y - head.y, target.x - head.x) - s.heading);
  s.heading += clamp(turn, -0.03 * dt, 0.03 * dt);

  // Snails keep creeping as they turn, so they sweep round in wide arcs.
  const wanted = toTarget < 26 * k ? 0 : Math.min(1.1 * k, toTarget * 0.02) * Math.max(0.2, Math.cos(turn));
  s.speed += (wanted - s.speed) * Math.min(1, 0.05 * dt);
  const move = polar(s.heading, s.speed * dt);
  head.x += move.x;
  head.y += move.y;
  s.angles[0] = s.heading;
  resolveChain(s.joints, s.angles, s.link, MAX_BEND);
  s.phase += (s.speed / k) * dt * 0.35;
}

function drawShell(ctx, s, look) {
  const c = add(s.joints[3], polar(s.angles[3], -3 * s.scale));
  const r = 25 * s.scale;
  ctx.fillStyle = look.shell;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Coil seen from above: an Archimedean spiral opening toward the tail.
  const turns = 2.6;
  const start = s.angles[3] + Math.PI;
  for (const [color, width, inset] of [[look.band, 4 * s.scale, 0.8], [INK, 1.6, 0.92]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = look.glow || 'transparent';
    ctx.shadowBlur = look.glow && color === look.band ? 9 * s.scale : 0;
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const p = add(c, polar(start + t * turns * Math.PI * 2, r * inset * (1 - t)));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function draw(ctx, s, look) {
  const pts = [];
  for (let i = 0; i < JOINTS; i++) pts.push(bodyPoint(s, i, Math.PI / 2));
  pts.push(bodyPoint(s, JOINTS - 1, Math.PI, 2));
  for (let i = JOINTS - 1; i >= 0; i--) pts.push(bodyPoint(s, i, -Math.PI / 2));
  pts.push(bodyPoint(s, 0, -Math.PI / 4, -1));
  pts.push(bodyPoint(s, 0, 0, -2));
  pts.push(bodyPoint(s, 0, Math.PI / 4, -1));
  fillOutline(ctx, pts, look.skin);

  // Two short feelers and two long eye-stalks, swaying out of step.
  for (const side of [1, -1]) {
    const sway = 0.14 * Math.sin(s.t * 2.2 + side);
    const lowBase = bodyPoint(s, 0, side * 0.55, -3);
    strokeLimb(ctx, [lowBase, add(lowBase, polar(s.heading + side * (0.7 + sway), 8 * s.scale))], 2.6 * s.scale, look.skin);
    const base = bodyPoint(s, 0, side * 0.3, -3);
    const tip = add(base, polar(s.heading + side * (0.32 + sway), 22 * s.scale));
    strokeLimb(ctx, [base, tip], 3 * s.scale, look.skin);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 2.8 * s.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShell(ctx, s, look);
}

export function makeSnail(look) {
  return {
    label: look.label,
    create,
    update,
    draw: (ctx, s) => draw(ctx, s, look),
    center: (s) => s.joints[3],
    footprint: (s) => 34 * s.scale,
    // The trail is laid by the tail of the foot and is about as wide as the body.
    trail: { point: (s) => s.joints[JOINTS - 1], width: (s) => BODY[3] * 1.6 * s.scale, colors: look.trail },
  };
}

export default makeSnail(SNAIL);
