"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, ChevronDown, ChevronRight, Layers, Film, ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiError, getDownloadUrl } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { SegmentationRun } from "@sam2-mask-dataset-builder/shared";
import { PreviewImage, RunPreview, instancesOf } from "./run-preview";

async function download(key: string) {
  try {
    const { url } = await getDownloadUrl(key);
    window.open(url, "_blank");
  } catch (err) {
    const detail = err instanceof ApiError ? err.message : "Download failed";
    toast.error(detail);
  }
}

export function RunCard({ run }: { run: SegmentationRun }) {
  const [open, setOpen] = useState(false);
  const instances = instancesOf(run);

  return (
    <Card>
      <CardContent className="p-0">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-accent/40 transition-colors"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          {run.kind === "video" ? (
            <Film className="h-4 w-4 shrink-0 text-[var(--attention)]" />
          ) : (
            <ImageIcon className="h-4 w-4 shrink-0 text-[var(--attention)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">{run.run_id}</span>
              <Badge variant="secondary" className="text-[10px]">
                {run.kind}
              </Badge>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {run.source_key} · {formatDate(run.created_at)}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <Layers className="h-3.5 w-3.5" />
            {run.mask_count} mask{run.mask_count === 1 ? "" : "s"}
          </div>
        </button>

        {open && (
          <div className="border-t border-border px-5 py-4 space-y-3">
            {run.kind === "image" ? (
              <RunPreview run={run} enabled={open} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Video run — per-object cut-outs from the prompt frame are shown
                below.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => download(run.run_key)}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                run.json
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => download(run.source_key)}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Source
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {instances.map((m) => (
                <div
                  key={m.object_id}
                  className="rounded-md border border-border p-3 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Object {m.object_id}</span>
                    <span className="font-mono text-muted-foreground">
                      {m.area_px.toLocaleString()} px
                    </span>
                  </div>
                  {/* Cut-out shows the object on transparent bg; fall back to
                      the mask silhouette when no cut-out was written. */}
                  <div className="h-28 w-full overflow-hidden rounded bg-muted/30">
                    <PreviewImage
                      assetKey={m.cutout_png_key ?? m.mask_png_key}
                      enabled={open}
                      alt={`Object ${m.object_id} preview`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => download(m.rle_key)}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      RLE
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => download(m.mask_png_key)}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Mask PNG
                    </Button>
                    {m.cutout_png_key && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => download(m.cutout_png_key as string)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Cut-out
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
