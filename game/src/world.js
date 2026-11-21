// Wick & Whisper — the rules: movement, patrols, vision cones, the detection
// meter, alarms, pickups and the exit. Pure logic, no drawing, no sound.

import {
  ALARM_AT, CATCH_DISTANCE, COLS, CONE_HALF_ANGLE, CONE_RANGE, DETECT_DECAY_RATE,
  DETECT_FULL_RATE, GUARD_CHASE_SPEED, GUARD_PATROL_SPEED, GUARD_RADIUS,
  GUARD_SUSPICIOUS_SPEED, LEVEL_CLEAR_SCORE, NO_ALARM_BONUS, PLAYER_RADIUS,
  PLAYER_SNEAK_SPEED, PLAYER_WALK_SPEED, RELIC_SCORE, ROWS, SEARCH_SECONDS,
  SHADOW_DETECT_FACTOR, SNEAK_DETECT_FACTOR, START_LIVES, STEP, SUSPICIOUS_AT,
  TILE, TIME_BONUS_PER_SECOND,
} from './config.js';
import { blocksSight, findAllTiles, findTile, isCurtain, isShadow, isWalkable, LEVELS } from './levels.js';

export const EVENT_NONE = 0;
export const EVENT_PICKUP = 1;
export const EVENT_ALARM = 2;
export const EVENT_CALM = 4;
export const EVENT_CAUGHT = 8;
export const EVENT_CLEARED = 16;
export const EVENT_SUSPICIOUS = 32;

const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function clampAngle(a) {
  let d = a % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** True when no sight-blocking tile sits between (x0,y0) and (x1,y1). */
export function hasLineOfSight(level, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const col = Math.floor((x0 + dx * t) / TILE);
    const row = Math.floor((y0 + dy * t) / TILE);
    if (blocksSight(level, col, row)) return false;
  }
  return true;
}

/** True when the guard can see the player right now. */
export function guardSeesPlayer(level, guard, player) {
  const dx = player.x - guard.x;
  const dy = player.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > CONE_RANGE) return false;
  const angle = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(angle, guard.facing)) > CONE_HALF_ANGLE) return false;
  return hasLineOfSight(level, guard.x, guard.y, player.x, player.y);
}

function makeGuard(def, index) {
  const first = def.waypoints[0];
  const second = def.waypoints[1] ?? first;
  return {
    id: index,
    x: (first[0] + 0.5) * TILE,
    y: (first[1] + 0.5) * TILE,
    waypoints: def.waypoints.map(([c, r]) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE })),
    targetIndex: 1 % def.waypoints.length,
    speedFactor: def.speed ?? 1,
    facing: Math.atan2((second[1] - first[1]) * TILE, (second[0] - first[0]) * TILE),
    state: 'patrol',
    pause: 0,
    lastSeenX: 0,
    lastSeenY: 0,
    lostSightFor: 0,
    searchFor: 0,
    stepPhase: Math.random() * 10,
  };
}

export function createWorld(levelIndex, score, lives) {
  const level = LEVELS[levelIndex];
  const start = findTile(level, 'P');
  const exit = findTile(level, 'E');
  return {
    levelIndex,
    level,
    time: 0,
    score,
    lives,
    levelScore: 0,
    relicsTaken: 0,
    relics: findAllTiles(level, 'R').map((p) => ({ ...p, taken: false })),
    exit,
    player: {
      x: start.x, y: start.y, radius: PLAYER_RADIUS,
      sneaking: false, moving: false, hidden: false, inShadow: false,
      facing: 0, stepTimer: 0,
    },
    guards: level.guards.map((def, i) => makeGuard(def, i)),
    detection: 0,
    alarmed: false,
    everAlarmed: false,
    status: 'playing', // playing | cleared | caught | gameover | won
    mouseTarget: null,
    message: '',
    messageFor: 0,
  };
}

/** Slide a circle through the walls, axis by axis. */
function moveCircle(level, body, dx, dy) {
  const r = body.radius;
  let nx = body.x + dx;
  if (!circleHitsWall(level, nx, body.y, r)) body.x = nx;
  let ny = body.y + dy;
  if (!circleHitsWall(level, body.x, ny, r)) body.y = ny;
}

function circleHitsWall(level, x, y, r) {
  const c0 = Math.floor((x - r) / TILE);
  const c1 = Math.floor((x + r) / TILE);
  const r0 = Math.floor((y - r) / TILE);
  const r1 = Math.floor((y + r) / TILE);
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      if (isWalkable(level, col, row)) continue;
      const bx = Math.max(col * TILE, Math.min(x, (col + 1) * TILE));
      const by = Math.max(row * TILE, Math.min(y, (row + 1) * TILE));
      const ddx = x - bx;
      const ddy = y - by;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
  }
  return false;
}

function moveGuardToward(world, guard, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  const nx = guard.x + (dx / dist) * step;
  const ny = guard.y + (dy / dist) * step;
  if (!circleHitsWall(world.level, nx, guard.y, GUARD_RADIUS)) guard.x = nx;
  if (!circleHitsWall(world.level, guard.x, ny, GUARD_RADIUS)) guard.y = ny;
  guard.facing = Math.atan2(dy, dx);
  return dist - step < 2;
}

/**
 * Advance the world one fixed step. `input` carries the keys held and the
 * mouse target, or null for a paused frame. Returns an event bitmask.
 */
export function stepWorld(world, input, dt = STEP) {
  if (world.status !== 'playing') return EVENT_NONE;
  const level = world.level;
  const player = world.player;
  world.time += dt;
  let events = EVENT_NONE;

  // --- Player movement: keys first, mouse click-to-move second. ---
  let mx = 0;
  let my = 0;
  if (input) {
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
  }
  const wasMoving = player.moving;
  player.moving = false;
  player.sneaking = Boolean(input && input.sneak);
  const speed = player.sneaking ? PLAYER_SNEAK_SPEED : PLAYER_WALK_SPEED;
  if (mx !== 0 || my !== 0) {
    world.mouseTarget = null;
    const len = Math.hypot(mx, my);
    moveCircle(level, player, (mx / len) * speed * dt, (my / len) * speed * dt);
    player.facing = Math.atan2(my, mx);
    player.moving = true;
  } else if (world.mouseTarget) {
    const dx = world.mouseTarget.x - player.x;
    const dy = world.mouseTarget.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6) {
      moveCircle(level, player, (dx / dist) * speed * dt, (dy / dist) * speed * dt);
      player.facing = Math.atan2(dy, dx);
      player.moving = true;
    } else {
      world.mouseTarget = null;
    }
  }
  if (player.moving && !wasMoving) player.stepTimer = 0;

  const pCol = Math.floor(player.x / TILE);
  const pRow = Math.floor(player.y / TILE);
  player.hidden = isCurtain(level, pCol, pRow);
  player.inShadow = isShadow(level, pCol, pRow);

  // --- Vision: every guard checks the player. ---
  let anySees = false;
  let nearestSeenDist = Infinity;
  for (const guard of world.guards) {
    const sees = !player.hidden && guardSeesPlayer(level, guard, player);
    guard.seesPlayer = sees;
    if (sees) {
      anySees = true;
      const d = Math.hypot(player.x - guard.x, player.y - guard.y);
      if (d < nearestSeenDist) nearestSeenDist = d;
      guard.lastSeenX = player.x;
      guard.lastSeenY = player.y;
      guard.lostSightFor = 0;
    } else if (guard.state === 'chase' || guard.state === 'search') {
      guard.lostSightFor += dt;
    }
  }

  // --- Detection meter: rises in a cone, falls when unseen. ---
  const wasAlarmed = world.alarmed;
  const wasSuspicious = world.detection >= SUSPICIOUS_AT && world.detection < ALARM_AT;
  if (anySees) {
    const rangeFactor = 1 - 0.55 * (nearestSeenDist / CONE_RANGE);
    let rate = DETECT_FULL_RATE * rangeFactor;
    if (player.inShadow) rate *= SHADOW_DETECT_FACTOR;
    if (player.sneaking) rate *= SNEAK_DETECT_FACTOR;
    world.detection = Math.min(ALARM_AT, world.detection + rate * dt);
  } else {
    world.detection = Math.max(0, world.detection - DETECT_DECAY_RATE * dt);
  }
  if (world.detection >= ALARM_AT && !world.alarmed) {
    world.alarmed = true;
    world.everAlarmed = true;
    events |= EVENT_ALARM;
    for (const guard of world.guards) {
      if (guard.state !== 'chase') { guard.state = 'chase'; guard.lostSightFor = 0; }
    }
  }
  if (!wasSuspicious && world.detection >= SUSPICIOUS_AT && world.detection < ALARM_AT) {
    events |= EVENT_SUSPICIOUS;
  }

  // --- Guards: patrol, stare, chase, search, return. ---
  for (const guard of world.guards) {
    guard.stepPhase += dt * (guard.state === 'patrol' ? 3.2 : 5.5);
    if (world.alarmed && guard.state !== 'chase' && guard.state !== 'search') {
      guard.state = 'chase';
    }
    if (guard.state === 'patrol') {
      if (guard.pause > 0) {
        guard.pause -= dt;
        guard.facing = clampAngle(guard.facing + Math.sin(world.time * 0.7 + guard.id) * 0.35 * dt);
      } else {
        const target = guard.waypoints[guard.targetIndex];
        const arrived = moveGuardToward(world, guard, target.x, target.y, GUARD_PATROL_SPEED * guard.speedFactor, dt);
        if (arrived) {
          guard.targetIndex = (guard.targetIndex + 1) % guard.waypoints.length;
          guard.pause = 1.4;
        }
      }
      if (world.detection >= SUSPICIOUS_AT && guard.seesPlayer) guard.state = 'suspicious';
    } else if (guard.state === 'suspicious') {
      guard.facing = Math.atan2(player.y - guard.y, player.x - guard.x);
      if (guard.seesPlayer) {
        moveGuardToward(world, guard, player.x, player.y, GUARD_SUSPICIOUS_SPEED * guard.speedFactor, dt);
      } else if (world.detection < 20) {
        guard.state = 'patrol';
      }
      if (world.alarmed) guard.state = 'chase';
    } else if (guard.state === 'chase') {
      if (guard.seesPlayer) {
        moveGuardToward(world, guard, player.x, player.y, GUARD_CHASE_SPEED * guard.speedFactor, dt);
      } else if (guard.lostSightFor > 1.2) {
        guard.state = 'search';
        guard.searchFor = SEARCH_SECONDS;
      } else {
        moveGuardToward(world, guard, guard.lastSeenX, guard.lastSeenY, GUARD_CHASE_SPEED * guard.speedFactor, dt);
      }
      const d = Math.hypot(player.x - guard.x, player.y - guard.y);
      if (d < CATCH_DISTANCE && !player.hidden) {
        world.status = 'caught';
        world.lives -= 1;
        events |= EVENT_CAUGHT;
        if (world.lives <= 0) world.status = 'gameover';
        return events;
      }
    } else if (guard.state === 'search') {
      const arrived = moveGuardToward(world, guard, guard.lastSeenX, guard.lastSeenY, GUARD_SUSPICIOUS_SPEED * guard.speedFactor, dt);
      if (arrived) {
        guard.searchFor -= dt;
        guard.facing = clampAngle(guard.facing + 1.9 * dt);
        if (guard.searchFor <= 0) {
          guard.state = 'return';
          if (world.detection <= 0) {
            world.alarmed = false;
            events |= EVENT_CALM;
          }
        }
      }
      if (guard.seesPlayer && world.detection >= ALARM_AT) guard.state = 'chase';
    } else if (guard.state === 'return') {
      let best = guard.waypoints[0];
      let bestDist = Infinity;
      for (const wp of guard.waypoints) {
        const d = Math.hypot(wp.x - guard.x, wp.y - guard.y);
        if (d < bestDist) { bestDist = d; best = wp; }
      }
      const arrived = moveGuardToward(world, guard, best.x, best.y, GUARD_PATROL_SPEED * guard.speedFactor, dt);
      if (arrived) {
        guard.state = 'patrol';
        guard.targetIndex = guard.waypoints.indexOf(best);
        if (world.detection <= 0 && world.alarmed) {
          world.alarmed = false;
          events |= EVENT_CALM;
        }
      }
    }
  }
  if (!world.alarmed && wasAlarmed && world.detection <= 0) events |= EVENT_CALM;

  // --- Relics. ---
  for (const relic of world.relics) {
    if (!relic.taken && Math.hypot(player.x - relic.x, player.y - relic.y) < 26) {
      relic.taken = true;
      world.relicsTaken += 1;
      world.score += RELIC_SCORE;
      world.levelScore += RELIC_SCORE;
      events |= EVENT_PICKUP;
    }
  }

  // --- Exit: step on the green door unseen to clear the level. ---
  const exitDist = Math.hypot(player.x - world.exit.x, player.y - world.exit.y);
  if (exitDist < 24) {
    const timeBonus = Math.max(0, Math.round((world.level.parSeconds - world.time) * TIME_BONUS_PER_SECOND));
    const quietBonus = world.everAlarmed ? 0 : NO_ALARM_BONUS;
    world.score += LEVEL_CLEAR_SCORE + timeBonus + quietBonus;
    world.levelScore += LEVEL_CLEAR_SCORE + timeBonus + quietBonus;
    world.clearBonus = { timeBonus, quietBonus };
    world.status = world.levelIndex >= LEVELS.length - 1 ? 'won' : 'cleared';
    events |= EVENT_CLEARED;
  }

  if (world.messageFor > 0) world.messageFor -= dt;
  return events;
}

/** Column/row bounds helpers for the renderer and the autopilot. */
export { COLS, ROWS };
