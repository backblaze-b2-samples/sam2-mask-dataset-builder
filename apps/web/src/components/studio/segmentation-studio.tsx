"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MousePointerClick,
  Ban,
  Square,
  Sparkles,
  Trash2,
  Layers,
  Film,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SourcePicker } from "./source-picker";
import { PromptCanvas, type PromptMode } from "./prompt-canvas";
import { ApiError, getPreviewUrl } from "@/lib/api-client";
import { useSegmentImage, useSegmentVideo } from "@/lib/queries";
import type {
  BoxPrompt,
  FileMetadata,
  PointPrompt,
  SegmentationRun,
} from "@sam2-mask-dataset-builder/shared";

const MODES: { id: PromptMode; label: string; icon: typeof Square }[] = [
  { id: "foreground", label: "Include point", icon: MousePointerClick },
  { id: "background", label: "Exclude point", icon: Ban },
  { id: "box", label: "Box", icon: Square },
];

export function SegmentationStudio() {
  const [source, setSource] = useState<FileMetadata | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [mode, setMode] = useState<PromptMode>("foreground");
  const [points, setPoints] = useState<PointPrompt[]>([]);
  const [box, setBox] = useState<BoxPrompt | null>(null);
  const [maskUrls, setMaskUrls] = useState<string[]>([]);
  const [run, setRun] = useState<SegmentationRun | null>(null);

  const segmentImageMut = useSegmentImage();
  const segmentVideoMut = useSegmentVideo();

  const isVideo = source?.content_type.startsWith("video/") ?? false;

  // Fetch a preview URL for the chosen source and reset prompt state. This is
  // the documented escape hatch for react-hooks/set-state-in-effect: syncing
  // UI state when an external input (the selected source) changes.
  useEffect(() => {
    if (!source) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    setImageLoading(true);
    setPoints([]);
    setBox(null);
    setMaskUrls([]);
    setRun(null);
    getPreviewUrl(source.key)
      .then(({ url }) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load source preview");
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const resetPrompts = () => {
    setPoints([]);
    setBox(null);
    setMaskUrls([]);
    setRun(null);
  };

  const hasPrompts = points.length > 0 || box !== null;

  const loadMaskOverlays = async (result: SegmentationRun) => {
    // Image runs carry instances directly; video runs carry per-frame masks
    // (we overlay the prompt frame's masks as a preview).
    const instances =
      result.instances.length > 0
        ? result.instances
        : result.frames[0]?.instances ?? [];
    try {
      const urls = await Promise.all(
        instances.map((m) => getPreviewUrl(m.mask_png_key).then((r) => r.url)),
      );
      setMaskUrls(urls);
    } catch {
      // Non-fatal: the run still saved; the dataset explorer shows artifacts.
      toast.warning("Run saved, but mask preview could not be loaded");
    }
  };

  const runSegment = async () => {
    if (!source) return;
    const objects = [{ object_id: 1, points, box }];
    try {
      const result = isVideo
        ? await segmentVideoMut.mutateAsync({ sourceKey: source.key, objects })
        : await segmentImageMut.mutateAsync({ sourceKey: source.key, objects });
      setRun(result);
      await loadMaskOverlays(result);
      toast.success(
        `Saved run ${result.run_id} — ${result.mask_count} mask${result.mask_count === 1 ? "" : "s"} written to B2`,
      );
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : "Segmentation failed";
      toast.error(detail);
    }
  };

  const pending = segmentImageMut.isPending || segmentVideoMut.isPending;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <SourcePicker selectedKey={source?.key ?? null} onSelect={setSource} />
        {isVideo && (
          <Alert>
            <Film className="h-4 w-4" />
            <AlertTitle>Video propagation</AlertTitle>
            <AlertDescription>
              Prompts are placed on the first frame and propagated across the
              clip. This path is heavier — a GPU is recommended.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border py-4 px-5 space-y-0">
          <CardTitle className="card-title">
            {source ? source.filename : "Prompt & segment"}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {MODES.map((m) => (
              <Button
                key={m.id}
                variant={mode === m.id ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setMode(m.id)}
                disabled={!source}
              >
                <m.icon className="h-3.5 w-3.5 mr-1" />
                {m.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <PromptCanvas
            imageUrl={imageUrl}
            loading={imageLoading}
            mode={mode}
            points={points}
            box={box}
            maskUrls={maskUrls}
            onAddPoint={(p) => setPoints((prev) => [...prev, p])}
            onSetBox={setBox}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{points.length} points</Badge>
              <Badge variant="secondary">{box ? "1 box" : "no box"}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetPrompts}
                disabled={!hasPrompts || pending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
              <Button
                size="sm"
                onClick={runSegment}
                disabled={!source || !hasPrompts || pending}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {pending
                  ? "Segmenting..."
                  : isVideo
                    ? "Propagate & save"
                    : "Segment & save"}
              </Button>
            </div>
          </div>

          {run && (
            <Alert>
              <Layers className="h-4 w-4" />
              <AlertTitle>Saved to dataset</AlertTitle>
              <AlertDescription>
                Run <span className="font-mono">{run.run_id}</span> wrote{" "}
                {run.mask_count} mask{run.mask_count === 1 ? "" : "s"} to B2.{" "}
                <Link href="/dataset" className="underline">
                  Open the dataset explorer
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
