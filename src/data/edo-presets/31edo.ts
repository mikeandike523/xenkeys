import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type { KeyClass, KeyDeclaration } from "../../types/XenOctaveDisplayManifest";
import getBaseFrequencyC from "../../utils/music-theory/getBaseFrequency";

/**
 * 31EDO preset with three key classes, inspired by the Clavemusicum Omnitonum.
 *
 * Layout logic (carefully chosen to yield exactly 31 keys per octave):
 * - Top level (white): 7 diatonic anchors at steps [0,5,10,13,18,23,28].
 * - Gaps come in sizes 5 (tone) or 3 (diatonic semitone) 31-EDO steps.
 * - For each 5-step gap (C–D, D–E, F–G, G–A, A–B):
 *     • BLACK keys at +2 and +3 (centered accidentals).
 *     • PURPLE (3rd class) keys at +1 and +4 (edge microsteps).
 * - For each 3-step gap (E–F, B–C):
 *     • BLACK key at +2 (close to upper diatonic).
 *     • PURPLE key at +1 (close to lower diatonic).
 *
 * Totals: 7 white + 12 black + 12 purple = 31 distinct microsteps.
 *
 * Offsets semantics (per KeyClass):
 *   offsets: [whiteIndex, blackSlotIndex, purpleSlotIndex]
 *   - White keys: [i, 0, 0]
 *   - Black keys: [i, j, 0]  (j = 0..1 in 5-step gaps; 0 in 3-step gaps)
 *   - Purple keys: [i, 0, k] (k = 0..1 in 5-step gaps; 0 in 3-step gaps)
 */

export function make31EDO(
  whiteKeyAppearance = {
    baseColor: "hsl(0, 0%, 100%)",
    pressedColor: "hsl(0, 0%, 65%)",
    outlineColor: "hsl(0, 0%, 50%)",
    outlineThickness: 3,
  },
  blackKeyAppearance = {
    baseColor: "hsl(0, 0%, 0%)",
    pressedColor: "hsl(0, 0%, 30%)",
    outlineColor: "hsl(0, 0%, 50%)",
    outlineThickness: 3,
  },
  // Thin, shorter, purple‑ish third class
  purpleKeyAppearance = {
    baseColor: "hsl(275, 55%, 52%)",
    pressedColor: "hsl(275, 55%, 38%)",
    outlineColor: "hsl(275, 20%, 35%)",
    outlineThickness: 2,
  },
  // Geometry ratios
  blackKeyWidthToWhiteKeyWidthRatio = 0.60,
  blackKeyHeight = 0.80,
  purpleWidthToBlackWidthRatio = 0.50, // third class thinner than black
  purpleHeight = 0.60 // third class shorter than black
): XenOctaveDisplayManifest {
  // --- Key classes ---------------------------------------------------------
  const keyClasses: Array<KeyClass> = [
    // White
    {
      widthFraction: 1 / 7,
      heightFraction: 1,
      baseColor: whiteKeyAppearance.baseColor,
      pressedColor: whiteKeyAppearance.pressedColor,
      outlineColor: whiteKeyAppearance.outlineColor,
      outlineThickness: whiteKeyAppearance.outlineThickness,
    },
    // Black (relative to white)
    {
      widthFraction: blackKeyWidthToWhiteKeyWidthRatio,
      heightFraction: blackKeyHeight,
      baseColor: blackKeyAppearance.baseColor,
      pressedColor: blackKeyAppearance.pressedColor,
      outlineColor: blackKeyAppearance.outlineColor,
      outlineThickness: blackKeyAppearance.outlineThickness,
    },
    // Purple third class (relative to black)
    {
      widthFraction: purpleWidthToBlackWidthRatio,
      heightFraction: purpleHeight,
      baseColor: purpleKeyAppearance.baseColor,
      pressedColor: purpleKeyAppearance.pressedColor,
      outlineColor: purpleKeyAppearance.outlineColor,
      outlineThickness: purpleKeyAppearance.outlineThickness,
    },
  ];

  // --- Scale scaffold (31-EDO meantone-style):
  // C major anchors at microsteps 0,5,10,13,18,23,28 ; next octave at 31.
  const anchors: number[] = [0, 5, 10, 13, 18, 23, 28, 31];

  // For each gap, define the within-gap placements for black & purple slots.
  // Using the scheme described in the header comment.
  type GapPlan = {
    gap: 3 | 5;
    blackPositions: number[];  // relative microsteps inside the gap
    purplePositions: number[]; // relative microsteps inside the gap
  };

  const plans: GapPlan[] = [
    { gap: 5, blackPositions: [2, 3], purplePositions: [1, 4] }, // C–D
    { gap: 5, blackPositions: [2, 3], purplePositions: [1, 4] }, // D–E
    { gap: 3, blackPositions: [2], purplePositions: [1] },       // E–F
    { gap: 5, blackPositions: [2, 3], purplePositions: [1, 4] }, // F–G
    { gap: 5, blackPositions: [2, 3], purplePositions: [1, 4] }, // G–A
    { gap: 5, blackPositions: [2, 3], purplePositions: [1, 4] }, // A–B
    { gap: 3, blackPositions: [2], purplePositions: [1] },       // B–C
  ];

  const keyDeclarations: Array<KeyDeclaration> = [];

  // Add whites first (anchors themselves)
  for (let i = 0; i < anchors.length - 1; i++) {
    keyDeclarations.push({
      offsets: [i, 0, 0], // whiteIndex i, blackSlot 0, purpleSlot 0
      divisions: 1,
      microStepOffset: anchors[i],
    });
  }

  // Add accidentals and micro-keys within each gap
  for (let i = 0; i < plans.length; i++) {
    const base = anchors[i];
    const { gap, blackPositions, purplePositions } = plans[i];
    const expected = anchors[i + 1] - anchors[i];
    if (expected !== gap) {
      // Safety check in case someone later tweaks anchors or plans independently
      throw new Error(
        `31EDO preset invariant failed at gap ${i}: expected ${expected}, planned ${gap}`
      );
    }

    // Black keys (second class) — index them left-to-right within the slot
    for (let j = 0; j < blackPositions.length; j++) {
      keyDeclarations.push({
        offsets: [i, j, 0],
        divisions: 1,
        microStepOffset: base + blackPositions[j],
      });
    }

    // Purple keys (third class) — also left-to-right
    for (let k = 0; k < purplePositions.length; k++) {
      keyDeclarations.push({
        offsets: [i, 0, k],
        divisions: 1,
        microStepOffset: base + purplePositions[k],
      });
    }
  }

  // Now sort everything by ascending microStepOffset so the array is in play-order
  keyDeclarations.sort((a, b) => a.microStepOffset - b.microStepOffset);

  // Defensive check: ensure we built exactly 31 unique steps [0..30]
  if (keyDeclarations.length !== 31) {
    throw new Error(`31EDO preset must have 31 keys; got ${keyDeclarations.length}`);
  }
  const seen = new Set<number>();
  for (const kd of keyDeclarations) {
    if (seen.has(kd.microStepOffset)) {
      throw new Error(`Duplicate microStepOffset ${kd.microStepOffset}`);
    }
    seen.add(kd.microStepOffset);
  }

  return {
    keyClasses,
    keyDeclarations,
    totalEDO: 31,
    // In 31-EDO, A is 23 steps above C (C→D 5, D→E 5, E→F 3, F→G 5, G→A 5; 5+5+3+5+5 = 23)
    C4Frequency: getBaseFrequencyC(440, 31, 4, 23),
  };
}

export default make31EDO;
