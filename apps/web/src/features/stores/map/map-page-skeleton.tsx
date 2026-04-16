import { Skeleton } from '@market/ui';

export function MapPageSkeleton() {
  return (
    <div className="-mx-6 -my-8 flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <div className="flex w-full flex-col gap-2 border-b p-3 lg:w-96 lg:border-b-0 lg:border-r">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="flex-1 bg-muted" />
    </div>
  );
}
