"use client";

import { cn } from "@/lib/utils";

export function ResponsiveTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-1 overflow-x-auto rounded-[1.25rem]", className)}>
      <div className="min-w-[640px] px-1">{children}</div>
    </div>
  );
}

export function ResponsiveGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 2xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
