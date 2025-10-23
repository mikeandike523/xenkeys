import React, { forwardRef, useEffect, useRef, useCallback } from "react";

import type XenOctaveDisplayManifest from "../types/XenOctaveDisplayManifest";

interface PointerRec {
  captureEl: HTMLElement;
  currentPitchId?: number;
  currentPitch?: number;
}

export interface CanvasKeyboardProps extends React.CanvasHTMLAttributes<HTMLCanvasElement> {
  width: number; // CSS pixels (intrinsic size will be DPR-scaled automatically)
  height: number; // CSS pixels (intrinsic size will be DPR-scaled automatically)
  manifest: XenOctaveDisplayManifest;
  startingOctave: number;
  octaveCount: number;
  pressAnimationDuration?: number;
  onIdPress: (pitchId: number, pitch: number) => void;
  onIdRelease: (pitchId: number) => void;
  top?: number | string;
  left?: number | string;
}

// ------------------------- Pitch helper (C4 + EDO) --------------------------
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

// -------------------- Normalized geometry helpers ---------------------------
// All layout/hit-test math happens in a normalized space where height = 1 and
// width = aspect = rect.width / rect.height. DPR does not appear in hit-testing.
function getCanvasClientMetrics(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const aspect = rect.width / rect.height; // A = W/H
  const S = rect.height; // pixel scale for normalized units
  const dpr = window.devicePixelRatio || 1;
  return { rect, aspect, S, dpr };
}

function computeKeyLayoutNormalized(
  manifest: XenOctaveDisplayManifest,
  octaveCount: number,
  aspect: number
) {
  const keyClasses = manifest.keyClasses;
  const keyDeclarations = manifest.keyDeclarations;

  const octaveWidthN = aspect / octaveCount; // normalized width per octave
  const octaveHeightN = 1; // normalized height for the canvas

  const keyWidthsN: number[] = [];
  const keyHeightsN: number[] = [];

  keyWidthsN[0] = octaveWidthN * keyClasses[0].widthFraction;
  keyHeightsN[0] = octaveHeightN * keyClasses[0].heightFraction;
  for (let i = 1; i < keyClasses.length; i++) {
    keyWidthsN[i] = keyClasses[i].widthFraction * keyWidthsN[i - 1];
    keyHeightsN[i] = keyClasses[i].heightFraction * keyHeightsN[i - 1];
  }

  return {
    keyClasses,
    keyDeclarations,
    octaveWidthN,
    octaveHeightN,
    keyWidthsN,
    keyHeightsN,
  };
}

function normToPx(n: number, S: number) {
  return n * S; // 1 normalized unit equals canvas CSS height in pixels
}

// ---------------------------- Drawing ---------------------------------------
function drawKeyboard(
  canvas: HTMLCanvasElement,
  manifest: XenOctaveDisplayManifest,
  startingOctave: number,
  octaveCount: number,
  pressedKeys: Set<number>
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { rect, aspect, S, dpr } = getCanvasClientMetrics(canvas);

  // Clear in CSS pixel space, but render with DPR scale for crispness.
  const cwCss = rect.width;
  const chCss = rect.height;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cwCss, chCss);

  const {
    keyClasses,
    keyDeclarations,
    octaveWidthN,
    keyWidthsN,
    keyHeightsN,
  } = computeKeyLayoutNormalized(manifest, octaveCount, aspect);

  const drawLayer = (classIndex: number) => {
    keyDeclarations.forEach((decl) => {
      if (decl.classIndex !== classIndex) return;

      for (let o = 0; o < octaveCount; o++) {
        const octaveNumber = startingOctave + o;
        const baseXN = o * octaveWidthN; // normalized left of octave

        // Compute normalized left within octave using offsets.
        let leftN = decl.offsets[0] * keyWidthsN[0];
        for (let i = 1; i < decl.offsets.length; i++) {
          if (decl.offsets[i] < 1) continue;
          leftN += keyWidthsN[i - 1] * decl.offsets[i];
        }
        if (classIndex > 0) leftN -= keyWidthsN[classIndex] / 2;

        for (let sub = 0; sub < decl.divisions; sub++) {
          const verticalIndex = decl.divisions - 1 - sub;

          const xN = baseXN + leftN;
          const yN = (verticalIndex * keyHeightsN[classIndex]) / decl.divisions;
          const wN = keyWidthsN[classIndex];
          const hN = keyHeightsN[classIndex] / decl.divisions;

          // Convert to CSS pixels for drawing.
          const x = normToPx(xN, S);
          const y = normToPx(yN, S);
          const w = normToPx(wN, S);
          const h = normToPx(hN, S);

          const inOctaveMicrotone = decl.microStepOffset + sub;
          const pitchId = octaveNumber * manifest.totalEDO + inOctaveMicrotone;
          const isPressed = pressedKeys.has(pitchId);
          const keyClass = keyClasses[classIndex];
          const fillColor = isPressed ? keyClass.pressedColor : keyClass.baseColor;

          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, w, h);

          if (keyClass.outlineThickness > 0) {
            ctx.lineWidth = keyClass.outlineThickness; // CSS px
            ctx.strokeStyle = keyClass.outlineColor;
            ctx.strokeRect(x, y, w, h);
          }
        }
      }
    });
  };

  for (let ci = 0; ci < keyClasses.length; ci++) drawLayer(ci);

  ctx.restore();
}

// ---------------------------- Hit testing -----------------------------------
function hitTestKey(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  manifest: XenOctaveDisplayManifest,
  startingOctave: number,
  octaveCount: number
): { pitchId: number; pitch: number } | null {
  const { rect, aspect, S } = getCanvasClientMetrics(canvas);

  // Client → normalized coords (height=1, width=aspect)
  const nx = (clientX - rect.left) / S; // 0..aspect
  const ny = (clientY - rect.top) / S;  // 0..1

  if (nx < 0 || ny < 0 || ny > 1 || nx > aspect) return null;

  const {
    keyClasses,
    keyDeclarations,
    octaveWidthN,
    keyWidthsN,
    keyHeightsN,
  } = computeKeyLayoutNormalized(manifest, octaveCount, aspect);

  const octaveIndex = Math.floor(nx / octaveWidthN);
  if (octaveIndex < 0 || octaveIndex >= octaveCount) return null;

  const octaveNumber = startingOctave + octaveIndex;
  const baseXN = octaveIndex * octaveWidthN;

  // Top-down so overlapping higher classes win.
  for (let ci = keyClasses.length - 1; ci >= 0; ci--) {
    for (const decl of keyDeclarations) {
      if (decl.classIndex !== ci) continue;

      let leftN = decl.offsets[0] * keyWidthsN[0];
      for (let i = 1; i < decl.offsets.length; i++) {
        if (decl.offsets[i] < 1) continue;
        leftN += keyWidthsN[i - 1] * decl.offsets[i];
      }
      if (ci > 0) leftN -= keyWidthsN[ci] / 2;

      for (let sub = 0; sub < decl.divisions; sub++) {
        const verticalIndex = decl.divisions - 1 - sub;
        const xN = baseXN + leftN;
        const yN = (verticalIndex * keyHeightsN[ci]) / decl.divisions;
        const wN = keyWidthsN[ci];
        const hN = keyHeightsN[ci] / decl.divisions;

        if (nx >= xN && nx <= xN + wN && ny >= yN && ny <= yN + hN) {
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

// ----------------------------- Component ------------------------------------
export default forwardRef<HTMLCanvasElement, CanvasKeyboardProps>(function CanvasKeyboard(
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
    style,
    ...rest
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointers = useRef<Map<number, PointerRec>>(new Map());
  const pressedKeys = useRef<Set<number>>(new Set());

  // Merge forwarded ref
  useEffect(() => {
    if (!ref) return;
    const node = canvasRef.current;
    if (typeof ref === "function") {
      ref(node);
    } else {
      (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
    }
  }, [ref]);

  // Prevent gestures and context menu on the canvas element
  useEffect(() => {
    const el = canvasRef.current;
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
      const canvas = canvasRef.current;
      if (canvas) {
        drawKeyboard(canvas, manifest, startingOctave, octaveCount, pressedKeys.current);
      }
    };
    const onBlur = () => endAll();
    const onVis = () => { if (document.visibilityState !== "visible") endAll(); };
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
    drawKeyboard(canvas, manifest, startingOctave, octaveCount, pressedKeys.current);
  }, [manifest, startingOctave, octaveCount, pressAnimationDuration]);

  useEffect(() => { redraw(); }, [redraw]);

  // Ensure backing store matches displayed size for crisp drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    redraw();
  }, [width, height, redraw]);

  // Pointer handlers on the canvas element
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && !(e.pointerType === "mouse" && e.button === 0)) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const hit = hitTestKey(e.clientX, e.clientY, canvas, manifest, startingOctave, octaveCount);
    if (hit) {
      const { pitchId, pitch } = hit;
      pressedKeys.current.add(pitchId);
      onIdPress(pitchId, pitch);
      redraw();
    }
    activePointers.current.set(e.pointerId, {
      captureEl: canvas,
      currentPitchId: hit?.pitchId,
      currentPitch: hit?.pitch,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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

  const handlePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    const rec = activePointers.current.get(e.pointerId);
    if (rec && rec.currentPitchId !== undefined) {
      pressedKeys.current.delete(rec.currentPitchId);
      onIdRelease(rec.currentPitchId);
      redraw();
    }
    try { rec?.captureEl.releasePointerCapture(e.pointerId); } catch {}
    activePointers.current.delete(e.pointerId);
  };

  const topPos = typeof top === "number" ? `${top}px` : top;
  const leftPos = typeof left === "number" ? `${left}px` : left;

  return (
    <canvas
      ref={canvasRef}
      // Intrinsic pixel size (backing store) is DPR-scaled via effect; here we set
      // the logical CSS size and positioning.
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
        position: "relative",
        top: topPos,
        left: leftPos,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        msUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
        overscrollBehavior: "contain",
        ...(style as object),
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      {...rest}
    />
  );
});
