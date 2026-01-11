// src/shared-types/remote.ts
import type { Envelope, Waveform } from "../shared-types/audio-engine";

export type SettingsSyncPayload = {
  kind: "settings-sync";
  // "edo preset" = your manifest preset key (e.g., "12edo", "19edo", etc.)
  manifestName: string;
  waveform: Waveform;            // "sound preset"
  envelope: Envelope;            // ADSR
  volumePct: number;             // 0..100
  startingOctave: number;        // oct start
  octaveCount: number;           // oct count
  a4Frequency: number;           // reference A4 frequency (Hz)
  tuneCIn12Edo: boolean;         // tune C using 12-EDO semitones
};


// --- New: ephemeral join-code types ---
export type InviteStartResponse = {
  status: "ok";
  code: string;                 // 6-char
  room: string;
  password: string;
  net: {
    hostname: string;
    fqdn: string;
    primary_ip: string;
    all_ips: string[];
    port: number;
    http_base: string | null;
  };
};

export type InviteStatus =
  | { status: "idle" }
  | { status: "pending"; requested_by: { ip?: string; label?: string; ts?: number } }
  | { status: "approved" }
  | { status: "denied" };

export type InviteRedeemResponse =
  | { status: "pending" }
  | { status: "approved"; room: string; password: string }
  | { status: "denied" };
