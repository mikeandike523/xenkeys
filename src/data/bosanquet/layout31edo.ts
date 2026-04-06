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
//   Moving right (SE direction) → +5 EDO steps  (whole tone: C → D)
//   Moving up   (N  direction)  → +3 EDO steps  (diatonic semitone / limma: E → F, B → C)
//   Moving NE                   → +8 EDO steps  (minor third)
//   Moving NW                   → −2 EDO steps  (chromatic semitone down)
//
// The diatonic naturals form the classic Bosanquet staircase — horizontal runs
// interrupted by a one-row step at each diatonic semitone (E→F and B→C):
//   Row 0: C (col 0), D (col 1), E (col 2)        — three whites moving right
//   Row 1: F (col 2), G (col 3), A (col 4), B (col 5) — four whites moving right
//   Row 2: C'(col 5), D'(col 6), E'(col 7)
//   Row 3: F'(col 7), G'(col 8), A'(col 9), B'(col 10)
//   Row 4: C''(col 10), D''(col 11), E''(col 12)
//   Row 5: F''(col 12), G''(col 13), A''(col 14), B''(col 15)
//   Row 6: C'''(col 15) — top-right corner closes out 3 octaves
//
// 16 columns × 7 rows = 112 tiles covering ~3 octaves of diatonic content.
// ---------------------------------------------------------------------------
export const bosanquet31EdoLayout: HexKeyboardLayout = {
  colStep: 5,   // EDO steps moving right   → whole tone
  rowStep: 3,   // EDO steps moving up      → diatonic semitone
  cols: 16,
  rows: 7,
  stepAppearances,
};
