export const WIDTH = 800;
export const HEIGHT = 600;
export const TICK_RATE = 60;

// Input bits. The keys Q/E/Z/C are shortcuts that set two direction bits at once.
export const Input = {
  UP: 1,
  DOWN: 2,
  LEFT: 4,
  RIGHT: 8,
  PUNCH: 16,
  KICK: 32,
} as const;
const DIR_MASK = 15;

// ---------- body and movement ----------
export const GROUND_Y = 500;
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const CROUCH_H = 70;
const HALF_W = FIGHTER_W / 2;
const WALK_SPEED = 5;
const JUMP_V = -24;
const GRAVITY = 2;
const JUMP_SQUAT = 3; // ticks of crouch before leaving the ground (an attack can cancel it)

// ---------- round ----------
export const MAX_HP = 1000;
export const ROUND_TICKS = 99 * TICK_RATE; // 99 seconds
export const RESTART_TICKS = 180;

// ---------- combat tuning ----------
const ATTACK_BUFFER = 6; // ticks an early click is remembered
const BLOCK_PERCENT = 20; // a blocked hit does this % of its damage
const BLOCKSTUN = 8; // ticks a blocking fighter is pushed back and stuck
const ROLL_WINDOW = 12; // ticks between two taps for a roll (12 = 200 ms)
const ROLL_SPEED = 6;
export const ROLL_MOVE = 20; // ticks spent moving
export const ROLL_INVULN = 14; // ticks with no hurtbox
export const ROLL_TOTAL = 26;

// ---------- moves ----------
export type Move = {
  name: string;
  startup: number; // ticks before the hitbox appears
  active: number; // ticks the hitbox is live
  recovery: number; // ticks of helplessness afterwards
  damage: number; // out of MAX_HP
  stun: number; // ticks the victim is stuck if the hit lands
  knockback: number;
  reach: number; // hitbox length past the fighter's front edge
  top: number; // hitbox top edge, in pixels above the feet
  height: number;
  lunge: number; // pixels moved forward per tick during startup
};

// Ground moves: index = (kick ? 5 : 0) + direction, with direction 0 neutral, 1 forward, 2 back, 3 up, 4 down.
// Indexes 10 and 11 are the air moves.
export const MOVES: Move[] = [
  {
    name: 'punch',
    startup: 6,
    active: 3,
    recovery: 10,
    damage: 50,
    stun: 14,
    knockback: 5,
    reach: 50,
    top: 100,
    height: 30,
    lunge: 0,
  },
  {
    name: 'strong punch',
    startup: 11,
    active: 4,
    recovery: 15,
    damage: 90,
    stun: 18,
    knockback: 8,
    reach: 58,
    top: 95,
    height: 35,
    lunge: 3,
  },
  {
    name: 'spin punch',
    startup: 13,
    active: 4,
    recovery: 18,
    damage: 110,
    stun: 20,
    knockback: 10,
    reach: 72,
    top: 95,
    height: 36,
    lunge: 0,
  },
  {
    name: 'uppercut',
    startup: 10,
    active: 4,
    recovery: 20,
    damage: 120,
    stun: 24,
    knockback: 12,
    reach: 45,
    top: 125,
    height: 50,
    lunge: 0,
  },
  {
    name: 'low punch',
    startup: 9,
    active: 3,
    recovery: 14,
    damage: 70,
    stun: 18,
    knockback: 6,
    reach: 55,
    top: 45,
    height: 30,
    lunge: 0,
  },
  {
    name: 'kick',
    startup: 8,
    active: 3,
    recovery: 13,
    damage: 70,
    stun: 16,
    knockback: 6,
    reach: 58,
    top: 60,
    height: 30,
    lunge: 0,
  },
  {
    name: 'front kick',
    startup: 12,
    active: 4,
    recovery: 17,
    damage: 100,
    stun: 20,
    knockback: 11,
    reach: 68,
    top: 70,
    height: 34,
    lunge: 2,
  },
  {
    name: 'back kick',
    startup: 14,
    active: 4,
    recovery: 20,
    damage: 115,
    stun: 22,
    knockback: 12,
    reach: 78,
    top: 85,
    height: 36,
    lunge: 0,
  },
  {
    name: 'high kick',
    startup: 12,
    active: 4,
    recovery: 20,
    damage: 105,
    stun: 22,
    knockback: 10,
    reach: 62,
    top: 120,
    height: 40,
    lunge: 0,
  },
  {
    name: 'sweep',
    startup: 11,
    active: 4,
    recovery: 20,
    damage: 80,
    stun: 24,
    knockback: 8,
    reach: 66,
    top: 25,
    height: 25,
    lunge: 0,
  },
  // Air moves (used while off the ground). The kick box reaches below the feet so a jump-in can hit.
  {
    name: 'air punch',
    startup: 5,
    active: 6,
    recovery: 8,
    damage: 60,
    stun: 16,
    knockback: 6,
    reach: 48,
    top: 105,
    height: 35,
    lunge: 0,
  },
  {
    name: 'air kick',
    startup: 6,
    active: 7,
    recovery: 9,
    damage: 80,
    stun: 18,
    knockback: 8,
    reach: 58,
    top: 50,
    height: 55,
    lunge: 0,
  },
];
export const AIR_PUNCH = 10;
export const AIR_KICK = 11;

// ---------- actions ----------
export const ACT_FREE = 0;
export const ACT_ATTACK = 1;
export const ACT_HITSTUN = 2;
export const ACT_BLOCKSTUN = 3;
export const ACT_ROLL = 4;
export const ACT_JUMPSQUAT = 5;

export type PlayerState = {
  x: number;
  y: number;
  vy: number;
  vx: number; // knockback speed in stun, roll speed in a roll
  facing: 1 | -1;
  hp: number;
  act: number;
  t: number; // ticks into the action (counts DOWN while stunned)
  hit: 0 | 1; // has the current attack already connected?
  mv: number; // index into MOVES of the current attack
  prev: number; // last tick's input
  buf: number; // ticks left on a remembered click
  bufMove: number; // the move that click asked for
  tapDir: number; // direction of the last tap (-1 left, 1 right, 0 none)
  tapAge: number; // ticks since that tap
  d1: number; // direction bits 1 tick ago
  d2: number; // direction bits 2 ticks ago
};

export type GameState = {
  frame: number;
  players: [PlayerState, PlayerState];
  time: number; // ticks left in the round
  over: number; // 0 = fighting, otherwise ticks since the round ended
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
    mv: 0,
    prev: 0,
    buf: 0,
    bufMove: 0,
    tapDir: 0,
    tapAge: 255,
    d1: 0,
    d2: 0,
  };
  return {
    frame: 0,
    players: [
      { ...base, x: 250, facing: 1 },
      { ...base, x: 550, facing: -1 },
    ],
    time: ROUND_TICKS,
    over: 0,
    winner: -1,
    wins,
  };
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

// ---------- boxes ----------

export function isCrouching(p: PlayerState): boolean {
  return p.act === ACT_FREE && p.y === GROUND_Y && (p.prev & Input.DOWN) !== 0;
}

export function hurtbox(p: PlayerState): Box {
  const h = isCrouching(p) ? CROUCH_H : FIGHTER_H;
  return { left: p.x - HALF_W, right: p.x + HALF_W, top: p.y - h, bottom: p.y };
}

export function attackBox(p: PlayerState): Box | null {
  if (p.act !== ACT_ATTACK) return null;
  const m = MOVES[p.mv];
  if (p.t < m.startup || p.t >= m.startup + m.active) return null;
  const near = p.x + p.facing * HALF_W;
  const far = near + p.facing * m.reach;
  return {
    left: Math.min(near, far),
    right: Math.max(near, far),
    top: p.y - m.top,
    bottom: p.y - m.top + m.height,
  };
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// ---------- picking a move ----------

/** Turns "kick or punch" plus the held direction into an index into MOVES */
function moveIndex(kick: boolean, dir: number, facing: number): number {
  const h = (dir & Input.RIGHT ? 1 : 0) - (dir & Input.LEFT ? 1 : 0);
  let v = 0; // 0 neutral, 1 forward, 2 back, 3 up, 4 down. Diagonals pick up or down for now.
  if (dir & Input.UP) v = 3;
  else if (dir & Input.DOWN) v = 4;
  else if (h * facing > 0) v = 1;
  else if (h * facing < 0) v = 2;
  return (kick ? 5 : 0) + v;
}

// ---------- one fighter, one tick ----------

const ROLL_KEYS: [number, number][] = [
  [Input.LEFT, -1],
  [Input.RIGHT, 1],
];

function moveFighter(
  p: PlayerState,
  other: PlayerState,
  input: number,
): PlayerState {
  let { x, y, vy, vx, facing, act, t, hit, mv, buf, bufMove, tapDir, tapAge } =
    p;
  const grounded = y === GROUND_Y;
  const pressed = (bit: number) => (input & bit) !== 0 && (p.prev & bit) === 0;
  const dirNow = input & DIR_MASK;

  // A click remembers its move now, using the direction held this tick or within the last 2 ticks
  const punchPressed = pressed(Input.PUNCH);
  const kickPressed = pressed(Input.KICK);
  if (punchPressed || kickPressed) {
    bufMove = moveIndex(!punchPressed, dirNow || p.d1 || p.d2, facing);
    buf = ATTACK_BUFFER;
  } else {
    buf = Math.max(0, buf - 1);
  }

  // Double tap: a fresh press of the same side within ROLL_WINDOW ticks of the previous one
  tapAge = Math.min(tapAge + 1, 255);
  let rollDir = 0;
  for (const [bit, d] of ROLL_KEYS) {
    if (!pressed(bit)) continue;
    if (tapDir === d && tapAge <= ROLL_WINDOW) {
      rollDir = d;
      tapDir = 0;
    } else {
      tapDir = d;
      tapAge = 0;
    }
  }

  if (act === ACT_FREE) {
    if (grounded && rollDir !== 0) {
      act = ACT_ROLL;
      t = 0;
      vx = rollDir * ROLL_SPEED;
    } else if (grounded && buf > 0) {
      act = ACT_ATTACK;
      t = 0;
      hit = 0;
      mv = bufMove;
      buf = 0;
    } else if (grounded && input & Input.UP) {
      act = ACT_JUMPSQUAT;
      t = 0;
    } else if (grounded && input & Input.DOWN) {
      // crouching: no walking, shorter hurtbox
    } else if (!grounded && buf > 0) {
      // a click in the air: air punch or air kick
      act = ACT_ATTACK;
      t = 0;
      hit = 0;
      mv = bufMove >= 5 ? AIR_KICK : AIR_PUNCH;
      buf = 0;
    } else {
      if (input & Input.LEFT) x -= WALK_SPEED;
      if (input & Input.RIGHT) x += WALK_SPEED;
    }
  } else if (act === ACT_JUMPSQUAT) {
    t++;
    if (buf > 0) {
      // up + click: the jump turns into the attack (uppercut / high kick)
      act = ACT_ATTACK;
      t = 0;
      hit = 0;
      mv = bufMove;
      buf = 0;
    } else if (t >= JUMP_SQUAT) {
      act = ACT_FREE;
      t = 0;
      vy = JUMP_V;
    }
  } else if (act === ACT_ATTACK) {
    const m = MOVES[mv];
    if (t < m.startup) x += facing * m.lunge;
    if (mv >= AIR_PUNCH && !grounded) {
      // air attacks keep the air control you had
      if (input & Input.LEFT) x -= WALK_SPEED;
      if (input & Input.RIGHT) x += WALK_SPEED;
    }
    t++;
    if (t >= m.startup + m.active + m.recovery) {
      act = ACT_FREE;
      t = 0;
      hit = 0;
    }
  } else if (act === ACT_ROLL) {
    if (t < ROLL_MOVE) x += vx;
    t++;
    if (t >= ROLL_TOTAL) {
      act = ACT_FREE;
      t = 0;
      vx = 0;
    }
  } else {
    // hitstun or blockstun: pushed back and stuck. t counts down to 0.
    x += vx;
    vx -= Math.sign(vx);
    t--;
    if (t <= 0) {
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

  return {
    x,
    y,
    vy,
    vx,
    facing,
    hp: p.hp,
    act,
    t,
    hit,
    mv,
    prev: input,
    buf,
    bufMove,
    tapDir,
    tapAge,
    d1: dirNow,
    d2: p.d1,
  };
}

// Push overlapping fighters apart sideways, at most MAX_PUSH px per tick each, so a roll that ends
// inside the opponent slides out instead of snapping. A wall's share of the push goes to the other fighter.
const MAX_PUSH = 6;
function separate(a: PlayerState, b: PlayerState): [PlayerState, PlayerState] {
  const dx = b.x - a.x;
  const overlapX = FIGHTER_W - Math.abs(dx);
  const overlapY = FIGHTER_H - Math.abs(a.y - b.y);
  if (overlapX <= 0 || overlapY <= 0) return [a, b];

  const dir = dx >= 0 ? 1 : -1;
  const half = overlapX >> 1;
  const pushA = Math.min(half, MAX_PUSH);
  const pushB = Math.min(overlapX - half, MAX_PUSH);

  const ax = a.x - dir * pushA;
  const bx = b.x + dir * pushB;
  const axC = clamp(ax, HALF_W, WIDTH - HALF_W);
  const bxC = clamp(bx, HALF_W, WIDTH - HALF_W);
  const shortA = (axC - ax) * dir;
  const shortB = (bx - bxC) * dir;

  return [
    { ...a, x: clamp(axC - dir * shortB, HALF_W, WIDTH - HALF_W) },
    { ...b, x: clamp(bxC + dir * shortA, HALF_W, WIDTH - HALF_W) },
  ];
}

// ---------- hits ----------

function canBeHit(d: PlayerState): boolean {
  if (d.act === ACT_HITSTUN) return false; // no combos
  if (d.act === ACT_ROLL && d.t < ROLL_INVULN) return false;
  return true;
}

/** Blocking is the neutral stance: standing or crouching on the ground, not walking or jumping */
export function isBlocking(d: PlayerState): boolean {
  if (d.act === ACT_BLOCKSTUN) return true;
  return (
    d.act === ACT_FREE &&
    d.y === GROUND_Y &&
    (d.prev & (Input.LEFT | Input.RIGHT | Input.UP)) === 0
  );
}

function landed(attacker: PlayerState, defender: PlayerState): boolean {
  const box = attackBox(attacker);
  return (
    box !== null &&
    attacker.hit === 0 &&
    canBeHit(defender) &&
    overlaps(box, hurtbox(defender))
  );
}

function takeHit(
  victim: PlayerState,
  attacker: PlayerState,
  blocked: boolean,
): PlayerState {
  const m = MOVES[attacker.mv];
  const damage = blocked
    ? Math.floor((m.damage * BLOCK_PERCENT) / 100)
    : m.damage;
  return {
    ...victim,
    hp: Math.max(0, victim.hp - damage),
    act: blocked ? ACT_BLOCKSTUN : ACT_HITSTUN,
    t: blocked ? BLOCKSTUN : m.stun,
    vx: attacker.facing * (blocked ? m.knockback >> 1 : m.knockback),
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

  // After the round ends nobody can act, but fighters finish falling and being pushed back
  const live: Inputs = roundOver ? [0, 0] : inputs;
  const [a0, b0] = state.players;
  const m0 = moveFighter(a0, b0, live[0]);
  const m1 = moveFighter(b0, a0, live[1]);
  // A rolling fighter passes through the opponent, so nobody is pushed while a roll is running
  const rolling = m0.act === ACT_ROLL || m1.act === ACT_ROLL;
  const [a, b] = rolling ? [m0, m1] : separate(m0, m1);

  let na = a;
  let nb = b;
  if (!roundOver) {
    // Both outcomes are decided from the same positions and stances, so trades are possible
    const aHits = landed(a, b);
    const bHits = landed(b, a);
    if (aHits) {
      nb = takeHit(b, a, isBlocking(b));
      na = { ...na, hit: 1 };
    }
    if (bHits) {
      na = takeHit(a, b, isBlocking(a));
      nb = { ...nb, hit: 1 };
    }
  }

  let { over, winner, wins, time } = state;
  if (roundOver) {
    over++;
  } else {
    time--;
    const koA = na.hp <= 0;
    const koB = nb.hp <= 0;
    if (koA || koB || time <= 0) {
      over = 1;
      winner =
        koA && koB
          ? 2
          : koA
            ? 1
            : koB
              ? 0
              : na.hp > nb.hp
                ? 0
                : nb.hp > na.hp
                  ? 1
                  : 2;
      if (winner === 0) wins = [wins[0] + 1, wins[1]];
      else if (winner === 1) wins = [wins[0], wins[1] + 1];
    }
  }

  return {
    frame: state.frame + 1,
    players: [na, nb],
    time,
    over,
    winner,
    wins,
  };
}

// The checksum hashes EVERY field of the state
export function checksum(s: GameState): number {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
  };
  mix(s.frame);
  mix(s.time);
  mix(s.over);
  mix(s.winner);
  mix(s.wins[0]);
  mix(s.wins[1]);
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
    mix(p.mv);
    mix(p.prev);
    mix(p.buf);
    mix(p.bufMove);
    mix(p.tapDir);
    mix(p.tapAge);
    mix(p.d1);
    mix(p.d2);
  }
  return h >>> 0;
}
