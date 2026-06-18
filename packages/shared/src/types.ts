export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // Video-specific
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- SAM 2 segmentation ---

export interface PointPrompt {
  type: "point";
  x: number;
  y: number;
  label: 0 | 1; // 1 = foreground (include), 0 = background (exclude)
}

export interface BoxPrompt {
  type: "box";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ObjectPrompt {
  object_id: number;
  points: PointPrompt[];
  box: BoxPrompt | null;
}

export interface SegmentImageRequest {
  source_key: string;
  objects: ObjectPrompt[];
}

export interface SegmentVideoRequest {
  source_key: string;
  objects: ObjectPrompt[];
  prompt_frame: number;
  max_frames: number;
}

export interface MaskInstance {
  object_id: number;
  area_px: number;
  bbox: [number, number, number, number];
  rle_key: string;
  mask_png_key: string;
  cutout_png_key: string | null;
}

export interface FrameMasks {
  frame_index: number;
  instances: MaskInstance[];
}

export interface SegmentationRun {
  run_id: string;
  kind: "image" | "video";
  source_key: string;
  created_at: string;
  model_id: string;
  image_width: number;
  image_height: number;
  instances: MaskInstance[];
  frames: FrameMasks[];
  mask_count: number;
  run_key: string;
}

export interface DatasetSummary {
  run_count: number;
  mask_count: number;
  cutout_count: number;
  source_bytes: number;
  source_human: string;
  derived_bytes: number;
  derived_human: string;
  growth_ratio: number;
}
