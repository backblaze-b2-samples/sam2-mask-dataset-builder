import { UploadForm } from "@/components/upload/upload-form";

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Ingest source media</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Drop source images and video clips into your B2 raw archive (under{" "}
          <span className="font-mono">raw/</span>). Up to 500 MB per file.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <UploadForm />
      </div>
    </div>
  );
}
