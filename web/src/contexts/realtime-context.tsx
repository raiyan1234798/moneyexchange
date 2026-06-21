"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type ConnectionState = "connecting" | "live" | "offline";

const RealtimeContext = createContext<ConnectionState>("connecting");

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const ref = doc(db, "settings", "global");
    const unsubscribe = onSnapshot(
      ref,
      () => setStatus("live"),
      () => setStatus("offline"),
    );
    return unsubscribe;
  }, []);

  return <RealtimeContext.Provider value={status}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeStatus() {
  return useContext(RealtimeContext);
}

export function RealtimeBadge() {
  const status = useRealtimeStatus();
  const label =
    status === "live" ? "Live sync" : status === "offline" ? "Offline" : "Connecting";
  const color =
    status === "live"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "offline"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-slate-500/15 text-slate-600 dark:text-slate-300";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ring-current/10 ${color}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status === "live"
            ? "animate-pulse bg-emerald-500"
            : status === "offline"
              ? "bg-amber-500"
              : "animate-pulse bg-slate-400"
        }`}
      />
      {label}
    </span>
  );
}
