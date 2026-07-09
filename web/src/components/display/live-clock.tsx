"use client";

import { useEffect, useState } from "react";

/**
 * Live date + time for TV signage. Renders nothing until mounted so the
 * statically-exported HTML never mismatches on hydration.
 */
export function LiveClock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    // First tick is async (setTimeout 0) so no synchronous setState in-effect.
    const kickoff = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  if (!now) return null;

  const date = now
    .toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className={`flex flex-col items-end font-[Arial,Helvetica,sans-serif] leading-tight ${className}`}>
      <span className="text-[clamp(0.55rem,0.9vw,0.8rem)] font-semibold tracking-[0.08em] text-white/75">
        {date}
      </span>
      <span className="text-[clamp(0.8rem,1.4vw,1.25rem)] font-bold tabular-nums text-white">
        {time}
      </span>
    </div>
  );
}
