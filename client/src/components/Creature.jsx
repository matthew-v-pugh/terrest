// Canvas host for the procedural creatures. Runs the animation loop, follows
// the pointer (or wanders when it's idle), draws a ground shadow whenever the
// creature is off the ground, pops a new creature in with a little hop when
// `kind` changes, and keeps any slime trail on the page for as long as it's open.
import { useEffect, useRef, useState } from 'react';
import axolotl from './creatures/axolotl.js';
import { ALIEN_FISH, FISH, makeFish } from './creatures/fish.js';
import frog from './creatures/frog.js';
import lizard from './creatures/lizard.js';
import { LAVA_SNAIL, SNAIL, makeSnail } from './creatures/snail.js';
import snake from './creatures/snake.js';
import spider from './creatures/spider.js';
import { TORTOISE, TURTLE, makeTurtle } from './creatures/turtle.js';
import { INK, dist, withHelmet } from './creatures/common.js';

export const CREATURES = {
  lizard,
  frog,
  spider,
  snail: makeSnail(SNAIL),
  lavaSnail: makeSnail(LAVA_SNAIL),
  tortoise: makeTurtle(TORTOISE),
  spaceLizard: withHelmet(lizard, 'Space lizard'),
  spaceSnake: withHelmet(snake, 'Space snake'),
  alienFish: makeFish(ALIEN_FISH),
  fish: makeFish(FISH),
  axolotl,
  turtle: makeTurtle(TURTLE),
};

// Which creatures live in each scene background. An uploaded background
// ('custom') has no biome, so every creature is welcome there.
export const BIOMES = {
  organic: ['lizard', 'frog', 'spider', 'snail'],
  lava: ['lavaSnail', 'lizard', 'tortoise'],
  space: ['spaceLizard', 'spaceSnake', 'alienFish'],
  ocean: ['fish', 'axolotl', 'turtle'],
};

const POP_MS = 560;
const TRAIL_SPACING = 2.5;
const MAX_TRAIL_POINTS = 8000;
const SLIME = [['rgba(150, 144, 108, 0.28)', 1], ['rgba(245, 237, 223, 0.32)', 0.12]];

const CREATURE_KEY = 'terrest:creature';

// The chosen creature for a biome (one of its creatures, or 'none' where
// `allowNone`). Remembered per biome in this browser only, so each person picks
// their own and nobody else sees it. Returns [choice, next] where `next` cycles.
export function useCreatureChoice(biome, allowNone = false) {
  const known = biome in BIOMES || biome === 'custom' ? biome : 'organic';
  const kinds = known === 'custom' ? Object.keys(CREATURES) : BIOMES[known];
  const options = [...kinds, ...(allowNone ? ['none'] : [])];
  const key = `${CREATURE_KEY}:${known}`;
  const [picked, setPicked] = useState({});
  let stored = picked[key];
  if (stored === undefined) {
    try { stored = localStorage.getItem(key); } catch { /* storage unavailable */ }
  }
  const choice = options.includes(stored) ? stored : options[0];

  function next() {
    const n = options[(options.indexOf(choice) + 1) % options.length];
    setPicked((p) => ({ ...p, [key]: n }));
    try { localStorage.setItem(key, n); } catch { /* storage unavailable */ }
  }
  return [choice, next];
}

// The top-left button that cycles through the biome's creatures.
export function CreatureButton({ choice, onNext }) {
  const label = CREATURES[choice]?.label || 'None';
  return (
    <button type="button" className="btn small creature-btn" onClick={onNext} aria-label={`Change creature (currently ${label})`}>
      Creature: {label}
    </button>
  );
}

// Overshoots past 1 and settles back, for a springy pop.
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

export default function Creature({ kind }) {
  const canvasRef = useRef(null);
  const swapRef = useRef(null);
  const kindRef = useRef(kind);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let scale = 0.42;
    let def = CREATURES[kindRef.current] || lizard;
    let creature = null;
    let popStart = -Infinity;
    let frame = 0;
    let last = performance.now();
    let pointer = null;
    let lastPointerMove = -Infinity;
    // Trails outlive the creature that laid them: each is { width, points }.
    const trails = [];
    let trailOpen = false;
    let trailPoints = 0;

    function recordTrail(now) {
      if (!def.trail || now - popStart < POP_MS) { trailOpen = false; return; }
      if (!trailOpen) {
        trails.push({ width: def.trail.width(creature), colors: def.trail.colors || SLIME, points: [] });
        trailOpen = true;
      }
      const line = trails.at(-1);
      const p = def.trail.point(creature);
      const prev = line.points.at(-1);
      if (prev && dist(prev, p) < TRAIL_SPACING) return;
      line.points.push({ x: p.x, y: p.y });
      // Past the cap, the oldest slime dries up first.
      if (++trailPoints > MAX_TRAIL_POINTS) {
        trails[0].points.shift();
        trailPoints--;
        if (trails[0].points.length === 0 && trails.length > 1) trails.shift();
      }
    }

    function drawTrails() {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Each line in its creature's colours: a soft wide smear, then a glisten.
      for (const line of trails) {
        if (line.points.length < 2) continue;
        for (const [color, share] of line.colors) {
          ctx.strokeStyle = color;
          ctx.lineWidth = line.width * share;
          ctx.beginPath();
          ctx.moveTo(line.points[0].x, line.points[0].y);
          for (const p of line.points) ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }

    // Without a recent pointer (idle mouse, touch screens), wander a slow loop.
    function target(now) {
      const margin = 40;
      if (pointer && now - lastPointerMove < 4000) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.min(width - margin, Math.max(margin, pointer.x - rect.left)),
          y: Math.min(height - margin, Math.max(margin, pointer.y - rect.top)),
        };
      }
      const t = now / 1000;
      return { x: width / 2 + width * 0.36 * Math.cos(t * 0.13), y: height * 0.55 + height * 0.32 * Math.sin(t * 0.21) };
    }

    // Settle into a natural resting pose without animating (reduced motion).
    function settle() {
      for (let i = 0; i < 240; i++) def.update(creature, { x: width * 0.3, y: height * 0.62 }, 1);
    }

    function render(now) {
      ctx.clearRect(0, 0, width, height);
      drawTrails();
      const pop = Math.min(1, (now - popStart) / POP_MS);
      const popScale = pop < 1 ? Math.max(0.001, easeOutBack(Math.min(1, pop * 1.3))) : 1;
      const z = (creature.z || 0) + (pop < 1 ? Math.sin(pop * Math.PI) * 46 * (scale / 0.42) : 0);
      const c = def.center(creature);

      if (z > 0.5) {
        // Shadow stays on the ground, shrinking and fading as it rises.
        const r = def.footprint(creature) * popScale * Math.max(0.55, 1 - z / 220);
        ctx.fillStyle = INK;
        ctx.globalAlpha = 0.16 * Math.max(0.35, 1 - z / 160);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + 4, r, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Height reads as lifting up the screen and growing slightly toward the viewer.
      const s = popScale * (1 + z / 380);
      ctx.save();
      ctx.translate(c.x, c.y - z * 0.6);
      ctx.scale(s, s);
      ctx.translate(-c.x, -c.y);
      def.draw(ctx, creature);
      ctx.restore();
    }

    function tick(now) {
      const dt = Math.min(3, (now - last) / (1000 / 60));
      last = now;
      // Hold still while popping in, then get moving.
      if (now - popStart > POP_MS * 0.6) def.update(creature, target(now), dt);
      recordTrail(now);
      render(now);
      frame = requestAnimationFrame(tick);
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const next = Math.max(0.24, Math.min(0.42, width / 3000));
      if (!creature || Math.abs(next - scale) > 0.02) {
        scale = next;
        creature = def.create(width * 0.18, height * 0.82, scale);
        if (reduceMotion) settle();
      }
    }

    // Replace the creature where the old one stood, facing the same way.
    swapRef.current = (nextKind) => {
      const nextDef = CREATURES[nextKind];
      if (!nextDef || nextDef === def) return;
      const at = def.center(creature);
      trailOpen = false; // a new creature starts a fresh trail line
      const heading = creature.heading;
      def = nextDef;
      creature = def.create(at.x, at.y, scale, heading);
      if (reduceMotion) {
        settle();
        render(performance.now());
      } else {
        popStart = performance.now();
      }
    };

    const onMove = (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      lastPointerMove = performance.now();
    };
    const onLeave = () => { pointer = null; };

    resize();
    const observer = new ResizeObserver(() => { resize(); if (reduceMotion) render(performance.now()); });
    observer.observe(canvas);

    if (reduceMotion) {
      render(performance.now());
    } else {
      window.addEventListener('pointermove', onMove);
      document.addEventListener('pointerleave', onLeave);
      frame = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      swapRef.current = null;
    };
  }, []);

  useEffect(() => {
    kindRef.current = kind;
    swapRef.current?.(kind);
  }, [kind]);

  return <canvas ref={canvasRef} className="creature-canvas" aria-hidden="true" />;
}
