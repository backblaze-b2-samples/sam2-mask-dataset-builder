"use client";

import { Archive, Database, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useDatasetSummary } from "@/lib/queries";

/** The headline B2 story: how a raw media archive grows into a multi-layer
 * labeled dataset. Raw footprint vs derived footprint + growth ratio. */
export function FootprintCard() {
  const { data: summary, isLoading, error, refetch } = useDatasetSummary();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const ratio = summary?.growth_ratio ?? 0;
  const ratioLabel = ratio > 0 ? `${ratio.toFixed(2)}×` : "—";

  return (
    <Card className="card-hover">
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Storage footprint</CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric
            icon={Archive}
            label="Raw archive"
            value={summary?.source_human ?? "0 B"}
            loading={isLoading}
            hint="Ingested source media under raw/"
          />
          <Metric
            icon={Database}
            label="Derived dataset"
            value={summary?.derived_human ?? "0 B"}
            loading={isLoading}
            hint="Masks, cut-outs, run.json under datasets/"
          />
          <Metric
            icon={TrendingUp}
            label="Growth ratio"
            value={ratioLabel}
            loading={isLoading}
            hint="Derived footprint ÷ raw footprint"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  loading,
  hint,
}: {
  icon: typeof Archive;
  label: string;
  value: string;
  loading: boolean;
  hint: string;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <div className="stat-icon-wrap">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <div className="stat-value mt-1">{value}</div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
