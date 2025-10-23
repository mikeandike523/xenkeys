// AudioWorklet: Generalized polyphonic pitch synth (temperament-agnostic).
// Loads via: audioContext.audioWorklet.addModule('/worklets/pitch-synth.js')
// Build: esbuild -> public/worklets/pitch-synth.js (ESM)
//
// Assumptions:
// - Client logic computes frequencies (12EDO, 24EDO, N-EDO, just intonation, etc.)
//   and sends them via postMessage({ type: 'noteOn', data: { id, freq, ... } }).
// - This processor focuses on envelopes, simple waveforms, and mixing.
//
// TS notes:
// - Include "DOM" and "WebWorker" libs in tsconfig for AudioWorklet types.
// - ESM output (no IIFE). See the esbuild command you planned earlier.

import { type AudioParamDescriptor } from "./extra-glue-types.d";

import {
  Envelope,
  PitchSynthMessage,
  Waveform
} from "@shared-types/audio-engine";

type VoiceState = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

// Some environments need this to placate TS about global `sampleRate` in worklets.
declare const sampleRate: number;

// --- Utilities ---------------------------------------------------------------

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function secondsToSamples(sec: number, sr: number): number {
  // at least 1 sample to avoid division-by-zero edge cases
  return Math.max(1, Math.floor(Math.max(0, sec) * sr));
}

/**
 * Generalized power-sine oscillator: |sin(2π·phase)|^n * sign(sin(2π·phase)).
 */
function powerSin(phase: number, n: number): number {
  const s = Math.sin(2 * Math.PI * phase);
  return Math.pow(Math.abs(s), n) * Math.sign(s);
}

// --- Voice -------------------------------------------------------------------

class PolyVoice {
  private sr: number;
  private _freq = 440;
  private _samples = 0;

  private _state: VoiceState = 'idle';

  private envSamples = 0;       // samples within current stage
  private attackSamples = 0;
  private decaySamples = 0;
  private releaseSamples = 0;
  private sustainLevel = 0;

  public noteId = 0;
  public waveform: Waveform = 'sine';

  constructor(sr: number) {
    this.sr = sr;
  }

  public get state(): VoiceState {
    return this._state;
  }

  noteOn(freq: number, id: number, env: Envelope): void {
    this._freq = freq;
    this.noteId = id;
    this._state = 'attack';
    this.envSamples = 0;
    this._samples = 0;

    this.attackSamples = secondsToSamples(env.attack, this.sr);
    this.decaySamples = secondsToSamples(env.decay, this.sr);
    this.releaseSamples = secondsToSamples(env.release, this.sr);
    this.sustainLevel = clamp(env.sustain, 0, 1);
  }

  noteOff(id: number): void {
    if (this._state !== 'idle' && this.noteId === id && this._state !== 'release') {
      this._state = 'release';
      this.envSamples = 0;
    }
  }

  forceRelease(): void {
    if (this._state !== 'idle') {
      this._state = 'release';
      this.envSamples = 0;
    }
  }

  setWaveform(w: Waveform): void {
    this.waveform = w;
  }

  process(): number {
    // Envelope
    let envAmp = 0;

    switch (this._state) {
      case 'attack': {
        envAmp = this.envSamples / this.attackSamples;
        if (this.envSamples++ >= this.attackSamples) {
          this._state = 'decay';
          this.envSamples = 0;
        }
        break;
      }
      case 'decay': {
        const t = this.envSamples / this.decaySamples;
        envAmp = 1 + (this.sustainLevel - 1) * t; // linear decay
        if (this.envSamples++ >= this.decaySamples) {
          this._state = 'sustain';
          this.envSamples = 0;
        }
        break;
      }
      case 'sustain': {
        envAmp = this.sustainLevel;
        break;
      }
      case 'release': {
        const t = this.envSamples / this.releaseSamples;
        envAmp = this.sustainLevel * (1 - t);
        if (this.envSamples++ >= this.releaseSamples) {
          this._state = 'idle';
          this.envSamples = 0;
          this.noteId = 0;
          return 0;
        }
        break;
      }
      default:
        return 0;
    }

    // Phase & waveform
    const t = (this._samples * this._freq) / this.sr;
    const phase = t - Math.floor(t); // [0,1)
    let sample: number;

    switch (this.waveform) {
      case 'square':
        sample = phase < 0.5 ? 1 : -1;
        break;
      case 'triangle':
        sample = 1 - 4 * Math.abs(phase - 0.5);
        break;
      case 'sawtooth':
        sample = 2 * phase - 1;
        break;
      case 'power2':
        sample = powerSin(phase, 2);
        break;
      case 'power3':
        sample = powerSin(phase, 3);
        break;
      case 'power4':
        sample = powerSin(phase, 4);
        break;
      case 'power5':
        sample = powerSin(phase, 5);
        break;
      case 'power6':
        sample = powerSin(phase, 6);
        break;
      case 'power7':
        sample = powerSin(phase, 7);
        break;
      case 'power8':
        sample = powerSin(phase, 8);
        break;
      case 'power9':
        sample = powerSin(phase, 9);
        break;
      case 'power10':
        sample = powerSin(phase, 10);
        break;
      case 'sine':
      default:
        sample = Math.sin(2 * Math.PI * phase);
        break;
    }

    this._samples++;
    return sample * envAmp;
  }
}

// --- Processor ---------------------------------------------------------------

type ParameterMap = {
  volume: Float32Array;
};

const DEFAULT_ENV: Envelope = {
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.5,
};

class PitchSynthProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      { name: 'volume', defaultValue: 0.8, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
    ];
  }

  private voices: PolyVoice[] = [];
  private baseEnvelope: Envelope = { ...DEFAULT_ENV };
  private waveform: Waveform = 'sine';

  constructor() {
    super();

    // Default polyphony: 16
    this.resizeVoices(16);

    this.port.onmessage = (e: MessageEvent<PitchSynthMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'noteOn': {
          const env: Envelope = {
            attack: msg.data.envelope?.attack ?? this.baseEnvelope.attack,
            decay: msg.data.envelope?.decay ?? this.baseEnvelope.decay,
            sustain: msg.data.envelope?.sustain ?? this.baseEnvelope.sustain,
            release: msg.data.envelope?.release ?? this.baseEnvelope.release,
          };
          const v = this.findFreeOrSteal();
          v.setWaveform(this.waveform);
          v.noteOn(msg.data.freq, msg.data.id, env);
          break;
        }
        case 'noteOff': {
          const { id } = msg.data;
          this.voices.forEach((v) => v.noteOff(id));
          break;
        }
        case 'waveform': {
          this.waveform = msg.data;
          // Apply immediately to ringing voices
          this.voices.forEach((v) => v.setWaveform(this.waveform));
          break;
        }
        case 'setEnvelope': {
          this.baseEnvelope = {
            attack: msg.data.attack ?? this.baseEnvelope.attack,
            decay: msg.data.decay ?? this.baseEnvelope.decay,
            sustain: msg.data.sustain ?? this.baseEnvelope.sustain,
            release: msg.data.release ?? this.baseEnvelope.release,
          };
          break;
        }
        case 'allNotesOff': {
          this.voices.forEach((v) => v.forceRelease());
          break;
        }
        case 'setPolyphony': {
          const n = Math.max(1, Math.floor(msg.data.voices));
          this.resizeVoices(n);
          break;
        }
      }
    };
  }

  private resizeVoices(n: number): void {
    if (n === this.voices.length) return;
    if (n > this.voices.length) {
      const add = n - this.voices.length;
      for (let i = 0; i < add; i++) this.voices.push(new PolyVoice(sampleRate));
    } else {
      // Shrink: release extra voices first to avoid clicks
      for (let i = n; i < this.voices.length; i++) this.voices[i].forceRelease();
      this.voices.length = n;
    }
    // Ensure current waveform applies to all
    this.voices.forEach((v) => v.setWaveform(this.waveform));
  }

  private findFreeOrSteal(): PolyVoice {
    const free = this.voices.find((v) => v.state === 'idle');
    if (free) return free;
    // Simple voice stealing: reuse voice 0
    return this.voices[0];
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: ParameterMap
  ): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const frameCount = output[0].length;

    // Ensure all channels same length
    for (let ch = 1; ch < output.length; ch++) {
      if (output[ch].length !== frameCount) {
        throw new Error('All outputs must have the same length');
      }
    }

    const vol = parameters.volume;
    for (let i = 0; i < frameCount; i++) {
      let mix = 0;
      for (let v = 0; v < this.voices.length; v++) {
        mix += this.voices[v].process();
      }
      const gain = vol.length > 1 ? vol[i] : vol[0];
      const s = mix * gain * 0.25; // headroom

      for (let ch = 0; ch < output.length; ch++) {
        output[ch][i] = s;
      }
    }

    return true;
  }
}

// The name is generalized (no “quarter-tone” baked in).
registerProcessor('pitch-synth', PitchSynthProcessor);
