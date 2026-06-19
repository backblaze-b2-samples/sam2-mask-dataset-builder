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

/** A single mask PNG stacked as a tinted overlay — same treatment as the
 * Studio canvas so the dataset preview reads consistently with segmentation. */
function MaskOverlay({ maskKey, enabled }: { maskKey: string; enabled: boolean }) {
  const { data } = usePreviewUrl(maskKey, enabled);
  if (!data?.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data.url}
      alt=""
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full object-contain mix-blend-screen opacity-60"
      style={{ filter: "invert(31%) sepia(98%) saturate(1200%) hue-rotate(190deg)" }}
    />
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
      {instances.map((m) => (
        <MaskOverlay key={m.object_id} maskKey={m.mask_png_key} enabled={enabled} />
      ))}
    </div>
  );
}
