// Wick & Whisper — keyboard and mouse input.
// WASD / arrows move, Shift sneaks, M mutes, Enter / click starts and restarts.
// A mouse click also sets a move target the thief walks to on his own.

export function createInput(canvas) {
  const keys = new Set();
  const input = {
    left: false,
    right: false,
    up: false,
    down: false,
    sneak: false,
    clickTarget: null, // {x, y} in canvas pixels, consumed by main.js
    clicked: false, // a click that is not a move target (menus)
    pressedEnter: false,
    pressedMute: false,
  };

  function refresh() {
    input.left = keys.has('ArrowLeft') || keys.has('KeyA');
    input.right = keys.has('ArrowRight') || keys.has('KeyD');
    input.up = keys.has('ArrowUp') || keys.has('KeyW');
    input.down = keys.has('ArrowDown') || keys.has('KeyS');
    input.sneak = keys.has('ShiftLeft') || keys.has('ShiftRight');
  }

  window.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === 'Enter' || event.code === 'Space') input.pressedEnter = true;
    if (event.code === 'KeyM') input.pressedMute = true;
    keys.add(event.code);
    refresh();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    refresh();
  });
  window.addEventListener('blur', () => {
    keys.clear();
    refresh();
  });

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.clickTarget = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    input.clicked = true;
  });

  return input;
}
