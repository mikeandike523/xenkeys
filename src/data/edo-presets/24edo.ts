import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type { KeyClass, KeyDeclaration } from "../../types/XenOctaveDisplayManifest";
import { blackToWhiteWidthRatio, blackToWhiteLengthRatio } from "../piano-key-dimensions";
import { defaultWhiteKeyAppearance, defaultBlackKeyAppearance } from "../color-presets";


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
    }
}
