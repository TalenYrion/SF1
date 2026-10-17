//stage 6

import {
  createInitialState,
  step,
  checksum,
  type GameState,
  type Inputs,
} from './sim';

type InputPacket = { f: number; i: number[]; s?: [number, number] };
const CHECK_INTERVAL = 30; // compare checksums every 30 frames (twice a second)

export const INPUT_DELAY = 1; // frames. Lockstep needed 3, rollback can use 0-2
const MAX_ROLLBACK = 8; // max frames we run ahead of the opponent's confirmed input
const REDUNDANCY = 12; // recent inputs resent in every packet
const KEEP = 60; // frames of history to keep

export class Rollback {
  state: GameState = createInitialState();
  readonly localIndex: 0 | 1;
  private send: (msg: string) => void;

  private local = new Map<number, number>();
  private remote = new Map<number, number>(); // opponent inputs we KNOW
  private usedRemote = new Map<number, number>(); // what we actually simulated with
  private history = new Map<number, GameState>(); // state at the START of each frame

  private confirmed = INPUT_DELAY - 1; // highest frame with known remote input (no gaps)
  private checked = INPUT_DELAY - 1; // frames up to here are verified correct
  private latestRemoteInput = 0;
  private latestRemoteFrame = -1;
  private lastPacket = '';

  private mySums = new Map<number, number>();
  private theirSums = new Map<number, number>();
  private nextCheck = CHECK_INTERVAL;
  private latestSum: [number, number] | null = null;
  desyncFrame: number | null = null;
  // Debug stats
  rollbackCount = 0;
  lastRollbackDepth = 0;

  constructor(localIndex: 0 | 1, send: (msg: string) => void) {
    this.localIndex = localIndex;
    this.send = send;

    // The first INPUT_DELAY frames have no real input, so both sides use "nothing pressed"
    for (let f = 0; f < INPUT_DELAY; f++) {
      this.local.set(f, 0);
      this.remote.set(f, 0);
    }
  }

  /** How many frames we are running ahead of confirmed opponent input */
  get framesAhead(): number {
    return Math.max(0, this.state.frame - 1 - this.confirmed);
  }

  /** Try to run one tick. Returns false only if we're too far ahead and must wait. */
  advance(localInput: number): boolean {
    const f = this.state.frame;

    // 1. Schedule my input for f + INPUT_DELAY (once per frame) and send it
    const target = f + INPUT_DELAY;
    if (!this.local.has(target)) {
      this.local.set(target, localInput);
      this.sendInputs(target);
    }

    // 2. If a past guess turned out wrong, rewind and replay
    this.rollbackIfNeeded();

    // 3. Don't run too far ahead of what we know
    if (f - 1 - this.confirmed >= MAX_ROLLBACK) return false;

    // 4. Simulate this frame, guessing the opponent's input if it hasn't arrived
    this.simulate();

    // 5. Forget old data
    const old = f - KEEP;
    this.local.delete(old);
    this.remote.delete(old);
    this.usedRemote.delete(old);
    this.history.delete(old);
    return true;
  }

  receive(data: string): void {
    let p: InputPacket;
    try {
      p = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof p.f !== 'number' || !Array.isArray(p.i)) return;

    if (
      Array.isArray(p.s) &&
      typeof p.s[0] === 'number' &&
      typeof p.s[1] === 'number'
    ) {
      this.theirSums.set(p.s[0], p.s[1]);
      this.compare(p.s[0]);
    }
    p.i.forEach((input, k) => {
      const frame = p.f - k;
      if (typeof input !== 'number' || frame < 0) return;
      if (frame <= this.confirmed || this.remote.has(frame)) return; // already known

      this.remote.set(frame, input);
      if (frame > this.latestRemoteFrame) {
        this.latestRemoteFrame = frame;
        this.latestRemoteInput = input;
      }
    });

    while (this.remote.has(this.confirmed + 1)) this.confirmed++;
  }

  /** Called while stalled so a dropped packet can't deadlock both sides */
  resend(): void {
    if (this.lastPacket) this.send(this.lastPacket);
  }

  // ---------- internals ----------

  /** Simulate the frame at state.frame, saving a snapshot first */
  private simulate(): void {
    const f = this.state.frame;
    this.history.set(f, this.state);

    const r = this.remote.get(f) ?? this.latestRemoteInput; // known, or guess
    this.usedRemote.set(f, r);

    const mine = this.local.get(f) ?? 0;
    const inputs: Inputs = this.localIndex === 0 ? [mine, r] : [r, mine];
    this.state = step(this.state, inputs);
  }

  private rollbackIfNeeded(): void {
    const upTo = Math.min(this.confirmed, this.state.frame - 1);

    // Find the earliest frame where our guess differs from the real input
    let bad = -1;
    for (let g = this.checked + 1; g <= upTo; g++) {
      if (this.usedRemote.get(g) !== this.remote.get(g)) {
        bad = g;
        break;
      }
    }

    if (bad !== -1) {
      const target = this.state.frame;
      this.state = this.history.get(bad)!; // rewind
      while (this.state.frame < target) this.simulate(); // replay with corrected inputs
      this.rollbackCount++;
      this.lastRollbackDepth = target - bad;
    }

    if (upTo > this.checked) this.checked = upTo;
    this.updateChecksums();
  }

  private sendInputs(newest: number): void {
    const list: number[] = [];
    for (let k = 0; k < REDUNDANCY; k++)
      list.push(this.local.get(newest - k) ?? 0);
    this.lastPacket = JSON.stringify({
      f: newest,
      i: list,
      ...(this.latestSum ? { s: this.latestSum } : {}),
    } satisfies InputPacket);
    this.send(this.lastPacket);
  }
  /** Hash a frame only once it is verified, so both sides hash the same "truth" */
  private updateChecksums(): void {
    // The state at the START of frame g is correct once every frame before g is verified
    while (
      this.nextCheck <= this.checked + 1 &&
      this.history.has(this.nextCheck)
    ) {
      const g = this.nextCheck;
      const h = checksum(this.history.get(g)!);
      this.mySums.set(g, h);
      this.latestSum = [g, h];
      this.compare(g);
      this.nextCheck += CHECK_INTERVAL;
    }
  }

  private compare(frame: number): void {
    const mine = this.mySums.get(frame);
    const theirs = this.theirSums.get(frame);
    if (mine === undefined || theirs === undefined || mine === theirs) return;
    if (this.desyncFrame === null) {
      this.desyncFrame = frame;
      console.error(`DESYNC at frame ${frame}: mine ${mine}, theirs ${theirs}`);
    }
  }

  /** Test helper: nudges my state so the two sims diverge */
  debugCorrupt(): void {
    const [a, b] = this.state.players;
    this.state = { ...this.state, players: [{ ...a, x: a.x + 1 }, b] };
  }
}
