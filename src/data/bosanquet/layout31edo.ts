import type { HexTileAppearance, HexKeyboardLayout } from "../../components/CanvasHexKeyboard";

// ---------------------------------------------------------------------------
// Color categories for 31-EDO Bosanquet-Wilson hex keys
// ---------------------------------------------------------------------------
// In 31-EDO meantone:
//   Natural notes (C D E F G A B): steps 0, 5, 10, 13, 18, 23, 28
//   Diesis up (+1 from natural):   steps 1, 6, 11, 14, 19, 24, 29
//   Chromatic sharps (+2):         steps 2, 7, 15, 20, 25
//   Chromatic flats  (-2):         steps 3, 8, 16, 21, 26
//   Diesis down (-1 from natural): steps 4, 9, 12, 17, 22, 27, 30

const NATURAL: HexTileAppearance    = { base: "#ffffff", pressed: "#bbbbbb", outline: "#888888", labelColor: "#222222" };
const DIESIS_UP: HexTileAppearance  = { base: "#bb77ee", pressed: "#9955cc", outline: "#772299", labelColor: "#ffffff" };
const SHARP: HexTileAppearance      = { base: "#333333", pressed: "#555555", outline: "#111111", labelColor: "#ffffff" };
const FLAT: HexTileAppearance       = { base: "#224499", pressed: "#3355bb", outline: "#112266", labelColor: "#ffffff" };
const DIESIS_DN: HexTileAppearance  = { base: "#117766", pressed: "#229988", outline: "#005544", labelColor: "#ffffff" };

// One entry per 31-EDO step (index = inOctaveStep)
const stepAppearances: HexTileAppearance[] = [
  NATURAL,    // 0:  C
  DIESIS_UP,  // 1:  C↑  (C + diesis)
  SHARP,      // 2:  C#
  FLAT,       // 3:  Db
  DIESIS_DN,  // 4:  D↓  (D - diesis)
  NATURAL,    // 5:  D
  DIESIS_UP,  // 6:  D↑
  SHARP,      // 7:  D#
  FLAT,       // 8:  Eb
  DIESIS_DN,  // 9:  E↓
  NATURAL,    // 10: E
  DIESIS_UP,  // 11: E↑
  DIESIS_DN,  // 12: F↓  (F - diesis, between E and F)
  NATURAL,    // 13: F
  DIESIS_UP,  // 14: F↑
  SHARP,      // 15: F#
  FLAT,       // 16: Gb
  DIESIS_DN,  // 17: G↓
  NATURAL,    // 18: G
  DIESIS_UP,  // 19: G↑
  SHARP,      // 20: G#
  FLAT,       // 21: Ab
  DIESIS_DN,  // 22: A↓
  NATURAL,    // 23: A
  DIESIS_UP,  // 24: A↑
  SHARP,      // 25: A#
  FLAT,       // 26: Bb
  DIESIS_DN,  // 27: B↓
  NATURAL,    // 28: B
  DIESIS_UP,  // 29: B↑
  DIESIS_DN,  // 30: Cb  (= B + diesis, enharmonic with C - diesis)
];

// ---------------------------------------------------------------------------
// Bosanquet-Wilson layout for 31-EDO
//
// On the hex grid (flat-top hexagons, odd columns shifted down):
//   Moving right        → +2 EDO steps  (chromatic semitone / apotome: C → C#)
//   Moving up-right     → +5 EDO steps  (whole tone: C → D)
//   Moving up-left      → +3 EDO steps  (diatonic semitone / limma: E → F, B → C)
//
// The diatonic naturals sit in two vertical "bands":
//   col=0: C (row 0), D (row 1), E (row 2)
//   col=4: F (row 1), G (row 2), A (row 3), B (row 4)
// with the next-octave C appearing at col=3, row=5.
// ---------------------------------------------------------------------------
export const bosanquet31EdoLayout: HexKeyboardLayout = {
  colStep: 2,   // EDO steps moving right   → chromatic semitone
  rowStep: 5,   // EDO steps moving up      → whole tone
  cols: 14,
  rows: 7,
  stepAppearances,
};
