import React, { useCallback, useEffect, useRef } from "react";
import type { XenOctaveDisplayRuntimeManifest } from "../types/XenOctaveDisplayManifest";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HexTileAppearance {
  base: string;
  pressed: string;
  outline: string;
  labelColor: string;
}

export interface HexKeyboardLayout {
  colStep: number;                      // EDO steps per axial q (moving right)
  rowStep: number;                      // EDO steps per axial r (moving up)
  cols: number;                         // axial q: 0 .. cols-1
  rows: number;                         // axial r: 0 .. rows-1
  stepAppearances: HexTileAppearance[]; // length == manifest.totalEDO
}

export interface CanvasHexKeyboardProps {
  width: number;
  height: number;
  manifest: XenOctaveDisplayRuntimeManifest;
  layout: HexKeyboardLayout;
  refOctave: number;  // octave of the note at axial position (q=0, r=0)
  refStep: number;    // in-octave step at (q=0, r=0)
  onIdPress: (pitchId: number, pitch: number) => void;
  onIdRelease: (pitchId: number) => void;
  externalPressedIds?: number[];
}

interface PointerRec {
  captureEl: HTMLElement;
  currentPitchId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Axial hex geometry (pointy-top hexagons, q-axis horizontal)
// ─────────────────────────────────────────────────────────────────────────────
//
// Uses axial (q, r) coordinates rotated +30° from the flat-top basis so that
// the q-axis (whole-tone / white-key run) is perfectly horizontal on screen.
// This fills the canvas efficiently and matches the classic Bosanquet diagram.
//
// Canvas position of tile (q, r):
//   cx = originX + √3 · hexSize · (q + r/2)   ← q is purely horizontal
//   cy = originY − 1.5 · hexSize · r           ← r goes up-and-right at 60°
//
// Grid bounding box (center-to-center):
//   width  = √3 · hexSize · ((cols−1) + (rows−1)/2)
//   height = 1.5 · hexSize · (rows−1)
//
// The 6 axial neighbor directions and their pitch intervals (for any tile):
//
//   Direction    Δ(q,r)    pixel offset          pitch Δ
//   ────────────────────────────────────────────────────────
//   Right        (+1, 0)   purely right          +colStep
//   Left         (−1, 0)   purely left           −colStep
//   Up-right     ( 0,+1)   up and right at 60°   +rowStep
//   Down-left    ( 0,−1)   down and left at 60°  −rowStep
//   Down-right   (+1,−1)   right + slightly dn   +colStep−rowStep
//   Up-left      (−1,+1)   left  + slightly up   −colStep+rowStep
//
// For colStep=5, rowStep=3: neighbor intervals are ±5, ±3, ±2 from EVERY tile.
// True isomorphism: any chord shape sounds identical regardless of position.

const SQRT3 = Math.sqrt(3);
const PADDING = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Hex size computation
// ─────────────────────────────────────────────────────────────────────────────

// Pointy-top hexagon grid (q-axis horizontal):
//   total width  = √3 · hexSize · (cols + (rows−1)/2)
//                  [center span + one hex-width of padding]
//   total height = 1.5 · hexSize · (rows−1) + 2 · hexSize
//                  [center span + one hex-height of padding]
function computeHexSize(width: number, height: number, cols: number, rows: number): number {
  const avW = Math.max(1, width  - 2 * PADDING);
  const avH = Math.max(1, height - 2 * PADDING);
  const fromW = avW / (SQRT3 * (cols + (rows - 1) / 2));
  const fromH = avH / (1.5 * (rows - 1) + 2);
  return Math.max(1, Math.min(fromW, fromH));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile data
// ─────────────────────────────────────────────────────────────────────────────

interface HexTile {
  cx: number;
  cy: number;
  pitchId: number;
  pitchHz: number;
  inOctaveStep: number;
}

function computePitchHz(
  manifest: XenOctaveDisplayRuntimeManifest,
  octave: number,
  inOctaveStep: number
): number {
  const { C4Frequency, totalEDO } = manifest;
  return C4Frequency * Math.pow(2, octave - 4) * Math.pow(2, inOctaveStep / totalEDO);
}

function buildTiles(
  manifest: XenOctaveDisplayRuntimeManifest,
  layout: HexKeyboardLayout,
  refOctave: number,
  refStep: number,
  hexSize: number,
  canvasWidth: number,
  canvasHeight: number,
): HexTile[] {
  const { colStep, rowStep, cols, rows } = layout;
  const { totalEDO } = manifest;

  // Center the parallelogram in the canvas.
  // Bounding box of tile centers:
  //   x: [0,  √3·s·((cols−1) + (rows−1)/2)]
  //   y: [−1.5·s·(rows−1), 0]
  const xSpan = SQRT3 * hexSize * ((cols - 1) + (rows - 1) / 2);
  const ySpan = 1.5 * hexSize * (rows - 1);
  const originX = canvasWidth  / 2 - xSpan / 2;
  const originY = canvasHeight / 2 + ySpan / 2;

  const tiles: HexTile[] = [];

  for (let q = 0; q < cols; q++) {
    for (let r = 0; r < rows; r++) {
      const cx = originX + SQRT3 * hexSize * (q + r / 2);
      const cy = originY - 1.5 * hexSize * r;

      const absoluteStep = refStep + q * colStep + r * rowStep;
      const octaveOffset  = Math.floor(absoluteStep / totalEDO);
      const inOctaveStep  = ((absoluteStep % totalEDO) + totalEDO) % totalEDO;
      const octave        = refOctave + octaveOffset;

      const pitchId = octave * totalEDO + inOctaveStep;
      const pitchHz = computePitchHz(manifest, octave, inOctaveStep);

      tiles.push({ cx, cy, pitchId, pitchHz, inOctaveStep });
    }
  }

  return tiles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hit testing (flat-top hex containment)
// ─────────────────────────────────────────────────────────────────────────────

// Point (px,py) inside pointy-top regular hex centred at (cx,cy) with circumradius r.
// Strategy: rotate the test point by −30° into flat-top space, then apply the
// standard flat-top test (|dy|≤r√3/2, |dx|≤r, |dx|√3+|dy|≤r√3).
function hexContains(
  px: number, py: number,
  cx: number, cy: number,
  r: number
): boolean {
  const dx0 = px - cx;
  const dy0 = py - cy;
  // Rotate −30°: cos(−30°)=√3/2, sin(−30°)=−1/2
  const dx = Math.abs(dx0 * (SQRT3 / 2) + dy0 * 0.5);
  const dy = Math.abs(-dx0 * 0.5     + dy0 * (SQRT3 / 2));
  return dy <= r * SQRT3 / 2 && dx <= r && dx * SQRT3 + dy <= r * SQRT3;
}

function hitTest(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  tiles: HexTile[],
  hexSize: number
): HexTile | null {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const r = hexSize * 0.97;
  for (const tile of tiles) {
    if (hexContains(px, py, tile.cx, tile.cy, r)) return tile;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing
// ─────────────────────────────────────────────────────────────────────────────

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  fill: string, outlineColor: string,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 + Math.PI / 6;  // +30° → pointy-top
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  tiles: HexTile[],
  hexSize: number,
  layout: HexKeyboardLayout,
  noteNames: string[] | undefined,
  pressed: Set<number>,
) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const r = hexSize * 0.97;
  const fontSize = Math.max(7, Math.min(13, hexSize * 0.27));

  for (const tile of tiles) {
    const app = layout.stepAppearances[tile.inOctaveStep];
    const isPressed = pressed.has(tile.pitchId);
    drawHex(ctx, tile.cx, tile.cy, r, isPressed ? app.pressed : app.base, app.outline);

    if (hexSize >= 18 && noteNames) {
      const rawName = noteNames[tile.inOctaveStep] ?? "";
      const label = rawName.split(" | ")[0];
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = app.labelColor;
      ctx.fillText(label, tile.cx, tile.cy);
    }
  }

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CanvasHexKeyboard({
  width,
  height,
  manifest,
  layout,
  refOctave,
  refStep,
  onIdPress,
  onIdRelease,
  externalPressedIds,
}: CanvasHexKeyboardProps) {
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const tilesRef      = useRef<HexTile[]>([]);
  const hexSizeRef    = useRef<number>(1);
  const pressedKeys   = useRef<Set<number>>(new Set());
  const activePointers = useRef<Map<number, PointerRec>>(new Map());

  // ── Rebuild ───────────────────────────────────────────────────────────────

  const rebuildTiles = useCallback(() => {
    const hexSize = computeHexSize(width, height, layout.cols, layout.rows);
    hexSizeRef.current = hexSize;
    tilesRef.current   = buildTiles(manifest, layout, refOctave, refStep, hexSize, width, height);
  }, [width, height, manifest, layout, refOctave, refStep]);

  // ── Redraw ────────────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const allPressed = new Set<number>(pressedKeys.current);
    if (externalPressedIds) for (const id of externalPressedIds) allPressed.add(id);

    drawScene(ctx, tilesRef.current, hexSizeRef.current, layout, manifest.noteNames, allPressed);
  }, [layout, manifest.noteNames, externalPressedIds]);

  // ── Canvas size sync ──────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    rebuildTiles();
    redraw();
  }, [width, height, rebuildTiles, redraw]);

  useEffect(() => {
    rebuildTiles();
    redraw();
  }, [rebuildTiles, redraw]);

  useEffect(() => { redraw(); }, [externalPressedIds, redraw]);

  // ── Gesture / touch prevention ────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener("gesturestart",  prevent as EventListener, opts);
    el.addEventListener("gesturechange", prevent as EventListener, opts);
    el.addEventListener("gestureend",    prevent as EventListener, opts);
    el.addEventListener("touchstart",    prevent, opts);
    el.addEventListener("touchmove",     prevent, opts);
    el.addEventListener("touchend",      prevent, opts);
    el.addEventListener("contextmenu",   prevent as EventListener);
    return () => {
      el.removeEventListener("gesturestart",  prevent as EventListener, opts);
      el.removeEventListener("gesturechange", prevent as EventListener, opts);
      el.removeEventListener("gestureend",    prevent as EventListener, opts);
      el.removeEventListener("touchstart",    prevent as EventListener, opts);
      el.removeEventListener("touchmove",     prevent as EventListener, opts);
      el.removeEventListener("touchend",      prevent as EventListener, opts);
      el.removeEventListener("contextmenu",   prevent as EventListener);
    };
  }, []);

  // ── Release all on blur / visibility change ───────────────────────────────

  useEffect(() => {
    const endAll = () => {
      for (const [pid, rec] of activePointers.current) {
        if (rec.currentPitchId !== undefined) {
          pressedKeys.current.delete(rec.currentPitchId);
          onIdRelease(rec.currentPitchId);
        }
        try { rec.captureEl.releasePointerCapture(pid); } catch {}
      }
      activePointers.current.clear();
      redraw();
    };
    const onVis = () => { if (document.visibilityState !== "visible") endAll(); };
    window.addEventListener("blur", endAll);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", endAll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [onIdRelease, redraw]);

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && !(e.pointerType === "mouse" && e.button === 0)) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const tile = hitTest(e.clientX, e.clientY, canvas, tilesRef.current, hexSizeRef.current);
    if (tile) {
      pressedKeys.current.add(tile.pitchId);
      onIdPress(tile.pitchId, tile.pitchHz);
      redraw();
    }
    activePointers.current.set(e.pointerId, { captureEl: canvas, currentPitchId: tile?.pitchId });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    const rec = activePointers.current.get(e.pointerId);
    if (!rec) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tile  = hitTest(e.clientX, e.clientY, canvas, tilesRef.current, hexSizeRef.current);
    const newId = tile?.pitchId;

    if (newId === rec.currentPitchId) return;

    if (rec.currentPitchId !== undefined) {
      pressedKeys.current.delete(rec.currentPitchId);
      onIdRelease(rec.currentPitchId);
    }
    if (newId !== undefined && tile) {
      pressedKeys.current.add(newId);
      onIdPress(newId, tile.pitchHz);
    }
    rec.currentPitchId = newId;
    redraw();
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    const rec = activePointers.current.get(e.pointerId);
    if (rec?.currentPitchId !== undefined) {
      pressedKeys.current.delete(rec.currentPitchId);
      onIdRelease(rec.currentPitchId);
      redraw();
    }
    try { rec?.captureEl.releasePointerCapture(e.pointerId); } catch {}
    activePointers.current.delete(e.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "block",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
    />
  );
}
