import { Skeleton } from "@/components/ui/skeleton";

export function VideoCardSkeleton() {
  return (
    <div className="bg-card/50 border border-foreground/10 rounded-xl p-4 sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <Skeleton className="w-4 h-4 mt-1 rounded" />
        <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex items-center gap-2 mt-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-1.5 w-16 sm:w-24 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function VideoListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: count }, (_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CalendarSkeleton({ rows = 6, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-5 rounded" />
        ))}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows * cols }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass-card rounded-2xl border border-foreground/10 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full mt-2" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-28 rounded-full" />
        ))}
      </div>
    </section>
  );
}

export function KanbanSkeleton({ columns = 4, cardsPerCol = 2 }: { columns?: number; cardsPerCol?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} className="glass-card rounded-2xl border border-foreground/10 p-3 min-h-[260px] space-y-2">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-foreground/10">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-6" />
          </div>
          {Array.from({ length: cardsPerCol }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
