// audio/synth.ts
import type { Envelope, PitchSynthMessage, Waveform } from "../shared-types/audio-engine";

export default class Synth {
  private context: AudioContext;
  private node: AudioWorkletNode;
  private streamDest: MediaStreamAudioDestinationNode; // <-- add

  private constructor(ctx: AudioContext, node: AudioWorkletNode, streamDest: MediaStreamAudioDestinationNode) {
    this.context = ctx;
    this.node = node;
    this.streamDest = streamDest;
  }

  static async create(): Promise<Synth> {
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/worklets/pitch-synth.worklet.js");
    const node = new AudioWorkletNode(ctx, "pitch-synth");

    // Speakers
    node.connect(ctx.destination);

    // Recording tap
    const streamDest = ctx.createMediaStreamDestination();
    node.connect(streamDest);

    return new Synth(ctx, node, streamDest);
  }

  getMediaStream(): MediaStream {
    return this.streamDest.stream;
  }

  async resume(): Promise<void> {
    if (this.context.state !== "running") {
      await this.context.resume();
    }
  }
  /**
   * Suspend audio context to mute synth output.
   */
  async suspend(): Promise<void> {
    if (this.context.state === "running") {
      await this.context.suspend();
    }
  }

  noteOn(id: number, freq: number, envelope: Envelope): void {
    const msg: PitchSynthMessage = { type: "noteOn", data: { id, freq, envelope } };
    this.node.port.postMessage(msg);
  }

  noteOff(id: number): void {
    const msg: PitchSynthMessage = { type: "noteOff", data: { id } };
    this.node.port.postMessage(msg);
  }

  setWaveform(waveform: Waveform): void {
    const msg: PitchSynthMessage = { type: "waveform", data: waveform };
    this.node.port.postMessage(msg);
  }

  setEnvelope(env: Partial<Envelope>): void {
    const msg: PitchSynthMessage = { type: "setEnvelope", data: env };
    this.node.port.postMessage(msg);
  }

  setVolume(v01: number): void {
    const p = this.node.parameters.get("volume");
    if (!p) return;
    // snap for now; could use setTargetAtTime for smoothing
    p.setValueAtTime(Math.max(0, Math.min(1, v01)), this.context.currentTime);
  }
}
