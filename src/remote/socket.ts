// src/remote/socket.ts
import { io, Socket } from "socket.io-client";

export type JoinArgs = { room: string; password: string; client_id?: string };
export type SubscribeArgs = { room: string; channels: string[] | ["*"] };
export type PublishArgs = {
  room: string; password: string; client_id: string;
  channel: string; message: string; // server expects string
};

export function connectSocket(baseUrl: string): Socket {
  // baseUrl example: http://<host>:8080 (you derive this in Play.tsx)
  return io(baseUrl, { transports: ["websocket"] });
}

export function joinRoom(sock: Socket, args: JoinArgs): Promise<{client_id: string}> {
  return new Promise((resolve, reject) => {
    sock.emit("join", args);
    const onJoined = (payload: any) => {
      sock.off("error", onErr);
      resolve({ client_id: String(payload?.client_id || "") });
    };
    const onErr = (payload: any) => {
      sock.off("joined", onJoined);
      reject(new Error(payload?.error || "join_failed"));
    };
    sock.once("joined", onJoined);
    sock.once("error", onErr);
  });
}

export function subscribe(sock: Socket, args: SubscribeArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    sock.emit("subscribe", args);
    const ok = () => { cleanup(); resolve(); };
    const bad = (p: any) => { cleanup(); reject(new Error(p?.error || "subscribe_failed")); };
    const cleanup = () => { sock.off("subscribed", ok); sock.off("error", bad); };
    sock.once("subscribed", ok);
    sock.once("error", bad);
  });
}

export function publish(sock: Socket, args: PublishArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    sock.emit("publish", args);
    const ok = () => { cleanup(); resolve(); };
    const bad = (p: any) => { cleanup(); reject(new Error(p?.error || "publish_failed")); };
    const cleanup = () => { sock.off("published", ok); sock.off("error", bad); };
    sock.once("published", ok);
    sock.once("error", bad);
  });
}
