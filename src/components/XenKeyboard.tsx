import { Div, type DivProps } from "style-props-html";
import { forwardRef, useEffect, useMemo, useRef } from "react";
import { css } from "@emotion/react";

import type XenOctaveDisplayManifest from "../types/XenOctaveDisplayManifest";
import lastIndexOfNonzeroValue from "../utils/algorithms/lastIndexOfNonzeroValue";
import iota from "../utils/algorithms/iota";

export interface XenKeyboardProps extends DivProps {
  width: number;
  height: number;
  manifest: XenOctaveDisplayManifest;
  pressAnimationDuration?: number;
  octaveNumber: number;

  onIdPress(pitchId: number, pitch: number): void;
  onIdRelease(pitchId: number): void;
}

/**
 * Basic pitch helper using C4 and EDO.
 * f = C4 * 2^(octave-4) * (2^(1/EDO))^(inOctaveMicrotone)
 */
function computePitchHz(
  manifest: XenOctaveDisplayManifest,
  octaveNumber: number,
  inOctaveMicrotone: number
): number {
  const { C4Frequency, totalEDO } = manifest;
  const octaveShift = Math.pow(2, octaveNumber - 4);
  const stepRatio = Math.pow(2, 1 / totalEDO);
  return C4Frequency * octaveShift * Math.pow(stepRatio, inOctaveMicrotone);
}

// Visual pressed state that survives capture
function setPressedAttr(el: Element | null, pressed: boolean) {
  if (!el) return;
  if (pressed) el.setAttribute("data-pressed", "true");
  else el.removeAttribute("data-pressed");
}

// Find the subkey element under a screen point.
// Works even while we hold pointer capture on a different element.
function hitTestSubKey(clientX: number, clientY: number): HTMLElement | null {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  return el?.closest('[data-xen-subkey="true"]') as HTMLElement | null;
}

type PointerRec = {
  // the element currently holding capture (we transfer this during gliss)
  captureEl: HTMLElement;
  // the key that is currently sounding (null if pointer is outside any key)
  currentKeyEl: HTMLElement | null;
  // cached ids for current key (undefined if no current key)
  pitchId?: number;
  pitch?: number;
};

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
      onIdPress,
      onIdRelease,
      ...rest
    },
    ref
  ) {
    // --- Layout math (unchanged) ----------------------------------------------
    const topString = typeof top === "number" ? `${top}px` : top;
    const leftString = typeof left === "number" ? `${left}px` : left;

    const keyWidths = useMemo(() => {
      const arr = [width * manifest.keyClasses[0].widthFraction];
      for (let i = 1; i < manifest.keyClasses.length; i++) {
        const lastWidth = arr[i - 1];
        arr.push(manifest.keyClasses[i].widthFraction * lastWidth);
      }
      return arr;
    }, [width, manifest.keyClasses]);

    const keyHeights = useMemo(() => {
      const arr = [height * manifest.keyClasses[0].heightFraction];
      for (let i = 1; i < manifest.keyClasses.length; i++) {
        const lastHeight = arr[i - 1];
        arr.push(manifest.keyClasses[i].heightFraction * lastHeight);
      }
      return arr;
    }, [height, manifest.keyClasses]);

    // --- Multitouch state (one entry per pointerId) ---------------------------
    const activePointersRef = useRef<Map<number, PointerRec>>(new Map());

    const endAllActivePointers = () => {
      for (const [pointerId, rec] of activePointersRef.current) {
        if (
          rec.currentKeyEl &&
          rec.pitchId !== undefined &&
          rec.pitch !== undefined
        ) {
          setPressedAttr(rec.currentKeyEl, false);
          onIdRelease(rec.pitchId);
        }
        try {
          rec.captureEl.releasePointerCapture?.(pointerId);
        } catch {}
      }
      activePointersRef.current.clear();
    };

    useEffect(() => {
      const onBlur = () => endAllActivePointers();
      const onVis = () => {
        if (document.visibilityState !== "visible") endAllActivePointers();
      };
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVis);
      return () => {
        window.removeEventListener("blur", onBlur);
        document.removeEventListener("visibilitychange", onVis);
      };
    }, []);

    // --- Helpers to read data-* off a subkey and compute pitch ----------------
    function getIdsAndPitchFromSubKey(el: HTMLElement) {
      const pid = Number(el.dataset.pitchId);
      const inOct = Number(el.dataset.inOctave);
      const pitch = computePitchHz(manifest, octaveNumber, inOct);
      return { pitchId: pid, pitch };
    }

    // --- Pointer handlers ------------------------------------------------------

    // function handlePointerDown(e: React.PointerEvent<HTMLElement>) {
    //   // All interactive keys carry data-xen-subkey="true".
    //   // We rely on that instead of any specific component variables.
    //   e.preventDefault();
    //   const keyEl = e.currentTarget as HTMLElement;

    //   // Initial capture on the pressed key (per pointerId, allows multitouch)
    //   keyEl.setPointerCapture(e.pointerId);

    //   const { pitchId, pitch } = getIdsAndPitchFromSubKey(keyEl);

    //   setPressedAttr(keyEl, true);
    //   onIdPress(pitchId, pitch);

    //   activePointersRef.current.set(e.pointerId, {
    //     captureEl: keyEl,
    //     currentKeyEl: keyEl,
    //     pitchId,
    //     pitch,
    //   });
    // }

    function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
      const rec = activePointersRef.current.get(e.pointerId);
      if (!rec) return;

      // Simple glissando via hit-testing under the pointer:
      const newKeyEl = hitTestSubKey(e.clientX, e.clientY);

      if (newKeyEl === rec.currentKeyEl) {
        // Still on same key; nothing to do.
        return;
      }

      // If we’ve left a key, release the previous one (temporary key-up)
      if (!newKeyEl) {
        if (
          rec.currentKeyEl &&
          rec.pitchId !== undefined &&
          rec.pitch !== undefined
        ) {
          setPressedAttr(rec.currentKeyEl, false);
          onIdRelease(rec.pitchId);
        }
        rec.currentKeyEl = null;
        rec.pitchId = undefined;
        rec.pitch = undefined;
        // Keep capture where it is (rec.captureEl). We’ll transfer when we hit a new key.
        return;
      }

      // We entered a different key: release previous (if any), press the new key,
      // and transfer pointer capture to the new key so we still won’t miss "up".
      if (rec.currentKeyEl) {
        setPressedAttr(rec.currentKeyEl, false);
        if (rec.pitchId !== undefined && rec.pitch !== undefined) {
          onIdRelease(rec.pitchId);
        }
        try {
          rec.captureEl.releasePointerCapture?.(e.pointerId);
        } catch {}
      }

      // Press the new key
      const { pitchId, pitch } = getIdsAndPitchFromSubKey(newKeyEl);
      setPressedAttr(newKeyEl, true);
      onIdPress(pitchId, pitch);

      // Transfer capture to the new key (allowed by the spec; it reassigns capture)
      newKeyEl.setPointerCapture(e.pointerId);

      // Update record
      rec.captureEl = newKeyEl;
      rec.currentKeyEl = newKeyEl;
      rec.pitchId = pitchId;
      rec.pitch = pitch;
    }

    function endPointer(e: React.PointerEvent<HTMLElement>) {
      const rec = activePointersRef.current.get(e.pointerId);
      if (!rec) return;

      // Release currently sounding key if any
      if (
        rec.currentKeyEl &&
        rec.pitchId !== undefined &&
        rec.pitch !== undefined
      ) {
        setPressedAttr(rec.currentKeyEl, false);
        onIdRelease(rec.pitchId);
      }

      try {
        rec.captureEl.releasePointerCapture?.(e.pointerId);
      } catch {}

      activePointersRef.current.delete(e.pointerId);
    }

    // --- Render ---------------------------------------------------------------
    return (
      <Div
        width={width}
        height={height}
        ref={ref}
        position="absolute"
        top={topString}
        left={leftString}
        overflow="visible"
        css={css`
          touch-action: none; /* we fully handle gestures */
          user-select: none;
          /* Remove or customize the mobile tap flash */
          -webkit-tap-highlight-color: transparent; /* or rgba(0,0,0,.1) to match theme */
          /* Optional: prevent iOS long-press actions on keys */
          -webkit-touch-callout: none;
        `}
        {...rest}
      >
        {manifest.keyDeclarations.map((keyDeclaration) => {
          const reactKey = `key-${keyDeclaration.microStepOffset}`;

          const keyClassIndex = keyDeclaration.classIndex;
          const keyClass = manifest.keyClasses[keyClassIndex];

          let leftValue = keyDeclaration.offsets[0] * keyWidths[0];
          for (let i = 1; i < keyDeclaration.offsets.length; i++) {
            if (keyDeclaration.offsets[i] < 1) continue;
            const priorKeyWidth = keyWidths[i - 1];

            leftValue += priorKeyWidth * keyDeclaration.offsets[i];
          }
          if (keyClassIndex > 0) {
            leftValue -= keyWidths[keyClassIndex] / 2;
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
              css={css`
                touch-action: none;
              `}
            >
              {iota(keyDeclaration.divisions).map((subKeyIndex) => {
                const subReactKey = `${reactKey}-sub-${subKeyIndex}`;
                const verticalIndex =
                  keyDeclaration.divisions - 1 - subKeyIndex;
                const verticalPosition =
                  (verticalIndex * keyHeights[keyClassIndex]) /
                  keyDeclaration.divisions;

                const inOctaveMicrotone =
                  keyDeclaration.microStepOffset + subKeyIndex;

                const globalPitchId =
                  octaveNumber * manifest.totalEDO + inOctaveMicrotone;

                // We compute pitch on demand from dataset when glissing,
                // but we also compute it here for the initial press.
                const initialPitch = computePitchHz(
                  manifest,
                  octaveNumber,
                  inOctaveMicrotone
                );

                return (
                  <Div
                    key={subReactKey}
                    data-xen-subkey="true"
                    data-pitch-id={globalPitchId}
                    data-in-octave={inOctaveMicrotone}
                    role="button"
                    aria-label={`Key ${globalPitchId}`}
                    tabIndex={0}
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
                      touch-action: none;
                      background-color: ${keyClass.baseColor};

                      /* pressed/touched state */
                      &[data-pressed="true"] {
                        background-color: ${keyClass.pressedColor};
                      }

                      /* Keyboard-visible focus style only */
                      &:focus-visible {
                        outline: none; /* remove UA outline */
                        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3) inset;
                      }

                      /* Suppress non-keyboard focus rings (e.g., tap focus) */
                      &:focus:not(:focus-visible) {
                        outline: none;
                        box-shadow: none;
                      }

                      /* Extra guard */
                      &:focus {
                        outline: none;
                      }

                      /* Prevent blue/gray flash on individual keys as well (belt & suspenders) */
                      -webkit-tap-highlight-color: transparent;
                    `}
                    // Pointer Events: unified + glissando
                    onPointerDown={(e) => {
                      // Use the precomputed pitch for the initial key
                      // (same as what getIdsAndPitchFromSubKey would compute).
                      e.preventDefault();
                      const keyEl = e.currentTarget as HTMLElement;
                      keyEl.setPointerCapture(e.pointerId);
                      setPressedAttr(keyEl, true);
                      onIdPress(globalPitchId, initialPitch);
                      activePointersRef.current.set(e.pointerId, {
                        captureEl: keyEl,
                        currentKeyEl: keyEl,
                        pitchId: globalPitchId,
                        pitch: initialPitch,
                      });
                    }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endPointer}
                    onPointerCancel={endPointer}
                    onLostPointerCapture={endPointer}
                    // Optional keyboard activation
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        const el = e.currentTarget as HTMLElement;
                        setPressedAttr(el, true);
                        onIdPress(globalPitchId, initialPitch);
                      }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        const el = e.currentTarget as HTMLElement;
                        setPressedAttr(el, false);
                        onIdRelease(globalPitchId);
                      }
                    }}
                  />
                );
              })}
            </Div>
          );
        })}
      </Div>
    );
  }
);
