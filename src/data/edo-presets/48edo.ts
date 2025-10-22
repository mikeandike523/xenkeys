import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type { KeyClass, KeyDeclaration } from "../../types/XenOctaveDisplayManifest";
import getBaseFrequencyC from "../../utils/music-theory/getBaseFrequency";
import { blackToWhiteWidthRatio, blackToWhiteLengthRatio } from "../piano-key-dimensions";


const keyDeclarations: Array<KeyDeclaration> = [
    {
        offsets: [0,0],
        divisions: 4,
        microStepOffset: 0*4,
        classIndex: 0,
    }, // C
    {
        offsets: [0,1],
        divisions: 4,
        microStepOffset: 1*4,
        classIndex: 1,
    }, // C#
    {
        offsets: [1,0],
        divisions: 4,
        microStepOffset: 2*4,
        classIndex: 0,
    }, // D
    {
        offsets: [1,1],
        divisions: 4,
        microStepOffset: 3*4,
        classIndex: 1,
    }, // D#
    {
        offsets: [2,0],
        divisions: 4,
        microStepOffset: 4*4,
        classIndex: 0,
    }, // E
    {
        offsets: [3,0],
        divisions: 4,
        microStepOffset: 5*4,
        classIndex: 0,
    }, // F
    {
        offsets: [3,1],
        divisions: 4,
        microStepOffset: 6*4,
        classIndex: 1,
    }, // F#
    {
        offsets: [4,0],
        divisions: 4,
        microStepOffset: 7*4,
        classIndex: 0,
    }, // G
    {
        offsets: [4,1],
        divisions: 4,
        microStepOffset: 8*4,
        classIndex: 1,
    }, // G#
    {
        offsets: [5,0],
        divisions: 4,
        microStepOffset: 9*4,
        classIndex: 0,
    }, // A
    {
        offsets: [5,1],
        divisions: 4,
        microStepOffset: 10*4,
        classIndex: 1,
    }, // A#
    {
        offsets: [6,0],
        divisions: 4,
        microStepOffset: 11*4,
        classIndex: 0,
    }, // B


]

export function make48EDO(
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
        totalEDO: 48,
        C4Frequency: getBaseFrequencyC(440,48,4,12)
    }
}
