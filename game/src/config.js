// Wick & Whisper — shared constants for the whole game.
// One place for every number the other modules tune against.

export const TILE = 40;
export const COLS = 24;
export const ROWS = 15;
export const FIELD_W = COLS * TILE; // 960
export const FIELD_H = ROWS * TILE; // 600
export const HUD_H = 64;
export const CANVAS_W = FIELD_W;
export const CANVAS_H = FIELD_H + HUD_H;

export const PLAYER_RADIUS = 13;
export const PLAYER_WALK_SPEED = 150;
export const PLAYER_SNEAK_SPEED = 88;
export const GUARD_PATROL_SPEED = 62;
export const GUARD_SUSPICIOUS_SPEED = 95;
export const GUARD_CHASE_SPEED = 138;
export const GUARD_RADIUS = 14;

export const CONE_RANGE = 195;
export const CONE_HALF_ANGLE = Math.PI / 5.2; // ~35 degrees each side
export const DETECT_FULL_RATE = 78; // per second, point blank in the light
export const DETECT_DECAY_RATE = 26; // per second while unseen
export const SHADOW_DETECT_FACTOR = 0.38; // how much slower detection grows in shadow
export const SNEAK_DETECT_FACTOR = 0.55;
export const SUSPICIOUS_AT = 42; // detection where a guard stops and stares
export const ALARM_AT = 100;
export const SEARCH_SECONDS = 3.2; // how long a guard hunts the last seen spot
export const CATCH_DISTANCE = 26;

export const START_LIVES = 3;
export const RELIC_SCORE = 250;
export const LEVEL_CLEAR_SCORE = 500;
export const NO_ALARM_BONUS = 300;
export const TIME_BONUS_PER_SECOND = 4;

export const STEP = 1 / 60;
