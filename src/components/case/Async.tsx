// src/components/case/Async.tsx
import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function Async<T>({ state, height = "h-32", children }: {
  state: { data: T | null; loading: boolean; error: Error | null };
  height?: string;
  children: (data: T) => ReactNode;
}) {
  if (state.loading) return <Skeleton className={`${height} w-full`} />;
  if (state.error || !state.data)
    return <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Not available yet.</div>;
  return <>{children(state.data)}</>;
}