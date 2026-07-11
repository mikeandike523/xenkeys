import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type { KeyClass, KeyDeclaration } from "../../types/XenOctaveDisplayManifest";
import { blackToWhiteWidthRatio, blackToWhiteLengthRatio } from "../piano-key-dimensions";
import { defaultWhiteKeyAppearance, defaultBlackKeyAppearance } from "../color-presets";
import makeSuffixCycle from "@/utils/algorithms/makeSuffixCycle";
import iota from "@/utils/algorithms/iota";

// ASCII accidental symbols (no special UTF-8):
//   ^ quarter sharp (up a quarter tone)   v quarter flat (down a quarter tone)
//   # sharp                                b flat
//   ^# three-quarter sharp                 vb three-quarter flat
// Whole tones split into 4 quarter-steps, diatonic semitones (E-F, B-C) into 2.
// Enharmonic pairs are shown as "sharpward | flatward", e.g. "^C | vDb".

const noteNamesSharpwards = makeSuffixCycle([
    ["C", ["", "^", "#", "^#"]],
    ["D", ["", "^", "#", "^#"]],
    ["E", ["", "^"]],
    ["F", ["", "^", "#", "^#"]],
    ["G", ["", "^", "#", "^#"]],
    ["A", ["", "^", "#", "^#"]],
    ["B", ["", "^"]],
]);

const noteNamesFlatwards = makeSuffixCycle([
    ["C", ["v"]],
    ["B", ["", "v", "b", "vb"]],
    ["A", ["", "v", "b", "vb"]],
    ["G", ["", "v", "b", "vb"]],
    ["F", ["", "v"]],
    ["E", ["", "v", "b", "vb"]],
    ["D", ["", "v", "b", "vb"]],
    ["C", [""]],
]);

const noteNames = iota(24).map((i) => {
    const sharpwardsName = noteNamesSharpwards[i];
    const flatwardsName = noteNamesFlatwards[24 - 1 - i];
    return `${sharpwardsName} | ${flatwardsName}`;
});


const keyDeclarations: Array<KeyDeclaration> = [
    {
        offsets: [0,0],
        divisions: 2,
        microStepOffset: 0*2,
        classIndex: 0,
    }, // C
    {
        offsets: [0,1],
        divisions: 2,
        microStepOffset: 1*2,
        classIndex: 1,
    }, // C#
    {
        offsets: [1,0],
        divisions: 2,
        microStepOffset: 2*2,
        classIndex: 0,
    }, // D
    {
        offsets: [1,1],
        divisions: 2,
        microStepOffset: 3*2,
        classIndex: 1,
    }, // D#
    {
        offsets: [2,0],
        divisions: 2,
        microStepOffset: 4*2,
        classIndex: 0,
    }, // E
    {
        offsets: [3,0],
        divisions: 2,
        microStepOffset: 5*2,
        classIndex: 0,
    }, // F
    {
        offsets: [3,1],
        divisions: 2,
        microStepOffset: 6*2,
        classIndex: 1,
    }, // F#
    {
        offsets: [4,0],
        divisions: 2,
        microStepOffset: 7*2,
        classIndex: 0,
    }, // G
    {
        offsets: [4,1],
        divisions: 2,
        microStepOffset: 8*2,
        classIndex: 1,
    }, // G#
    {
        offsets: [5,0],
        divisions: 2,
        microStepOffset: 9*2,
        classIndex: 0,
    }, // A
    {
        offsets: [5,1],
        divisions: 2,
        microStepOffset: 10*2,
        classIndex: 1,
    }, // A#
    {
        offsets: [6,0],
        divisions: 2,
        microStepOffset: 11*2,
        classIndex: 0,
    }, // B


]

export function make24EDO(
    whiteKeyAppearance = defaultWhiteKeyAppearance,
    blackKeyAppearance = defaultBlackKeyAppearance,
    blackKeyWidthToWhiteKeyWidthRatio = blackToWhiteWidthRatio,
    blackKeyHeight = blackToWhiteLengthRatio
): XenOctaveDisplayManifest{
    const keyClasses: Array<KeyClass> = [
        // White keys
        {
            widthFraction: 1/7,
            heightFraction: 1,
            baseColor: whiteKeyAppearance.baseColor,
            pressedColor: whiteKeyAppearance.pressedColor,
            outlineColor: whiteKeyAppearance.outlineColor,
            outlineThickness: whiteKeyAppearance.outlineThickness,
        },
        // Black keys
        {
            widthFraction: blackKeyWidthToWhiteKeyWidthRatio,
            heightFraction: blackKeyHeight,
            baseColor: blackKeyAppearance.baseColor,
            pressedColor: blackKeyAppearance.pressedColor,
            outlineColor: blackKeyAppearance.outlineColor,
            outlineThickness: blackKeyAppearance.outlineThickness,
        }
    ];
    return {
        keyClasses,
        keyDeclarations,
        totalEDO: 24,
        a4ToC5Microsteps: 6,
        noteNames,
    }
}
