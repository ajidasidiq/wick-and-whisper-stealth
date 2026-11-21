// Wick & Whisper — the three manors to rob.
// Legend: '#' wall, '.' floor, ',' shadow floor (slow detection), 'C' crate,
// 'B' bookshelf, 'H' curtain (walkable, hides you), 'P' player start,
// 'E' exit, 'R' relic. Guards patrol the waypoints in tile coordinates;
// every waypoint must sit on a walkable tile.

export const LEVELS = [
  {
    name: 'The Candlelit Foyer',
    hint: 'Slip past the watchmen. Shift sneaks. Reach the green door.',
    parSeconds: 75,
    map: [
      '########################',
      '#P......#......#......E#',
      '#.......#..R...#...R...#',
      '#..C....#......#.......#',
      '#.......#..B...#...B...#',
      '#..C....#......#.......#',
      '#.......#......#...C...#',
      '#.......,......,.......#',
      '#..C....,......,....C..#',
      '#.......,......,.......#',
      '#...R...#..B...#...R...#',
      '#.......#......#.......#',
      '#..C....#..R...#....C..#',
      '#.......#......#.......#',
      '########################',
    ],
    guards: [
      { waypoints: [[10, 1], [10, 13]], speed: 1.0 },
      { waypoints: [[17, 2], [17, 12]], speed: 1.0 },
    ],
  },
  {
    name: 'The Gilded Gallery',
    hint: 'Shadows slow their eyes. Curtains hide you completely.',
    parSeconds: 100,
    map: [
      '########################',
      '#P....C......,......R.E#',
      '#......#.....,...#.....#',
      '#..B...#..R..,....#..C.#',
      '#......#.....,...#.....#',
      '#..C...#.....,.B..#....#',
      '#......#.....,...#.....#',
      '#,.....,.....,.....,...#',
      '#,..R..,.....,..R..,..C#',
      '#,.....,.....,.....,...#',
      '#......#.....,...#.....#',
      '#..C...#..R..,....#..B.#',
      '#......#.....,...#.....#',
      '#..B...#.....,.R..#....#',
      '########################',
    ],
    guards: [
      { waypoints: [[2, 7], [21, 7]], speed: 1.0 },
      { waypoints: [[11, 1], [11, 13]], speed: 1.1 },
      { waypoints: [[18, 2], [18, 12]], speed: 0.95 },
    ],
  },
  {
    name: 'The Vault of Candles',
    hint: 'Four watchmen, tight patrols. Patience wins the vault.',
    parSeconds: 130,
    map: [
      '########################',
      '#P..C....#.....#..R...E#',
      '#.......#..R..#........#',
      '#..B....#.....#..C.....#',
      '#.......#..B..#........#',
      '#..C....#.....#..B.....#',
      '#.......,.....,........#',
      '#..H....,.....,..H.....#',
      '#.......,.....,........#',
      '#..C....#.....#..C.....#',
      '#.......#..R..#........#',
      '#..B....#.....#..B.....#',
      '#.......#..R..#...R....#',
      '#..C....#.....#........#',
      '########################',
    ],
    guards: [
      { waypoints: [[5, 1], [5, 13]], speed: 1.15 },
      { waypoints: [[12, 1], [12, 6], [12, 13]], speed: 1.0 },
      { waypoints: [[19, 1], [19, 13]], speed: 1.1 },
      { waypoints: [[2, 8], [21, 8]], speed: 1.05 },
    ],
  },
];

/** Tile at (col, row) of a level map, '#' outside the map. */
export function tileAt(level, col, row) {
  if (row < 0 || row >= level.map.length) return '#';
  const line = level.map[row];
  if (col < 0 || col >= line.length) return '#';
  return line[col];
}

/** True when a tile can be walked on. */
export function isWalkable(level, col, row) {
  const tile = tileAt(level, col, row);
  return tile === '.' || tile === ',' || tile === 'H' || tile === 'P' || tile === 'E' || tile === 'R';
}

/** True when a tile blocks a guard's line of sight. */
export function blocksSight(level, col, row) {
  const tile = tileAt(level, col, row);
  return tile === '#' || tile === 'C' || tile === 'B';
}

/** True when the tile is a shadow tile (detection grows slower there). */
export function isShadow(level, col, row) {
  return tileAt(level, col, row) === ',';
}

/** True when the tile is a curtain (the player is fully hidden inside it). */
export function isCurtain(level, col, row) {
  return tileAt(level, col, row) === 'H';
}

/** Find the first tile holding `mark` ('P', 'E' or 'R') and return its pixel centre. */
export function findTile(level, mark) {
  for (let row = 0; row < level.map.length; row += 1) {
    const col = level.map[row].indexOf(mark);
    if (col !== -1) return { x: (col + 0.5) * 40, y: (row + 0.5) * 40, col, row };
  }
  return null;
}

/** Every tile holding `mark`, as pixel centres. */
export function findAllTiles(level, mark) {
  const out = [];
  for (let row = 0; row < level.map.length; row += 1) {
    for (let col = 0; col < level.map[row].length; col += 1) {
      if (level.map[row][col] === mark) out.push({ x: (col + 0.5) * 40, y: (row + 0.5) * 40, col, row });
    }
  }
  return out;
}
