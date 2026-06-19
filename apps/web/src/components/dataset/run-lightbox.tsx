"use client";

import { ImageOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreviewUrl } from "@/lib/queries";
import type { MaskInstance, SegmentationRun } from "@sam2-mask-dataset-builder/shared";
import { MaskComposite } from "./run-preview";

/** What the lightbox should show. A `composite` view stacks the run's source +
 * the same spotlight/tint mask overlay used in the inline preview; a `single`
 * view shows one asset (a cut-out or mask PNG) on its own. */
export type LightboxTarget =
  | { kind: "composite"; run: SegmentationRun; instances: MaskInstance[] }
  | { kind: "single"; assetKey: string; title: string };

/** The large source + mask overlay for a single run, sized to fill the dialog. */
function CompositeView({
  run,
  instances,
  open,
}: {
  run: SegmentationRun;
  instances: MaskInstance[];
  open: boolean;
}) {
  const { data, isLoading } = usePreviewUrl(run.source_key, open);
  const url = data?.url ?? null;

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;
  if (!url) {
    return (
      <div className="flex h-[70vh] w-full items-center justify-center bg-muted/30 text-muted-foreground">
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  return (
    <div className="relative flex max-h-[80vh] w-full items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Source for ${run.run_id}`}
        className="max-h-[80vh] w-auto max-w-full object-contain"
      />
      <MaskComposite instances={instances} enabled={open} />
    </div>
  );
}

/** A single enlarged asset (cut-out or mask PNG). */
function SingleView({ assetKey, open }: { assetKey: string; open: boolean }) {
  const { data, isLoading } = usePreviewUrl(assetKey, open);
  const url = data?.url ?? null;

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;
  if (!url) {
    return (
      <div className="flex h-[70vh] w-full items-center justify-center bg-muted/30 text-muted-foreground">
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="mx-auto max-h-[80vh] w-auto max-w-full object-contain"
    />
  );
}

/** Click-to-expand lightbox for a run's composite preview and per-object
 * thumbnails. Reuses the shadcn Dialog (see files/file-preview.tsx) and the
 * shared spotlight/tint treatment so the enlarged composite matches the
 * inline preview exactly. Preview URLs are only fetched while open. */
export function RunLightbox({
  target,
  open,
  onOpenChange,
}: {
  target: LightboxTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!target) return null;
  const title =
    target.kind === "composite" ? `Run ${target.run.run_id}` : target.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate font-mono text-sm">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/20 p-2">
          {target.kind === "composite" ? (
            <CompositeView
              run={target.run}
              instances={target.instances}
              open={open}
            />
          ) : (
            <SingleView assetKey={target.assetKey} open={open} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
