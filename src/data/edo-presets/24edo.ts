import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type { KeyClass, KeyDeclaration } from "../../types/XenOctaveDisplayManifest";
import getBaseFrequencyC from "../../utils/music-theory/getBaseFrequency";


const keyDeclarations: Array<KeyDeclaration> = [
    {
        offsets: [0,0],
        divisions: 2,
        microStepOffset: 0*2,
    }, // C
    {
        offsets: [0,1],
        divisions: 2,
        microStepOffset: 1*2,
    }, // C#
    {
        offsets: [1,0],
        divisions: 2,
        microStepOffset: 2*2,
    }, // D
    {
        offsets: [1,1],
        divisions: 2,
        microStepOffset: 3*2,
    }, // D#
    {
        offsets: [2,0],
        divisions: 2,
        microStepOffset: 4*2,
    }, // E
    {
        offsets: [3,0],
        divisions: 2,
        microStepOffset: 5*2,
    }, // F
    {
        offsets: [3,1],
        divisions: 2,
        microStepOffset: 6*2,
    }, // F#
    {
        offsets: [4,0],
        divisions: 2,
        microStepOffset: 7*2,
    }, // G
    {
        offsets: [4,1],
        divisions: 2,
        microStepOffset: 8*2,
    }, // G#
    {
        offsets: [5,0],
        divisions: 2,
        microStepOffset: 9*2,
    }, // A
    {
        offsets: [5,1],
        divisions: 2,
        microStepOffset: 10*2,
    }, // A#
    {
        offsets: [6,0],
        divisions: 2,
        microStepOffset: 11*2,
    }, // B


]

export function make24EDO(
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
    blackKeyWidthToWhiteKeyWidthRatio = 0.6,
    blackKeyHeight=0.8
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
        C4Frequency: getBaseFrequencyC(440,24,4,6)
    }
}