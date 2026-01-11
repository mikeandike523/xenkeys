/**
 * Get a base frequency for any EDO tuning that has some music-theoretic
 * relation to a 12-tone piano.
 *
 * The EDO must relate to the 12-tone piano in terms of tuning for
 * `microtonesFromA4toC5` to make sense.
 *
 * Steps:
 *  1. Start from A4 at the given `A4Frequency` (Hz).
 *  2. Move up by `microtonesFromAtoC` steps, where each step is
 *     2^(1 / totalEDO), to reach C5.
 *  3. Use `octaveNumber` and powers of 2.0 to shift C5 to the desired octave.
 *
 * @param A4Frequency - The frequency of A4 in Hz.
 * @param totalEDO - The total number of equal divisions of the octave (EDO).
 * @param octaveNumber - After finding C5, use this and factors of 2.0
 * to find the frequency of the desired octave number.
 * @param microtonesFromAtoC - The number of microtone steps to travel
 * from A4 to C5.
 * @param tuneCIn12Edo - When true, tune C5 using 12-EDO (A4 to C5 is 3
 * semitones) instead of the current EDO's microtone steps.
 */
export default function getBaseFrequencyC(
  A4Frequency: number,
  totalEDO: number,
  octaveNumber: number,
  microtonesFromAtoC: number,
  tuneCIn12Edo = false
): number {
  if (!Number.isFinite(A4Frequency) || A4Frequency <= 0) {
    throw new Error("A4Frequency must be a positive finite number.");
  }
  if (!Number.isFinite(totalEDO) || totalEDO <= 0) {
    throw new Error("totalEDO must be a positive finite number.");
  }
  if (!Number.isFinite(octaveNumber)) {
    throw new Error("octaveNumber must be a finite number.");
  }
  if (!Number.isFinite(microtonesFromAtoC)) {
    throw new Error("microtonesFromAtoC must be a finite number.");
  }

  // One microtone step in the given EDO
  const stepRatio = Math.pow(2, 1 / totalEDO);

  // Move from A4 up to C5 by the specified number of steps
  const c5 = tuneCIn12Edo
    ? A4Frequency * Math.pow(2, 3 / 12)
    : A4Frequency * Math.pow(stepRatio, microtonesFromAtoC);

  // Shift from C5 to the requested octave using powers of 2
  const octaveShift = Math.pow(2, octaveNumber - 5);

  return c5 * octaveShift;
}
