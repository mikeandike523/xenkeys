// Piano key dimensions and ratios
export const whiteKeyWidth = 23.5;   // mm
export const whiteKeyLength = 150;   // mm

export const whiteKeyAspect = whiteKeyWidth / whiteKeyLength;

export const blackKeyWidth = 13.7;   // mm
export const blackKeyLength = 95;    // mm


// Derived ratios (normalized to white key width and length)
export const blackToWhiteWidthRatio = blackKeyWidth / whiteKeyWidth;     // ≈ 0.583
export const blackToWhiteLengthRatio = blackKeyLength / whiteKeyLength;  // ≈ 0.633
// Hypothetical purple key dimensions (for tertiary subdivisions)
export const purpleKeyWidth = 7;    // mm (hypothetical)
export const purpleKeyLength = 80;  // mm (hypothetical)

// Derived ratios (normalized to black key width and length)
export const purpleToBlackWidthRatio = purpleKeyWidth / blackKeyWidth;     // ≈ 0.511
export const purpleToBlackLengthRatio = purpleKeyLength / blackKeyLength;  // ≈ 0.842
