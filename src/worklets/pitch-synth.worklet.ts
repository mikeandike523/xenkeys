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
} from "@/shared-types/audio-engine";

type VoiceState = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

// Some environments need this to placate TS about global `sampleRate` in worklets.
declare const sampleRate: number;

// --- RMS normalization config -------------------------------------------------

/**
 * Number of sample points to measure per oscillator cycle when precomputing RMS.
 * Increase for more accuracy (slightly more module init cost).
 */
const RMS_SAMPLE_POINTS = 50;

/**
 * Number of cycles to measure when precomputing RMS.
 * Useful for exotic/self-modulating periodic shapes to ensure stability.
 */
const RMS_NUM_CYCLES = 1;

const AVG_EXPECTED_SIMULTANEOUS_VOICES = 6;

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

/**
 * Pure oscillator output for a given phase in [0,1).
 * Keep in sync with the switch in PolyVoice.process (or use this helper there).
 */
function oscSample(w: Waveform, phase: number): number {
  switch (w) {
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'sawtooth':
      return 2 * phase - 1;
    case 'power2':
      return powerSin(phase, 2);
    case 'power3':
      return powerSin(phase, 3);
    case 'power4':
      return powerSin(phase, 4);
    case 'selfmod0.1':
      return Math.sin(2 * Math.PI * phase + 0.1 * 2 * Math.PI * Math.sin(2 * Math.PI * phase));
    case 'selfmod0.2':
      return Math.sin(2 * Math.PI * phase + 0.2 * 2 * Math.PI * Math.sin(2 * Math.PI * phase));
    case 'selfmod0.3':
      return Math.sin(2 * Math.PI * phase + 0.3 * 2 * Math.PI * Math.sin(2 * Math.PI * phase));
    case 'sine':
    default:
      return Math.sin(2 * Math.PI * phase);
  }
}

/**
 * Compute RMS of a periodic waveform by uniform sampling.
 */
function computeWaveformRMS(w: Waveform, pointsPerCycle: number, cycles: number): number {
  const totalPoints = Math.max(1, Math.floor(pointsPerCycle)) * Math.max(1, Math.floor(cycles));
  let acc = 0;
  for (let i = 0; i < totalPoints; i++) {
    const phase = (i / pointsPerCycle) % 1; // wraps each cycle
    const s = oscSample(w, phase);
    acc += s * s;
  }
  return Math.sqrt(acc / totalPoints);
}

/**
 * Build a normalization gain map so that each waveform’s RMS matches triangle’s RMS.
 * If you prefer a different target (e.g. sine), change targetWave.
 */
const KNOWN_WAVEFORMS: Waveform[] = [
  'sine',
  'square',
  'triangle',
  'sawtooth',
  'power2',
  'power3',
  'power4',
  'selfmod0.1',
  'selfmod0.2',
  'selfmod0.3',
];

const targetWave: Waveform = 'triangle';
const targetRMS = computeWaveformRMS(targetWave, RMS_SAMPLE_POINTS, RMS_NUM_CYCLES);

const NORMALIZATION_GAIN: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const w of KNOWN_WAVEFORMS) {
    const r = computeWaveformRMS(w, RMS_SAMPLE_POINTS, RMS_NUM_CYCLES);
    // Fallback to 1 if RMS is degenerate (shouldn’t happen with these shapes).
    map[w] = r > 0 ? (targetRMS / r) : 1;
  }
  return map;
})();

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

    // Base oscillator sample
    let sample = oscSample(this.waveform, phase);

    // Apply precomputed normalization gain so each waveform matches triangle RMS.
    const norm = NORMALIZATION_GAIN[this.waveform] ?? 1;
    sample *= norm;

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

      // Keep a little headroom since multiple voices can stack
      const s = mix * gain * (1.0/AVG_EXPECTED_SIMULTANEOUS_VOICES);

      for (let ch = 0; ch < output.length; ch++) {
        output[ch][i] = s;
      }
    }

    return true;
  }
}

registerProcessor('pitch-synth', PitchSynthProcessor);
