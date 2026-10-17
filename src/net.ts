//stage 6

import { io } from 'socket.io-client';

export const socket = io('http://localhost:3000');

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  // { urls: 'turn:your-turn-host:3478', username: 'user', credential: 'pass' },
];

type Signal =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

export type PeerHandlers = {
  onOpen?: () => void;
  onMessage?: (data: string) => void;
  onClose?: () => void;
};

let pc: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];

// ---------- Room ----------

export function joinRoom(
  roomId: string,
  onReady: (playerIndex: number) => void,
): void {
  let playerIndex = -1;

  socket.on('joined', (data: { playerIndex: number }) => {
    playerIndex = data.playerIndex;
    console.log('Joined room', roomId, 'as player', playerIndex);
  });

  socket.on('ready', () => {
    console.log('ready received, I am player', playerIndex);
    onReady(playerIndex);
  });
  socket.on('room-full', () =>
    console.warn('Room is full, waiting for a free slot...'),
  );
  socket.on('room-open', () => socket.emit('join', roomId));

  socket.emit('join', roomId);
}

// ---------- Peer connection ----------

function setupChannel(
  conn: RTCPeerConnection,
  ch: RTCDataChannel,
  handlers: PeerHandlers,
): void {
  channel = ch;
  ch.onopen = () => {
    console.log('channel open, current connection:', pc === conn);
    if (pc === conn) handlers.onOpen?.();
  };
  ch.onmessage = (e) => {
    if (pc === conn) handlers.onMessage?.(e.data);
  };
  ch.onclose = () => {
    console.log('channel closed, current connection:', pc === conn);
    if (pc === conn) handlers.onClose?.();
  };
}

export function closePeer(): void {
  if (channel) {
    channel.onclose = null;
    channel.onmessage = null;
    channel.close();
  }
  pc?.close();
  channel = null;
  pc = null;
  pendingCandidates = [];
}

export async function startPeer(
  playerIndex: number,
  handlers: PeerHandlers,
): Promise<void> {
  closePeer();

  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc = conn;

  conn.onconnectionstatechange = () => {
    console.log('connection state:', conn.connectionState);
    if (pc === conn && conn.connectionState === 'failed') handlers.onClose?.();
  };
  conn.oniceconnectionstatechange = () =>
    console.log('ICE state:', conn.iceConnectionState);
  conn.onicecandidate = (e) => {
    if (e.candidate) {
      console.log('local candidate:', e.candidate.candidate);
      socket.emit('signal', {
        type: 'candidate',
        candidate: e.candidate.toJSON(),
      });
    } else {
      console.log('candidate gathering done');
    }
  };

  if (playerIndex === 0) {
    setupChannel(
      conn,
      conn.createDataChannel('game', { ordered: false, maxRetransmits: 0 }),
      handlers,
    );
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    socket.emit('signal', { type: 'offer', sdp: conn.localDescription });
  } else {
    conn.ondatachannel = (e) => setupChannel(conn, e.channel, handlers);
  }
}

async function flushCandidates(conn: RTCPeerConnection): Promise<void> {
  for (const c of pendingCandidates) await conn.addIceCandidate(c);
  pendingCandidates = [];
}

socket.on('signal', async (msg: Signal) => {
  const conn = pc;
  if (!conn) {
    console.warn('signal dropped, no peer connection yet:', msg.type);
    return;
  }
  console.log('signal received:', msg.type);

  try {
    if (msg.type === 'offer') {
      await conn.setRemoteDescription(msg.sdp);
      await flushCandidates(conn);
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      socket.emit('signal', { type: 'answer', sdp: conn.localDescription });
    } else if (msg.type === 'answer') {
      await conn.setRemoteDescription(msg.sdp);
      await flushCandidates(conn);
    } else if (msg.type === 'candidate') {
      if (conn.remoteDescription) await conn.addIceCandidate(msg.candidate);
      else pendingCandidates.push(msg.candidate);
    }
  } catch (err) {
    console.error('signal handling failed:', msg.type, err);
  }
});

export function sendToPeer(data: string): void {
  if (channel?.readyState === 'open') channel.send(data);
}
