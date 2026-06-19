"use client";

import { useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PointPrompt, BoxPrompt } from "@sam2-mask-dataset-builder/shared";

export type PromptMode = "foreground" | "background" | "box";

interface PromptCanvasProps {
  imageUrl: string | null;
  loading: boolean;
  mode: PromptMode;
  points: PointPrompt[];
  box: BoxPrompt | null;
  maskUrls: string[]; // presigned mask PNG URLs to overlay
  onAddPoint: (p: PointPrompt) => void;
  onSetBox: (b: BoxPrompt) => void;
}

// Maps a pointer event to image-pixel coordinates, accounting for the rendered
// (CSS) size vs the natural image size. SAM 2 prompts are in image pixels, and
// we clamp to the image bounds so a drag that leaves the image still yields a
// valid in-bounds box.
function toImageCoords(
  e: { clientX: number; clientY: number },
  img: HTMLImageElement,
): { x: number; y: number } {
  const rect = img.getBoundingClientRect();
  const scaleX = img.naturalWidth / rect.width;
  const scaleY = img.naturalHeight / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return {
    x: Math.max(0, Math.min(img.naturalWidth, x)),
    y: Math.max(0, Math.min(img.naturalHeight, y)),
  };
}

export function PromptCanvas({
  imageUrl,
  loading,
  mode,
  points,
  box,
  maskUrls,
  onAddPoint,
  onSetBox,
}: PromptCanvasProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  // Live drag state for box mode: start + current corner in image pixels.
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  const handleClick = (e: React.MouseEvent) => {
    // Points are placed on click; box mode is handled by the pointer drag below.
    if (!imgRef.current || mode === "box") return;
    const { x, y } = toImageCoords(e, imgRef.current);
    onAddPoint({ type: "point", x, y, label: mode === "foreground" ? 1 : 0 });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imgRef.current || mode !== "box") return;
    // Prevent the browser's native image drag (ghost image) and text selection,
    // then capture the pointer so move/up keep firing even outside the image.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImageCoords(e, imgRef.current);
    setDragStart(p);
    setDragCurrent(p);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!imgRef.current || mode !== "box" || !dragStart) return;
    setDragCurrent(toImageCoords(e, imgRef.current));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!imgRef.current || mode !== "box" || !dragStart) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }
    const end = toImageCoords(e, imgRef.current);
    // Ignore accidental clicks / tiny drags so a single click doesn't commit a
    // zero-size box. Threshold scales with the image so it's resolution-independent.
    const minSize = Math.max(dims.w, dims.h) * 0.01;
    if (
      Math.abs(end.x - dragStart.x) >= minSize &&
      Math.abs(end.y - dragStart.y) >= minSize
    ) {
      onSetBox({
        type: "box",
        x0: Math.min(dragStart.x, end.x),
        y0: Math.min(dragStart.y, end.y),
        x1: Math.max(dragStart.x, end.x),
        y1: Math.max(dragStart.y, end.y),
      });
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  if (loading) {
    return <Skeleton className="aspect-video w-full rounded-lg" />;
  }

  if (!imageUrl) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Pick a source image to start prompting.
      </div>
    );
  }

  // Rubber-band preview while dragging a box, in image natural coordinates.
  const preview =
    dragStart && dragCurrent
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          w: Math.abs(dragCurrent.x - dragStart.x),
          h: Math.abs(dragCurrent.y - dragStart.y),
        }
      : null;

  // SVG overlay uses the image's natural coordinate system via viewBox, so
  // prompt markers stay aligned regardless of the rendered size.
  return (
    <div className="relative inline-block max-w-full select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Segmentation source"
        draggable={false}
        className={`max-h-[60vh] w-auto max-w-full rounded-lg ${
          mode === "box" ? "cursor-crosshair" : "cursor-pointer"
        }`}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onLoad={(e) => {
          const t = e.currentTarget;
          setDims({ w: t.naturalWidth, h: t.naturalHeight });
        }}
      />
      {/* Returned mask overlays. The mask PNG is grayscale (white inside the
          segment, black outside), so two blended passes make the selection
          stand out clearly against what was left out:
          1. Spotlight — `multiply` keeps the inside untouched (white = neutral)
             and darkens the background (black = darken), dimming everything
             OUTSIDE the mask. Only meaningful for a single object; with several
             masks each would dim the others, so it's gated on a lone mask. */}
      {maskUrls.length === 1 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={maskUrls[0]}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full rounded-lg"
          style={{ mixBlendMode: "multiply", opacity: 0.55 }}
        />
      )}
      {/* 2. Tint — `screen` lifts the inside toward a vivid color (black stays
            neutral, so the dimmed background is untouched). The result: the
            mask glows over a darkened backdrop. */}
      {maskUrls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${url}-${i}`}
          src={url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full rounded-lg"
          style={{
            mixBlendMode: "screen",
            opacity: 0.85,
            filter:
              "invert(31%) sepia(98%) saturate(1800%) hue-rotate(140deg) brightness(1.1)",
          }}
        />
      ))}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        preserveAspectRatio="none"
      >
        {box && !preview && (
          <rect
            x={box.x0}
            y={box.y0}
            width={box.x1 - box.x0}
            height={box.y1 - box.y0}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={Math.max(dims.w, dims.h) / 250}
          />
        )}
        {preview && (
          <rect
            x={preview.x}
            y={preview.y}
            width={preview.w}
            height={preview.h}
            fill="var(--primary)"
            fillOpacity={0.12}
            stroke="var(--primary)"
            strokeDasharray={`${Math.max(dims.w, dims.h) / 100}`}
            strokeWidth={Math.max(dims.w, dims.h) / 250}
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={Math.max(dims.w, dims.h) / 90}
            fill={p.label === 1 ? "var(--success)" : "var(--destructive)"}
            stroke="white"
            strokeWidth={Math.max(dims.w, dims.h) / 400}
          />
        ))}
      </svg>
    </div>
  );
}
