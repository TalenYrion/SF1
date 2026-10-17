export const WIDTH = 800;
export const HEIGHT = 600;
export const TICK_RATE = 60;

export const Input = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, ATTACK: 16 } as const;

export const GROUND_Y = 500;
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
const HALF_W = FIGHTER_W / 2;
const WALK_SPEED = 5;
const JUMP_V = -24;
const GRAVITY = 2;

export const MAX_HP = 100;
export const ATTACK_STARTUP = 5;
export const ATTACK_ACTIVE = 3;
const ATTACK_RECOVERY = 12;
const ATTACK_TOTAL = ATTACK_STARTUP + ATTACK_ACTIVE + ATTACK_RECOVERY;
export const ATTACK_REACH = 55; // how far the hitbox extends past the fighter's edge
export const ATTACK_H = 40;
const ATTACK_TOP = 90; // hitbox top, in pixels above the feet
const DAMAGE = 10;
const HITSTUN = 18; // ticks a hit fighter can't act
const KNOCKBACK = 8; // starting push speed, shrinks by 1 per tick

export const ACT_FREE = 0;
export const ACT_ATTACK = 1;
export const ACT_HITSTUN = 2;

export type PlayerState = {
  x: number;
  y: number;
  vy: number; // vertical speed
  vx: number; // knockback speed (only used in hitstun)
  facing: 1 | -1;
  hp: number;
  act: number; // ACT_FREE, ACT_ATTACK or ACT_HITSTUN
  t: number; // ticks spent in the current action
  hit: 0 | 1; // has the current attack already connected?
};
export type GameState = { frame: number; players: [PlayerState, PlayerState] };
export type Inputs = [number, number];
export type Box = { left: number; right: number; top: number; bottom: number };

export function createInitialState(): GameState {
  const base = {
    y: GROUND_Y,
    vy: 0,
    vx: 0,
    hp: MAX_HP,
    act: ACT_FREE,
    t: 0,
    hit: 0 as const,
  };
  return {
    frame: 0,
    players: [
      { ...base, x: 250, facing: 1 },
      { ...base, x: 550, facing: -1 },
    ],
  };
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

// ---------- boxes ----------

export function hurtbox(p: PlayerState): Box {
  return {
    left: p.x - HALF_W,
    right: p.x + HALF_W,
    top: p.y - FIGHTER_H,
    bottom: p.y,
  };
}

/** The attack hitbox, only during the active frames (null otherwise) */
export function attackBox(p: PlayerState): Box | null {
  if (p.act !== ACT_ATTACK) return null;
  if (p.t < ATTACK_STARTUP || p.t >= ATTACK_STARTUP + ATTACK_ACTIVE)
    return null;
  const near = p.x + p.facing * HALF_W;
  const far = near + p.facing * ATTACK_REACH;
  return {
    left: Math.min(near, far),
    right: Math.max(near, far),
    top: p.y - ATTACK_TOP,
    bottom: p.y - ATTACK_TOP + ATTACK_H,
  };
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// ---------- one fighter, one tick ----------

function moveFighter(
  p: PlayerState,
  other: PlayerState,
  input: number,
): PlayerState {
  let { x, y, vy, vx, facing, act, t, hit } = p;

  if (act === ACT_FREE) {
    if (y === GROUND_Y && input & Input.ATTACK) {
      act = ACT_ATTACK;
      t = 0;
      hit = 0;
    } else {
      if (y === GROUND_Y && input & Input.UP) vy = JUMP_V;
      if (input & Input.LEFT) x -= WALK_SPEED;
      if (input & Input.RIGHT) x += WALK_SPEED;
    }
  } else if (act === ACT_ATTACK) {
    t++;
    if (t >= ATTACK_TOTAL) {
      act = ACT_FREE;
      t = 0;
      hit = 0;
    }
  } else {
    // hitstun: pushed back, can't act
    x += vx;
    vx -= Math.sign(vx);
    t++;
    if (t >= HITSTUN) {
      act = ACT_FREE;
      t = 0;
      vx = 0;
    }
  }

  // Gravity always applies
  y += vy;
  vy += GRAVITY;
  if (y >= GROUND_Y) {
    y = GROUND_Y;
    vy = 0;
  }
  x = clamp(x, HALF_W, WIDTH - HALF_W);

  // Face the opponent, but only while free and on the ground
  if (act === ACT_FREE && y === GROUND_Y) {
    if (other.x > x) facing = 1;
    else if (other.x < x) facing = -1;
  }

  return { x, y, vy, vx, facing, hp: p.hp, act, t, hit };
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

// ---------- hits ----------

function landed(attacker: PlayerState, defender: PlayerState): boolean {
  const box = attackBox(attacker);
  return (
    box !== null &&
    attacker.hit === 0 &&
    defender.act !== ACT_HITSTUN &&
    overlaps(box, hurtbox(defender))
  );
}

function takeHit(victim: PlayerState, attacker: PlayerState): PlayerState {
  return {
    ...victim,
    hp: Math.max(0, victim.hp - DAMAGE),
    act: ACT_HITSTUN,
    t: 0,
    vx: attacker.facing * KNOCKBACK,
    hit: 0,
  };
}

// ---------- the whole game, one tick ----------

export function step(state: GameState, inputs: Inputs): GameState {
  const [a0, b0] = state.players;
  const [a, b] = separate(
    moveFighter(a0, b0, inputs[0]),
    moveFighter(b0, a0, inputs[1]),
  );

  // Both hits are decided from the same positions, so a trade is possible
  const aHits = landed(a, b);
  const bHits = landed(b, a);

  let na = a;
  let nb = b;
  if (aHits) {
    nb = takeHit(nb, a);
    na = { ...na, hit: 1 };
  }
  if (bHits) {
    na = takeHit(na, b);
    nb = { ...nb, hit: 1 };
  }

  return { frame: state.frame + 1, players: [na, nb] };
}

// The checksum hashes EVERY field of the state
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
    mix(p.vx);
    mix(p.facing);
    mix(p.hp);
    mix(p.act);
    mix(p.t);
    mix(p.hit);
  }
  return h >>> 0;
}
