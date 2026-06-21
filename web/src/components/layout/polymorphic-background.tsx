"use client";

import { usePathname } from "next/navigation";
import { getPageBackground } from "@/lib/page-themes";

export function PolymorphicBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bg = getPageBackground(pathname);

  return (
    <div className="relative min-h-full flex-1 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="animate-blob absolute -left-24 top-0 h-[420px] w-[420px] rounded-[40%_60%_70%_30%/40%_50%_60%_50%] blur-3xl"
          style={{ background: bg.blob1 }}
        />
        <div
          className="animate-blob animation-delay-2000 absolute right-0 top-1/4 h-[380px] w-[380px] rounded-[60%_40%_30%_70%/60%_30%_70%_40%] blur-3xl"
          style={{ background: bg.blob2 }}
        />
        <div
          className="animate-blob animation-delay-4000 absolute bottom-0 left-1/3 h-[360px] w-[360px] rounded-[50%_50%_40%_60%/30%_60%_40%_70%] blur-3xl"
          style={{ background: bg.blob3 }}
        />
      </div>
      <div className="relative z-10 min-h-full">{children}</div>
    </div>
  );
}
