export const WIDTH = 800;
export const HEIGHT = 600;
export const RADIUS = 50;
export const SPEED = 5; // pixels per tick (5 x 60 = 300 px/s)
export const TICK_RATE = 60;

// Input bitmask
export const Input = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8 } as const;

export type PlayerState = { x: number; y: number };
export type GameState = { frame: number; players: [PlayerState, PlayerState] };
export type Inputs = [number, number]; // one bitmask per player

export function createInitialState(): GameState {
  return {
    frame: 0,
    players: [
      { x: 200, y: 300 },
      { x: 600, y: 300 },
    ],
  };
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export function step(state: GameState, inputs: Inputs): GameState {
  const players = state.players.map((p, i) => {
    const input = inputs[i];
    let x = p.x;
    let y = p.y;

    if (input & Input.LEFT) x -= SPEED;
    if (input & Input.RIGHT) x += SPEED;
    if (input & Input.UP) y -= SPEED;
    if (input & Input.DOWN) y += SPEED;

    return {
      x: clamp(x, RADIUS, WIDTH - RADIUS),
      y: clamp(y, RADIUS, HEIGHT - RADIUS),
    };
  }) as [PlayerState, PlayerState];

  return { frame: state.frame + 1, players };
}

// FNV-style hash of the state. Positions are integers, so both machines get the same number.
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
  }
  return h >>> 0;
}
