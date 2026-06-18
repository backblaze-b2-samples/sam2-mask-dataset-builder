"use client";

import { Layers, Boxes, Scissors, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useDatasetSummary } from "@/lib/queries";

export function StatsCards() {
  const { data: summary, isLoading, error, refetch } = useDatasetSummary();

  // Surface fetch failures inline rather than rendering zeros — that would
  // lie about the dataset state when really the API is just unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { title: "Segmentation Runs", value: summary?.run_count ?? 0, icon: Layers },
    { title: "Masks Generated", value: summary?.mask_count ?? 0, icon: Boxes },
    { title: "Cut-out Instances", value: summary?.cutout_count ?? 0, icon: Scissors },
    { title: "Derived Dataset", value: summary?.derived_human ?? "0 B", icon: Database },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="stat-value">{card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
