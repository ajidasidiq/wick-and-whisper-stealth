// Wick & Whisper — everything the eye sees: the manor floor, walls and cover,
// the guards' vision cones clipped by walls, the thief, the relics, the exit,
// the night lighting, the HUD and the title and end screens.

import {
  CANVAS_H, CANVAS_W, COLS, CONE_HALF_ANGLE, CONE_RANGE, FIELD_H, FIELD_W,
  GUARD_RADIUS, HUD_H, PLAYER_RADIUS, ROWS, TILE,
} from './config.js';
import { blocksSight, isCurtain, isShadow, tileAt } from './levels.js';

const TAU = Math.PI * 2;

/** Deterministic shade for a tile, so the floor never flickers. */
function tileHash(col, row) {
  let h = (col * 374761393 + row * 668265263) ^ 0x5bf03635;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

/** Distance from (x,y) along `angle` until a sight-blocking tile or the range. */
function coneRayLength(level, x, y, angle, maxLen) {
  const step = 6;
  for (let d = step; d <= maxLen; d += step) {
    const col = Math.floor((x + Math.cos(angle) * d) / TILE);
    const row = Math.floor((y + Math.sin(angle) * d) / TILE);
    if (blocksSight(level, col, row)) return d;
  }
  return maxLen;
}

/** The cone as a polygon whose edges stop at walls. */
function conePolygon(level, guard) {
  const points = [{ x: guard.x, y: guard.y }];
  const rays = 26;
  for (let i = 0; i <= rays; i += 1) {
    const angle = guard.facing - CONE_HALF_ANGLE + (2 * CONE_HALF_ANGLE * i) / rays;
    const len = coneRayLength(level, guard.x, guard.y, angle, CONE_RANGE);
    points.push({ x: guard.x + Math.cos(angle) * len, y: guard.y + Math.sin(angle) * len });
  }
  return points;
}

function drawFloor(ctx, level) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = tileAt(level, col, row);
      const x = col * TILE;
      const y = row * TILE;
      const shade = tileHash(col, row);
      if (tile === '#') {
        ctx.fillStyle = '#241d33';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#322a47';
        ctx.fillRect(x, y + TILE - 6, TILE, 3);
        ctx.fillStyle = '#1a1426';
        ctx.fillRect(x, y, TILE, 3);
      } else if (tile === ',') {
        ctx.fillStyle = `rgb(${38 + shade * 8}, ${34 + shade * 6}, ${52 + shade * 10})`;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(120, 130, 200, 0.05)';
        ctx.fillRect(x, y, TILE, 2);
      } else {
        const base = 74 + shade * 14;
        ctx.fillStyle = `rgb(${base + 12}, ${base - 8}, ${base - 30})`;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(x, y + TILE - 2, TILE, 2);
        ctx.fillStyle = 'rgba(255,220,150,0.05)';
        ctx.fillRect(x, y, TILE, 1);
        if (tile === 'H') {
          ctx.fillStyle = '#5d1f2b';
          ctx.fillRect(x + 4, y, TILE - 8, TILE);
          ctx.fillStyle = '#7a2836';
          for (let fold = 0; fold < 4; fold += 1) ctx.fillRect(x + 7 + fold * 8, y, 3, TILE);
          ctx.fillStyle = '#c9a227';
          ctx.fillRect(x + 4, y, TILE - 8, 3);
        }
      }
    }
  }
}

function drawCover(ctx, level) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = tileAt(level, col, row);
      const x = col * TILE;
      const y = row * TILE;
      if (tile === 'C') {
        ctx.fillStyle = '#6b4a26';
        ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = '#8a6234';
        ctx.fillRect(x + 3, y + 3, TILE - 6, 8);
        ctx.strokeStyle = '#4a3016';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 3);
        ctx.lineTo(x + TILE - 3, y + TILE - 3);
        ctx.moveTo(x + TILE - 3, y + 3);
        ctx.lineTo(x + 3, y + TILE - 3);
        ctx.stroke();
      } else if (tile === 'B') {
        ctx.fillStyle = '#3d2b1a';
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        const colors = ['#7a3b2e', '#2e5d3a', '#3a4a7a', '#8a6d2f', '#5d2e5d'];
        for (let shelf = 0; shelf < 3; shelf += 1) {
          for (let book = 0; book < 5; book += 1) {
            ctx.fillStyle = colors[(col + row + shelf * 2 + book) % colors.length];
            ctx.fillRect(x + 5 + book * 6, y + 5 + shelf * 11, 5, 9);
          }
        }
      }
    }
  }
}

function drawRelics(ctx, world) {
  for (const relic of world.relics) {
    if (relic.taken) continue;
    const pulse = 0.5 + 0.5 * Math.sin(world.time * 3 + relic.col);
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.3;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(relic.x, relic.y, 22 + pulse * 4, 0, TAU);
    ctx.fill();
    ctx.restore();
    // A golden candlestick: stem, arms, three flames.
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(relic.x - 2, relic.y - 4, 4, 14);
    ctx.fillRect(relic.x - 9, relic.y + 8, 18, 3);
    ctx.fillRect(relic.x - 10, relic.y + 2, 3, 8);
    ctx.fillRect(relic.x + 7, relic.y + 2, 3, 8);
    ctx.fillStyle = '#ffe9a3';
    for (const fx of [-9, 0, 9]) {
      ctx.beginPath();
      ctx.ellipse(relic.x + fx, relic.y - 8, 2.5, 5, 0, 0, TAU);
      ctx.fill();
    }
  }
}

function drawExit(ctx, world) {
  const { x, y } = world.exit;
  const pulse = 0.5 + 0.5 * Math.sin(world.time * 2.4);
  ctx.save();
  ctx.globalAlpha = 0.3 + pulse * 0.25;
  ctx.fillStyle = '#39d98a';
  ctx.beginPath();
  ctx.arc(x, y, 26 + pulse * 5, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0e3d24';
  ctx.fillRect(x - 14, y - 18, 28, 36);
  ctx.fillStyle = '#1f7a4a';
  ctx.fillRect(x - 11, y - 15, 22, 30);
  ctx.fillStyle = '#39d98a';
  ctx.fillRect(x - 11, y - 15, 22, 4);
  ctx.fillStyle = '#d8ffe9';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', x, y + 1);
}

function drawVisionCone(ctx, level, guard, detection) {
  const polygon = conePolygon(level, guard);
  let fill = 'rgba(255, 214, 90, 0.20)';
  let edge = 'rgba(255, 214, 90, 0.55)';
  if (guard.state === 'chase' || detection >= 100) {
    fill = 'rgba(255, 70, 60, 0.30)';
    edge = 'rgba(255, 70, 60, 0.8)';
  } else if (guard.state === 'suspicious' || detection >= 42) {
    fill = 'rgba(255, 150, 50, 0.26)';
    edge = 'rgba(255, 150, 50, 0.7)';
  }
  ctx.beginPath();
  ctx.moveTo(polygon[0].x, polygon[0].y);
  for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i].x, polygon[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawGuard(ctx, guard, world) {
  const bob = Math.sin(guard.stepPhase) * 1.5;
  ctx.save();
  ctx.translate(guard.x, guard.y + bob * 0.4);
  // Lantern glow behind the watchman.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffca5f';
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Body: dark blue coat.
  ctx.fillStyle = guard.state === 'chase' ? '#7a2020' : '#2e3d5c';
  ctx.beginPath();
  ctx.arc(0, 0, GUARD_RADIUS, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#10141f';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Brass helmet and brim.
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.arc(0, -2, 8, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-10, -3, 20, 3);
  // Face turned toward the patrol direction.
  const fx = Math.cos(guard.facing);
  const fy = Math.sin(guard.facing);
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(fx * 5, fy * 5 + 1, 5.5, 0, TAU);
  ctx.fill();
  // Lantern in hand, swinging toward the facing.
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(fx * 17, fy * 17, 4.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8a6234';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // State mark above the head: ? when suspicious, ! when chasing.
  if (guard.state === 'suspicious' || guard.state === 'search') {
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', guard.x, guard.y - 26);
  } else if (guard.state === 'chase') {
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', guard.x, guard.y - 26);
  }
}

function drawPlayer(ctx, world) {
  const player = world.player;
  const sneak = player.sneaking;
  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.hidden) ctx.globalAlpha = 0.45;
  // Cloak shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 13, 6, 0, 0, TAU);
  ctx.fill();
  // Hooded cloak.
  ctx.fillStyle = sneak ? '#5a3d75' : '#6b4a8a';
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_RADIUS, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#1c1026';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Hood point toward the facing.
  const fx = Math.cos(player.facing);
  const fy = Math.sin(player.facing);
  ctx.fillStyle = '#5e3d78';
  ctx.beginPath();
  ctx.moveTo(fx * 14, fy * 14);
  ctx.lineTo(fx * 4 - fy * 7, fy * 4 + fx * 7);
  ctx.lineTo(fx * 4 + fy * 7, fy * 4 - fx * 7);
  ctx.closePath();
  ctx.fill();
  // Eyes in the dark hood.
  ctx.fillStyle = '#ffe9a3';
  ctx.beginPath();
  ctx.arc(fx * 6 - fy * 3.5, fy * 6 + fx * 3.5, 1.8, 0, TAU);
  ctx.arc(fx * 6 + fy * 3.5, fy * 6 - fx * 3.5, 1.8, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Mouse move target marker.
  if (world.mouseTarget) {
    ctx.strokeStyle = 'rgba(255, 233, 163, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(world.mouseTarget.x, world.mouseTarget.y, 8, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(world.mouseTarget.x - 12, world.mouseTarget.y);
    ctx.lineTo(world.mouseTarget.x + 12, world.mouseTarget.y);
    ctx.moveTo(world.mouseTarget.x, world.mouseTarget.y - 12);
    ctx.lineTo(world.mouseTarget.x, world.mouseTarget.y + 12);
    ctx.stroke();
  }
}

/** Night falls over the manor; pools of light stay around the thief and lanterns. */
let lightCanvas = null;
function drawLighting(ctx, world) {
  if (!lightCanvas) {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = FIELD_W;
    lightCanvas.height = FIELD_H;
  }
  const light = lightCanvas.getContext('2d');
  light.clearRect(0, 0, FIELD_W, FIELD_H);
  light.fillStyle = 'rgba(6, 8, 20, 0.55)';
  light.fillRect(0, 0, FIELD_W, FIELD_H);
  light.globalCompositeOperation = 'destination-out';
  const holes = [
    { x: world.player.x, y: world.player.y, r: 130 },
    { x: world.exit.x, y: world.exit.y, r: 90 },
  ];
  for (const guard of world.guards) holes.push({ x: guard.x, y: guard.y, r: 110 });
  for (const relic of world.relics) {
    if (!relic.taken) holes.push({ x: relic.x, y: relic.y, r: 55 });
  }
  for (const hole of holes) {
    const gradient = light.createRadialGradient(hole.x, hole.y, 10, hole.x, hole.y, hole.r);
    gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    light.fillStyle = gradient;
    light.beginPath();
    light.arc(hole.x, hole.y, hole.r, 0, TAU);
    light.fill();
  }
  light.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCanvas, 0, 0);
}

function drawHud(ctx, world) {
  ctx.fillStyle = '#14101f';
  ctx.fillRect(0, 0, CANVAS_W, HUD_H);
  ctx.fillStyle = '#2a2140';
  ctx.fillRect(0, HUD_H - 2, CANVAS_W, 2);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2e6c9';
  ctx.font = 'bold 19px Georgia, serif';
  ctx.fillText(`Wick & Whisper — ${world.level.name}`, 14, 20);
  ctx.fillStyle = '#b8a888';
  ctx.font = '13px Georgia, serif';
  ctx.fillText(world.level.hint, 14, 44);

  // Relics, score, lives, time on the right.
  const totalRelics = world.relics.length;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText(`◆ ${world.relicsTaken}/${totalRelics}`, CANVAS_W - 230, 20);
  ctx.fillStyle = '#f2e6c9';
  ctx.fillText(`Score ${world.score}`, CANVAS_W - 150, 20);
  ctx.fillStyle = '#ff8a7a';
  ctx.fillText('♥'.repeat(Math.max(0, world.lives)), CANVAS_W - 14, 20);
  ctx.fillStyle = '#b8a888';
  ctx.font = '13px Georgia, serif';
  const mins = Math.floor(world.time / 60);
  const secs = Math.floor(world.time % 60);
  ctx.fillText(`⏱ ${mins}:${String(secs).padStart(2, '0')}`, CANVAS_W - 14, 44);

  // Detection meter, right of the hint text.
  const meterW = 250;
  const meterX = 470;
  const meterY = 44;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#b8a888';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.fillText('SEEN', meterX - 42, meterY + 7);
  ctx.fillStyle = '#241d33';
  ctx.fillRect(meterX, meterY, meterW, 12);
  const ratio = world.detection / 100;
  ctx.fillStyle = world.detection >= 100 ? '#ff4030' : world.detection >= 42 ? '#ff9a30' : '#ffd76a';
  ctx.fillRect(meterX, meterY, meterW * ratio, 12);
  ctx.strokeStyle = '#5a4a7a';
  ctx.lineWidth = 1;
  ctx.strokeRect(meterX, meterY, meterW, 12);
  if (world.alarmed) {
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('! ALARM — BREAK LINE OF SIGHT !', CANVAS_W / 2, 20);
  } else if (world.detection >= 42) {
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('? A watchman is suspicious…', CANVAS_W / 2, 20);
  }
  if (world.player.hidden) {
    ctx.fillStyle = '#9ecfff';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Hidden in the curtains', CANVAS_W / 2, 20);
  }
}

function drawTitleScreen(ctx, world, message) {
  ctx.fillStyle = 'rgba(8, 6, 16, 0.88)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillText('Wick & Whisper', CANVAS_W / 2, 170);
  ctx.fillStyle = '#c9a227';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('a candlelit stealth heist in three manors', CANVAS_W / 2, 208);
  ctx.fillStyle = '#f2e6c9';
  ctx.font = '17px Georgia, serif';
  const lines = [
    'You are Wick, a thief in the night. Steal the golden candlesticks,',
    'slip past the watchmen, and reach the green door — unseen.',
    '',
    'WASD or arrows to move  •  click to walk there  •  hold Shift to sneak',
    'Yellow cones are watching eyes. Hide behind crates and bookshelves,',
    'linger in shadows, duck behind curtains. If the SEEN meter fills, run —',
    'break line of sight and the watchmen will lose you.',
    '',
    'M mutes the sound.  Enter or click to begin.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, CANVAS_W / 2, 268 + i * 27));
  if (message) {
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText(message, CANVAS_W / 2, 268 + lines.length * 27 + 10);
  }
}

function drawEndScreen(ctx, world, title, lines, accent) {
  ctx.fillStyle = 'rgba(8, 6, 16, 0.82)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(title, CANVAS_W / 2, 210);
  ctx.fillStyle = '#f2e6c9';
  ctx.font = '18px Georgia, serif';
  lines.forEach((line, i) => ctx.fillText(line, CANVAS_W / 2, 270 + i * 30));
  ctx.fillStyle = '#b8a888';
  ctx.font = '16px Georgia, serif';
  ctx.fillText('Enter or click to continue', CANVAS_W / 2, 270 + lines.length * 30 + 24);
}

/** Draw the whole game for one frame. `view` maps field pixels to the canvas. */
export function renderGame(ctx, world, screen, view) {
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#07060f';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.translate(view.ox, view.oy);
  ctx.scale(view.scale, view.scale);

  // HUD sits above the field.
  drawHud(ctx, world);
  ctx.save();
  ctx.translate(0, HUD_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, FIELD_W, FIELD_H);
  ctx.clip();
  drawFloor(ctx, world.level);
  drawRelics(ctx, world);
  drawExit(ctx, world);
  drawCover(ctx, world.level);
  for (const guard of world.guards) drawVisionCone(ctx, world.level, guard, world.detection);
  for (const guard of world.guards) drawGuard(ctx, guard, world);
  drawPlayer(ctx, world);
  drawLighting(ctx, world);
  ctx.restore();
  ctx.restore();

  if (screen === 'title') {
    drawTitleScreen(ctx, world, world.status === 'caught' ? 'Caught! One life lost — the manor resets.' : '');
  } else if (screen === 'cleared') {
    const bonus = world.clearBonus ?? { timeBonus: 0, quietBonus: 0 };
    drawEndScreen(ctx, world, 'Level Cleared!', [
      `${world.level.name} — slipped away unseen.`,
      `Relics ${world.relicsTaken}/${world.relics.length}  •  Time bonus +${bonus.timeBonus}`,
      bonus.quietBonus > 0 ? `Ghost bonus +${bonus.quietBonus} — never once alarmed!` : 'The alarm rang this time — ghost it next run.',
      `Score ${world.score}`,
    ], '#39d98a');
  } else if (screen === 'caught') {
    drawEndScreen(ctx, world, 'Caught!', [
      'A watchman grabbed Wick by the cloak.',
      world.lives > 0 ? `Lives left: ${world.lives} — the manor resets.` : 'No lives left.',
    ], '#ff5040');
  } else if (screen === 'gameover') {
    drawEndScreen(ctx, world, 'The Night Ends', [
      'The watchmen caught Wick one time too many.',
      `Final score ${world.score}.`,
    ], '#ff5040');
  } else if (screen === 'won') {
    drawEndScreen(ctx, world, 'The Vault Is Yours!', [
      'Three manors robbed, not a single watchman the wiser.',
      `Relics ${world.relicsTaken} this level  •  Final score ${world.score}`,
      'Wick vanishes into the night — until the next heist.',
    ], '#ffd76a');
  }
  ctx.restore();
}
