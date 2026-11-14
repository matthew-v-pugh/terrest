// Shared pieces for the procedural creatures (after argonaut's "A simple
// procedural animation technique"): distance-constrained joint chains with
// limited bending, two-bone legs, and smooth outlines traced around joints.

export const INK = '#29251d';
export const EYE = '#f5eddf';
export const OUTLINE = 2.4;

export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const polar = (angle, len) => ({ x: Math.cos(angle) * len, y: Math.sin(angle) * len });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function constrainAngle(angle, anchor, limit) {
  const diff = wrap(angle - anchor);
  return Math.abs(diff) <= limit ? angle : anchor + Math.sign(diff) * limit;
}

// Joints follow the head at a fixed spacing; each segment may only bend
// `maxBend` away from the one in front of it.
export function resolveChain(joints, angles, link, maxBend) {
  for (let i = 1; i < joints.length; i++) {
    const prev = joints[i - 1];
    const cur = joints[i];
    const a = constrainAngle(Math.atan2(prev.y - cur.y, prev.x - cur.x), angles[i - 1], maxBend);
    angles[i] = a;
    const back = polar(a, link);
    cur.x = prev.x - back.x;
    cur.y = prev.y - back.y;
  }
}

// A point offset from joint i: `turn` is relative to the body's heading there,
// `radius` is the distance out from the joint.
export function jointPoint(joints, angles, i, turn, radius) {
  return add(joints[i], polar(angles[i] + turn, radius));
}

// Two-bone IK. Of the two possible knees, takes the one that points most
// toward `kneeAngle`: the tail for lizard legs, the head for frog hind legs,
// outward for spider legs.
export function solveTwoBone(hip, foot, a, b, kneeAngle) {
  const [, k1, end] = bendTwoBone(hip, foot, a, b, 1);
  const [, k2] = bendTwoBone(hip, foot, a, b, -1);
  const prefer = polar(kneeAngle, 1);
  const along = (p) => (p.x - hip.x) * prefer.x + (p.y - hip.y) * prefer.y;
  return [hip, along(k1) > along(k2) ? k1 : k2, end];
}

// Two-bone IK with the knee always on one side of the hip-to-foot line: `sign`
// 1 bends it clockwise on screen, -1 anticlockwise. Unlike solveTwoBone, the
// knee can never flip over when the foot sits straight out from the hip.
export function bendTwoBone(hip, foot, a, b, sign) {
  const d = clamp(dist(hip, foot), Math.abs(a - b) + 0.01, a + b - 0.01);
  const toFoot = Math.atan2(foot.y - hip.y, foot.x - hip.x);
  const bend = Math.acos((a * a + d * d - b * b) / (2 * a * d));
  return [hip, add(hip, polar(toFoot + sign * bend, a)), add(hip, polar(toFoot, d))];
}

// Walking gait shared by the legged walkers. Legs in the same `group` step
// together and only one group is in the air at a time; a grounded group steps
// once any of its feet strays a stride from its resting spot (`rest`), landing
// at `plant`. Feet then ease toward their footholds.
export function stepGait(legs, { rest, stride, plant }, k, ease) {
  const airborne = [false, false];
  for (const l of legs) if (dist(l.foot, l.planted) > 2 * k) airborne[l.group] = true;
  // How far each group's worst foot has strayed from rest, in strides.
  const due = [0, 0];
  for (const l of legs) due[l.group] = Math.max(due[l.group], dist(rest(l), l.planted) / stride(l));
  const stepGroup = (group) => { for (const l of legs) if (l.group === group) l.planted = plant(l); };
  if (!airborne[0] && !airborne[1]) {
    // If both groups are due, the one that has strayed furthest goes first.
    // (Always trying group 0 first starved group 1 in fast turns: group 0
    // was due again the moment it landed, so group 1's feet were left behind.)
    const group = due[1] > due[0] ? 1 : 0;
    if (due[group] > 1) stepGroup(group);
  } else {
    // A grounded group left far behind (a hard turn) steps without waiting.
    for (const group of [0, 1]) if (!airborne[group] && due[group] > 1.7) stepGroup(group);
  }
  for (const leg of legs) {
    leg.foot.x += (leg.planted.x - leg.foot.x) * ease;
    leg.foot.y += (leg.planted.y - leg.foot.y) * ease;
  }
}

// Thick limb with an ink outline: ink stroke first, then the skin on top.
export function strokeLimb(ctx, points, width, skin) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [color, w] of [[INK, width + OUTLINE * 2], [skin, width]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

// Closed Catmull-Rom spline through the points, as cubic Béziers.
export function traceClosed(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y,
    );
  }
  ctx.closePath();
}

export function fillOutline(ctx, pts, skin) {
  traceClosed(ctx, pts);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = OUTLINE;
  ctx.stroke();
}

// A glass space helmet over the head: a pale bubble, a metal collar round the
// back where it meets the neck, and a glint lit from the upper left.
export function drawHelmet(ctx, at, r, heading) {
  ctx.fillStyle = 'rgba(190, 220, 236, 0.38)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineCap = 'round';
  for (const [color, width] of [[INK, r * 0.12 + OUTLINE * 2], ['#b4b9be', r * 0.12]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, heading + Math.PI * 0.72, heading + Math.PI * 1.28);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r * 0.7, Math.PI * 1.08, Math.PI * 1.38);
  ctx.stroke();
}

// The same creature in a space helmet. `def.helmet(state)` says where the
// bubble goes: { at, r }.
export function withHelmet(def, label) {
  return {
    ...def,
    label,
    create: (...args) => Object.assign(def.create(...args), { helmeted: true }),
    draw(ctx, s) {
      def.draw(ctx, s);
      const { at, r, heading } = def.helmet(s);
      drawHelmet(ctx, at, r, heading);
    },
  };
}

export function drawEye(ctx, at, r, heading, pupilShape = 'round') {
  ctx.fillStyle = EYE;
  ctx.strokeStyle = INK;
  ctx.lineWidth = OUTLINE * 0.75;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const look = polar(heading, r * 0.3);
  ctx.fillStyle = INK;
  ctx.beginPath();
  if (pupilShape === 'slit') ctx.ellipse(at.x + look.x, at.y + look.y, r * 0.55, r * 0.3, heading + Math.PI / 2, 0, Math.PI * 2);
  else ctx.arc(at.x + look.x, at.y + look.y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}
