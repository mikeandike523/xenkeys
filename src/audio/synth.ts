import type { Envelope, PitchSynthMessage, Waveform } from "../shared-types/audio-engine";

/**
 * Synthesizer engine wrapping the AudioWorklet pitch-synth processor.
 */
export default class Synth {
  private context: AudioContext;
  private node: AudioWorkletNode;

  private constructor(ctx: AudioContext, node: AudioWorkletNode) {
    this.context = ctx;
    this.node = node;
  }

  /**
   * Create and initialize the AudioContext and worklet node.
   */
  static async create(): Promise<Synth> {
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/worklets/pitch-synth.worklet.js");
    const node = new AudioWorkletNode(ctx, "pitch-synth");
    node.connect(ctx.destination);
    return new Synth(ctx, node);
  }

  /** Resume audio context if not already running. */
  resume(): void {
    if (this.context.state !== "running") {
      this.context.resume();
    }
  }

  /** Trigger a note-on event (with envelope overrides). */
  noteOn(id: number, freq: number, envelope: Envelope): void {
    const msg: PitchSynthMessage = { type: "noteOn", data: { id, freq, envelope } };
    this.node.port.postMessage(msg);
  }

  /** Trigger a note-off event. */
  noteOff(id: number): void {
    const msg: PitchSynthMessage = { type: "noteOff", data: { id } };
    this.node.port.postMessage(msg);
  }

  /** Change the global waveform for new and ringing voices. */
  setWaveform(waveform: Waveform): void {
    const msg: PitchSynthMessage = { type: "waveform", data: waveform };
    this.node.port.postMessage(msg);
  }

  /** Update the base ADSR envelope settings. */
  setEnvelope(env: Partial<Envelope>): void {
    const msg: PitchSynthMessage = { type: "setEnvelope", data: env };
    this.node.port.postMessage(msg);
  }
}
