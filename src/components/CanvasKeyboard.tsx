import { css } from "@emotion/react";
import React, { forwardRef, useEffect, useRef, useCallback } from "react";
import { Div, type DivProps } from "style-props-html";

import type XenOctaveDisplayManifest from "../types/XenOctaveDisplayManifest";

interface PointerRec {
  captureEl: HTMLElement;
  currentPitchId?: number;
  currentPitch?: number;
}

export interface CanvasKeyboardProps extends DivProps {
  width: number;
  height: number;
  manifest: XenOctaveDisplayManifest;
  startingOctave: number;
  octaveCount: number;
  pressAnimationDuration?: number;
  onIdPress: (pitchId: number, pitch: number) => void;
  onIdRelease: (pitchId: number) => void;
}

// Basic pitch helper using C4 and EDO.
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

// Draw the full keyboard into the canvas.
function drawKeyboard(
  canvas: HTMLCanvasElement,
  manifest: XenOctaveDisplayManifest,
  startingOctave: number,
  octaveCount: number,
  pressedKeys: Set<number>,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.width / dpr;
  const ch = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cw, ch);

  // Compute layout fractions for one octave.
  const octaveWidth = cw / octaveCount;
  const octaveHeight = ch;
  const keyClasses = manifest.keyClasses;
  const keyDeclarations = manifest.keyDeclarations;

  // Compute class-based key widths and heights.
  const keyWidths: number[] = [];
  const keyHeights: number[] = [];
  keyWidths[0] = octaveWidth * keyClasses[0].widthFraction;
  keyHeights[0] = octaveHeight * keyClasses[0].heightFraction;
  for (let i = 1; i < keyClasses.length; i++) {
    keyWidths[i] = keyClasses[i].widthFraction * keyWidths[i - 1];
    keyHeights[i] = keyClasses[i].heightFraction * keyHeights[i - 1];
  }

  // Helper to draw keys of a given classIndex (layer).
  const drawLayer = (classIndex: number) => {
    keyDeclarations.forEach((decl) => {
      if (decl.classIndex !== classIndex) return;
      for (let o = 0; o < octaveCount; o++) {
        const octaveNumber = startingOctave + o;
        // Base left offset of the octave.
        const baseX = o * octaveWidth;
        // Compute left of the declaration within octave.
        let left = decl.offsets[0] * keyWidths[0];
        for (let i = 1; i < decl.offsets.length; i++) {
          if (decl.offsets[i] < 1) continue;
          left += keyWidths[i - 1] * decl.offsets[i];
        }
        if (classIndex > 0) {
          left -= keyWidths[classIndex] / 2;
        }

        // For each subdivision (in-octave microtone).
        for (let sub = 0; sub < decl.divisions; sub++) {
          const verticalIndex = decl.divisions - 1 - sub;
          const x = baseX + left;
          const y = (verticalIndex * keyHeights[classIndex]) / decl.divisions;
          const w = keyWidths[classIndex];
          const h = keyHeights[classIndex] / decl.divisions;
          const inOctaveMicrotone = decl.microStepOffset + sub;
          const pitchId = octaveNumber * manifest.totalEDO + inOctaveMicrotone;
          const isPressed = pressedKeys.has(pitchId);
          const keyClass = keyClasses[classIndex];
          const fillColor = isPressed ? keyClass.pressedColor : keyClass.baseColor;

          // Draw key rectangle.
          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, w, h);
          if (keyClass.outlineThickness > 0) {
            ctx.lineWidth = keyClass.outlineThickness;
            ctx.strokeStyle = keyClass.outlineColor;
            ctx.strokeRect(x, y, w, h);
          }
        }
      }
    });
  };

  // Draw white keys (classIndex 0) first, then higher.
  for (let ci = 0; ci < keyClasses.length; ci++) {
    drawLayer(ci);
  }

  ctx.restore();
}

// Find which key is under given point.
function hitTestKey(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  manifest: XenOctaveDisplayManifest,
  startingOctave: number,
  octaveCount: number
): { pitchId: number; pitch: number } | null {
  const rect = canvas.getBoundingClientRect();
  const xRel =
    ((clientX - rect.left) * (canvas.width / rect.width)) /
    (window.devicePixelRatio || 1);
  const yRel =
    ((clientY - rect.top) * (canvas.height / rect.height)) /
    (window.devicePixelRatio || 1);
  const cw = rect.width;
  const ch = rect.height;

  const octaveWidth = cw / octaveCount;
  const octaveHeight = ch;
  const keyClasses = manifest.keyClasses;
  const keyDeclarations = manifest.keyDeclarations;

  const keyWidths: number[] = [];
  const keyHeights: number[] = [];
  keyWidths[0] = octaveWidth * keyClasses[0].widthFraction;
  keyHeights[0] = octaveHeight * keyClasses[0].heightFraction;
  for (let i = 1; i < keyClasses.length; i++) {
    keyWidths[i] = keyClasses[i].widthFraction * keyWidths[i - 1];
    keyHeights[i] = keyClasses[i].heightFraction * keyHeights[i - 1];
  }

  // Determine which octave.
  const octaveIndex = Math.floor(xRel / octaveWidth);
  if (octaveIndex < 0 || octaveIndex >= octaveCount) return null;
  const octaveNumber = startingOctave + octaveIndex;
  const baseX = octaveIndex * octaveWidth;

  // Check layers top-down (highest classIndex first) for correct gliss pickup.
  for (let ci = keyClasses.length - 1; ci >= 0; ci--) {
    for (const decl of keyDeclarations) {
      if (decl.classIndex !== ci) continue;
      // Compute left within octave.
      let left = decl.offsets[0] * keyWidths[0];
      for (let i = 1; i < decl.offsets.length; i++) {
        if (decl.offsets[i] < 1) continue;
        left += keyWidths[i - 1] * decl.offsets[i];
      }
      if (ci > 0) {
        left -= keyWidths[ci] / 2;
      }
      for (let sub = 0; sub < decl.divisions; sub++) {
        const verticalIndex = decl.divisions - 1 - sub;
        const x = baseX + left;
        const y = (verticalIndex * keyHeights[ci]) / decl.divisions;
        const w = keyWidths[ci];
        const h = keyHeights[ci] / decl.divisions;
        if (xRel >= x && xRel <= x + w && yRel >= y && yRel <= y + h) {
          const inOctaveMicrotone = decl.microStepOffset + sub;
          const pitchId = octaveNumber * manifest.totalEDO + inOctaveMicrotone;
          const pitch = computePitchHz(manifest, octaveNumber, inOctaveMicrotone);
          return { pitchId, pitch };
        }
      }
    }
  }
  return null;
}

export default forwardRef<HTMLDivElement, CanvasKeyboardProps>(function CanvasKeyboard(
  {
    width,
    height,
    manifest,
    startingOctave,
    octaveCount,
    pressAnimationDuration = 100,
    onIdPress,
    onIdRelease,
    top = 0,
    left = 0,
    ...rest
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointers = useRef<Map<number, PointerRec>>(new Map());
  const pressedKeys = useRef<Set<number>>(new Set());

  // Merge forwarded ref
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === "function") {
      ref(rootRef.current);
    } else {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = rootRef.current;
    }
  }, [ref]);

  // Prevent gestures and context menu
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    const opts = { passive: false } as AddEventListenerOptions;
    el.addEventListener("gesturestart", prevent as EventListener, opts);
    el.addEventListener("gesturechange", prevent as EventListener, opts);
    el.addEventListener("gestureend", prevent as EventListener, opts);
    el.addEventListener("touchstart", prevent, opts);
    el.addEventListener("touchmove", prevent, opts);
    el.addEventListener("touchend", prevent, opts);
    el.addEventListener("contextmenu", prevent as EventListener);
    return () => {
      el.removeEventListener("gesturestart", prevent as EventListener, opts);
      el.removeEventListener("gesturechange", prevent as EventListener, opts);
      el.removeEventListener("gestureend", prevent as EventListener, opts);
      el.removeEventListener("touchstart", prevent as EventListener, opts);
      el.removeEventListener("touchmove", prevent as EventListener, opts);
      el.removeEventListener("touchend", prevent as EventListener, opts);
      el.removeEventListener("contextmenu", prevent as EventListener);
    };
  }, []);

  // Handle blur/visibility to release all pointers
  useEffect(() => {
    const endAll = () => {
      for (const [pid, rec] of activePointers.current) {
        if (rec.currentPitchId !== undefined) {
          pressedKeys.current.delete(rec.currentPitchId);
          onIdRelease(rec.currentPitchId);
        }
        try {
          rec.captureEl.releasePointerCapture(pid);
        } catch {}
      }
      activePointers.current.clear();
      // Redraw to clear pressed state
      const canvas = canvasRef.current;
      if (canvas) {
        drawKeyboard(
          canvas,
          manifest,
          startingOctave,
          octaveCount,
          pressedKeys.current
        );
      }
    };
    const onBlur = () => endAll();
    const onVis = () => {
      if (document.visibilityState !== "visible") endAll();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [manifest, startingOctave, octaveCount, onIdRelease, pressAnimationDuration]);

  // Draw on changes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawKeyboard(
      canvas,
      manifest,
      startingOctave,
      octaveCount,
      pressedKeys.current
    );
  }, [manifest, startingOctave, octaveCount, pressAnimationDuration]);

  useEffect(() => {
    redraw();
  }, [redraw]);
  // Ensure the canvas backing store matches the displayed size for crisp drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    redraw();
  }, [width, height, redraw]);

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" && !(e.pointerType === "mouse" && e.button === 0)) {
      return;
    }
    e.preventDefault();
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    root.setPointerCapture(e.pointerId);
    const hit = hitTestKey(e.clientX, e.clientY, canvas, manifest, startingOctave, octaveCount);
    if (hit) {
      const { pitchId, pitch } = hit;
      pressedKeys.current.add(pitchId);
      onIdPress(pitchId, pitch);
      redraw();
    }
    activePointers.current.set(e.pointerId, {
      captureEl: root,
      currentPitchId: hit?.pitchId,
      currentPitch: hit?.pitch,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    const rec = activePointers.current.get(e.pointerId);
    if (!rec) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hit = hitTestKey(e.clientX, e.clientY, canvas, manifest, startingOctave, octaveCount);
    if (!hit) {
      if (rec.currentPitchId !== undefined) {
        pressedKeys.current.delete(rec.currentPitchId);
        onIdRelease(rec.currentPitchId);
        rec.currentPitchId = undefined;
        rec.currentPitch = undefined;
        redraw();
      }
      return;
    }
    if (hit.pitchId === rec.currentPitchId) return;
    if (rec.currentPitchId !== undefined) {
      pressedKeys.current.delete(rec.currentPitchId);
      onIdRelease(rec.currentPitchId);
    }
    pressedKeys.current.add(hit.pitchId);
    onIdPress(hit.pitchId, hit.pitch);
    rec.currentPitchId = hit.pitchId;
    rec.currentPitch = hit.pitch;
    redraw();
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    const rec = activePointers.current.get(e.pointerId);
    if (rec && rec.currentPitchId !== undefined) {
      pressedKeys.current.delete(rec.currentPitchId);
      onIdRelease(rec.currentPitchId);
      redraw();
    }
    try {
      rec?.captureEl.releasePointerCapture(e.pointerId);
    } catch {}
    activePointers.current.delete(e.pointerId);
  };

  const topPos = typeof top === "number" ? `${top}px` : top;
  const leftPos = typeof left === "number" ? `${left}px` : left;

  return (
    <Div
      ref={rootRef}
      position="absolute"
      top={topPos}
      left={leftPos}
      width={width}
      height={height}
      overflow="visible"
      onContextMenu={(e) => e.preventDefault()}
      css={css`
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -ms-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
        overscroll-behavior: contain;
      `}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      {...rest}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </Div>
  );
});
