import { SegmentationStudio } from "@/components/studio/segmentation-studio";

export default function StudioPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Studio</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Pick a source image, drop click and box prompts, and let SAM 2 predict
          masks locally. Saving writes RLE + mask PNGs + cut-outs to B2.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <SegmentationStudio />
      </div>
    </div>
  );
}
