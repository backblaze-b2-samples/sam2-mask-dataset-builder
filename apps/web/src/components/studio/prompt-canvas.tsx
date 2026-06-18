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

// Maps a mouse event to image-pixel coordinates, accounting for the rendered
// (CSS) size vs the natural image size. SAM 2 prompts are in image pixels.
function toImageCoords(
  e: React.MouseEvent,
  img: HTMLImageElement,
): { x: number; y: number } {
  const rect = img.getBoundingClientRect();
  const scaleX = img.naturalWidth / rect.width;
  const scaleY = img.naturalHeight / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
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
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  const handleClick = (e: React.MouseEvent) => {
    if (!imgRef.current || mode === "box") return;
    const { x, y } = toImageCoords(e, imgRef.current);
    onAddPoint({ type: "point", x, y, label: mode === "foreground" ? 1 : 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgRef.current || mode !== "box") return;
    setDragStart(toImageCoords(e, imgRef.current));
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!imgRef.current || mode !== "box" || !dragStart) return;
    const end = toImageCoords(e, imgRef.current);
    onSetBox({
      type: "box",
      x0: Math.min(dragStart.x, end.x),
      y0: Math.min(dragStart.y, end.y),
      x1: Math.max(dragStart.x, end.x),
      y1: Math.max(dragStart.y, end.y),
    });
    setDragStart(null);
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

  // SVG overlay uses the image's natural coordinate system via viewBox, so
  // prompt markers stay aligned regardless of the rendered size.
  return (
    <div className="relative inline-block max-w-full select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Segmentation source"
        className={`max-h-[60vh] w-auto max-w-full rounded-lg ${
          mode === "box" ? "cursor-crosshair" : "cursor-pointer"
        }`}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onLoad={(e) => {
          const t = e.currentTarget;
          setDims({ w: t.naturalWidth, h: t.naturalHeight });
        }}
      />
      {/* Returned mask overlays — semi-transparent, stacked over the image. */}
      {maskUrls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${url}-${i}`}
          src={url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full rounded-lg mix-blend-screen opacity-60"
          style={{ filter: "invert(31%) sepia(98%) saturate(1200%) hue-rotate(190deg)" }}
        />
      ))}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        preserveAspectRatio="none"
      >
        {box && (
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
