// Wick & Whisper — the game loop, the screens, and the wiring between input,
// the world, the renderer and the sound. Open ?shot=cover|play|alarm|exit to
// stage one screenshot scene instead of playing.

import { CANVAS_H, CANVAS_W, FIELD_H, HUD_H, STEP } from './config.js';
import { createInput } from './input.js';
import { renderGame } from './render.js';
import {
  createWorld, EVENT_ALARM, EVENT_CALM, EVENT_CAUGHT, EVENT_CLEARED,
  EVENT_PICKUP, EVENT_SUSPICIOUS, stepWorld,
} from './world.js';
import { stageShot } from './shots.js';
import {
  playAlert, playCaught, playCalm, playDoorCreak, playGuardStep, playLevelClear,
  playPickup, playPlayerStep, playSuspicious, playWin, setMuted, unlockAudio,
} from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');
const input = createInput(canvas);

let view = { scale: 1, ox: 0, oy: 0 };
let levelIndex = 0;
let totalScore = 0;
let lives = 3;
let world = createWorld(0, 0, lives);
let screen = 'title';
let muted = false;
let lastStatusText = '';

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const scale = Math.min(w / CANVAS_W, h / CANVAS_H);
  view = {
    scale,
    ox: (w - CANVAS_W * scale) / 2,
    oy: (h - CANVAS_H * scale) / 2,
  };
}

function announce(text) {
  if (text === lastStatusText) return;
  lastStatusText = text;
  statusLine.textContent = text;
}

function startLevel(index, score, livesLeft) {
  levelIndex = index;
  totalScore = score;
  lives = livesLeft;
  world = createWorld(index, score, livesLeft);
  screen = 'playing';
}

function startGame() {
  startLevel(0, 0, 3);
}

function screenToField(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  const x = (clientX - rect.left) * dpr;
  const y = (clientY - rect.top) * dpr;
  return {
    x: (x - view.ox) / view.scale,
    y: (y - view.oy) / view.scale - HUD_H,
  };
}

let playerStepAcc = 0;
let lastPlayerX = world.player.x;
let lastPlayerY = world.player.y;
const guardStepAcc = new Map();

function playFootsteps() {
  const player = world.player;
  const moved = Math.hypot(player.x - lastPlayerX, player.y - lastPlayerY);
  lastPlayerX = player.x;
  lastPlayerY = player.y;
  if (player.moving && moved > 0) {
    playerStepAcc += moved;
    const stride = player.sneaking ? 22 : 30;
    if (playerStepAcc >= stride) {
      playerStepAcc = 0;
      playPlayerStep(player.sneaking);
    }
  }
  for (const guard of world.guards) {
    const prev = guardStepAcc.get(guard.id) ?? { x: guard.x, y: guard.y, acc: 0 };
    const gMoved = Math.hypot(guard.x - prev.x, guard.y - prev.y);
    const acc = prev.acc + gMoved;
    if (acc >= 34) {
      const dx = guard.x - player.x;
      const dy = guard.y - player.y;
      playGuardStep(Math.max(-1, Math.min(1, dx / 300)), Math.hypot(dx, dy));
      guardStepAcc.set(guard.id, { x: guard.x, y: guard.y, acc: 0 });
    } else {
      guardStepAcc.set(guard.id, { x: guard.x, y: guard.y, acc });
    }
  }
}

function handleEvents(events) {
  if (events & EVENT_PICKUP) playPickup();
  if (events & EVENT_ALARM) playAlert();
  if (events & EVENT_SUSPICIOUS) playSuspicious();
  if (events & EVENT_CALM) playCalm();
  if (events & EVENT_CAUGHT) {
    playCaught();
    if (world.status === 'gameover') {
      screen = 'gameover';
    } else {
      screen = 'caught';
    }
  }
  if (events & EVENT_CLEARED) {
    playDoorCreak();
    if (world.status === 'won') {
      playWin();
      screen = 'won';
    } else {
      playLevelClear();
      screen = 'cleared';
    }
  }
}

function advanceToNextLevel() {
  startLevel(levelIndex + 1, world.score, world.lives);
}

function retryLevel() {
  startLevel(levelIndex, totalScore, world.lives > 0 ? world.lives : 3);
}

function handleMenuInput() {
  const clicked = input.clicked;
  input.clicked = false;
  if (input.pressedEnter || clicked) {
    input.pressedEnter = false;
    unlockAudio();
    if (screen === 'title') startGame();
    else if (screen === 'cleared') advanceToNextLevel();
    else if (screen === 'caught') retryLevel();
    else if (screen === 'gameover' || screen === 'won') startGame();
  }
}

function handlePlayInput() {
  if (input.pressedMute) {
    input.pressedMute = false;
    muted = !muted;
    setMuted(muted);
  }
  if (input.pressedEnter) input.pressedEnter = false;
  if (input.clickTarget) {
    const field = screenToField(input.clickTarget.x, input.clickTarget.y);
    input.clickTarget = null;
    if (field.x >= 0 && field.x < 960 && field.y >= 0 && field.y < FIELD_H) {
      world.mouseTarget = { x: field.x, y: field.y };
      unlockAudio();
    }
  }
  if (input.left || input.right || input.up || input.down) unlockAudio();
}

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  resizeCanvas();
  if (screen === 'playing') {
    handlePlayInput();
    accumulator += dt;
    while (accumulator >= STEP) {
      const events = stepWorld(world, input, STEP);
      handleEvents(events);
      accumulator -= STEP;
      if (world.status !== 'playing') break;
    }
    playFootsteps();
    const seen = Math.round(world.detection);
    announce(world.alarmed
      ? `Alarm! A watchman is chasing you. Detection ${seen} percent.`
      : seen > 0
        ? `A watchman is watching you. Detection ${seen} percent.`
        : `${world.level.name}. Relics ${world.relicsTaken} of ${world.relics.length}.`);
  } else {
    handleMenuInput();
  }
  renderGame(ctx, world, screen, view);
  requestAnimationFrame(frame);
}

function boot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    // Screenshot mode: stage a real gameplay state and hold the frame.
    const seed = Number(params.get('seed') ?? '7');
    const staged = stageShot(shot, seed);
    world = staged.world;
    screen = staged.screen;
    totalScore = world.score;
    lives = world.lives;
    resizeCanvas();
    renderGame(ctx, world, screen, view);
    window.__shotReady = true;
    document.title = `Wick & Whisper — ${shot}`;
    return;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(frame);
}

boot();
