import React, { forwardRef, useCallback, useEffect, useRef } from "react";
import type XenOctaveDisplayManifest from "../types/XenOctaveDisplayManifest";

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
  pressAnimationDuration?: number; // (kept for compatibility)
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
// Identity is unified: keyId === pitchId (octave * EDO + micro-index)

type KeyId = number; // unique across whole keyboard

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
  data: KeyData; // keyId === pitchId
  octaveNumber: number; // cached for fast bucketing
}

// Cached, derived scene for a particular layout
interface LayoutCache {
  aspect: number; // FROM PROPS only
  startingOctave: number;
  octaveCount: number;
  entities: KeyEntity[]; // immutable per layout (in insertion order)
  // Per-octave index of entity indices, sorted by zIndex ASC for draw
  octaveEntityIndices: number[][];
  // Global draw order of entity indices by ascending zIndex
  drawOrderIndices: number[];
  // Map entity index -> position in drawOrderIndices (bigger means drawn later/on top for ties)
  drawRank: number[];
}

// -------------------- Normalized geometry helpers ---------------------------
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
  const octaveEntityIndices: number[][] = Array.from({ length: octaveCount }, () => []);

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
        const pitchId = octaveNumber * totalEDO + inOctaveMicrotone; // unify id
        const pitch = computePitchHz(manifest, octaveNumber, inOctaveMicrotone);

        const kc = keyClasses[ci];
        const visuals: Visual = {
          baseColor: kc.baseColor,
          pressedColor: kc.pressedColor,
          outlineColor: kc.outlineColor,
          outlineThickness: kc.outlineThickness,
        };

        const order: RenderOrder = { zIndex: ci };

        const idx = entities.push({
          hitbox: { xN, yN, wN, hN },
          visuals,
          order,
          data: { keyId: pitchId, pitchHz: pitch },
          octaveNumber,
        }) - 1;

        octaveEntityIndices[o].push(idx);
      }
    }
  }

  // Sort per-octave indices by zIndex asc for draw (do NOT reorder entities array!)
  for (let o = 0; o < octaveEntityIndices.length; o++) {
    octaveEntityIndices[o].sort((ia, ib) => entities[ia].order.zIndex - entities[ib].order.zIndex);
  }

  // Build a global draw order across all entities by zIndex asc
  const drawOrderIndices = Array.from({ length: entities.length }, (_, i) => i).sort(
    (a, b) => entities[a].order.zIndex - entities[b].order.zIndex
  );
  const drawRank: number[] = Array(entities.length).fill(0);
  for (let i = 0; i < drawOrderIndices.length; i++) drawRank[drawOrderIndices[i]] = i;

  return { aspect, startingOctave, octaveCount, entities, octaveEntityIndices, drawOrderIndices, drawRank };
}

// ---------------------------- Drawing ---------------------------------------
function drawScene(
  ctx: CanvasRenderingContext2D,
  cache: LayoutCache,
  S: number,
  pressed: Set<number>
) {
  const { entities, drawOrderIndices } = cache;
  for (let k = 0; k < drawOrderIndices.length; k++) {
    const i = drawOrderIndices[k];
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
  const { aspect, octaveCount, entities, octaveEntityIndices, drawRank } = cache; // aspect comes from props at build time
  if (nx < 0 || ny < 0 || ny > 1 || nx > aspect) return null;

  // --- IMPORTANT FIX: scan primary + adjacent octaves to handle overlap ---
  // Compute which octave column this point is in.
  const octaveWidthN = aspect / octaveCount;
  const primaryIdx = Math.floor(nx / Math.max(1e-6, octaveWidthN));
  if (primaryIdx < 0 || primaryIdx >= octaveCount) return null;

  // Always include nearest two octaves in the vicinity: primary +/- 1 when available.
  const candidates: number[] = [];
  if (primaryIdx > 0) candidates.push(primaryIdx - 1);
  candidates.push(primaryIdx);
  if (primaryIdx < octaveCount - 1) candidates.push(primaryIdx + 1);

  // Find the top-most hit across all candidate octaves.
  let bestEnt: KeyEntity | null = null;
  let bestZ = -Infinity;
  let bestRank = -Infinity; // break ties using global draw order (later draw wins)

  for (let c = 0; c < candidates.length; c++) {
    const idxs = octaveEntityIndices[candidates[c]];
    if (!idxs || idxs.length === 0) continue;

    // Scan in descending zIndex so upper classes win within each octave.
    for (let i = idxs.length - 1; i >= 0; i--) {
      const entIdx = idxs[i];
      const ent = entities[entIdx];
      const { xN, yN, wN, hN } = ent.hitbox;
      if (nx >= xN && nx <= xN + wN && ny >= yN && ny <= yN + hN) {
        const z = ent.order.zIndex;
        const rank = drawRank[entIdx];
        if (z > bestZ || (z === bestZ && rank > bestRank)) {
          bestZ = z;
          bestRank = rank;
          bestEnt = ent;
        }
        // Don't break; another candidate octave might have a higher z or later draw.
      }
    }
  }

  return bestEnt;
}

// ----------------------------- Component ------------------------------------
export default forwardRef<HTMLCanvasElement, CanvasKeyboardProps>(function CanvasKeyboard(
  {
    width,
    height,
    manifest,
    startingOctave,
    octaveCount,
    pressAnimationDuration = 100, // preserved; currently unused by draw loop
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

  // Pointer handlers use cached hit-testing (multi-octave aware)
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
      // Unified identity: keyId === pitchId (also our visual/bbox id)
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
