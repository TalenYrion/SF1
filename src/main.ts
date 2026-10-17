//stage 6

import Phaser from 'phaser';
import {
  WIDTH,
  HEIGHT,
  RADIUS,
  TICK_RATE,
  Input,
  createInitialState,
  step,
  type GameState,
} from './sim';
import { Rollback } from './rollback';
import { joinRoom, socket, startPeer, closePeer, sendToPeer } from './net';

type WASDKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

const TICK_MS = 1000 / TICK_RATE;
const LIVENESS_TIMEOUT = 5000; // ms of silence before we declare the connection lost

const params = new URLSearchParams(location.search);
const room = params.get('room');
const LAG = Number(params.get('lag') ?? 0);
const JITTER = Number(params.get('jitter') ?? 0);
const LOSS = Number(params.get('loss') ?? 0);

function send(msg: string): void {
  if (Math.random() < LOSS) return;
  const delay = LAG + Math.random() * JITTER;
  if (delay <= 0) sendToPeer(msg);
  else setTimeout(() => sendToPeer(msg), delay);
}

let session: Rollback | null = null;
let status = room ? 'Waiting for opponent...' : '';
let ping = 0;
let lastHeard = 0;

// Messages: JSON input packets start with "{", pings with "P", pongs with "O"
function handleMessage(data: string): void {
  lastHeard = performance.now();
  if (data[0] === 'P') {
    send('O' + data.slice(1)); // echo the timestamp back
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
  private circles: Phaser.GameObjects.Arc[] = [];
  private hud!: Phaser.GameObjects.Text;
  private wasd!: WASDKeys;
  private arrows!: Phaser.Types.Input.Keyboard.CursorKeys;
  private highlighted = -1;

  create(): void {
    const kb = this.input.keyboard!;
    this.wasd = kb.addKeys('W,A,S,D') as WASDKeys;
    this.arrows = kb.createCursorKeys();

    this.circles = [
      this.add.circle(0, 0, RADIUS, 0xff0000),
      this.add.circle(0, 0, RADIUS, 0x00aaff),
    ];
    this.hud = this.add.text(10, 10, '', {
      fontSize: '14px',
      color: '#ffffff',
    });
    this.render(this.state);
  }

  update(_time: number, delta: number): void {
    this.accumulator += Math.min(delta, 250);

    if (session && performance.now() - lastHeard > LIVENESS_TIMEOUT) {
      endSession('Connection lost');
    }

    if (session) {
      while (this.accumulator >= TICK_MS) {
        if (!session.advance(this.readP1() | this.readP2())) {
          session.resend();
          this.accumulator = Math.min(this.accumulator, TICK_MS * 4);
          break;
        }
        this.accumulator -= TICK_MS;
      }
      this.render(session.state);
    } else if (!room) {
      while (this.accumulator >= TICK_MS) {
        this.state = step(this.state, [this.readP1(), this.readP2()]);
        this.accumulator -= TICK_MS;
      }
      this.render(this.state);
    } else {
      this.accumulator = 0;
      this.render(this.state);
    }
  }

  private readP1(): number {
    let input = 0;
    if (this.wasd.W.isDown) input |= Input.UP;
    if (this.wasd.S.isDown) input |= Input.DOWN;
    if (this.wasd.A.isDown) input |= Input.LEFT;
    if (this.wasd.D.isDown) input |= Input.RIGHT;
    return input;
  }

  private readP2(): number {
    let input = 0;
    if (this.arrows.up.isDown) input |= Input.UP;
    if (this.arrows.down.isDown) input |= Input.DOWN;
    if (this.arrows.left.isDown) input |= Input.LEFT;
    if (this.arrows.right.isDown) input |= Input.RIGHT;
    return input;
  }

  private render(state: GameState): void {
    state.players.forEach((p, i) => this.circles[i].setPosition(p.x, p.y));

    const mine = session ? session.localIndex : -1;
    if (mine !== this.highlighted) {
      this.circles.forEach((c, i) =>
        c.setStrokeStyle(i === mine ? 4 : 0, 0xffffff),
      );
      this.highlighted = mine;
    }

    if (session) {
      const desync = session.desyncFrame;
      this.hud.setColor(desync !== null ? '#ff5555' : '#ffffff');
      this.hud.setText(
        `frame ${state.frame} | ping ${ping} ms | ahead ${session.framesAhead} | rollbacks ${session.rollbackCount} | depth ${session.lastRollbackDepth}` +
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

  // Test helper
  (window as any).breakSim = () => session?.debugCorrupt();
}
