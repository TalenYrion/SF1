// World units: a fighter is 120 units tall (1.8 m), so 1 m = 66.7 units. The arena is 480 x 270 units (16:9),
// about 4 fighters wide, drawn at 2x on screen.
export const WIDTH = 480;
export const HEIGHT = 270;
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
export const GROUND_Y = 222;
export const FIGHTER_W = 60;
export const FIGHTER_H = 120;
export const CROUCH_H = 70;
const HALF_W = FIGHTER_W / 2;
// Real gravity (9.8 m/s^2) at this scale is 0.18 units/tick^2. These values give a 0.6 m jump that hangs for
// 0.7 s, which a fit person can do. All values are multiples of 1/16, so the maths stays exact on every machine.
export const JUMP_V = -3.875;
const GRAVITY = 0.1875;
export const JUMP_SQUAT = 10; // ticks of crouch (167 ms) before leaving the ground. A click during it turns the jump into an attack,
// and a second tap of Q / E during it turns the leap into a flip

// ---------- round ----------
export const MAX_HP = 1000;
export const ROUND_TICKS = 99 * TICK_RATE; // 99 seconds
export const RESTART_TICKS = 180;

// ---------- combat tuning ----------
const ATTACK_BUFFER = 6; // ticks an early click is remembered
export const LEAP_SQUAT = 5; // ticks of crouch before a leap kick springs (83 ms, quicker than a plain jump)
const LEAP_SPEED = 3; // sideways speed of a leap kick, units per tick
const LEAP_BUFFER = JUMP_SQUAT + 3; // a kick given with Q or E waits for the leap to start
const BLOCK_PERCENT = 20; // a blocked hit does this % of its damage
const BLOCKSTUN = 8; // ticks a blocking fighter is pushed back and stuck
const TAP_WINDOW = 10; // ticks between two taps of a key for a double tap (10 = 167 ms)
const ROLL_SPEED = 5;
export const ROLL_MOVE = 20; // ticks spent moving
export const ROLL_INVULN = 14; // ticks with no hurtbox
export const ROLL_TOTAL = 26;

// Stepping: holding A or D takes one quick step at a time. These tables are the units moved on each tick of a step,
// so a step eases in and out. Stepping toward the opponent is quicker than stepping back.
const STEP_FWD = [1, 2, 3, 4, 5, 5, 5, 4, 3, 2, 1, 1]; // 36 units = 0.54 m in 0.2 s
const STEP_BACK = [1, 1, 2, 3, 3, 3, 3, 3, 2, 1, 1, 1]; // 24 units = 0.36 m in 0.2 s
const STEP_PLANT = 2; // ticks with the feet planted before the next step
export const STEP_TICKS = STEP_FWD.length + STEP_PLANT; // 14: one step every 0.23 s while a key is held

// Dash: double tap toward the opponent
const DASH = [3, 5, 7, 9, 9, 9, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1]; // 88 units = 1.3 m in 0.27 s
const DASH_PLANT = 3;
export const DASH_TICKS = DASH.length + DASH_PLANT;

// Flip: double tap Q or E. A somersault that carries you through the opponent if need be.
// From the moment the feet leave the ground to standing again it takes exactly 1 second:
// 44 ticks in the air (0.73 s, 0.71 m high) and 16 ticks to absorb the landing and stand up.
const FLIP_V = -4.125;
export const FLIP_SQUAT = 4; // ticks of crouch before the spring
const FLIP_SPEED = 3;
export const FLIP_AIR = 44; // ticks from leaving the ground to touching down (checked by the tests against the real arc)
export const FLIP_TOTAL = 60; // ticks from leaving the ground to standing again

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
  // Q or E + punch: a stepping-in uppercut with the lead hand. Reaches further than the W uppercut (45), less than a kick (58).
  {
    name: 'lunge uppercut',
    startup: 12,
    active: 4,
    recovery: 22,
    damage: 135,
    stun: 24,
    knockback: 13,
    reach: 54,
    top: 118,
    height: 46,
    lunge: 2,
  },
];
export const AIR_PUNCH = 10;
export const AIR_KICK = 11;
export const LUNGE_UPPERCUT = 12;

// ---------- actions ----------
export const ACT_FREE = 0;
export const ACT_ATTACK = 1;
export const ACT_HITSTUN = 2;
export const ACT_BLOCKSTUN = 3;
export const ACT_ROLL = 4;
export const ACT_JUMPSQUAT = 5;
export const ACT_STEP = 6;
export const ACT_DASH = 7;
export const ACT_FLIP = 8;

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
  bufLeap: number; // -1 / +1 when the buffered click is a leap kick (kick + Q or E) toward that side, else 0
  bufMove: number; // the move that click asked for
  tapCode: number; // the key combination (direction bits) last tapped, 0 for none
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
    bufLeap: 0,
    bufMove: 0,
    tapCode: 0,
    tapAge: 255,
    d1: 0,
    d2: 0,
  };
  return {
    frame: 0,
    players: [
      { ...base, x: 165, facing: 1 },
      { ...base, x: 315, facing: -1 },
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
  if (dir & Input.UP) {
    if (h !== 0 && !kick) return LUNGE_UPPERCUT; // Q or E + punch
    v = 3; // W + punch / kick: uppercut / high kick
  } else if (dir & Input.DOWN) v = 4;
  else if (h * facing > 0) v = 1;
  else if (h * facing < 0) v = 2;
  return (kick ? 5 : 0) + v;
}

// ---------- one fighter, one tick ----------

function moveFighter(
  p: PlayerState,
  other: PlayerState,
  input: number,
): PlayerState {
  let {
    x,
    y,
    vy,
    vx,
    facing,
    act,
    t,
    hit,
    mv,
    buf,
    bufLeap,
    bufMove,
    tapCode,
    tapAge,
  } = p;
  const grounded = y === GROUND_Y;
  const pressed = (bit: number) => (input & bit) !== 0 && (p.prev & bit) === 0;
  const dirNow = input & DIR_MASK;

  // A click remembers its move now, using the direction held this tick or within the last 2 ticks
  const punchPressed = pressed(Input.PUNCH);
  const kickPressed = pressed(Input.KICK);
  if (punchPressed || kickPressed) {
    const dirW = dirNow || p.d1 || p.d2;
    bufMove = moveIndex(!punchPressed, dirW, facing);
    // Kick + Q or E (up with left or right) is the leap kick: the kick waits while the fighter springs into the air.
    // Punch + Q or E is the lunge uppercut and W on its own is the plain uppercut / high kick: neither jumps.
    const h = (dirW & Input.RIGHT ? 1 : 0) - (dirW & Input.LEFT ? 1 : 0);
    bufLeap =
      kickPressed && !punchPressed && dirW & Input.UP && h !== 0 ? h : 0;
    buf = bufLeap !== 0 ? LEAP_BUFFER : ATTACK_BUFFER;
  } else {
    buf = Math.max(0, buf - 1);
    if (buf === 0) bufLeap = 0;
  }

  // Double taps. A key (or pair of keys, like Q = up + left) counts as freshly pressed when it differs from last
  // tick. Two presses of the same key within TAP_WINDOW ticks are a double tap:
  //   A / D toward the opponent = dash,  Z / C = roll,  Q / E = flip
  tapAge = Math.min(tapAge + 1, 255);
  let dbl = 0;
  if (dirNow !== 0 && dirNow !== (p.prev & DIR_MASK)) {
    if (tapCode === dirNow && tapAge <= TAP_WINDOW) {
      dbl = dirNow;
      tapCode = 0;
    } else {
      tapCode = dirNow;
      tapAge = 0;
    }
  }
  const sx = dbl & Input.RIGHT ? 1 : -1; // the way the double tap went
  const isDash = (dbl === Input.LEFT || dbl === Input.RIGHT) && sx * facing > 0; // forward only
  const isRoll =
    dbl === (Input.DOWN | Input.LEFT) || dbl === (Input.DOWN | Input.RIGHT);
  const isFlip =
    dbl === (Input.UP | Input.LEFT) || dbl === (Input.UP | Input.RIGHT);

  if (act === ACT_FREE || act === ACT_STEP) {
    if (grounded && isRoll) {
      act = ACT_ROLL;
      t = 0;
      vx = sx * ROLL_SPEED;
    } else if (grounded && isDash) {
      act = ACT_DASH;
      t = 0;
      vx = facing;
    } else if (grounded && isFlip) {
      act = ACT_FLIP;
      t = 0;
      vx = sx * FLIP_SPEED;
    } else if (grounded && buf > 0 && bufLeap === 0) {
      act = ACT_ATTACK;
      t = 0;
      hit = 0;
      mv = bufMove;
      buf = 0;
      vx = 0;
    } else if (grounded && buf > 0) {
      // leap kick: a short crouch, then spring toward the side that was pressed. The kick itself fires in the air.
      act = ACT_JUMPSQUAT;
      t = 0;
      vx = bufLeap * LEAP_SPEED;
    } else if (
      grounded &&
      input & Input.UP &&
      !(input & (Input.LEFT | Input.RIGHT))
    ) {
      // W on its own: a jump straight up. (Q and E do nothing by themselves.)
      act = ACT_JUMPSQUAT;
      t = 0;
      vx = 0;
    } else if (!grounded) {
      if (buf > 0) {
        // a click in the air: air punch or air kick
        act = ACT_ATTACK;
        t = 0;
        hit = 0;
        mv = bufMove >= 5 && bufMove <= 9 ? AIR_KICK : AIR_PUNCH;
        buf = 0;
        bufLeap = 0;
      } else {
        x += vx; // in the air the body keeps the speed it left the ground with: no steering
      }
    } else {
      // On the ground. Holding A or D starts a step; a step plays through and the next one starts if the key is still held.
      if (act === ACT_FREE && !(input & Input.DOWN) && !(input & Input.UP)) {
        const h = (input & Input.RIGHT ? 1 : 0) - (input & Input.LEFT ? 1 : 0);
        if (h !== 0) {
          act = ACT_STEP;
          t = 0;
          vx = h;
        }
      }
      if (act === ACT_STEP) {
        const table = vx * facing > 0 ? STEP_FWD : STEP_BACK;
        if (t < table.length) x += vx * table[t];
        t++;
        if (t >= table.length + STEP_PLANT) {
          act = ACT_FREE;
          t = 0;
          vx = 0;
        }
      }
    }
  } else if (act === ACT_JUMPSQUAT) {
    t++;
    if (isFlip) {
      // a double tap of Q / E: the crouch becomes a flip
      act = ACT_FLIP;
      t = 0;
      vx = sx * FLIP_SPEED;
    } else if (buf > 0 && bufLeap === 0) {
      // W + click: the crouch turns into the attack (uppercut / high kick), whether or not W is still held
      act = ACT_ATTACK;
      t = 0;
      hit = 0;
      mv =
        bufMove === LUNGE_UPPERCUT
          ? LUNGE_UPPERCUT
          : bufMove >= 5 && bufMove <= 9
            ? 8
            : 3;
      buf = 0;
      vx = 0;
    } else if (t >= (vx !== 0 ? LEAP_SQUAT : JUMP_SQUAT)) {
      act = ACT_FREE;
      t = 0;
      vy = JUMP_V;
    }
  } else if (act === ACT_ATTACK) {
    const m = MOVES[mv];
    if (t < m.startup) x += facing * m.lunge;
    if ((mv === AIR_PUNCH || mv === AIR_KICK) && !grounded) x += vx; // an air attack carries on along the jump
    t++;
    if (t >= m.startup + m.active + m.recovery) {
      act = ACT_FREE;
      t = 0;
      hit = 0;
    }
  } else if (act === ACT_DASH) {
    if (t < DASH.length) x += vx * DASH[t];
    t++;
    if (t >= DASH.length + DASH_PLANT) {
      act = ACT_FREE;
      t = 0;
      vx = 0;
    }
  } else if (act === ACT_FLIP) {
    t++;
    if (t === FLIP_SQUAT)
      vy = FLIP_V; // spring off the ground
    else if (t > FLIP_SQUAT) x += vx; // then fly along the arc: no steering (vx is 0 again once landed)
    if (t >= FLIP_SQUAT + FLIP_TOTAL) {
      act = ACT_FREE; // standing again
      t = 0;
      vx = 0;
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
    if (act === ACT_FREE || act === ACT_ATTACK) vx = 0; // landing ends the jump's sideways speed
    if (act === ACT_FLIP && t > FLIP_SQUAT) vx = 0; // touched down: the rest of the flip is the landing, with no sliding
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
    bufLeap,
    bufMove,
    tapCode,
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
  // A rolling, dashing or flipping fighter passes through the opponent, so nobody is pushed while one is running
  const passing = [m0.act, m1.act].some(
    (x) => x === ACT_ROLL || x === ACT_DASH || x === ACT_FLIP,
  );
  const [a, b] = passing ? [m0, m1] : separate(m0, m1);

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
    mix(Math.round(p.y * 16));
    mix(Math.round(p.vy * 16));
    mix(p.vx);
    mix(p.facing);
    mix(p.hp);
    mix(p.act);
    mix(p.t);
    mix(p.hit);
    mix(p.mv);
    mix(p.prev);
    mix(p.buf);
    mix(p.bufLeap);
    mix(p.bufMove);
    mix(p.tapCode);
    mix(p.tapAge);
    mix(p.d1);
    mix(p.d2);
  }
  return h >>> 0;
}
