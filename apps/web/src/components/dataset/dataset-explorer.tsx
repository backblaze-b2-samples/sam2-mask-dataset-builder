"use client";

import Link from "next/link";
import { Layers, RefreshCw, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RunCard } from "./run-card";
import { FootprintCard } from "./footprint-card";
import { useRuns } from "@/lib/queries";

/** Scoped explorer: lists derived runs under the DATASET_PREFIX, alongside the
 * raw-vs-derived footprint. The full bucket lives on the Files page. */
export function DatasetExplorer() {
  const { data: runs = [], isLoading, isFetching, error, refetch } = useRuns();

  return (
    <div className="space-y-6">
      <FootprintCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4 px-5 space-y-0">
          <CardTitle className="card-title">Segmentation runs</CardTitle>
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
        <CardContent className="p-5">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No runs yet"
              description="Head to the Studio to prompt a source image and save your first run."
              action={
                <Button asChild size="sm">
                  <Link href="/studio">
                    <Wand2 className="h-3.5 w-3.5 mr-1" />
                    Open Studio
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <RunCard key={run.run_id} run={run} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
