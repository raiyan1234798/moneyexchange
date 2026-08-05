"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";

type ConnectionState = "connecting" | "live" | "offline";

const RealtimeContext = createContext<ConnectionState>("connecting");

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionState>("connecting");

  useEffect(() => {
    // The intermittent "Offline" right after login was a RACE: this listener
    // started before auth finished, the read was denied, and a snapshot error
    // KILLS the listener — so the badge stuck on Offline until a full reload.
    // Now: (re)subscribe whenever auth state changes, retry after errors, and
    // only report Offline when the browser genuinely has no network.
    let unsubSnap: (() => void) | null = null;
    let retryTimer: number | null = null;

    const subscribe = () => {
      unsubSnap?.();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      unsubSnap = onSnapshot(
        doc(db, "settings", "global"),
        () => setStatus("live"),
        () => {
          // Denied/errored ≠ network down. Show "Connecting" and retry soon;
          // a real outage is caught by navigator.onLine below.
          setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "connecting");
          retryTimer = window.setTimeout(subscribe, 4000);
        },
      );
    };

    const unsubAuth = onAuthStateChanged(auth, () => subscribe());
    const onOnline = () => subscribe();
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      unsubAuth();
      unsubSnap?.();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
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
