import Link from "next/link";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatasetExplorer } from "@/components/dataset/dataset-explorer";

export default function DatasetPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Dataset</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Derived segmentation runs, scoped to the dataset prefix on B2.
            Browse the full bucket on the Files page.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/studio">
            <Wand2 className="h-3.5 w-3.5" />
            New run
          </Link>
        </Button>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <DatasetExplorer />
      </div>
    </div>
  );
}
