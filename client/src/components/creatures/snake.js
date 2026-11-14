// Snake: a long, legless chain. The head weaves side to side as it travels,
// and because every joint follows the one ahead, that weave runs down the body
// as a slithering wave. It flicks a forked tongue every few seconds.
import {
  add, clamp, dist, drawEye, fillOutline, jointPoint, polar, resolveChain, wrap,
} from './common.js';

const SKIN = '#5f6e48';
const MARK = '#35422d';
const TONGUE = '#9c2f2f';
const SIZE = 1.5;
const JOINTS = 28;
const LINK = 15;
const MAX_BEND = Math.PI / 9;
const WAVE = 0.037; // weave phase per pixel travelled (unscaled): about 1.5 waves along the body
const SWING = 0.65; // how far the head weaves either side of its heading
// Half-widths: a broad head, a slight neck, then a long taper to the tail tip.
const BODY = Array.from({ length: JOINTS }, (_, i) => {
  if (i === 0) return 12;
  if (i === 1) return 9.5;
  return 12 * (1 - ((i - 2) / (JOINTS - 2)) ** 1.6) + 1.5;
});

const bodyPoint = (s, i, turn, extra = 0) => jointPoint(s.joints, s.angles, i, turn, (BODY[i] + extra) * s.scale);

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
  s.heading += clamp(turn, -0.06 * dt, 0.06 * dt);

  // Snakes keep slithering while they turn, curving round rather than pivoting.
  const wanted = toTarget < 30 * k ? 0 : Math.min(2.6 * k, toTarget * 0.04) * Math.max(0.15, Math.cos(turn));
  s.speed += (wanted - s.speed) * Math.min(1, 0.08 * dt);
  s.phase += (s.speed / k) * dt * WAVE;

  // Weave only while moving; at rest the head settles onto its heading.
  const dir = s.heading + Math.sin(s.phase) * SWING * Math.min(1, s.speed / (1.2 * k));
  const move = polar(dir, s.speed * dt);
  head.x += move.x;
  head.y += move.y;
  s.angles[0] = dir;
  resolveChain(s.joints, s.angles, s.link, MAX_BEND);
}

function drawTongue(ctx, s) {
  // A quick in-and-out flick every 2.6 seconds.
  const flick = (s.t % 2.6) / 0.35;
  if (flick >= 1) return;
  // Inside a helmet the flick stays short of the glass.
  const reach = Math.sin(flick * Math.PI) * (s.helmeted ? 7 : 15) * s.scale;
  const a = s.angles[0];
  const base = bodyPoint(s, 0, 0, -3);
  const tip = add(base, polar(a, reach + 3 * s.scale));
  ctx.strokeStyle = TONGUE;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(tip.x, tip.y);
  for (const fork of [0.45, -0.45]) {
    const end = add(tip, polar(a + fork, 5 * s.scale * (reach / (15 * s.scale))));
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(end.x, end.y);
  }
  ctx.stroke();
}

function draw(ctx, s) {
  drawTongue(ctx, s);

  const pts = [];
  for (let i = 0; i < JOINTS; i++) pts.push(bodyPoint(s, i, Math.PI / 2));
  pts.push(bodyPoint(s, JOINTS - 1, Math.PI, 1));
  for (let i = JOINTS - 1; i >= 0; i--) pts.push(bodyPoint(s, i, -Math.PI / 2));
  // Blunt, rounded snout.
  pts.push(bodyPoint(s, 0, -Math.PI / 4, -1));
  pts.push(bodyPoint(s, 0, 0, 2));
  pts.push(bodyPoint(s, 0, Math.PI / 4, -1));
  fillOutline(ctx, pts, SKIN);

  // A row of diamonds down the back.
  ctx.fillStyle = MARK;
  for (let i = 3; i < JOINTS - 3; i += 2) {
    const c = s.joints[i];
    const a = s.angles[i];
    const len = LINK * 0.55 * s.scale;
    const wide = BODY[i] * 0.55 * s.scale;
    const corners = [polar(a, len), polar(a + Math.PI / 2, wide), polar(a, -len), polar(a - Math.PI / 2, wide)];
    ctx.beginPath();
    corners.forEach((p, j) => (j ? ctx.lineTo(c.x + p.x, c.y + p.y) : ctx.moveTo(c.x + p.x, c.y + p.y)));
    ctx.closePath();
    ctx.fill();
  }

  for (const side of [1, -1]) drawEye(ctx, bodyPoint(s, 0, side * Math.PI * 0.55, -4), 4.4 * s.scale, s.angles[0], 'slit');
}

export default {
  label: 'Snake',
  create,
  update,
  draw,
  center: (s) => s.joints[8],
  footprint: (s) => 40 * s.scale,
  helmet: (s) => ({ at: bodyPoint(s, 0, 0, -9), r: 22 * s.scale, heading: s.angles[0] }),
};
