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
  colStep: number;                    // EDO steps per column (moving right)
  rowStep: number;                    // EDO steps per row (moving up)
  cols: number;
  rows: number;
  stepAppearances: HexTileAppearance[]; // length must equal manifest.totalEDO
}

export interface CanvasHexKeyboardProps {
  width: number;
  height: number;
  manifest: XenOctaveDisplayRuntimeManifest;
  layout: HexKeyboardLayout;
  refOctave: number;  // octave of the note at grid position (0, 0)
  refStep: number;    // in-octave step of the note at grid position (0, 0)
  onIdPress: (pitchId: number, pitch: number) => void;
  onIdRelease: (pitchId: number) => void;
  externalPressedIds?: number[];
}

interface PointerRec {
  captureEl: HTMLElement;
  currentPitchId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry constants
// ─────────────────────────────────────────────────────────────────────────────

const SQRT3 = Math.sqrt(3);
const PADDING = 6; // px around the grid

// Flat-top hexagon layout:
//   colSpacing = hexSize * 1.5
//   rowSpacing = hexSize * SQRT3
//   Odd columns are shifted DOWN by rowSpacing/2 ("even-q offset")
//
// Center of tile (col, row) where row=0 is BOTTOM, row increases UPWARD:
//   cx = PADDING + hexSize + col * colSpacing
//   cy = PADDING + hexHalfH + (rows - 1 - row) * rowSpacing
//        + (col % 2 === 1 ? rowSpacing / 2 : 0)

function computeHexSize(width: number, height: number, cols: number, rows: number): number {
  const avW = Math.max(1, width - 2 * PADDING);
  const avH = Math.max(1, height - 2 * PADDING);
  const fromW = avW / (2 + 1.5 * (cols - 1));
  const fromH = avH / (SQRT3 * (rows + 0.5));
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
): HexTile[] {
  const { colStep, rowStep, cols, rows } = layout;
  const { totalEDO } = manifest;

  const colSpacing = hexSize * 1.5;
  const rowSpacing = hexSize * SQRT3;
  const hexHalfH = rowSpacing / 2;

  const tiles: HexTile[] = [];

  for (let col = 0; col < cols; col++) {
    const cx = PADDING + hexSize + col * colSpacing;
    const stagger = col % 2 === 1 ? hexHalfH : 0;

    for (let row = 0; row < rows; row++) {
      const cy = PADDING + hexHalfH + (rows - 1 - row) * rowSpacing + stagger;

      const absoluteStep = refStep + col * colStep + row * rowStep;
      const octaveOffset = Math.floor(absoluteStep / totalEDO);
      const inOctaveStep = ((absoluteStep % totalEDO) + totalEDO) % totalEDO;
      const octave = refOctave + octaveOffset;

      const pitchId = octave * totalEDO + inOctaveStep;
      const pitchHz = computePitchHz(manifest, octave, inOctaveStep);

      tiles.push({ cx, cy, pitchId, pitchHz, inOctaveStep });
    }
  }

  return tiles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hit testing
// ─────────────────────────────────────────────────────────────────────────────

// Containment test for a flat-top regular hexagon centered at (cx, cy)
// with circumradius r.
function hexContains(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
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
  // Use 97% of hexSize to leave a tiny gap between tiles for precise edge behavior
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
  cx: number,
  cy: number,
  r: number,
  fill: string,
  outlineColor: string,
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
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
      // Display the sharpwards name only (before " | ")
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tilesRef = useRef<HexTile[]>([]);
  const hexSizeRef = useRef<number>(1);
  const pressedKeys = useRef<Set<number>>(new Set());
  const activePointers = useRef<Map<number, PointerRec>>(new Map());

  // ── Rebuild tile grid ─────────────────────────────────────────────────────

  const rebuildTiles = useCallback(() => {
    const hexSize = computeHexSize(width, height, layout.cols, layout.rows);
    hexSizeRef.current = hexSize;
    tilesRef.current = buildTiles(manifest, layout, refOctave, refStep, hexSize);
  }, [width, height, manifest, layout, refOctave, refStep]);

  // ── Redraw ────────────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const allPressed = new Set<number>(pressedKeys.current);
    if (externalPressedIds) {
      for (const id of externalPressedIds) allPressed.add(id);
    }

    drawScene(ctx, tilesRef.current, hexSizeRef.current, layout, manifest.noteNames, allPressed);
  }, [layout, manifest.noteNames, externalPressedIds]);

  // ── Canvas size + rebuild on dimension/manifest/layout change ─────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
    rebuildTiles();
    redraw();
  }, [width, height, rebuildTiles, redraw]);

  useEffect(() => {
    rebuildTiles();
    redraw();
  }, [rebuildTiles, redraw]);

  useEffect(() => {
    redraw();
  }, [externalPressedIds, redraw]);

  // ── Gesture / touch prevention ────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    const opts: AddEventListenerOptions = { passive: false };
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
    window.addEventListener("blur", endAll);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") endAll();
    });
    return () => {
      window.removeEventListener("blur", endAll);
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
    activePointers.current.set(e.pointerId, {
      captureEl: canvas,
      currentPitchId: tile?.pitchId,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    const rec = activePointers.current.get(e.pointerId);
    if (!rec) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tile = hitTest(e.clientX, e.clientY, canvas, tilesRef.current, hexSizeRef.current);
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
