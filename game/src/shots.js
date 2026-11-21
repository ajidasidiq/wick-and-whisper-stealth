// Wick & Whisper — the screenshot scenes behind ?shot=cover|play|alarm|exit.
// Each one plays the real rules forward from a fresh world with a simple
// autopilot (breadth-first pathfinding to the nearest relic, then the exit;
// back off when watched, run when chased), so every frame is what a short
// game really looks like, and the same seed always gives the same frame.

import { COLS, ROWS, STEP, TILE } from './config.js';
import { isWalkable, LEVELS } from './levels.js';
import { createWorld, stepWorld } from './world.js';

/** Small deterministic random source, so a shot restages identically. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shortest walkable path between two tiles, as pixel centres. */
function findPath(level, fromCol, fromRow, toCol, toRow) {
  const key = (c, r) => r * COLS + c;
  const prev = new Map();
  const queue = [[fromCol, fromRow]];
  prev.set(key(fromCol, fromRow), null);
  while (queue.length > 0) {
    const [c, r] = queue.shift();
    if (c === toCol && r === toRow) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (!isWalkable(level, nc, nr)) continue;
      if (prev.has(key(nc, nr))) continue;
      prev.set(key(nc, nr), [c, r]);
      queue.push([nc, nr]);
    }
  }
  if (!prev.has(key(toCol, toRow))) return [];
  const tiles = [];
  let node = [toCol, toRow];
  while (node) {
    tiles.push(node);
    node = prev.get(key(node[0], node[1]));
  }
  tiles.reverse();
  return tiles.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }));
}

/** The nearest relic by path length, or the exit when none are left. */
function pickTarget(world) {
  const player = world.player;
  const pCol = Math.floor(player.x / TILE);
  const pRow = Math.floor(player.y / TILE);
  let best = null;
  let bestLen = Infinity;
  for (const relic of world.relics) {
    if (relic.taken) continue;
    const path = findPath(world.level, pCol, pRow, relic.col, relic.row);
    if (path.length > 0 && path.length < bestLen) { bestLen = path.length; best = relic; }
  }
  return best ?? world.exit;
}

function makePilot(caution = 0) {
  // caution 0: bold, 1: careful, 2: ghost — lower retreat threshold, sneak more.
  return { path: [], targetKey: '', replanIn: 0, caution };
}

/** Steer the thief along the path; flee at full speed when the alarm rings. */
function autopilot(world, pilot) {
  const player = world.player;
  const retreatAt = pilot.caution === 0 ? 55 : pilot.caution === 1 ? 35 : 20;
  // A chase is on: run away from the nearest guard at full speed, never sneak.
  if (world.alarmed) {
    let chaser = null;
    let nearest = Infinity;
    for (const guard of world.guards) {
      if (guard.state !== 'chase' && guard.state !== 'search') continue;
      const d = Math.hypot(guard.x - player.x, guard.y - player.y);
      if (d < nearest) { nearest = d; chaser = guard; }
    }
    if (chaser) {
      const dx = player.x - chaser.x;
      const dy = player.y - chaser.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len, sneak: false };
    }
  }
  // Watched and the meter is climbing: back away from the nearest watcher.
  if (world.detection > retreatAt) {
    let watcher = null;
    let nearest = Infinity;
    for (const guard of world.guards) {
      if (!guard.seesPlayer) continue;
      const d = Math.hypot(guard.x - player.x, guard.y - player.y);
      if (d < nearest) { nearest = d; watcher = guard; }
    }
    if (watcher) {
      const dx = player.x - watcher.x;
      const dy = player.y - watcher.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len, sneak: false };
    }
  }
  const target = pickTarget(world);
  const targetKey = `${target.col},${target.row}`;
  pilot.replanIn -= 1;
  if (pilot.path.length === 0 || pilot.targetKey !== targetKey || pilot.replanIn <= 0) {
    const pCol = Math.floor(player.x / TILE);
    const pRow = Math.floor(player.y / TILE);
    pilot.path = findPath(world.level, pCol, pRow, target.col, target.row);
    pilot.targetKey = targetKey;
    pilot.replanIn = 120;
  }
  const node = pilot.path[0];
  if (!node) return { x: 0, y: 0, sneak: false };
  const dx = node.x - player.x;
  const dy = node.y - player.y;
  if (Math.hypot(dx, dy) < 8) pilot.path.shift();
  const len = Math.hypot(dx, dy) || 1;
  const sneak = pilot.caution >= 1 || world.guards.some((g) => g.seesPlayer);
  return { x: dx / len, y: dy / len, sneak };
}

function autopilotInput(world, pilot) {
  const dir = autopilot(world, pilot);
  return {
    left: dir.x < -0.3,
    right: dir.x > 0.3,
    up: dir.y < -0.3,
    down: dir.y > 0.3,
    sneak: dir.sneak,
  };
}

/** Run the world forward with the autopilot; returns the events seen. */
function runForward(world, seconds, stopWhen, caution = 0) {
  const steps = Math.round(seconds / STEP);
  const pilot = makePilot(caution);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, autopilotInput(world, pilot), STEP);
    if (world.status !== 'playing') return;
    if (stopWhen && stopWhen(world)) return;
  }
}

/**
 * Stage the named scene and return the world and the screen to draw over it.
 * cover: level 1, mid-play, a relic or two pocketed and a cone closing in.
 * play: level 2, deep in the gallery among the shadows.
 * alarm: level 3, caught in a cone, the alarm ringing, a guard closing in.
 * exit: level 1 played through to the green door, level cleared.
 */
export function stageShot(name, seed = 7) {
  const rng = mulberry32(seed);
  void rng;
  if (name === 'play') {
    // Deep in the gallery: a live mid-play frame, not a catch. Retry more
    // cautiously if the thief is grabbed on the way there.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const world = createWorld(1, 0, 3);
      runForward(world, 40, (w) => w.relicsTaken >= 2 && w.time > 10, attempt);
      if (world.status === 'playing') return { world, screen: 'playing' };
    }
    const world = createWorld(1, 0, 3);
    runForward(world, 25, null, 2);
    return { world, screen: 'playing' };
  }
  if (name === 'alarm') {
    const world = createWorld(2, 0, 3);
    // Stand in front of the nearest watchman and hold still: the meter fills,
    // the alarm rings, and the guard closes in — stop just short of the catch.
    const guard = world.guards[0];
    world.player.x = guard.x + Math.cos(guard.facing) * 100;
    world.player.y = guard.y + Math.sin(guard.facing) * 100;
    world.player.facing = guard.facing + Math.PI;
    for (let i = 0; i < Math.round(6 / STEP); i += 1) {
      stepWorld(world, { left: false, right: false, up: false, down: false, sneak: false }, STEP);
      if (world.detection >= 100 || world.status !== 'playing') break;
    }
    // A few steps of the chase closing in, stopping before the grab.
    for (let i = 0; i < Math.round(0.45 / STEP); i += 1) {
      const d = Math.hypot(world.player.x - guard.x, world.player.y - guard.y);
      if (d < 42 || world.status !== 'playing') break;
      stepWorld(world, { left: false, right: false, up: false, down: false, sneak: false }, STEP);
    }
    return { world, screen: 'playing' };
  }
  if (name === 'exit') {
    // Play level 1 through to the green door. If the thief is caught, try
    // again more cautiously — a cleared level is the shot we want.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const world = createWorld(0, 0, 3);
      runForward(world, 150, null, attempt);
      if (world.status === 'cleared' || world.status === 'won') {
        return { world, screen: 'cleared' };
      }
    }
    // The autopilot did not make it: walk the thief to the door's step.
    const world = createWorld(0, 0, 3);
    runForward(world, 40, (w) => w.relicsTaken >= 2, 1);
    world.player.x = world.exit.x - 60;
    world.player.y = world.exit.y;
    return { world, screen: 'playing' };
  }
  // cover (default): level 1 until the meter is half full, at most 40 seconds.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const world = createWorld(0, 0, 3);
    runForward(world, 40, (w) => w.detection >= 40 || (w.relicsTaken >= 2 && w.time > 10), attempt);
    if (world.status === 'playing') return { world, screen: 'playing' };
  }
  const world = createWorld(0, 0, 3);
  runForward(world, 25, null, 2);
  return { world, screen: 'playing' };
}

export { LEVELS };
