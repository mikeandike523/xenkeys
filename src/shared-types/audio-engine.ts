export type Waveform =
  | 'sine'
  | 'square'
  | 'triangle'
  | 'sawtooth'
  | 'power2'
  | 'power3'
  | 'power4'
  | 'selfmod0.1'
  | 'selfmod0.2'
  | 'selfmod0.3';

export type Envelope = {
  attack: number;   // seconds
  decay: number;    // seconds
  sustain: number;  // 0..1
  release: number;  // seconds
};



export type NoteOnMsg = {
  type: 'noteOn';
  data: {
    id: number;         // voice/note id from client
    freq: number;       // Hz, precomputed by client (any temperament)
    envelope?: Partial<Envelope>;
  };
};

export type NoteOffMsg = {
  type: 'noteOff';
  data: { id: number };
};

export type WaveformMsg = {
  type: 'waveform';
  data: Waveform;
};

export type SetEnvelopeMsg = {
  type: 'setEnvelope';
  data: Partial<Envelope>;
};

export type AllNotesOffMsg = {
  type: 'allNotesOff';
};

export type SetPolyphonyMsg = {
  type: 'setPolyphony';
  data: { voices: number }; // resize voice pool
};

export type PitchSynthMessage =
  | NoteOnMsg
  | NoteOffMsg
  | WaveformMsg
  | SetEnvelopeMsg
  | AllNotesOffMsg
  | SetPolyphonyMsg;
