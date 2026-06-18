"use client";

import { ImageIcon, FileVideoIcon, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useSourceFiles } from "@/lib/queries";
import type { FileMetadata } from "@sam2-mask-dataset-builder/shared";

interface SourcePickerProps {
  selectedKey: string | null;
  onSelect: (file: FileMetadata) => void;
}

/** Lists the raw/ ingest archive so the user can pick a source to segment. */
export function SourcePicker({ selectedKey, onSelect }: SourcePickerProps) {
  const { data: files = [], isLoading, isFetching, error, refetch } =
    useSourceFiles();

  // Only media is segmentable; the picker hides any stray non-media keys.
  const media = files.filter(
    (f) =>
      f.content_type.startsWith("image/") || f.content_type.startsWith("video/"),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4 px-5 space-y-0">
        <CardTitle className="card-title">Source media</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="h-7 text-xs"
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : media.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No source media yet"
            description="Ingest images or clips on the Upload page first."
          />
        ) : (
          <div className="space-y-0.5">
            {media.map((file) => {
              const isVideo = file.content_type.startsWith("video/");
              const active = file.key === selectedKey;
              return (
                <button
                  key={file.key}
                  onClick={() => onSelect(file)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                  }`}
                >
                  {isVideo ? (
                    <FileVideoIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-left">{file.filename}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
                    {file.size_human}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
