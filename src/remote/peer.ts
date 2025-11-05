// src/remote/peer.ts
// PeerJS wrapper to establish P2P data connections using 6-char invite codes.
import Peer, { type DataConnection } from 'peerjs';

/**
 * Namespace prefix for PeerJS IDs to avoid collisions.
 */
const PEER_ID_PREFIX = 'xenkeys_peer_';

/** Construct the actual PeerJS ID from a short invite code. */
export function makePeerId(code: string): string {
  return `${PEER_ID_PREFIX}${code}`;
}

/**
 * Result of establishing a PeerJS data connection.
 * - peer: the PeerJS Peer instance (control/signaling connection)
 * - conn: the underlying DataConnection (application data channel)
 */
export type PeerConn = {
  peer: Peer;
  conn: DataConnection;
};

/**
 * Receiver side: create a Peer with a fixed ID and await an incoming connection.
 * @param code Short invite code
 */
export function createReceiverPeer(code: string): Promise<PeerConn> {
  const id = makePeerId(code);
  const peer = new Peer(id);
  return new Promise((resolve, reject) => {
    peer.on('error', reject);
    peer.on('connection', (conn: DataConnection) => {
      conn.on('error', reject);
      conn.on('open', () => resolve({ peer, conn }));
    });
  });
}

/**
 * Sender side: create a Peer with a random ID and connect to the receiver.
 * @param code Short invite code
 */
export function createSenderPeer(code: string): Promise<PeerConn> {
  const peer = new Peer();
  return new Promise((resolve, reject) => {
    peer.on('error', reject);
    peer.on('open', () => {
      const conn = peer.connect(makePeerId(code));
      conn.on('error', reject);
      conn.on('open', () => resolve({ peer, conn }));
    });
  });
}
