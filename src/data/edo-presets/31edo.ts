import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type {
  KeyClass,
  KeyDeclaration,
} from "../../types/XenOctaveDisplayManifest";

import {
  blackToWhiteWidthRatio,
  blackToWhiteLengthRatio,
  purpleToBlackWidthRatio,
  purpleToBlackLengthRatio,
} from "../piano-key-dimensions";
import {
  defaultWhiteKeyAppearance,
  defaultBlackKeyAppearance,
  defaultPurpleKeyAppearance,
} from "../color-presets";
import makeSuffixCycle from "@/utils/algorithms/makeSuffixCycle";
import iota from "@/utils/algorithms/iota";

// UTF-8 accidental symbols:
//   𝄲 (U+1D132) half sharp    𝄳 (U+1D133) half flat
//   ♯ (U+266F)  sharp          ♭ (U+266D)  flat
//   𝄶 (U+1D136) sesquisharp   𝄷 (U+1D137) sesquiflat
//   𝄪 (U+1D12A) double sharp  𝄫 (U+1D12B) double flat

const noteNamesSharpwards = makeSuffixCycle([
  ["C", ["", "𝄲", "♯", "𝄶", "𝄪"]],
  ["D", ["", "𝄲", "♯", "𝄶", "𝄪"]],
  ["E", ["", "𝄲", "♯"]],
  ["F", ["", "𝄲", "♯", "𝄶", "𝄪"]],
  ["G", ["", "𝄲", "♯", "𝄶", "𝄪"]],
  ["A", ["", "𝄲", "♯", "𝄶", "𝄪"]],
  ["B", ["", "𝄲", "♯"]],
]);

const noteNamesFlatwards = makeSuffixCycle([
  ["C", ["𝄳", "♭"]],
  ["B", ["", "𝄳", "♭", "𝄷", "𝄫"]],
  ["A", ["", "𝄳", "♭", "𝄷", "𝄫"]],
  ["G", ["", "𝄳", "♭", "𝄷", "𝄫"]],
  ["F", ["", "𝄳", "♭"]],
  ["E", ["", "𝄳", "♭", "𝄷", "𝄫"]],
  ["D", ["", "𝄳", "♭", "𝄷", "𝄫"]],
  ["C", [""]],
]);

const noteNames = iota(31).map((i) => {
  const sharpwardsName = noteNamesSharpwards[i];
  const flatwardsName = noteNamesFlatwards[31-1-i];
  return `${sharpwardsName} | ${flatwardsName}`;
})

for (const name of noteNames) {
  console.log(name);
}


let microStepPointer = 0;

const postAddMicroSteps = (amt: number) => {
  microStepPointer += amt;
  return microStepPointer - amt;
};

const keyDeclarations: Array<KeyDeclaration> = [
  {
    offsets: [0, 0, 0],
    divisions: 1,
    microStepOffset: postAddMicroSteps(1),
    classIndex: 0,
  }, // C
  {
    offsets: [0, 1, 0],
    divisions: 4,
    microStepOffset: postAddMicroSteps(4),
    classIndex: 1,
  }, // C#
  {
    offsets: [1, 0, 0],
    divisions: 1,
    microStepOffset: postAddMicroSteps(1),
    classIndex: 0,
  }, // D
  {
    offsets: [1, 1, 0],
    divisions: 4,
    microStepOffset: postAddMicroSteps(4),
    classIndex: 1,
  }, // D#
  {
    offsets: [2, 0, 0],
    divisions: 1,
    microStepOffset: postAddMicroSteps(1),
    classIndex: 0,
  }, // E
  {
    offsets: [2, 1, 0],
    divisions: 2,
    microStepOffset: postAddMicroSteps(2),
    classIndex: 2,
  }, // EF-Gap Purple
  {
    offsets: [3, 0, 0],
    divisions: 1,
    microStepOffset: postAddMicroSteps(1),
    classIndex: 0,
  }, // F
  {
    offsets: [3, 1, 0],
    divisions: 4,
    microStepOffset: postAddMicroSteps(4),
    classIndex: 1,
  }, // F#
  {
    offsets: [4, 0, 0],
    divisions: 1,
    microStepOffset: postAddMicroSteps(1),
    classIndex: 0,
  }, // G
  {
    offsets: [4, 1, 0],
    divisions: 4,
    microStepOffset: postAddMicroSteps(4),
    classIndex: 1,
  }, // G#
  {
    offsets: [5, 0, 0],
    divisions: 1,
    microStepOffset: postAddMicroSteps(1),
    classIndex: 0,
  }, // A
  {
    offsets: [5, 1, 0],
    divisions: 4,
    microStepOffset: postAddMicroSteps(4),
    classIndex: 1,
  }, // A#
  {
    offsets: [6, 0, 0],
    divisions: 1,
    microStepOffset: postAddMicroSteps(1),
    classIndex: 0,
  }, // B
  {
    offsets: [6, 1, 0],
    divisions: 2,
    microStepOffset: postAddMicroSteps(2),
    classIndex: 2,
  }, // BC-Gap Purple Key, will hang partly off-octave-rectangle
  // Todo: add better logic for z-index when we have multiple octaves
];

export function make31EDO(
  whiteKeyAppearance = defaultWhiteKeyAppearance,
  blackKeyAppearance = defaultBlackKeyAppearance,
  purpleKeyAppearance = defaultPurpleKeyAppearance,
  blackKeyWidthToWhiteKeyWidthRatio = blackToWhiteWidthRatio,
  purpleKeyWidthToBlackKeyWidthRatio = purpleToBlackWidthRatio,
  blackKeyHeight = blackToWhiteLengthRatio,
  purpleKeyHeight = purpleToBlackLengthRatio
): XenOctaveDisplayManifest {
  console.log(noteNames.join("\n"));
  const keyClasses: Array<KeyClass> = [
    // White keys
    {
      widthFraction: 1 / 7,
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
    },
    // Purple keys
    {
      widthFraction: purpleKeyWidthToBlackKeyWidthRatio,
      heightFraction: purpleKeyHeight,
      baseColor: purpleKeyAppearance.baseColor,
      pressedColor: purpleKeyAppearance.pressedColor,
      outlineColor: purpleKeyAppearance.outlineColor,
      outlineThickness: purpleKeyAppearance.outlineThickness,
    },
  ];
  return {
    keyClasses,
    keyDeclarations,
    totalEDO: 31,
    // Number of microtones **traveled** to **land at** C from the A below,
    // for instance in 12edo this is 3: A-A#, A#-B, B-C, in 31edo we have 4 + 1 + 2 + 1 = 8
    a4ToC5Microsteps: 4 + 1 + 2 + 1,
    noteNames,
  };
}
