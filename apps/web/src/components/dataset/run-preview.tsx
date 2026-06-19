"use client";

import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreviewUrl } from "@/lib/queries";
import type { MaskInstance, SegmentationRun } from "@sam2-mask-dataset-builder/shared";

/** Image runs carry instances directly; video runs surface the prompt frame's
 * instances as the representative set. Shared by the preview and the run card. */
export function instancesOf(run: SegmentationRun): MaskInstance[] {
  if (run.instances.length > 0) return run.instances;
  return run.frames[0]?.instances ?? [];
}

// Mask PNGs are grayscale ("L": white = inside the segment, black = outside).
// The Studio canvas composites them with a two-pass "spotlight + tint"
// treatment for high contrast; the dataset composite + lightbox reuse these
// exact styles so the derived preview reads identically to segmentation.
//
// Spotlight (multiply): white stays neutral so the object keeps full
// brightness; black darkens so the background dims. Only meaningful for a
// single instance — multiple overlapping spotlights would over-darken.
const SPOTLIGHT_STYLE: React.CSSProperties = {
  mixBlendMode: "multiply",
  opacity: 0.55,
};
// Tint (screen): paints the segment with the brand teal so each object reads
// as a distinct colored region on top of the spotlight.
const TINT_STYLE: React.CSSProperties = {
  mixBlendMode: "screen",
  opacity: 0.85,
  filter: "invert(31%) sepia(98%) saturate(1800%) hue-rotate(140deg) brightness(1.1)",
};

const OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full object-contain";

interface PreviewImageProps {
  assetKey: string;
  enabled: boolean;
  alt: string;
}

/** Fetches a short-lived presigned preview URL for a single B2 object and
 * renders it to fill its (sized) parent. Callers provide the box; this just
 * handles the loading / missing states. */
export function PreviewImage({ assetKey, enabled, alt }: PreviewImageProps) {
  const { data, isLoading } = usePreviewUrl(assetKey, enabled);
  const url = data?.url ?? null;

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/30 text-muted-foreground">
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="h-full w-full object-contain" />
  );
}

/** A single mask PNG stacked as an overlay using one of the two compositing
 * passes. Used by both the composite preview and the lightbox. */
function MaskOverlay({
  maskKey,
  enabled,
  style,
}: {
  maskKey: string;
  enabled: boolean;
  style: React.CSSProperties;
}) {
  const { data } = usePreviewUrl(maskKey, enabled);
  if (!data?.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={data.url} alt="" aria-hidden className={OVERLAY_CLASS} style={style} />
  );
}

/** The full spotlight + tint mask stack for a set of instances, composited
 * over whatever source image sits behind it. Shared by `RunPreview` and the
 * lightbox so both render the identical high-contrast treatment. */
export function MaskComposite({
  instances,
  enabled,
}: {
  instances: MaskInstance[];
  enabled: boolean;
}) {
  return (
    <>
      {/* Spotlight only makes sense for a single instance (see SPOTLIGHT_STYLE). */}
      {instances.length === 1 && (
        <MaskOverlay
          maskKey={instances[0].mask_png_key}
          enabled={enabled}
          style={SPOTLIGHT_STYLE}
        />
      )}
      {instances.map((m) => (
        <MaskOverlay
          key={m.object_id}
          maskKey={m.mask_png_key}
          enabled={enabled}
          style={TINT_STYLE}
        />
      ))}
    </>
  );
}

/** Source image with its mask overlays composited on top — mirrors the Studio
 * canvas so users can see what was segmented without downloading anything.
 * Image runs only; the source of a video run isn't a single still frame. */
export function RunPreview({
  run,
  enabled,
}: {
  run: SegmentationRun;
  enabled: boolean;
}) {
  const instances = instancesOf(run);
  return (
    <div className="relative flex h-80 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20">
      <PreviewImage
        assetKey={run.source_key}
        enabled={enabled}
        alt={`Source for ${run.run_id}`}
      />
      <MaskComposite instances={instances} enabled={enabled} />
    </div>
  );
}
