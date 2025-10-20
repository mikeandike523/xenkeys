import { css } from "@emotion/react";
import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import { Div, type DivProps } from "style-props-html";

import type XenOctaveDisplayManifest from "../types/XenOctaveDisplayManifest";
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

// Guard for primary activation: allow touch OR primary mouse button
function isPrimaryActivation(e: React.PointerEvent) {
  return e.pointerType === "touch" || (e.pointerType === "mouse" && e.button === 0);
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

    // --- Global belt-and-suspenders: stop iOS/Android long-press, pinch, etc. -
    useEffect(() => {
      const prevent = (e: Event) => e.preventDefault();

      // iOS Safari gesture events
      document.addEventListener("gesturestart", prevent, { passive: false });
      document.addEventListener("gesturechange", prevent, { passive: false });
      document.addEventListener("gestureend", prevent, { passive: false });

      // Legacy touch scroll/zoom prevention
      const opts = { passive: false } as AddEventListenerOptions;
      document.addEventListener("touchstart", prevent, opts);
      document.addEventListener("touchmove", prevent, opts);
      document.addEventListener("touchend", prevent, opts);

      // Long-press context menus (Android/desktop)
      document.addEventListener("contextmenu", prevent);

      return () => {
        document.removeEventListener("gesturestart", prevent as any);
        document.removeEventListener("gesturechange", prevent as any);
        document.removeEventListener("gestureend", prevent as any);
        document.removeEventListener("touchstart", prevent as any);
        document.removeEventListener("touchmove", prevent as any);
        document.removeEventListener("touchend", prevent as any);
        document.removeEventListener("contextmenu", prevent as any);
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
    function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
      // Only react to touch/mouse pointers
      if (!(e.pointerType === "touch" || e.pointerType === "mouse")) return;

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
      if (!(e.pointerType === "touch" || e.pointerType === "mouse")) return;

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
        onContextMenu={(e) => e.preventDefault()}
        css={css`
          touch-action: none; /* we fully handle gestures */
          user-select: none;
          -webkit-user-select: none;   /* iOS Safari */
          -ms-user-select: none;       /* old Edge */
          -webkit-tap-highlight-color: transparent; /* or rgba(0,0,0,.1) to match theme */
          -webkit-touch-callout: none; /* iOS long-press callout */
          overscroll-behavior: contain; /* stop pull-to-refresh / scroll chaining */
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
              zIndex={keyClassIndex}
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
                    // No keyboard activation: debugging via mouse is still allowed
                    // by pointer events; omit tab focus
                    // role removed to avoid implying keyboard activation
                    // role="button"
                    // aria-label={`Key ${globalPitchId}`}
                    draggable={false}
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
                      user-select: none;
                      -webkit-user-select: none;
                      -ms-user-select: none;
                      -webkit-touch-callout: none;
                      -webkit-tap-highlight-color: transparent;
                      background-color: ${keyClass.baseColor};

                      /* pressed/touched state */
                      &[data-pressed="true"] {
                        background-color: ${keyClass.pressedColor};
                      }

                      /* Suppress focus rings entirely since no keyboard use */
                      &:focus {
                        outline: none;
                        box-shadow: none;
                      }
                    `}
                    // Pointer Events: unified + glissando
                    onPointerDown={(e) => {
                      if (!isPrimaryActivation(e)) return; // allow touch or primary mouse only
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
