// The fighter's body: a jointed skeleton posed by the game state. No Phaser in here, so it can be tested
// without a screen. Everything is a pure function of the state, so rollback can never glitch an animation.
//
// Coordinates are "local": x points the way the fighter faces, y points UP, (0,0) is between the feet.
import {
  MOVES,
  ACT_ATTACK,
  ACT_HITSTUN,
  ACT_BLOCKSTUN,
  ACT_ROLL,
  ACT_JUMPSQUAT,
  ROLL_MOVE,
  GROUND_Y,
  JUMP_V,
  JUMP_SQUAT,
  Input,
  isCrouching,
  type PlayerState,
} from './sim';

// ---------- body proportions (a standing fighter is about 118 tall) ----------
const TORSO = 36; // hip to shoulder
const NECK = 8; // shoulder to head centre
const HEAD_R = 10;
const ARM_UP = 28;
const ARM_LOW = 28;
const LEG_UP = 33;
const LEG_LOW = 33;
const ANKLE = 4; // an ankle sits this high when the foot is flat on the ground
const TOE = 9; // foot length

// ---------- poses ----------
export type Pose = {
  hx: number;
  hy: number; // pelvis position
  lean: number; // torso lean forward, degrees
  tilt: number; // extra head tilt, degrees
  lhx: number;
  lhy: number; // lead hand target
  rhx: number;
  rhy: number; // rear hand target
  lfx: number;
  lfy: number; // lead foot target (0 = on the ground)
  rfx: number;
  rfy: number; // rear foot target
  rot: number; // whole body rotation, degrees counter-clockwise
  px: number;
  py: number; // the point the body rotates around
  turn: number; // 0 = facing the opponent, 1 = turned right round (everything mirrored). In between the body is edge-on.
};
const KEYS: (keyof Pose)[] = [
  'hx',
  'hy',
  'lean',
  'tilt',
  'lhx',
  'lhy',
  'rhx',
  'rhy',
  'lfx',
  'lfy',
  'rfx',
  'rfy',
  'rot',
  'px',
  'py',
  'turn',
];

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const out = {} as Pose;
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

export const STANCE: Pose = {
  hx: -2,
  hy: 60,
  lean: 8,
  tilt: 0,
  lhx: 30,
  lhy: 92,
  rhx: 14,
  rhy: 100,
  lfx: 16,
  lfy: 0,
  rfx: -18,
  rfy: 0,
  rot: 0,
  px: 0,
  py: 50,
  turn: 0,
};
const P = (o: Partial<Pose>): Pose => ({ ...STANCE, ...o });

export const CROUCH = P({
  hx: 2,
  hy: 38,
  lean: 16,
  lhx: 30,
  lhy: 78,
  rhx: 16,
  rhy: 84,
  lfx: 20,
  rfx: -18,
});
export const JUMPSQUAT = P({
  hx: 2,
  hy: 44,
  lean: 20,
  lhx: 24,
  lhy: 70,
  rhx: 10,
  rhy: 76,
  lfx: 18,
  rfx: -16,
});
export const AIR_RISE = P({
  hx: -2,
  hy: 62,
  lean: 6,
  lhx: 26,
  lhy: 96,
  rhx: 12,
  rhy: 104,
  lfx: 16,
  lfy: 30,
  rfx: -4,
  rfy: 24,
});
export const AIR_FALL = P({
  hx: -2,
  hy: 60,
  lean: 4,
  lhx: 30,
  lhy: 104,
  rhx: 14,
  rhy: 110,
  lfx: 14,
  lfy: 8,
  rfx: -8,
  rfy: 12,
});
export const HIT = P({
  hx: -12,
  hy: 58,
  lean: -18,
  tilt: -10,
  lhx: 0,
  lhy: 98,
  rhx: -20,
  rhy: 92,
  lfx: 20,
  rfx: -22,
});
export const BLOCK = P({
  hx: -4,
  hy: 56,
  lean: 10,
  lhx: 28,
  lhy: 104,
  rhx: 20,
  rhy: 108,
  lfx: 18,
  rfx: -20,
});
export const ROLL = P({
  hx: 6,
  hy: 34,
  lean: 60,
  tilt: 20,
  lhx: 20,
  lhy: 30,
  rhx: 12,
  rhy: 26,
  lfx: 2,
  lfy: 20,
  rfx: -6,
  rfy: 14,
  px: 4,
  py: 36,
});
export const KO = P({
  hx: 0,
  hy: 62,
  lean: 0,
  lhx: 20,
  lhy: 88,
  rhx: -10,
  rhy: 90,
  lfx: 6,
  rfx: -6,
  px: 0,
  py: 9,
});
export const WIN = P({ hy: 62, lean: 2, lhx: 40, lhy: 128, rhx: 6, rhy: 126 });

// ---------- move animations ----------
// Each move is a wind-up pose and a hit pose. The system blends stance -> wind-up -> hit -> back to stance
// using the move's own frame data, so the picture and the hitbox always agree about timing.
export type Limb = 'lh' | 'rh' | 'lf' | 'rf';
type Anim = { wind: Pose; hit: Pose; strike: Limb; base?: Pose };

export const ANIMS: Anim[] = [
  // 0 punch: lead jab
  {
    strike: 'lh',
    wind: P({ hx: -6, lean: 4, lhx: 12, lhy: 96, rhx: 16, rhy: 102 }),
    hit: P({
      hx: 16,
      hy: 58,
      lean: 14,
      lhx: 80,
      lhy: 90,
      rhx: 20,
      rhy: 100,
      lfx: 30,
      rfx: -14,
    }),
  },
  // 1 strong punch: rear cross
  {
    strike: 'rh',
    wind: P({
      hx: -10,
      lean: 2,
      rhx: -4,
      rhy: 98,
      lhx: 34,
      lhy: 96,
      lfx: 18,
      rfx: -24,
    }),
    hit: P({
      hx: 26,
      hy: 56,
      lean: 20,
      tilt: -4,
      rhx: 88,
      rhy: 88,
      lhx: 30,
      lhy: 78,
      lfx: 44,
      rfx: -6,
    }),
  },
  // 2 spin punch: backfist
  {
    strike: 'rh',
    wind: P({
      hx: -14,
      hy: 58,
      lean: -6,
      tilt: -4,
      rhx: -34,
      rhy: 98,
      lhx: -10,
      lhy: 92,
      lfx: 10,
      rfx: -26,
    }),
    hit: P({
      hx: 36,
      hy: 56,
      lean: 22,
      rhx: 100,
      rhy: 86,
      lhx: 34,
      lhy: 80,
      lfx: 56,
      rfx: -4,
    }),
  },
  // 3 uppercut
  {
    strike: 'rh',
    wind: P({
      hx: 8,
      hy: 44,
      lean: 16,
      rhx: 22,
      rhy: 48,
      lhx: 34,
      lhy: 84,
      lfx: 20,
      rfx: -18,
    }),
    hit: P({
      hx: 16,
      hy: 68,
      lean: 6,
      tilt: -8,
      rhx: 62,
      rhy: 112,
      lhx: 30,
      lhy: 98,
      lfx: 26,
      rfx: -14,
    }),
  },
  // 4 low punch
  {
    strike: 'lh',
    wind: P({
      hx: 8,
      hy: 40,
      lean: 24,
      lhx: 20,
      lhy: 50,
      rhx: 8,
      rhy: 72,
      lfx: 22,
      rfx: -20,
    }),
    hit: P({
      hx: 26,
      hy: 38,
      lean: 30,
      lhx: 80,
      lhy: 30,
      rhx: 12,
      rhy: 62,
      lfx: 36,
      rfx: -22,
    }),
  },
  // 5 kick
  {
    strike: 'lf',
    wind: P({
      hy: 62,
      lean: 2,
      lfx: 10,
      lfy: 34,
      lhx: 26,
      lhy: 100,
      rhx: 12,
      rhy: 102,
    }),
    hit: P({
      hx: 24,
      hy: 58,
      lean: -4,
      lfx: 80,
      lfy: 42,
      rfx: -14,
      lhx: 20,
      lhy: 100,
      rhx: 8,
      rhy: 96,
    }),
  },
  // 6 front kick
  {
    strike: 'lf',
    wind: P({
      hx: 6,
      hy: 60,
      lean: 0,
      lfx: 30,
      lfy: 40,
      lhx: 24,
      lhy: 100,
      rhx: 10,
      rhy: 100,
    }),
    hit: P({
      hx: 34,
      hy: 56,
      lean: -8,
      lfx: 90,
      lfy: 52,
      rfx: -8,
      lhx: 14,
      lhy: 100,
      rhx: 2,
      rhy: 94,
    }),
  },
  // 7 back kick: the fighter turns their back on the opponent and thrusts the rear leg out behind them.
  // Poses here are written in the turned frame: "forward" is away from the opponent, and the kick goes to negative x.
  {
    strike: 'rf',
    wind: P({
      turn: 1,
      hx: -14,
      hy: 62,
      lean: 14,
      tilt: -12,
      lfx: -14,
      lfy: 0,
      rfx: -34,
      rfy: 42,
      lhx: 14,
      lhy: 86,
      rhx: -2,
      rhy: 90,
    }),
    hit: P({
      turn: 1,
      hx: -26,
      hy: 66,
      lean: 72,
      tilt: -30,
      lfx: -24,
      lfy: 0,
      rfx: -94,
      rfy: 68,
      lhx: 22,
      lhy: 58,
      rhx: -6,
      rhy: 64,
    }),
  },
  // 8 high kick
  {
    strike: 'lf',
    wind: P({
      hx: 2,
      hy: 62,
      lean: 0,
      lfx: 20,
      lfy: 50,
      lhx: 24,
      lhy: 100,
      rhx: 10,
      rhy: 102,
    }),
    hit: P({
      hx: 30,
      hy: 64,
      lean: -14,
      lfx: 82,
      lfy: 94,
      rfx: -12,
      lhx: 14,
      lhy: 104,
      rhx: 2,
      rhy: 98,
    }),
  },
  // 9 sweep
  {
    strike: 'lf',
    wind: P({
      hx: 8,
      hy: 40,
      lean: 14,
      lfx: 26,
      lfy: 10,
      rfx: -20,
      lhx: 30,
      lhy: 80,
      rhx: 16,
      rhy: 84,
    }),
    hit: P({
      hx: 30,
      hy: 34,
      lean: 20,
      lfx: 86,
      lfy: 8,
      rfx: -22,
      lhx: 40,
      lhy: 70,
      rhx: 20,
      rhy: 76,
    }),
  },
  // 10 air punch
  {
    strike: 'lh',
    base: AIR_FALL,
    wind: P({
      hy: 62,
      lean: 6,
      lhx: 14,
      lhy: 98,
      rhx: 12,
      rhy: 104,
      lfx: 14,
      lfy: 26,
      rfx: -4,
      rfy: 22,
    }),
    hit: P({
      hx: 14,
      hy: 62,
      lean: 12,
      lhx: 76,
      lhy: 90,
      rhx: 14,
      rhy: 102,
      lfx: 16,
      lfy: 26,
      rfx: -2,
      rfy: 22,
    }),
  },
  // 11 air kick
  {
    strike: 'lf',
    base: AIR_FALL,
    wind: P({
      hy: 58,
      lean: 6,
      lfx: 10,
      lfy: 26,
      rfx: -4,
      rfy: 22,
      lhx: 24,
      lhy: 98,
      rhx: 10,
      rhy: 102,
    }),
    hit: P({
      hx: 16,
      hy: 54,
      lean: -10,
      lfx: 76,
      lfy: 28,
      rfx: -2,
      rfy: 22,
      lhx: 20,
      lhy: 96,
      rhx: 6,
      rhy: 92,
    }),
  },
];

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const smooth = (x: number) => x * x * (3 - 2 * x);
const easeIn = (x: number) => x * x;
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

/** The pose of a move at tick tt (ticks since the attack started). */
export function attackPoseAt(mv: number, tt: number): Pose {
  const m = MOVES[mv];
  const a = ANIMS[mv];
  const base = a.base ?? STANCE;
  const S = m.startup;
  const E = S + m.active;
  const T = E + m.recovery;
  const t = clamp(tt, 0, T);
  const W = S * 0.55;
  if (t < W) return lerpPose(base, a.wind, smooth(t / W));
  if (t < S) return lerpPose(a.wind, a.hit, easeIn((t - W) / (S - W)));
  if (t < E) return a.hit;
  return lerpPose(a.hit, base, smooth((t - E) / (T - E)));
}

// ---------- walking, driven by how far the body has travelled so feet never skate ----------
const STEP_A = 20; // feet swing +-20px around their rest spot
const STRIDE = STEP_A * 4; // one full walk cycle covers 80px
const STEP_LIFT = 12;

function footCycle(u: number): { x: number; y: number } {
  const TAU = Math.PI * 2;
  const v = ((u % TAU) + TAU) % TAU;
  if (v < Math.PI) {
    const s = v / Math.PI; // swing: foot lifts and moves forward
    return { x: -STEP_A + 2 * STEP_A * smooth(s), y: STEP_LIFT * Math.sin(v) };
  }
  const s = (v - Math.PI) / Math.PI; // stance: foot on the ground moves back at body speed
  return { x: STEP_A - 2 * STEP_A * s, y: 0 };
}

export function walkPose(p: PlayerState): Pose {
  const th = ((p.x * p.facing) / STRIDE) * Math.PI * 2;
  const a = footCycle(th);
  const b = footCycle(th + Math.PI);
  return P({
    hy: 59 - 2 * Math.abs(Math.cos(th)),
    lean: 9,
    lfx: STANCE.lfx + a.x,
    lfy: a.y,
    rfx: STANCE.rfx + b.x,
    rfy: b.y,
    lhx: 30 + 2 * Math.sin(th),
    rhx: 14 - 2 * Math.sin(th),
  });
}

export function idlePose(frame: number, index: number): Pose {
  const s = Math.sin(frame * 0.11 + index * 1.7);
  return P({
    hy: 60 + 1.4 * s,
    lean: 8 + 0.8 * s,
    lhy: 92 + 1.5 * s,
    rhy: 100 + 1.2 * s,
  });
}

// ---------- state -> pose ----------
export type Ctx = { frame: number; index: number; over: number; won: boolean };
export type Target = { pose: Pose; rate: number };

const ANIM_LEAD = 2; // sample attacks two ticks ahead, so the smoothing delay does not make a hit look late

export function targetPose(p: PlayerState, ctx: Ctx): Target {
  const grounded = p.y >= GROUND_Y;

  // After the round: the loser falls, the winner celebrates
  if (ctx.over > 0 && p.hp <= 0) {
    return {
      pose: { ...KO, rot: 90 * easeOut(clamp(ctx.over / 22, 0, 1)) },
      rate: 14,
    };
  }
  if (ctx.over > 0 && ctx.won) return { pose: WIN, rate: 8 };

  switch (p.act) {
    case ACT_ATTACK:
      return { pose: attackPoseAt(p.mv, p.t + ANIM_LEAD), rate: 50 };
    case ACT_HITSTUN:
      return { pose: HIT, rate: 40 };
    case ACT_BLOCKSTUN:
      return { pose: BLOCK, rate: 35 };
    case ACT_JUMPSQUAT:
      // sink into the crouch over the wind-up, then spring
      return {
        pose: lerpPose(
          STANCE,
          JUMPSQUAT,
          smooth(clamp((p.t + 1) / (JUMP_SQUAT * 0.7), 0, 1)),
        ),
        rate: 30,
      };
    case ACT_ROLL: {
      // Tuck and somersault in the direction of travel, then stand up
      const forward = p.vx * p.facing > 0;
      const prog = clamp(p.t / ROLL_MOVE, 0, 1);
      if (p.t >= ROLL_MOVE) return { pose: STANCE, rate: 22 };
      return {
        pose: { ...ROLL, rot: (forward ? -1 : 1) * 360 * smooth(prog) },
        rate: 40,
      };
    }
    default: {
      if (!grounded) {
        const jv = Math.abs(JUMP_V);
        const k = smooth(clamp((p.vy + jv) / (2 * jv), 0, 1)); // rising -> falling
        return { pose: lerpPose(AIR_RISE, AIR_FALL, k), rate: 22 };
      }
      if (isCrouching(p)) return { pose: CROUCH, rate: 26 };
      if ((p.prev & (Input.LEFT | Input.RIGHT)) !== 0)
        return { pose: walkPose(p), rate: 20 };
      return { pose: idlePose(ctx.frame, ctx.index), rate: 20 };
    }
  }
}

// ---------- skeleton ----------
export type V = { x: number; y: number };
export type Skeleton = {
  hip: V;
  shoulder: V;
  head: V;
  leadElbow: V;
  leadHand: V;
  rearElbow: V;
  rearHand: V;
  leadKnee: V;
  leadFoot: V;
  leadToe: V;
  rearKnee: V;
  rearFoot: V;
  rearToe: V;
};

/** Two-bone IK: puts the middle joint (elbow or knee) so that the end reaches the target. */
function ik(
  root: V,
  target: V,
  a: number,
  b: number,
  bend: 1 | -1 | 0,
): { mid: V; end: V } {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const d = clamp(dist, Math.abs(a - b) + 0.01, a + b - 0.01);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const base = Math.atan2(dy, dx);
  const alpha = Math.acos(cosA);
  const at = (sign: number): V => ({
    x: root.x + a * Math.cos(base + sign * alpha),
    y: root.y + a * Math.sin(base + sign * alpha),
  });
  const end = { x: root.x + (dx / dist) * d, y: root.y + (dy / dist) * d };
  if (bend !== 0) return { mid: at(bend), end };

  // bend === 0: the elbow always points downward. Where the two possible elbows are at the same height the
  // answer is blended, so the elbow slides across instead of popping when a hand passes over the shoulder.
  const up = at(1);
  const down = at(-1);
  const w = smooth(clamp(0.5 + (down.y - up.y) / (2 * ELBOW_BLEND), 0, 1)); // 1 = use `up` candidate (it is the lower one)
  return {
    mid: { x: down.x + (up.x - down.x) * w, y: down.y + (up.y - down.y) * w },
    end,
  };
}
const ELBOW_BLEND = 10; // pixels of height difference over which the two elbow choices are blended

export function solve(pose: Pose): Skeleton {
  const lean = (pose.lean * Math.PI) / 180;
  const hip: V = { x: pose.hx, y: pose.hy };
  const shoulder: V = {
    x: hip.x + TORSO * Math.sin(lean),
    y: hip.y + TORSO * Math.cos(lean),
  };
  const headAng = ((pose.lean + pose.tilt) * Math.PI) / 180;
  const head: V = {
    x: shoulder.x + NECK * Math.sin(headAng),
    y: shoulder.y + NECK * Math.cos(headAng),
  };

  // Elbows always point downward (0 = choose the lower one), knees bend forward (+1)
  const la = ik(shoulder, { x: pose.lhx, y: pose.lhy }, ARM_UP, ARM_LOW, 0);
  const ra = ik(shoulder, { x: pose.rhx, y: pose.rhy }, ARM_UP, ARM_LOW, 0);
  const ll = ik(hip, { x: pose.lfx, y: pose.lfy + ANKLE }, LEG_UP, LEG_LOW, 1);
  const rl = ik(hip, { x: pose.rfx, y: pose.rfy + ANKLE }, LEG_UP, LEG_LOW, 1);

  // Rotate everything about the pivot (used by the roll and the knock-down)
  const r = (pose.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const rotate = (v: V): V => {
    const x = v.x - pose.px;
    const y = v.y - pose.py;
    return { x: pose.px + x * c - y * s, y: pose.py + x * s + y * c };
  };

  // The toe continues the shin when the foot is lifted, and lies flat when it is on the ground
  const toeOf = (knee: V, foot: V): V => {
    const sx = foot.x - knee.x;
    const sy = foot.y - knee.y;
    const sl = Math.hypot(sx, sy) || 1;
    const w = clamp((foot.y - ANKLE - 3) / 14, 0, 1);
    let tx = 1 - w + w * (sx / sl);
    let ty = w * (sy / sl);
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    return { x: foot.x + TOE * tx, y: foot.y + TOE * ty - (1 - w) * 2 };
  };

  // Turning round: squash everything sideways about the centre line, through edge-on, to a mirror image
  const sx = Math.cos(Math.PI * pose.turn);
  const T = (v: V): V => {
    const r = rotate(v);
    return { x: r.x * sx, y: r.y };
  };

  return {
    hip: T(hip),
    shoulder: T(shoulder),
    head: T(head),
    leadElbow: T(la.mid),
    leadHand: T(la.end),
    rearElbow: T(ra.mid),
    rearHand: T(ra.end),
    leadKnee: T(ll.mid),
    leadFoot: T(ll.end),
    leadToe: T(toeOf(ll.mid, ll.end)),
    rearKnee: T(rl.mid),
    rearFoot: T(rl.end),
    rearToe: T(toeOf(rl.mid, rl.end)),
  };
}

/** The tip of the limb that strikes: fist or toe. Used to check that what you see matches the hitbox. */
export function strikeTip(sk: Skeleton, limb: Limb): V {
  return limb === 'lh'
    ? sk.leadHand
    : limb === 'rh'
      ? sk.rearHand
      : limb === 'lf'
        ? sk.leadToe
        : sk.rearToe;
}

// ---------- drawing shapes (both Phaser and the test renderer draw from these) ----------
export type Shape =
  | {
      k: 'cap';
      ax: number;
      ay: number;
      bx: number;
      by: number;
      wa: number;
      wb: number;
      shade: 0 | 1;
    }
  | { k: 'circle'; x: number; y: number; r: number; shade: 0 | 1 };

/**
 * Silhouette parts in draw order, in world coordinates (y down), for a fighter at (ox, oy) facing `facing`.
 * `strike` is the limb that is attacking: it is drawn in front of the body, even if it is a rear limb.
 * `scale` converts world units to screen pixels (everything is multiplied by it).
 */
export function shapesOf(
  sk: Skeleton,
  facing: number,
  ox: number,
  oy: number,
  strike?: Limb,
  scale = 1,
): Shape[] {
  const W = (v: V): V => ({
    x: (ox + facing * v.x) * scale,
    y: (oy - v.y) * scale,
  });
  const cap = (a: V, b: V, wa: number, wb: number, shade: 0 | 1): Shape => {
    const A = W(a);
    const B = W(b);
    return {
      k: 'cap',
      ax: A.x,
      ay: A.y,
      bx: B.x,
      by: B.y,
      wa: wa * scale,
      wb: wb * scale,
      shade,
    };
  };
  const dot = (v: V, r: number, shade: 0 | 1): Shape => {
    const A = W(v);
    return { k: 'circle', x: A.x, y: A.y, r: r * scale, shade };
  };
  const rearArm = (shade: 0 | 1): Shape[] => [
    cap(sk.shoulder, sk.rearElbow, 8, 7, shade),
    cap(sk.rearElbow, sk.rearHand, 7, 6, shade),
    dot(sk.rearHand, 6, shade),
  ];
  const rearLeg = (shade: 0 | 1): Shape[] => [
    cap(sk.hip, sk.rearKnee, 12, 9, shade),
    cap(sk.rearKnee, sk.rearFoot, 9, 6, shade),
    cap(sk.rearFoot, sk.rearToe, 7, 5, shade),
  ];
  const rearArmFront = strike === 'rh';
  const rearLegFront = strike === 'rf';
  return [
    // rear limbs sit behind the body, slightly lighter so overlapping limbs stay readable
    ...(rearArmFront ? [] : rearArm(1)),
    ...(rearLegFront ? [] : rearLeg(1)),
    // torso and head
    cap(sk.hip, sk.shoulder, 15, 19, 0),
    cap(sk.shoulder, sk.head, 7, 6, 0),
    dot(sk.head, HEAD_R, 0),
    // lead leg and arm in front
    cap(sk.hip, sk.leadKnee, 12, 9, 0),
    cap(sk.leadKnee, sk.leadFoot, 9, 6, 0),
    cap(sk.leadFoot, sk.leadToe, 7, 5, 0),
    ...(rearLegFront ? rearLeg(0) : []),
    cap(sk.shoulder, sk.leadElbow, 8, 7, 0),
    cap(sk.leadElbow, sk.leadHand, 7, 6, 0),
    dot(sk.leadHand, 6, 0),
    ...(rearArmFront ? rearArm(0) : []),
  ];
}

// ---------- smoothing between poses (render only, never touches the simulation) ----------
export class Animator {
  pose: Pose | null = null;
  x = 0;
  y = 0;
  private placed = false;

  /** Forget everything, so the next frame snaps to the real state (new round, new match). */
  reset(): void {
    this.pose = null;
    this.placed = false;
  }

  /** Moves the drawn pose toward the target. dt is in seconds. Returns the pose to draw. */
  update(target: Target, dt: number): Pose {
    if (!this.pose) this.pose = target.pose;
    const k = 1 - Math.exp(-target.rate * dt);
    const next = lerpPose(this.pose, target.pose, k);
    // Rotation and its pivot come straight from the state: they are already smooth, and lerping a spin goes wrong
    next.rot = target.pose.rot;
    next.px = target.pose.px;
    next.py = target.pose.py;
    this.pose = next;
    return next;
  }

  /**
   * Where to draw the body. Normal movement is followed exactly; a big sudden jump (a rollback fixing a wrong
   * guess) is eased in over a few frames instead of popping.
   */
  place(px: number, py: number): void {
    if (!this.placed || Math.hypot(px - this.x, py - this.y) > 260) {
      this.x = px;
      this.y = py;
      this.placed = true;
      return;
    }
    const dx = px - this.x;
    const dy = py - this.y;
    this.x = Math.abs(dx) > 28 ? this.x + dx * 0.4 : px;
    this.y = Math.abs(dy) > 60 ? this.y + dy * 0.4 : py;
  }
}
