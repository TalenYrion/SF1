import { createInitialState, step, type GameState, type Inputs } from './sim';

export const INPUT_DELAY = 3; // frames (3 / 60 = 50 ms)
const REDUNDANCY = 8; // how many recent inputs go in every packet

type InputPacket = { f: number; i: number[] };

export class Lockstep {
  state: GameState = createInitialState();
  readonly localIndex: 0 | 1;
  private remoteIndex: 0 | 1;
  private send: (msg: string) => void;
  private inputs: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  private lastPacket = '';

  constructor(localIndex: 0 | 1, send: (msg: string) => void) {
    this.localIndex = localIndex;
    this.remoteIndex = localIndex === 0 ? 1 : 0;
    this.send = send;

    // The first INPUT_DELAY frames have no real input yet, so both sides use "nothing pressed"
    for (let f = 0; f < INPUT_DELAY; f++) {
      this.inputs[0].set(f, 0);
      this.inputs[1].set(f, 0);
    }
  }

  /** Try to run one tick. Returns false if we're waiting on the opponent's input. */
  advance(localInput: number): boolean {
    const f = this.state.frame;
    const mine = this.inputs[this.localIndex];
    const theirs = this.inputs[this.remoteIndex];

    // Input pressed now takes effect INPUT_DELAY frames from now. Sample it once per frame.
    const target = f + INPUT_DELAY;
    if (!mine.has(target)) {
      mine.set(target, localInput);
      this.sendInputs(target);
    }

    if (!theirs.has(f)) return false; // stall until their input arrives

    const a = mine.get(f)!;
    const b = theirs.get(f)!;
    const inputs: Inputs = this.localIndex === 0 ? [a, b] : [b, a];
    this.state = step(this.state, inputs);

    // Keep a short history because it is resent for redundancy
    mine.delete(f - REDUNDANCY);
    theirs.delete(f - REDUNDANCY);
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

    const theirs = this.inputs[this.remoteIndex];
    p.i.forEach((input, k) => {
      const frame = p.f - k;
      if (frame >= this.state.frame && !theirs.has(frame)) theirs.set(frame, input);
    });
  }

  /** Called while stalled, so a dropped packet can't deadlock both sides */
  resend(): void {
    if (this.lastPacket) this.send(this.lastPacket);
  }

  private sendInputs(newest: number): void {
    const mine = this.inputs[this.localIndex];
    const list: number[] = [];
    for (let k = 0; k < REDUNDANCY; k++) list.push(mine.get(newest - k) ?? 0);
    this.lastPacket = JSON.stringify({ f: newest, i: list } satisfies InputPacket);
    this.send(this.lastPacket);
  }
}
