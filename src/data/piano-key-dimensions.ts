// Piano key dimensions and ratios
export const whiteKeyWidth = 23.5;   // mm
export const whiteKeyLength = 150;   // mm

export const whiteKeyAspect = whiteKeyWidth / whiteKeyLength;

export const blackKeyWidth = 13.7;   // mm
export const blackKeyLength = 95;    // mm


// Derived ratios (normalized to white key width and length)
export const blackToWhiteWidthRatio = blackKeyWidth / whiteKeyWidth;     // ≈ 0.583
export const blackToWhiteLengthRatio = blackKeyLength / whiteKeyLength;  // ≈ 0.633
