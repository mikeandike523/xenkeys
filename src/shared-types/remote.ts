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
};
