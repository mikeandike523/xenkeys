import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type { KeyClass, KeyDeclaration } from "../../types/XenOctaveDisplayManifest";


const keyDeclarations: Array<KeyDeclaration> = [
    {
        offsets: [0,0],
        divisions: 1,
        microStepOffset: 0,
    }, // C
    {
        offsets: [0,1],
        divisions: 1,
        microStepOffset: 1,
    }, // C#
    {
        offsets: [1,0],
        divisions: 1,
        microStepOffset: 2,
    }, // D
    {
        offsets: [1,1],
        divisions: 1,
        microStepOffset: 3,
    }, // D#
    {
        offsets: [2,0],
        divisions: 1,
        microStepOffset: 4,
    }, // E
    {
        offsets: [3,0],
        divisions: 1,
        microStepOffset: 5,
    }, // F
    {
        offsets: [3,1],
        divisions: 1,
        microStepOffset: 6,
    }, // F#
    {
        offsets: [4,0],
        divisions: 1,
        microStepOffset: 7,
    }, // G
    {
        offsets: [4,1],
        divisions: 1,
        microStepOffset: 8,
    }, // G#
    {
        offsets: [5,0],
        divisions: 1,
        microStepOffset: 9,
    }, // A
    {
        offsets: [5,1],
        divisions: 1,
        microStepOffset: 10,
    }, // A#
    {
        offsets: [6,0],
        divisions: 1,
        microStepOffset: 11,
    }, // B


]

export function make12EDO(
    whiteKeyAppearance = {
        baseColor: "hsl(0, 0%, 100%)",
        pressedColor: "hsl(0, 0%, 65%)",
        outlineColor: "hsl(0, 0%, 0%)",
        outlineThickness: 1,

    },
    blackKeyAppearance = {
        baseColor: "hsl(0, 0%, 0%)",
        pressedColor: "hsl(0, 0%, 30%)",
        outlineColor: "hsl(0, 0%, 100%)",
        outlineThickness: 1,
    },
    blackKeyWidthToWhiteKeyWidthRatio = 0.8,
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
    }
}