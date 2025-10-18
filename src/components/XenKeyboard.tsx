import { Div, type DivProps } from "style-props-html";
import { forwardRef } from "react";
import { css } from "@emotion/react";

import type XenOctaveDisplayManifest from "../types/XenOctaveDisplayManifest";
import lastIndexOfNonzeroValue from "../utils/algorithms/lastIndexOfNonzeroValue";
import iota from "../utils/algorithms/iota";

export interface XenKeyboardProps extends DivProps {
  // Make width required
  width: number;
  // Make height required
  height: number;
  // Make manifest required
  manifest: XenOctaveDisplayManifest;
  // Press animation duration in milliseconds
  pressAnimationDuration?: number;
  // controls the pitch and starting z-index
  octaveNumber: number;
}

export default forwardRef<HTMLDivElement, XenKeyboardProps>(
  function XenKeyboard(
    {
      octaveNumber,
      width,
      height,
      manifest,
      top = 0,
      left = 0,
      pressAnimationDuration = 100,
    },
    ref
  ) {
    // We will assume valid manifest for now

    const topString = typeof top === "number" ? `${top}px` : top;
    const leftString = typeof left === "number" ? `${left}px` : top;

    const keyWidths = [width * manifest.keyClasses[0].widthFraction];
    const keyHeights = [height * manifest.keyClasses[0].heightFraction];
    for (let i = 1; i < manifest.keyClasses.length; i++) {
      const lastWidth = keyWidths[i - 1];
      keyWidths.push(manifest.keyClasses[i].widthFraction * lastWidth);
      const lastHeight = keyHeights[i - 1];
      keyHeights.push(manifest.keyClasses[i].heightFraction * lastHeight);
    }

    return (
      <Div
        width={width}
        height={height}
        ref={ref}
        position="absolute"
        top={topString}
        left={leftString}
      >
        {manifest.keyDeclarations.map((keyDeclaration) => {
          const reactKey = `key-start-${keyDeclaration.microStepOffset}`;
          const keyClassIndex =
            lastIndexOfNonzeroValue(keyDeclaration.offsets) ?? 0;
          const keyClass = manifest.keyClasses[keyClassIndex];
          let leftValue = keyDeclaration.offsets[0] * keyWidths[0];
          for (let i = 1; i < keyDeclaration.offsets.length; i++) {
            if (keyDeclaration.offsets[i] < 1) {
              continue;
            }
            const priorKeyWidth = keyWidths[i - 1];
            const currentKeyWidth = keyWidths[i];

            leftValue +=
              priorKeyWidth * keyDeclaration.offsets[i] - currentKeyWidth / 2;
          }

          return (
            <Div
              key={reactKey}
              zIndex={octaveNumber * manifest.keyClasses.length + keyClassIndex}
              width={`${keyWidths[keyClassIndex]}px`}
              height={`${keyHeights[keyClassIndex]}px`}
              position="absolute"
              top="0px"
              left={`${leftValue}px`}
            >
              {iota(keyDeclaration.divisions).map((subKeyIndex) => {
                const subReactKey = `${reactKey}-sub-${subKeyIndex}`;
                const verticalIndex =
                  keyDeclaration.divisions - 1 - subKeyIndex;
                const verticalPosition =
                  (verticalIndex * keyHeights[keyClassIndex]) /
                  keyDeclaration.divisions;
                return (
                  <Div
                    key={subReactKey}
                    position="absolute"
                    top={`${verticalPosition}px`}
                    left="0px"
                    width={`${keyWidths[keyClassIndex]}px`}
                    height={`${
                      keyHeights[keyClassIndex] / keyDeclaration.divisions
                    }px`}
                    transition={`background-color ${pressAnimationDuration}ms ease-in-out`}
                    outline={`${keyClass.outlineThickness}px solid ${keyClass.outlineColor}`}
                    cursor="pointer"
                    css={css`
                      background-color: ${keyClass.baseColor};
                      &:active {
                        background-color: ${keyClass.pressedColor};
                      }
                    `}
                  ></Div>
                );
              })}
            </Div>
          );
        })}
      </Div>
    );
  }
);
