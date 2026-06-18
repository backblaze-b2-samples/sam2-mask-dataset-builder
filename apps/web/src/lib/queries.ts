"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  deleteFile,
  getDatasetFiles,
  getDatasetSummary,
  getFiles,
  getFileStats,
  getPreviewUrl,
  getRun,
  getRuns,
  getUploadActivity,
  segmentImage,
  segmentVideo,
} from "@/lib/api-client";
import type {
  DatasetSummary,
  FileMetadata,
  ObjectPrompt,
  SegmentationRun,
} from "@sam2-mask-dataset-builder/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  runs: (limit?: number) => [...qk.all, "runs", limit ?? 100] as const,
  run: (runId: string) => [...qk.all, "run", runId] as const,
  datasetSummary: () => [...qk.all, "dataset", "summary"] as const,
  datasetFiles: (prefix?: string) =>
    [...qk.all, "dataset", "files", prefix ?? ""] as const,
};

export function useFiles(prefix = "", limit = 100) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

export function useFileStats() {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
  });
}

// Source media for the Studio picker — scoped to the raw/ ingest prefix.
export function useSourceFiles(prefix = "raw/", limit = 200) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    // After delete, blow away every cached file list + stats. Cheap and
    // correct — the dashboard re-fetches lazily as components remount.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- SAM 2 segmentation + dataset ---

export function useRuns(limit = 100) {
  return useQuery<SegmentationRun[], ApiError>({
    queryKey: qk.runs(limit),
    queryFn: () => getRuns(limit),
  });
}

export function useRun(runId: string | undefined) {
  return useQuery<SegmentationRun, ApiError>({
    queryKey: qk.run(runId ?? ""),
    queryFn: () => getRun(runId as string),
    enabled: !!runId,
  });
}

export function useDatasetSummary() {
  return useQuery<DatasetSummary, ApiError>({
    queryKey: qk.datasetSummary(),
    queryFn: getDatasetSummary,
  });
}

export function useDatasetFiles(prefix = "") {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.datasetFiles(prefix),
    queryFn: () => getDatasetFiles(prefix),
  });
}

// Segmenting writes new derived artifacts to B2, so on success we invalidate
// every cache (runs, dataset summary, file lists) — the dashboard and dataset
// explorer pick up the new run lazily on next read.
export function useSegmentImage() {
  const qc = useQueryClient();
  return useMutation<
    SegmentationRun,
    ApiError,
    { sourceKey: string; objects: ObjectPrompt[] }
  >({
    mutationFn: ({ sourceKey, objects }) => segmentImage(sourceKey, objects),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}

export function useSegmentVideo() {
  const qc = useQueryClient();
  return useMutation<
    SegmentationRun,
    ApiError,
    { sourceKey: string; objects: ObjectPrompt[]; promptFrame?: number; maxFrames?: number }
  >({
    mutationFn: ({ sourceKey, objects, promptFrame, maxFrames }) =>
      segmentVideo(sourceKey, objects, promptFrame, maxFrames),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}
