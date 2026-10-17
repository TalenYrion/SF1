export const WIDTH = 800;
export const HEIGHT = 600;
export const TICK_RATE = 60;

// Input bitmask
export const Input = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8 } as const;

export type GameState = { frame: number; players: [PlayerState, PlayerState] };
export type Inputs = [number, number]; // one bitmask per player

export const GROUND_Y = 500; // y of the fighters' feet
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
const HALF_W = FIGHTER_W / 2;
const WALK_SPEED = 5; // pixels per tick
const JUMP_V = -24; // upward speed at takeoff
const GRAVITY = 2; // added to vy every tick

export type PlayerState = { x: number; y: number; vy: number; facing: 1 | -1 };

export function createInitialState(): GameState {
  return {
    frame: 0,
    players: [
      { x: 250, y: GROUND_Y, vy: 0, facing: 1 },
      { x: 550, y: GROUND_Y, vy: 0, facing: -1 },
    ],
  };
}

function move(p: PlayerState, other: PlayerState, input: number): PlayerState {
  let { x, y, vy } = p;

  if (y === GROUND_Y && input & Input.UP) vy = JUMP_V;
  if (input & Input.LEFT) x -= WALK_SPEED;
  if (input & Input.RIGHT) x += WALK_SPEED;

  y += vy;
  vy += GRAVITY;
  if (y >= GROUND_Y) {
    y = GROUND_Y;
    vy = 0;
  }
  x = clamp(x, HALF_W, WIDTH - HALF_W);

  // Face the opponent while on the ground; keep facing in the air
  let facing = p.facing;
  if (y === GROUND_Y) {
    if (other.x > x) facing = 1;
    else if (other.x < x) facing = -1;
  }

  return { x, y, vy, facing };
}

// Push overlapping fighters apart sideways (they can still jump over each other)
function separate(a: PlayerState, b: PlayerState): [PlayerState, PlayerState] {
  const dx = b.x - a.x;
  const overlapX = FIGHTER_W - Math.abs(dx);
  const overlapY = FIGHTER_H - Math.abs(a.y - b.y);
  if (overlapX <= 0 || overlapY <= 0) return [a, b];

  const dir = dx >= 0 ? 1 : -1;
  const pushA = overlapX >> 1;
  const pushB = overlapX - pushA;
  return [
    { ...a, x: clamp(a.x - dir * pushA, HALF_W, WIDTH - HALF_W) },
    { ...b, x: clamp(b.x + dir * pushB, HALF_W, WIDTH - HALF_W) },
  ];
}

export function step(state: GameState, inputs: Inputs): GameState {
  const [a, b] = state.players;
  const [pa, pb] = separate(move(a, b, inputs[0]), move(b, a, inputs[1]));
  return { frame: state.frame + 1, players: [pa, pb] };
}

// The checksum must hash EVERY field of the state, or desyncs in the missing ones go unnoticed
export function checksum(s: GameState): number {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
  };
  mix(s.frame);
  for (const p of s.players) {
    mix(p.x);
    mix(p.y);
    mix(p.vy);
    mix(p.facing);
  }
  return h >>> 0;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);
