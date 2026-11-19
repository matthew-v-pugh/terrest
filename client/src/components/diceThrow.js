// Dice thrown across the table: a small physics simulation, worked out up
// front in table-area pixels and then played back by <ThrownDice>.
//
// Each throw leaves the roller's seat at a random angle, speed and spin, lands
// on the table, bounces off the rim, the roll card and the other dice, and
// rolls to a stop. Every client simulates its own throw (only the numbers come
// from the server), so the paths differ from screen to screen but the results
// never do. The results can be filled in after the throw has started: the face
// each die last tumbles onto becomes its real result.

export const DT = 1 / 240;
const MAX_SECONDS = 4.2;
const GRAVITY = 2000;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const spread = (n) => (Math.random() * 2 - 1) * n;
const randFace = (sides, not) => {
  const v = 1 + Math.floor(Math.random() * sides);
  return v === not && sides > 1 ? (v % sides) + 1 : v;
};

// The table as the simulation sees it, measured from the page: the oval
// surface, the roll card sitting on it, and where each seat is.
export function measureTable(area, seatIds) {
  const surfaceEl = area?.querySelector('.table-surface');
  if (!surfaceEl) return null;
  const a = area.getBoundingClientRect();
  const s = surfaceEl.getBoundingClientRect();
  if (!a.width || !s.width) return null;
  const ell = {
    cx: s.left - a.left + s.width / 2, cy: s.top - a.top + s.height / 2, a: s.width / 2, b: s.height / 2,
  };
  // The card is about to show the new roll; while dice are thrown it has no
  // row of dice, so leave that row out of the block the dice bounce off.
  let block = {
    left: ell.cx - 60, right: ell.cx + 60, top: ell.cy - 45, bottom: ell.cy + 45,
  };
  const cardEl = area.querySelector('.roll-display, .table-hint');
  if (cardEl) {
    const c = cardEl.getBoundingClientRect();
    const row = cardEl.querySelector('.roll-dice')?.getBoundingClientRect().height || 0;
    block = {
      left: c.left - a.left, right: c.right - a.left, top: c.top - a.top + row / 2, bottom: c.bottom - a.top - row / 2,
    };
  }
  const seatOf = (userId) => {
    const i = seatIds.indexOf(userId);
    // Someone without a seat throws from the near edge of the table.
    if (i < 0) return { x: a.width / 2, y: a.height * 0.98 };
    // Same placement as the seats in Table.jsx.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / seatIds.length;
    return { x: a.width * (0.5 + 0.4 * Math.cos(angle)), y: a.height * (0.5 + 0.4 * Math.sin(angle)) };
  };
  return { ell, block, seatOf };
}

// How hard a throw is, from 0 (a feeble dribble) to 1 (as hard as it gets).
// A plain click throws at DEFAULT_POWER, which is how throws always used to look.
export const DEFAULT_POWER = 0.4;
// A harder throw leaves the hand faster and keeps its speed longer, so it
// clatters off the rim; a weak one dribbles out and stops short. Both are 1
// at DEFAULT_POWER.
const throwBoost = (power) => 0.3 + 1.75 * power;
const dragScale = (power) => 1.4 - power;
// ...and comes off the rim livelier.
const rimBounce = (power) => Math.max(0, power - DEFAULT_POWER) * 0.3;

function simulate({ from, ell, block, count, sides, r, power }) {
  const unit = ell.a; // speeds scale with the table, so phones and big screens feel alike
  const boost = throwBoost(power);
  const drag = 1.6 * dragScale(power);
  const lively = rimBounce(power);
  const toward = Math.atan2(ell.cy - from.y, ell.cx - from.x);
  const box = {
    l: block.left - r, r: block.right + r, t: block.top - r, b: block.bottom + r,
  };
  const clearOfCard = (x, y) => x < box.l - r || x > box.r + r || y < box.t - r || y > box.b + r;
  const dice = Array.from({ length: count }, (_, i) => {
    // Aim somewhere past the middle of the table, never quite the same place,
    // and never onto the roll card itself.
    let lx;
    let ly;
    for (let tries = 0; tries < 40; tries++) {
      const aim = toward + spread(0.5 + tries * 0.03);
      const reach = 0.15 + Math.random() * 0.55;
      lx = ell.cx + Math.cos(aim) * reach * ell.a + spread(0.3) * ell.a;
      ly = ell.cy + Math.sin(aim) * reach * ell.b + spread(0.3) * ell.b;
      const q = Math.hypot((lx - ell.cx) / ell.a, (ly - ell.cy) / ell.b);
      if (q > 0.75) {
        lx = ell.cx + ((lx - ell.cx) * 0.75) / q;
        ly = ell.cy + ((ly - ell.cy) * 0.75) / q;
      }
      if (clearOfCard(lx, ly)) break;
    }
    const air = 0.3 + Math.random() * 0.16;
    const sx = from.x + spread(14);
    const sy = from.y + spread(10);
    const z0 = 30 + Math.random() * 20;
    return {
      x: sx,
      y: sy,
      z: z0,
      // A harder throw flies farther and faster on the same arc (so it can
      // reach the far rim); a weak one drops short.
      vx: ((lx - sx) / air) * boost,
      vy: ((ly - sy) / air) * boost,
      vz: ((GRAVITY * air * air) / 2 - z0) / air,
      angle: spread(60),
      w: (Math.random() < 0.5 ? -1 : 1) * (500 + Math.random() * 700) * boost,
      delay: i * 0.05 + Math.random() * 0.05,
      inside: false,
      face: randFace(sides),
      faceAngle: 0,
      tilt: spread(18), // the slight angle it comes to rest at
      stopped: false,
      lastMove: 0,
      lastChange: 0,
    };
  });
  const frames = [];
  const hits = []; // [seconds, strength] for table jolts
  const A = ell.a - r;
  const B = ell.b - r;
  const deflect = (d, amount) => {
    const c = Math.cos(amount);
    const s = Math.sin(amount);
    [d.vx, d.vy] = [d.vx * c - d.vy * s, d.vx * s + d.vy * c];
  };
  const newFace = (d) => {
    d.face = randFace(sides, d.face);
    d.faceAngle = d.angle;
    d.lastChange = frames.length;
  };

  let tau = 0;
  for (; tau < MAX_SECONDS; tau += DT) {
    for (const d of dice) {
      if (tau < d.delay || d.stopped) continue;
      const flying = d.z > 0 || d.vz > 0;
      if (flying) {
        d.z += d.vz * DT;
        d.vz -= GRAVITY * DT;
        if (d.z <= 0) {
          // Hits the table: bounces a little lower each time, skids off at a new angle.
          d.z = 0;
          const impact = -d.vz;
          d.vz = impact > 110 ? impact * 0.36 : 0;
          deflect(d, spread(0.45));
          const keep = 0.72 + Math.random() * 0.12;
          d.vx *= keep;
          d.vy *= keep;
          d.w += spread(900);
          newFace(d);
          hits.push([tau, impact / 700]);
        }
      }
      d.x += d.vx * DT;
      d.y += d.vy * DT;
      let speed = Math.hypot(d.vx, d.vy);
      if (!flying && d.z === 0) {
        // Rolling friction, plus drag so fast dice lose speed quicker.
        const lose = (1.1 * unit + drag * speed) * DT;
        const k = speed > lose ? (speed - lose) / speed : 0;
        d.vx *= k;
        d.vy *= k;
        speed *= k;
      }

      // The rim: once a die is over the table it can't leave it.
      const q = ((d.x - ell.cx) / A) ** 2 + ((d.y - ell.cy) / B) ** 2;
      if (!d.inside && q < 0.92) d.inside = true;
      if (d.inside && q > 1) {
        const s = 1 / Math.sqrt(q);
        d.x = ell.cx + (d.x - ell.cx) * s;
        d.y = ell.cy + (d.y - ell.cy) * s;
        let nx = (d.x - ell.cx) / (A * A);
        let ny = (d.y - ell.cy) / (B * B);
        const nl = Math.hypot(nx, ny);
        nx /= nl;
        ny /= nl;
        const vn = d.vx * nx + d.vy * ny;
        if (vn > 0) {
          const e = 0.5 + lively + Math.random() * 0.2;
          d.vx -= (1 + e) * vn * nx;
          d.vy -= (1 + e) * vn * ny;
          d.vx *= 0.9;
          d.vy *= 0.9;
          deflect(d, spread(0.25));
          d.w = -d.w * 0.5 + spread(700);
          newFace(d);
          hits.push([tau, vn / unit / 2.2]);
        }
      }

      // The roll card is a block on the table; dice rolling into it bounce off
      // its sides. Only a die just touching an edge counts: one that's already
      // well over the card (it came down from above) passes across instead of
      // being shoved out sideways, which looks like a burst of speed.
      const pen = [d.x - box.l, box.r - d.x, d.y - box.t, box.b - d.y];
      const depth = Math.min(...pen);
      if (d.z < 16 && depth > 0 && depth < Math.max(6, speed * DT * 2.5)) {
        const side = pen.indexOf(depth);
        const e = 0.45 + Math.random() * 0.2;
        if (side === 0) { d.x = box.l; if (d.vx > 0) d.vx *= -e; }
        if (side === 1) { d.x = box.r; if (d.vx < 0) d.vx *= -e; }
        if (side === 2) { d.y = box.t; if (d.vy > 0) d.vy *= -e; }
        if (side === 3) { d.y = box.b; if (d.vy < 0) d.vy *= -e; }
        deflect(d, spread(0.2));
        d.w += spread(600);
        newFace(d);
      }

      // Spin: dies away, and a slow die rocks onto a face and settles there.
      d.w *= Math.exp(-(d.z > 0 ? 0.6 : 2.6) * DT);
      if (d.z === 0 && d.vz === 0 && speed < 0.3 * unit) {
        const target = Math.round((d.angle - d.tilt) / 360) * 360 + d.tilt;
        d.w += ((target - d.angle) * 70 - d.w * 11) * DT;
        if (speed === 0 && Math.abs(d.w) < 12 && Math.abs(target - d.angle) < 1.2) {
          d.angle = target;
          d.w = 0;
          d.stopped = true;
        }
      }
      d.angle += d.w * DT;
      if (Math.abs(d.angle - d.faceAngle) > 80) newFace(d);
      if (!d.stopped) d.lastMove = tau;
    }

    // Dice on the table knock into each other. (Dice still in the air leave
    // the hand together, so they're left alone.) Overlaps are eased apart a
    // little each step rather than all at once, which looked like a shove.
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const a = dice[i];
        const b = dice[j];
        if (tau < a.delay || tau < b.delay || a.z > 6 || b.z > 6) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= 2 * r) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const push = Math.min(1.5, (2 * r - dist) / 2);
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const jmp = (-(1 + 0.6) * rel) / 2;
          a.vx -= jmp * nx;
          a.vy -= jmp * ny;
          b.vx += jmp * nx;
          b.vy += jmp * ny;
          a.w += spread(500);
          b.w += spread(500);
          a.stopped = false;
          b.stopped = false;
          newFace(a);
          newFace(b);
          hits.push([tau, Math.abs(rel) / unit / 3]);
        }
      }
    }

    frames.push(dice.map((d) => ({
      x: d.x, y: d.y, z: d.z, angle: d.angle, face: d.face, shown: tau >= d.delay,
    })));
    if (tau > 0.3 && dice.every((d) => d.stopped)) break;
  }
  return {
    frames,
    hits,
    stops: dice.map((d) => d.lastMove + DT),
    lastChange: dice.map((d) => d.lastChange),
  };
}

let nextId = 1;

// Plans a throw by `userId` on the measured table. Its results are filled in
// later with applyResults; `start` is set by whoever plays it.
export function planThrow(table, userId, count, sides, power = DEFAULT_POWER) {
  const size = Math.round(clamp(table.ell.a * 0.15, 28, 44));
  const p = clamp(Number.isFinite(power) ? power : DEFAULT_POWER, 0, 1);
  const sim = simulate({
    from: table.seatOf(userId), ell: table.ell, block: table.block, count, sides, r: size * 0.44, power: p,
  });
  // Fit the throw into a sensible length: slow-motion a quick one, hurry a long
  // one. A hard throw is allowed to clatter about a little longer.
  const natural = Math.max(...sim.stops);
  const shortest = count === 1 && sides === 20 ? 1.5 : 1.2;
  const longest = 2.6 + Math.max(0, p - DEFAULT_POWER) * 0.8;
  let speed = 1;
  if (natural < shortest) speed = natural / shortest;
  else if (natural > longest) speed = natural / longest;
  return {
    ...sim,
    id: nextId++,
    sides,
    count,
    size,
    speed,
    lands: sim.stops.map((s) => (s / speed) * 1000), // ms from the start
    results: null,
    start: 0,
  };
}

// Playback frame for a moment `ms` into the throw.
export const frameIndex = (sim, ms) => clamp(Math.floor(((ms / 1000) * sim.speed) / DT), 0, sim.frames.length - 1);

// Fill in the real results: the last face each die tumbles onto becomes its
// result, so it never lands on one number and then switches to another. If the
// results arrive late, frames already played stay as they were.
export function applyResults(sim, results, fromFrame = 0) {
  sim.results = results;
  results.forEach((result, i) => {
    for (let k = Math.max(sim.lastChange[i], fromFrame); k < sim.frames.length; k++) sim.frames[k][i].face = result;
  });
}
