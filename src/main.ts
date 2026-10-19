import Phaser from 'phaser';
import {
  WIDTH, HEIGHT, TICK_RATE, Input,
  FIGHTER_W, FIGHTER_H, GROUND_Y, MAX_HP, ROLL_INVULN, MOVES,
  ACT_ATTACK, ACT_HITSTUN, ACT_BLOCKSTUN, ACT_ROLL, ACT_JUMPSQUAT,
  createInitialState, step, attackBox, hurtbox,
  type GameState,
} from './sim';
import { Rollback } from './rollback';
import { joinRoom, socket, startPeer, closePeer, sendToPeer } from './net';

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'Q' | 'E' | 'Z' | 'C', Phaser.Input.Keyboard.Key>;

const TICK_MS = 1000 / TICK_RATE;
const LIVENESS_TIMEOUT = 5000;
const BASE_COLORS = [0xff0000, 0x00aaff];

const params = new URLSearchParams(location.search);
const room = params.get('room');
const LAG = Number(params.get('lag') ?? 0);
const JITTER = Number(params.get('jitter') ?? 0);
const LOSS = Number(params.get('loss') ?? 0);
const SKEW = Number(params.get('skew') ?? 1);   // test only: above 1 makes THIS window's clock run fast
const SYNC = params.get('nosync') === null;     // ?nosync=1 turns the drift correction off
const DEBUG = params.get('debug') !== null;     // ?debug=1 draws the hurtboxes
const DUMMY = params.get('dummy') ?? 'idle';    // offline only: idle, punch or kick

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

class MainScene extends Phaser.Scene {
  private state: GameState = createInitialState();
  private accumulator = 0;
  private bodies: Phaser.GameObjects.Rectangle[] = [];
  private faces: Phaser.GameObjects.Rectangle[] = [];
  private atkBoxes: Phaser.GameObjects.Rectangle[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private hpBars: Phaser.GameObjects.Rectangle[] = [];
  private hud!: Phaser.GameObjects.Text;
  private score!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private dbg!: Phaser.GameObjects.Graphics;
  private keys!: Keys;
  private highlighted = -1;

  create(): void {
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q,E,Z,C') as Keys;

    this.add.rectangle(WIDTH / 2, GROUND_Y, WIDTH, 4, 0x888888).setOrigin(0.5, 0);

    // Health bars: dark background, then the coloured bar on top
    this.add.rectangle(20, 36, 300, 16, 0x444444).setOrigin(0, 0);
    this.add.rectangle(WIDTH - 20, 36, 300, 16, 0x444444).setOrigin(1, 0);
    this.hpBars = [
      this.add.rectangle(20, 36, 300, 16, 0x22cc55).setOrigin(0, 0),
      this.add.rectangle(WIDTH - 20, 36, 300, 16, 0x22cc55).setOrigin(1, 0),
    ];

    this.bodies = [
      this.add.rectangle(0, 0, FIGHTER_W, FIGHTER_H, BASE_COLORS[0]).setOrigin(0.5, 1),
      this.add.rectangle(0, 0, FIGHTER_W, FIGHTER_H, BASE_COLORS[1]).setOrigin(0.5, 1),
    ];
    this.faces = [
      this.add.rectangle(0, 0, 14, 14, 0xffffff),
      this.add.rectangle(0, 0, 14, 14, 0xffffff),
    ];
    // 1x1 rectangles that get scaled to the hitbox size each frame
    this.atkBoxes = [
      this.add.rectangle(0, 0, 1, 1, 0xffff00, 0.5).setVisible(false),
      this.add.rectangle(0, 0, 1, 1, 0xffff00, 0.5).setVisible(false),
    ];
    this.labels = [
      this.add.text(0, 0, '', { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5, 1),
      this.add.text(0, 0, '', { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5, 1),
    ];
    this.dbg = this.add.graphics();

    this.hud = this.add.text(10, 10, '', { fontSize: '14px', color: '#ffffff' });
    this.score = this.add
      .text(WIDTH / 2, 26, '0  -  0', { fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5, 0);
    this.clock = this.add
      .text(WIDTH / 2, 58, '', { fontSize: '18px', color: '#dddddd' })
      .setOrigin(0.5, 0);
    this.banner = this.add
      .text(WIDTH / 2, 220, '', { fontSize: '56px', color: '#ffdd44', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.render(this.state);
  }

  update(_time: number, delta: number): void {
    this.accumulator += Math.min(delta, 250);

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
      this.render(session.state);
    } else if (!room) {
      while (this.accumulator >= TICK_MS) {
        this.state = step(this.state, [this.readInput(), dummyInput(this.state.frame)]);
        this.accumulator -= TICK_MS;
      }
      this.render(this.state);
    } else {
      this.accumulator = 0;
      this.render(this.state);
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

  private render(state: GameState): void {
    this.dbg.clear();

    state.players.forEach((p, i) => {
      // Placeholder colours show the phase. The black silhouettes come with the animation step.
      let color = BASE_COLORS[i];
      let alpha = 1;
      if (p.act === ACT_HITSTUN) color = 0xffffff;
      else if (p.act === ACT_BLOCKSTUN) color = 0x99ffdd;
      else if (p.act === ACT_ROLL) alpha = p.t < ROLL_INVULN ? 0.3 : 0.7;
      else if (p.act === ACT_JUMPSQUAT) alpha = 0.8;
      else if (p.act === ACT_ATTACK) {
        const m = MOVES[p.mv];
        if (p.t < m.startup) color = 0xffaa00;
        else if (p.t < m.startup + m.active) color = 0xffff00;
        else color = 0x888888;
      }

      // The body is as tall as the hurtbox, so crouching shrinks it
      const hb = hurtbox(p);
      const h = p.y - hb.top;
      this.bodies[i]
        .setPosition(p.x, p.y)
        .setScale(1, h / FIGHTER_H)
        .setFillStyle(color)
        .setAlpha(alpha);
      this.faces[i].setPosition(p.x + p.facing * 16, p.y - h + 24);
      this.labels[i]
        .setPosition(p.x, p.y - h - 4)
        .setText(p.act === ACT_ATTACK ? MOVES[p.mv].name : '');

      const box = attackBox(p);
      if (box) {
        this.atkBoxes[i]
          .setPosition((box.left + box.right) / 2, (box.top + box.bottom) / 2)
          .setScale(box.right - box.left, box.bottom - box.top)
          .setVisible(true);
      } else {
        this.atkBoxes[i].setVisible(false);
      }

      if (DEBUG) {
        this.dbg.lineStyle(1, 0x00ff66, 1);
        this.dbg.strokeRect(hb.left, hb.top, hb.right - hb.left, hb.bottom - hb.top);
      }

      this.hpBars[i].setScale(p.hp / MAX_HP, 1);
    });

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

    const mine = session ? session.localIndex : -1;
    if (mine !== this.highlighted) {
      this.bodies.forEach((c, i) => c.setStrokeStyle(i === mine ? 4 : 0, 0xffffff));
      this.highlighted = mine;
    }

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
