// Fish: a school of small fish steered as boids. Each fish keeps its distance
// from close neighbours, matches their heading and drifts toward the school's
// middle, while the whole school is drawn toward the target. Near the target
// each fish circles its own point around it, so the school mills about rather
// than piling up. Every fish is a short joint chain, so it bends as it turns,
// and its tail beats faster the faster it swims.
import {
  INK, add, clamp, fillOutline, jointPoint, polar, resolveChain, wrap,
} from './common.js';

const COUNT = 14;
// Looks: body tones (spread across the school), the tail colour, and an
// optional antenna with a glowing tip.
export const FISH = { label: 'Fish', colors: ['#ad7d62', '#b9895f', '#c49a6c', '#9a6e55'], fin: '#694737' };
export const ALIEN_FISH = {
  label: 'Alien fish',
  colors: ['#5fae9a', '#7fc4b4', '#6a5aa8', '#8a7ac0'],
  fin: '#3d2f6b',
  antenna: '#d8f57a',
};
const JOINTS = 4;
const LINK = 7;
const MAX_BEND = Math.PI / 6;
const BODY = [5, 6.2, 4.4, 2]; // half-widths, head first (unscaled)
// Boid tuning, in unscaled pixels per frame.
const VIEW = 60;
const PERSONAL = 20;
const MAX_SPEED = 3.4;
const MIN_SPEED = 0.9;
const MAX_FORCE = 0.14;
const ORBIT = 46;

const bodyPoint = (f, s, i, turn, extra = 0) => jointPoint(f.joints, f.angles, i, turn, (BODY[i] + extra) * s.scale);

function limit(v, max) {
  const len = Math.hypot(v.x, v.y);
  return len > max ? { x: (v.x / len) * max, y: (v.y / len) * max } : v;
}

// The same direction at exactly `len` (each boid rule asks for full speed).
function resize(v, len) {
  const d = Math.hypot(v.x, v.y) || 1;
  return { x: (v.x / d) * len, y: (v.y / d) * len };
}

// Steering toward a desired velocity, capped at the maximum turning force.
function steer(desired, vel, k) {
  return limit({ x: desired.x - vel.x, y: desired.y - vel.y }, MAX_FORCE * k);
}

function create(look, x, y, canvasScale, heading = 0) {
  const scale = canvasScale / 0.42;
  const fish = Array.from({ length: COUNT }, (_, i) => {
    // Start in a loose cluster, all facing roughly the same way.
    const at = add({ x, y }, polar(i * 2.4, 6 + Math.sqrt(i) * 14 * scale));
    const angle = heading + Math.sin(i * 1.7) * 0.3;
    const joints = Array.from({ length: JOINTS }, (_, j) => add(at, polar(angle, -j * LINK * scale)));
    return {
      joints,
      angles: new Array(JOINTS).fill(angle),
      vel: polar(angle, MIN_SPEED * scale),
      phase: i * 0.9,
      orbit: (i / COUNT) * Math.PI * 2,
      color: look.colors[i % look.colors.length],
      size: 0.85 + ((i * 37) % 10) / 30,
    };
  });
  return { scale, fish, heading, t: 0 };
}

function update(s, target, dt) {
  const k = s.scale;
  s.t += dt / 60;
  for (const f of s.fish) {
    const p = f.joints[0];
    let sepX = 0, sepY = 0, alignX = 0, alignY = 0, midX = 0, midY = 0, near = 0;
    for (const o of s.fish) {
      if (o === f) continue;
      const q = o.joints[0];
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const d = Math.hypot(dx, dy);
      if (d > VIEW * k || d === 0) continue;
      near++;
      alignX += o.vel.x;
      alignY += o.vel.y;
      midX += q.x;
      midY += q.y;
      if (d < PERSONAL * k) {
        sepX += dx / (d * d);
        sepY += dy / (d * d);
      }
    }

    const max = MAX_SPEED * k;
    const force = { x: 0, y: 0 };
    const addForce = (v, weight) => { force.x += v.x * weight; force.y += v.y * weight; };
    if (near) {
      if (sepX || sepY) addForce(steer(resize({ x: sepX, y: sepY }, max), f.vel, k), 2.2);
      addForce(steer(resize({ x: alignX, y: alignY }, max), f.vel, k), 0.7);
      addForce(steer(resize({ x: midX / near - p.x, y: midY / near - p.y }, max), f.vel, k), 0.5);
    }
    // Head for this fish's own spot on a slowly turning ring round the target,
    // easing off as it gets there.
    const spot = add(target, polar(s.t * 0.5 + f.orbit, ORBIT * k));
    const toSpot = { x: spot.x - p.x, y: spot.y - p.y };
    const gap = Math.hypot(toSpot.x, toSpot.y) || 1;
    const want = max * Math.min(1, gap / (90 * k));
    addForce(steer({ x: (toSpot.x / gap) * want, y: (toSpot.y / gap) * want }, f.vel, k), 1);

    f.vel = limit({ x: f.vel.x + force.x * dt, y: f.vel.y + force.y * dt }, max);
    const speed = Math.hypot(f.vel.x, f.vel.y);
    if (speed < MIN_SPEED * k) {
      const a = Math.atan2(f.vel.y, f.vel.x);
      f.vel = polar(a, MIN_SPEED * k);
    }

    p.x += f.vel.x * dt;
    p.y += f.vel.y * dt;
    // Turn the head toward its heading gradually, so fish arc rather than snap.
    const a = Math.atan2(f.vel.y, f.vel.x);
    f.angles[0] += clamp(wrap(a - f.angles[0]), -0.25 * dt, 0.25 * dt);
    resolveChain(f.joints, f.angles, LINK * k * f.size, MAX_BEND);
    f.phase += (0.15 + Math.hypot(f.vel.x, f.vel.y) / k * 0.12) * dt;
  }

  // The school's heading, for swapping in the next creature facing the same way.
  let hx = 0, hy = 0;
  for (const f of s.fish) { hx += Math.cos(f.angles[0]); hy += Math.sin(f.angles[0]); }
  s.heading = Math.atan2(hy, hx);
}

function drawFish(ctx, s, f, look) {
  const sc = { scale: s.scale * f.size };
  const last = JOINTS - 1;
  // Tail fin, beating side to side.
  const tailAngle = f.angles[last] + Math.PI + Math.sin(f.phase) * 0.45;
  const root = f.joints[last];
  fillOutline(ctx, [
    root,
    add(root, polar(tailAngle + 0.55, 9 * sc.scale)),
    add(root, polar(tailAngle, 6 * sc.scale)),
    add(root, polar(tailAngle - 0.55, 9 * sc.scale)),
  ], look.fin);

  const pts = [];
  for (let i = 0; i < JOINTS; i++) pts.push(bodyPoint(f, sc, i, Math.PI / 2));
  for (let i = last; i >= 0; i--) pts.push(bodyPoint(f, sc, i, -Math.PI / 2));
  pts.push(bodyPoint(f, sc, 0, 0, 1.5));
  fillOutline(ctx, pts, f.color);

  ctx.fillStyle = INK;
  const eye = bodyPoint(f, sc, 0, 0.9, -2.6);
  const eye2 = bodyPoint(f, sc, 0, -0.9, -2.6);
  for (const e of [eye, eye2]) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, 1.1 * sc.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  if (look.antenna) {
    // A thin stalk bobbing ahead of the head, ending in a glowing bead.
    const base = f.joints[0];
    const tip = add(base, polar(f.angles[0] + Math.sin(f.phase * 0.5) * 0.35, 10 * sc.scale));
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = look.antenna;
    ctx.shadowColor = look.antenna;
    ctx.shadowBlur = 6 * sc.scale;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 1.8 * sc.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function draw(ctx, s, look) {
  for (const f of s.fish) drawFish(ctx, s, f, look);
}

function center(s) {
  let x = 0, y = 0;
  for (const f of s.fish) { x += f.joints[1].x; y += f.joints[1].y; }
  return { x: x / s.fish.length, y: y / s.fish.length };
}

export function makeFish(look) {
  return {
    label: look.label,
    create: (...args) => create(look, ...args),
    update,
    draw: (ctx, s) => draw(ctx, s, look),
    center,
    footprint: (s) => 60 * s.scale,
  };
}

export default makeFish(FISH);
