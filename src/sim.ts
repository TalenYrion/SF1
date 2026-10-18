export const WIDTH = 800;
export const HEIGHT = 600;
export const TICK_RATE = 60;

export const Input = {
  UP: 1,
  DOWN: 2,
  LEFT: 4,
  RIGHT: 8,
  ATTACK: 16,
  DODGE: 32,
} as const;

export const GROUND_Y = 500;
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
const HALF_W = FIGHTER_W / 2;
const WALK_SPEED = 5;
const JUMP_V = -24;
const GRAVITY = 2;
const ATTACK_BUFFER = 6; // ticks an early attack press is remembered
export const RESTART_TICKS = 180; // 3 seconds between a KO and the next round

export const MAX_HP = 100;

// Attack frame data (ticks)
export const ATTACK_STARTUP = 14;
export const ATTACK_ACTIVE = 4;
const ATTACK_RECOVERY = 20;
const ATTACK_TOTAL = ATTACK_STARTUP + ATTACK_ACTIVE + ATTACK_RECOVERY;
export const ATTACK_REACH = 55;
export const ATTACK_H = 40;
const ATTACK_TOP = 90;
const DAMAGE = 10;
const HITSTUN = 18;
const KNOCKBACK = 8;

// Block
const CHIP_DAMAGE = 2;
const BLOCKSTUN = 4;
const BLOCK_KNOCKBACK = 4;

// Dodge
export const DODGE_INVULN = 12; // ticks with no hurtbox
const DODGE_TOTAL = 18; // invulnerable ticks plus vulnerable recovery
const DODGE_MOVE = 8; // ticks spent moving backward
const DODGE_SPEED = 4; // pixels per tick

export const ACT_FREE = 0;
export const ACT_ATTACK = 1;
export const ACT_HITSTUN = 2;
export const ACT_BLOCK = 3;
export const ACT_BLOCKSTUN = 4;
export const ACT_DODGE = 5;

export type PlayerState = {
  x: number;
  y: number;
  vy: number;
  vx: number;
  facing: 1 | -1;
  hp: number;
  act: number;
  t: number;
  hit: 0 | 1;
  prev: number; // last tick's input, used to detect fresh key presses
  buf: number; // ticks left on a buffered attack press
};
export type GameState = {
  frame: number;
  players: [PlayerState, PlayerState];
  over: number; // 0 = fighting, otherwise ticks since the KO
  winner: number; // -1 = none, 0 or 1 = that player, 2 = draw
  wins: [number, number];
};
export type Inputs = [number, number];
export type Box = { left: number; right: number; top: number; bottom: number };

export function createInitialState(wins: [number, number] = [0, 0]): GameState {
  const base = {
    y: GROUND_Y,
    vy: 0,
    vx: 0,
    hp: MAX_HP,
    act: ACT_FREE,
    t: 0,
    hit: 0 as const,
    prev: 0,
    buf: 0,
  };
  return {
    frame: 0,
    players: [
      { ...base, x: 250, facing: 1 },
      { ...base, x: 550, facing: -1 },
    ],
    over: 0,
    winner: -1,
    wins,
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
  let { x, y, vy, vx, facing, act, t, hit, buf } = p;
  const grounded = y === GROUND_Y;

  // A press is a key that is down now but was not down last tick
  const attackPressed =
    (input & Input.ATTACK) !== 0 && (p.prev & Input.ATTACK) === 0;
  const dodgePressed =
    (input & Input.DODGE) !== 0 && (p.prev & Input.DODGE) === 0;
  buf = attackPressed ? ATTACK_BUFFER : Math.max(0, buf - 1);

  if (act === ACT_FREE || act === ACT_BLOCK) {
    // Priority: dodge, then attack, then block, then normal movement
    if (grounded && dodgePressed) {
      act = ACT_DODGE;
      t = 0;
    } else if (grounded && buf > 0) {
      act = ACT_ATTACK;
      t = 0;
      hit = 0;
      buf = 0;
    } else if (grounded && input & Input.DOWN) {
      act = ACT_BLOCK;
      t = 0;
    } else {
      act = ACT_FREE;
      t = 0;
      if (grounded && input & Input.UP) vy = JUMP_V;
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
  } else if (act === ACT_DODGE) {
    if (t < DODGE_MOVE) x -= facing * DODGE_SPEED;
    t++;
    if (t >= DODGE_TOTAL) {
      act = ACT_FREE;
      t = 0;
    }
  } else {
    // hitstun or blockstun: pushed back, can't act
    x += vx;
    vx -= Math.sign(vx);
    t++;
    const duration = act === ACT_HITSTUN ? HITSTUN : BLOCKSTUN;
    if (t >= duration) {
      act = ACT_FREE;
      t = 0;
      vx = 0;
    }
  }

  y += vy;
  vy += GRAVITY;
  if (y >= GROUND_Y) {
    y = GROUND_Y;
    vy = 0;
  }
  x = clamp(x, HALF_W, WIDTH - HALF_W);

  if (act === ACT_FREE && y === GROUND_Y) {
    if (other.x > x) facing = 1;
    else if (other.x < x) facing = -1;
  }

  return { x, y, vy, vx, facing, hp: p.hp, act, t, hit, prev: input, buf };
}

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

function canBeHit(d: PlayerState): boolean {
  if (d.act === ACT_HITSTUN) return false;
  if (d.act === ACT_DODGE && d.t < DODGE_INVULN) return false; // invulnerable
  return true;
}

const isBlocking = (d: PlayerState) =>
  d.act === ACT_BLOCK || d.act === ACT_BLOCKSTUN;

function landed(attacker: PlayerState, defender: PlayerState): boolean {
  const box = attackBox(attacker);
  return (
    box !== null &&
    attacker.hit === 0 &&
    canBeHit(defender) &&
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

function takeBlock(victim: PlayerState, attacker: PlayerState): PlayerState {
  return {
    ...victim,
    hp: Math.max(0, victim.hp - CHIP_DAMAGE),
    act: ACT_BLOCKSTUN,
    t: 0,
    vx: attacker.facing * BLOCK_KNOCKBACK,
    hit: 0,
  };
}

// ---------- the whole game, one tick ----------

export function step(state: GameState, inputs: Inputs): GameState {
  const roundOver = state.over > 0;

  if (roundOver && state.over >= RESTART_TICKS) {
    // New round. The frame counter keeps counting, because rollback indexes history by frame.
    return { ...createInitialState(state.wins), frame: state.frame + 1 };
  }

  // After a KO nobody can act, but fighters finish falling and being pushed back
  const live: Inputs = roundOver ? [0, 0] : inputs;
  const [a0, b0] = state.players;
  const [a, b] = separate(
    moveFighter(a0, b0, live[0]),
    moveFighter(b0, a0, live[1]),
  );

  let na = a;
  let nb = b;
  if (!roundOver) {
    const aHits = landed(a, b);
    const bHits = landed(b, a);
    if (aHits) {
      nb = isBlocking(b) ? takeBlock(b, a) : takeHit(b, a);
      na = { ...na, hit: 1 };
    }
    if (bHits) {
      na = isBlocking(a) ? takeBlock(a, b) : takeHit(a, b);
      nb = { ...nb, hit: 1 };
    }
  }

  let { over, winner, wins } = state;
  if (roundOver) {
    over++;
  } else if (na.hp <= 0 || nb.hp <= 0) {
    over = 1;
    winner = na.hp <= 0 && nb.hp <= 0 ? 2 : na.hp <= 0 ? 1 : 0;
    if (winner === 0) wins = [wins[0] + 1, wins[1]];
    else if (winner === 1) wins = [wins[0], wins[1] + 1];
  }

  return { frame: state.frame + 1, players: [na, nb], over, winner, wins };
}

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
    mix(p.prev);
    mix(p.buf);
    mix(s.over);
    mix(s.winner);
    mix(s.wins[0]);
    mix(s.wins[1]);
  }
  return h >>> 0;
}
