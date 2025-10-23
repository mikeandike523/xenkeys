import React, { forwardRef, useCallback, useEffect, useRef } from "react";
import type XenOctaveDisplayManifest from "../types/XenOctaveDisplayManifest";

/**
 * CHANGE SUMMARY
 * - Rebuild layout on width/height prop changes only (parent throttles these).
 * - Stop checking DOM-computed aspect to decide staleness; rely on props instead.
 * - Compute aspect from props (width/height) when building the cache.
 * - Use height prop for the pixel scale S during draw to avoid layout reads.
 * - Hit-testing no longer bails on aspect mismatch; it assumes cache matches props.
 *   It still reads the bounding rect for pointer offset only.
 */

// -------------------------- Types -------------------------------------------
interface PointerRec {
  captureEl: HTMLElement;
  currentPitchId?: number;
  currentPitch?: number;
}

export interface CanvasKeyboardProps extends React.CanvasHTMLAttributes<HTMLCanvasElement> {
  width: number; // CSS pixels
  height: number; // CSS pixels
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

// ----------------------------- ECS Components -------------------------------
type KeyId = number; // unique across whole keyboard (we'll use pitchId)

// Spatial (normalized units; canvas height = 1, width = aspect)
interface HitboxRectN {
  xN: number;
  yN: number;
  wN: number;
  hN: number;
}

// Visual/style (static)
interface Visual {
  baseColor: string;
  pressedColor: string;
  outlineColor: string;
  outlineThickness: number; // CSS px
}

// Sorting/overlap control
interface RenderOrder {
  zIndex: number; // higher wins for draw + hit-test
}

// Identity + sound
interface KeyData {
  keyId: KeyId; // equals pitchId
  pitchHz: number;
}

interface KeyEntity {
  hitbox: HitboxRectN;
  visuals: Visual;
  order: RenderOrder;
  data: KeyData;
}

// Cached, derived scene for a particular layout
interface LayoutCache {
  aspect: number; // FROM PROPS only
  startingOctave: number;
  octaveCount: number;
  entities: KeyEntity[]; // immutable per layout
  grid: SpatialHash; // Spatial hash for fast hit tests in normalized space
}

// ----------------------------- Spatial Hash ---------------------------------
interface SpatialHash {
  cellSize: number; // normalized units
  cols: number;
  rows: number;
  buckets: Map<number, Uint32Array>; // key `r*cols + c` -> indices into entities[]
}

function buildSpatialHash(entities: KeyEntity[], aspect: number, cellSize = 0.12): SpatialHash {
  const cols = Math.max(1, Math.ceil(aspect / cellSize));
  const rows = Math.max(1, Math.ceil(1 / cellSize));
  const buckets = new Map<number, number[]>();

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  entities.forEach((e, idx) => {
    const { xN, yN, wN, hN } = e.hitbox;
    const x0 = clamp(Math.floor(xN / (aspect / cols)), 0, cols - 1);
    const x1 = clamp(Math.floor((xN + wN) / (aspect / cols)), 0, cols - 1);
    const y0 = clamp(Math.floor(yN / (1 / rows)), 0, rows - 1);
    const y1 = clamp(Math.floor((yN + hN) / (1 / rows)), 0, rows - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cy * cols + cx;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(idx);
      }
    }
  });

  const compact = new Map<number, Uint32Array>();
  for (const [k, v] of buckets) compact.set(k, new Uint32Array(v));
  return { cellSize, cols, rows, buckets: compact } as unknown as SpatialHash;
}

// -------------------- Normalized geometry helpers ---------------------------
// All layout/hit-test math happens in a normalized space where height = 1 and
// width = aspect. We no longer depend on DOM aspect for cache staleness.
function getCanvasClientRect(canvas: HTMLCanvasElement) {
  return canvas.getBoundingClientRect();
}

function normToPx(n: number, S: number) {
  return n * S; // 1 normalized unit equals canvas CSS height in pixels
}

// --------------------------- Layout builder ---------------------------------
function buildLayoutCache(
  manifest: XenOctaveDisplayManifest,
  startingOctave: number,
  octaveCount: number,
  aspect: number
): LayoutCache {
  const { keyClasses, keyDeclarations, totalEDO } = manifest;

  const octaveWidthN = aspect / octaveCount; // normalized width per octave
  const octaveHeightN = 1; // normalized height of the canvas

  // Precompute class-relative widths/heights in normalized units
  const keyWidthsN: number[] = [];
  const keyHeightsN: number[] = [];
  keyWidthsN[0] = octaveWidthN * keyClasses[0].widthFraction;
  keyHeightsN[0] = octaveHeightN * keyClasses[0].heightFraction;
  for (let i = 1; i < keyClasses.length; i++) {
    keyWidthsN[i] = keyClasses[i].widthFraction * keyWidthsN[i - 1];
    keyHeightsN[i] = keyClasses[i].heightFraction * keyHeightsN[i - 1];
  }

  const entities: KeyEntity[] = [];

  for (let o = 0; o < octaveCount; o++) {
    const octaveNumber = startingOctave + o;
    const baseXN = o * octaveWidthN;

    for (const decl of keyDeclarations) {
      const ci = decl.classIndex;

      // base left offset for this declaration within the octave
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

        const inOctaveMicrotone = decl.microStepOffset + sub;
        const pitchId = octaveNumber * totalEDO + inOctaveMicrotone;
        const pitch = computePitchHz(manifest, octaveNumber, inOctaveMicrotone);

        const kc = keyClasses[ci];
        const visuals: Visual = {
          baseColor: kc.baseColor,
          pressedColor: kc.pressedColor,
          outlineColor: kc.outlineColor,
          outlineThickness: kc.outlineThickness,
        };

        const order: RenderOrder = { zIndex: ci };

        entities.push({
          hitbox: { xN, yN, wN, hN },
          visuals,
          order,
          data: { keyId: pitchId, pitchHz: pitch },
        });
      }
    }
  }

  // Sort once by zIndex ascending for draw; hit-test will scan buckets in DESC
  entities.sort((a, b) => a.order.zIndex - b.order.zIndex);
  const grid = buildSpatialHash(entities, aspect);

  return { aspect, startingOctave, octaveCount, entities, grid };
}

// ---------------------------- Drawing ---------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  cache: LayoutCache,
  S: number,
  pressed: Set<number>
) {
  const { entities } = cache;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    const { xN, yN, wN, hN } = e.hitbox;
    const x = normToPx(xN, S);
    const y = normToPx(yN, S);
    const w = normToPx(wN, S);
    const h = normToPx(hN, S);

    const isPressed = pressed.has(e.data.keyId);
    ctx.fillStyle = isPressed ? e.visuals.pressedColor : e.visuals.baseColor;
    ctx.fillRect(x, y, w, h);

    if (e.visuals.outlineThickness > 0) {
      ctx.lineWidth = e.visuals.outlineThickness; // CSS px
      ctx.strokeStyle = e.visuals.outlineColor;
      ctx.strokeRect(x, y, w, h);
    }
  }
}

// ---------------------------- Hit testing -----------------------------------
function hitTestFromCache(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  cache: LayoutCache
): KeyEntity | null {
  const rect = getCanvasClientRect(canvas);

  // Client → normalized coords using PROPS-derived aspect and rect-based offsets.
  const S = rect.height; // CSS pixels per normalized unit (height=1)
  const nx = (clientX - rect.left) / S; // 0..aspect
  const ny = (clientY - rect.top) / S;  // 0..1
  const { aspect } = cache;             // aspect comes from props at build time
  if (nx < 0 || ny < 0 || ny > 1 || nx > aspect) return null;

  const { grid, entities } = cache;
  // Map normalized point to grid cell
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor((nx / aspect) * grid.cols)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(ny * grid.rows)));
  const key = cy * grid.cols + cx;
  const bucket = grid.buckets.get(key);
  if (!bucket) return null;

  // Search bucket in descending zIndex (so upper classes win)
  let winner: KeyEntity | null = null;
  let bestZ = -Infinity;
  for (let i = 0; i < bucket.length; i++) {
    const ent = entities[bucket[i]];
    if (ent.order.zIndex < bestZ) continue;
    const { xN, yN, wN, hN } = ent.hitbox;
    if (nx >= xN && nx <= xN + wN && ny >= yN && ny <= yN + hN) {
      bestZ = ent.order.zIndex;
      winner = ent;
    }
  }
  return winner;
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

  // Cached layout for current geometry/manifest (aspect derived from props)
  const layoutRef = useRef<LayoutCache | null>(null);

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
        redraw();
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
  }, [onIdRelease]);

  // Build or refresh the layout cache using props-derived aspect
  const rebuildLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const aspect = width / Math.max(1, height); // guard divide-by-zero
    layoutRef.current = buildLayoutCache(
      manifest,
      startingOctave,
      octaveCount,
      aspect
    );
  }, [manifest, startingOctave, octaveCount, width, height]);

  // Draw function that uses cached entities; S comes from HEIGHT PROP to avoid layout reads
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const S = height; // CSS px per normalized unit (height=1)

    if (!layoutRef.current) rebuildLayout();
    if (!layoutRef.current) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawScene(ctx, layoutRef.current, S, pressedKeys.current);

    ctx.restore();
  }, [rebuildLayout, height]);

  // Ensure intrinsic canvas size matches CSS size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    rebuildLayout();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // Rebuild cache when manifest / layout inputs change
  useEffect(() => {
    rebuildLayout();
    redraw();
  }, [rebuildLayout, redraw]);

  // Pointer handlers use cached hit-testing
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && !(e.pointerType === "mouse" && e.button === 0)) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const entity = layoutRef.current
      ? hitTestFromCache(e.clientX, e.clientY, canvas, layoutRef.current)
      : null;

    if (entity) {
      pressedKeys.current.add(entity.data.keyId);
      onIdPress(entity.data.keyId, entity.data.pitchHz);
      redraw();
    }
    activePointers.current.set(e.pointerId, {
      captureEl: canvas,
      currentPitchId: entity?.data.keyId,
      currentPitch: entity?.data.pitchHz,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    const rec = activePointers.current.get(e.pointerId);
    if (!rec) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const entity = layoutRef.current
      ? hitTestFromCache(e.clientX, e.clientY, canvas, layoutRef.current)
      : null;

    if (!entity) {
      if (rec.currentPitchId !== undefined) {
        pressedKeys.current.delete(rec.currentPitchId);
        onIdRelease(rec.currentPitchId);
        rec.currentPitchId = undefined;
        rec.currentPitch = undefined;
        redraw();
      }
      return;
    }

    if (entity.data.keyId === rec.currentPitchId) return; // same key

    if (rec.currentPitchId !== undefined) {
      pressedKeys.current.delete(rec.currentPitchId);
      onIdRelease(rec.currentPitchId);
    }
    pressedKeys.current.add(entity.data.keyId);
    onIdPress(entity.data.keyId, entity.data.pitchHz);
    rec.currentPitchId = entity.data.keyId;
    rec.currentPitch = entity.data.pitchHz;
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
    try {
      rec?.captureEl.releasePointerCapture(e.pointerId);
    } catch {}
    activePointers.current.delete(e.pointerId);
  };

  const topPos = typeof top === "number" ? `${top}px` : top;
  const leftPos = typeof left === "number" ? `${left}px` : left;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
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
