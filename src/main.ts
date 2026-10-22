import Phaser from 'phaser';
import {
  WIDTH,
  HEIGHT,
  TICK_RATE,
  Input,
  GROUND_Y,
  MAX_HP,
  MOVES,
  ACT_ATTACK,
  createInitialState,
  step,
  attackBox,
  hurtbox,
  type GameState,
} from './sim';
import {
  Animator,
  ANIMS,
  targetPose,
  solve,
  shapesOf,
  type Shape,
} from './rig';
import { Rollback } from './rollback';
import { joinRoom, socket, startPeer, closePeer, sendToPeer } from './net';

type Keys = Record<
  'W' | 'A' | 'S' | 'D' | 'Q' | 'E' | 'Z' | 'C',
  Phaser.Input.Keyboard.Key
>;

const TICK_MS = 1000 / TICK_RATE;
const LIVENESS_TIMEOUT = 5000;
const TEAM_COLORS = [0xe03030, 0x3070e0]; // the ring under each fighter

const params = new URLSearchParams(location.search);
const room = params.get('room');
const LAG = Number(params.get('lag') ?? 0);
const JITTER = Number(params.get('jitter') ?? 0);
const LOSS = Number(params.get('loss') ?? 0);
const SKEW = Number(params.get('skew') ?? 1); // test only: above 1 makes THIS window's clock run fast
const SYNC = params.get('nosync') === null; // ?nosync=1 turns the drift correction off
const DEBUG = params.get('debug') !== null; // ?debug=1 shows hurtboxes, hitboxes and move names
const DUMMY = params.get('dummy') ?? 'idle'; // offline only: idle, punch or kick

function send(msg: string): void {
  if (Math.random() < LOSS) return;
  const delay = LAG + Math.random() * JITTER;
  if (delay <= 0) sendToPeer(msg);
  else setTimeout(() => sendToPeer(msg), delay);
}

// ---------- mouse ----------
// Plain browser events, so it works the same in any Phaser version
let mouseLeft = false;
let mouseRight = false;
window.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseLeft = true;
  if (e.button === 2) mouseRight = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseLeft = false;
  if (e.button === 2) mouseRight = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => {
  mouseLeft = false;
  mouseRight = false;
});

// Offline training dummy: stands still, or throws a move every 2 seconds
function dummyInput(frame: number): number {
  if (DUMMY === 'punch') return frame % 120 < 2 ? Input.PUNCH : 0;
  if (DUMMY === 'kick') return frame % 120 < 2 ? Input.KICK : 0;
  return 0;
}

let session: Rollback | null = null;
let status = room ? 'Waiting for opponent...' : '';
let ping = 0;
let lastHeard = 0;

// Messages: JSON input packets start with "{", pings with "P", pongs with "O"
function handleMessage(data: string): void {
  lastHeard = performance.now();
  if (data[0] === 'P') {
    send('O' + data.slice(1));
    return;
  }
  if (data[0] === 'O') {
    ping = Math.round(performance.now() - Number(data.slice(1)));
    return;
  }
  session?.receive(data);
}

function endSession(message: string): void {
  console.trace('endSession:', message);
  session = null;
  status = message;
  closePeer();
}

setInterval(() => {
  if (session) send('P' + performance.now());
}, 1000);

// ---------- drawing helpers ----------

const SHADE_COLORS = [0x0a0a0a, 0x2c2c34]; // front limbs, rear limbs

function drawShape(g: Phaser.GameObjects.Graphics, s: Shape): void {
  g.fillStyle(SHADE_COLORS[s.shade], 1);
  if (s.k === 'circle') {
    g.fillCircle(s.x, s.y, s.r);
    return;
  }
  // A limb is a quad that tapers from one end to the other, with a round cap on each end
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ra = s.wa / 2;
  const rb = s.wb / 2;
  const x1 = s.ax + nx * ra,
    y1 = s.ay + ny * ra;
  const x2 = s.bx + nx * rb,
    y2 = s.by + ny * rb;
  const x3 = s.bx - nx * rb,
    y3 = s.by - ny * rb;
  const x4 = s.ax - nx * ra,
    y4 = s.ay - ny * ra;
  g.fillTriangle(x1, y1, x2, y2, x3, y3);
  g.fillTriangle(x1, y1, x3, y3, x4, y4);
  g.fillCircle(s.ax, s.ay, ra);
  g.fillCircle(s.bx, s.by, rb);
}

type Spark = { x: number; y: number; age: number; size: number };

const TEXT = { color: '#ffffff', stroke: '#000000', strokeThickness: 3 };

class MainScene extends Phaser.Scene {
  private state: GameState = createInitialState();
  private accumulator = 0;
  private animators = [new Animator(), new Animator()];
  private sparks: Spark[] = [];
  private lastHp = [MAX_HP, MAX_HP];
  private prevFrame = 0;
  private prevOver = 0;
  private body!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private dbg!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private hpBars: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private keys!: Keys;

  create(): void {
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q,E,Z,C') as Keys;

    // Background: a dusk sky in bands, a distant ridge, and the ground
    const sky = this.add.graphics();
    const top = [0x56688a, 0x8a7a98, 0xd9967a, 0xf0c090]; // top of the sky down to the horizon
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const t = (i / (bands - 1)) * (top.length - 1);
      const a = Math.floor(t);
      const b = Math.min(a + 1, top.length - 1);
      const f = t - a;
      const r = ((top[a] >> 16) & 255) * (1 - f) + ((top[b] >> 16) & 255) * f;
      const g = ((top[a] >> 8) & 255) * (1 - f) + ((top[b] >> 8) & 255) * f;
      const bl = (top[a] & 255) * (1 - f) + (top[b] & 255) * f;
      sky.fillStyle(
        (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl),
        1,
      );
      sky.fillRect(0, (GROUND_Y / bands) * i, WIDTH, GROUND_Y / bands + 1);
    }
    sky.fillStyle(0x3a3a52, 1);
    sky.fillTriangle(-40, GROUND_Y, 160, GROUND_Y - 120, 360, GROUND_Y);
    sky.fillTriangle(260, GROUND_Y, 470, GROUND_Y - 80, 700, GROUND_Y);
    sky.fillTriangle(560, GROUND_Y, 760, GROUND_Y - 140, 900, GROUND_Y);
    sky.fillStyle(0x23252f, 1);
    sky.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    sky.fillStyle(0x3b3e4c, 1);
    sky.fillRect(0, GROUND_Y, WIDTH, 3);

    this.body = this.add.graphics();
    this.fx = this.add.graphics();
    this.dbg = this.add.graphics();
    this.labels = [
      this.add.text(0, 0, '', { fontSize: '12px', ...TEXT }).setOrigin(0.5, 1),
      this.add.text(0, 0, '', { fontSize: '12px', ...TEXT }).setOrigin(0.5, 1),
    ];

    // Health bars: dark background, then the coloured bar on top
    this.add
      .rectangle(20, 36, 300, 16, 0x222222)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x000000);
    this.add
      .rectangle(WIDTH - 20, 36, 300, 16, 0x222222)
      .setOrigin(1, 0)
      .setStrokeStyle(2, 0x000000);
    this.hpBars = [
      this.add.rectangle(20, 36, 300, 16, 0xe8c030).setOrigin(0, 0),
      this.add.rectangle(WIDTH - 20, 36, 300, 16, 0xe8c030).setOrigin(1, 0),
    ];

    this.hud = this.add.text(10, 10, '', { fontSize: '14px', ...TEXT });
    this.score = this.add
      .text(WIDTH / 2, 26, '0  -  0', { fontSize: '26px', ...TEXT })
      .setOrigin(0.5, 0);
    this.clock = this.add
      .text(WIDTH / 2, 58, '', { fontSize: '18px', ...TEXT })
      .setOrigin(0.5, 0);
    this.banner = this.add
      .text(WIDTH / 2, 200, '', {
        fontSize: '56px',
        fontStyle: 'bold',
        ...TEXT,
        color: '#ffdd44',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.render(this.state, 0);
  }

  update(_time: number, delta: number): void {
    this.accumulator += Math.min(delta, 250);
    const dt = Math.min(delta, 100) / 1000;

    if (session && performance.now() - lastHeard > LIVENESS_TIMEOUT) {
      endSession('Connection lost');
    }

    if (session) {
      const tickMs = (TICK_MS * (SYNC ? session.slowdown : 1)) / SKEW;
      while (this.accumulator >= tickMs) {
        if (!session.advance(this.readInput())) {
          session.resend();
          this.accumulator = Math.min(this.accumulator, tickMs * 4);
          break;
        }
        this.accumulator -= tickMs;
      }
      this.render(session.state, dt);
    } else if (!room) {
      while (this.accumulator >= TICK_MS) {
        this.state = step(this.state, [
          this.readInput(),
          dummyInput(this.state.frame),
        ]);
        this.accumulator -= TICK_MS;
      }
      this.render(this.state, dt);
    } else {
      this.accumulator = 0;
      this.render(this.state, dt);
    }
  }

  // WASD = straight directions, Q/E/Z/C = the diagonals, left click = punch, right click = kick
  private readInput(): number {
    const k = this.keys;
    let input = 0;
    if (k.W.isDown) input |= Input.UP;
    if (k.S.isDown) input |= Input.DOWN;
    if (k.A.isDown) input |= Input.LEFT;
    if (k.D.isDown) input |= Input.RIGHT;
    if (k.Q.isDown) input |= Input.UP | Input.LEFT;
    if (k.E.isDown) input |= Input.UP | Input.RIGHT;
    if (k.Z.isDown) input |= Input.DOWN | Input.LEFT;
    if (k.C.isDown) input |= Input.DOWN | Input.RIGHT;
    if (mouseLeft) input |= Input.PUNCH;
    if (mouseRight) input |= Input.KICK;
    return input;
  }

  private render(state: GameState, dt: number): void {
    // A new round or a new match: forget the old poses so nothing slides in from the last one
    if (
      (this.prevOver > 0 && state.over === 0) ||
      state.frame < this.prevFrame - 30
    ) {
      this.animators.forEach((a) => a.reset());
      this.lastHp = state.players.map((p) => p.hp);
      this.sparks = [];
    }
    this.prevFrame = state.frame;
    this.prevOver = state.over;

    this.body.clear();
    this.fx.clear();
    this.dbg.clear();

    const mine = session ? session.localIndex : room ? -1 : 0;

    state.players.forEach((p, i) => {
      const anim = this.animators[i];
      anim.place(p.x, p.y);
      const target = targetPose(p, {
        frame: state.frame,
        index: i,
        over: state.over,
        won: state.winner === i,
      });
      const pose = anim.update(target, dt);
      const skeleton = solve(pose);
      const strike = p.act === ACT_ATTACK ? ANIMS[p.mv].strike : undefined;

      // Shadow on the ground, in the fighter's colour, smaller when they are in the air
      const lift = Math.max(0, GROUND_Y - anim.y);
      const size = Math.max(0.4, 1 - lift / 300);
      this.body.fillStyle(TEAM_COLORS[i], 0.55);
      this.body.fillEllipse(anim.x, GROUND_Y + 3, 78 * size, 13 * size);

      for (const shape of shapesOf(skeleton, p.facing, anim.x, anim.y, strike))
        drawShape(this.body, shape);

      // A small white marker over the head of the fighter you control
      if (i === mine) {
        const hx = anim.x + p.facing * skeleton.head.x;
        const hy = anim.y - skeleton.head.y - 22;
        this.body.fillStyle(0xffffff, 1);
        this.body.fillTriangle(hx - 6, hy - 9, hx + 6, hy - 9, hx, hy);
      }

      // Hit spark when health drops
      if (p.hp < this.lastHp[i]) {
        this.sparks.push({
          x: p.x,
          y: p.y - 72,
          age: 0,
          size: 14 + Math.min(30, (this.lastHp[i] - p.hp) / 3),
        });
      }
      this.lastHp[i] = p.hp;

      this.hpBars[i].setScale(p.hp / MAX_HP, 1);

      if (DEBUG) {
        const hb = hurtbox(p);
        this.dbg.lineStyle(1, 0x00ff66, 1);
        this.dbg.strokeRect(
          hb.left,
          hb.top,
          hb.right - hb.left,
          hb.bottom - hb.top,
        );
        const box = attackBox(p);
        if (box) {
          this.dbg.fillStyle(0xffff00, 0.45);
          this.dbg.fillRect(
            box.left,
            box.top,
            box.right - box.left,
            box.bottom - box.top,
          );
        }
        this.labels[i]
          .setPosition(p.x, hb.top - 6)
          .setText(p.act === ACT_ATTACK ? MOVES[p.mv].name : '');
      }
    });

    // Sparks: a short white starburst
    this.sparks = this.sparks.filter((s) => s.age < 0.2);
    for (const s of this.sparks) {
      s.age += dt;
      const t = Math.min(1, s.age / 0.2);
      this.fx.lineStyle(3, 0xffffff, 1 - t);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.4;
        const r0 = s.size * 0.3 * (1 + t);
        const r1 = s.size * (0.6 + t);
        this.fx.lineBetween(
          s.x + Math.cos(a) * r0,
          s.y + Math.sin(a) * r0,
          s.x + Math.cos(a) * r1,
          s.y + Math.sin(a) * r1,
        );
      }
    }

    this.score.setText(`${state.wins[0]}  -  ${state.wins[1]}`);
    this.clock.setText(String(Math.ceil(state.time / TICK_RATE)));
    const ko = state.players[0].hp <= 0 || state.players[1].hp <= 0;
    this.banner.setText(
      state.over > 0
        ? state.winner === 2
          ? 'DRAW'
          : `${ko ? 'KO' : 'TIME'}! ${state.winner === 0 ? 'RED' : 'BLUE'} WINS`
        : '',
    );

    if (session) {
      const desync = session.desyncFrame;
      this.hud.setColor(desync !== null ? '#ff5555' : '#ffffff');
      this.hud.setText(
        `frame ${state.frame} | ping ${ping} ms | ahead ${session.framesAhead} | drift ${session.drift.toFixed(1)} | speed ${(100 / session.slowdown).toFixed(0)}% | rollbacks ${session.rollbackCount} | depth ${session.lastRollbackDepth}` +
          (desync !== null ? ` | DESYNC at frame ${desync}` : ''),
      );
    } else {
      this.hud.setColor('#ffffff');
      this.hud.setText(status);
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#222222',
  scene: MainScene,
});

if (room) {
  joinRoom(room, (playerIndex) => {
    session = null;
    status = 'Connecting...';
    startPeer(playerIndex, {
      onOpen: () => {
        console.log('Data channel open, starting match as player', playerIndex);
        lastHeard = performance.now();
        status = '';
        session = new Rollback(playerIndex as 0 | 1, send);
      },
      onMessage: handleMessage,
      onClose: () => endSession('Connection closed'),
    });
  });

  socket.on('peer-left', () => {
    console.log('Opponent left');
    endSession('Opponent left. Waiting for a new opponent...');
  });

  (window as any).breakSim = () => session?.debugCorrupt();
}
