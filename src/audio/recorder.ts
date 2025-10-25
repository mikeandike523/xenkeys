// audio/recorder.ts
export type Recording = {
  blob: Blob;
  mimeType: string;
  createdAt: number;
};

function chooseSupportedType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/ogg",
  ];
  for (const t of candidates) {
    if ((window as any).MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  // Fallback lets the UA pick something workable.
  return "";
}

export default class Recorder {
  private mediaRecorder: MediaRecorder;
  private chunks: BlobPart[] = [];
  private _mimeType: string;

  constructor(stream: MediaStream) {
    if (!(window as any).MediaRecorder) {
      throw new Error("MediaRecorder is not supported in this browser.");
    }
    const mimeType = chooseSupportedType();
    this._mimeType = mimeType || undefined as unknown as string;
    this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
  }

  get mimeType(): string {
    return this._mimeType || this.mediaRecorder.mimeType;
  }

  get state(): RecordingState {
    return this.mediaRecorder.state;
  }

  start(): void {
    this.chunks = [];
    // Give the encoder time to flush small buffers; 100ms is a nice balance.
    this.mediaRecorder.start(100);
  }

  stop(): Promise<Recording> {
    return new Promise((resolve, reject) => {
      const onStop = () => {
        this.mediaRecorder.removeEventListener("stop", onStop);
        const blob = new Blob(this.chunks, { type: this.mimeType || "audio/webm" });
        resolve({
          blob,
          mimeType: this.mimeType || "audio/webm",
          createdAt: Date.now(),
        });
      };
      this.mediaRecorder.addEventListener("stop", onStop);
      try {
        this.mediaRecorder.stop();
      } catch (err) {
        this.mediaRecorder.removeEventListener("stop", onStop);
        reject(err);
      }
    });
  }
}
