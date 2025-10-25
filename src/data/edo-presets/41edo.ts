import type XenOctaveDisplayManifest from "../../types/XenOctaveDisplayManifest";
import type {
  KeyClass,
  KeyDeclaration,
} from "../../types/XenOctaveDisplayManifest";

import getBaseFrequencyC from "../../utils/music-theory/getBaseFrequency";
import { blackToWhiteWidthRatio, blackToWhiteLengthRatio, purpleToBlackWidthRatio, purpleToBlackLengthRatio } from "../piano-key-dimensions";
import { defaultWhiteKeyAppearance, defaultBlackKeyAppearance, defaultPurpleKeyAppearance } from "../color-presets";

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
    divisions: 6,
    microStepOffset: postAddMicroSteps(6),
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
    divisions: 6,
    microStepOffset: postAddMicroSteps(6),
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
    divisions: 6,
    microStepOffset: postAddMicroSteps(6),
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
    divisions: 6,
    microStepOffset: postAddMicroSteps(6),
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
    divisions: 6,
    microStepOffset: postAddMicroSteps(6),
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

export function make41EDO(
  whiteKeyAppearance = defaultWhiteKeyAppearance,
  blackKeyAppearance = defaultBlackKeyAppearance,
  purpleKeyAppearance = defaultPurpleKeyAppearance,
  blackKeyWidthToWhiteKeyWidthRatio = blackToWhiteWidthRatio,
  purpleKeyWidthToBlackKeyWidthRatio = purpleToBlackWidthRatio,
  blackKeyHeight = blackToWhiteLengthRatio,
  purpleKeyHeight = purpleToBlackLengthRatio
): XenOctaveDisplayManifest {
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
    totalEDO: 41,
    C4Frequency: getBaseFrequencyC(
      440,
      41,
      4,

      6 + 1 + 2 + 1
    ),
  };
}
