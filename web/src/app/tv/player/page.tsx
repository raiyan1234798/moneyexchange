"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DisplayScreen } from "@/components/display/display-screen";
import { heartbeatTvDevice, registerTvDevice } from "@/lib/services/tv-service";
import { getTvSession, saveTvSession } from "@/lib/tv/offline-cache";

function TvPlayerContent() {
  const searchParams = useSearchParams();
  const session = typeof window !== "undefined" ? getTvSession() : null;
  const branchId = searchParams.get("branchId") ?? session?.branchId ?? "";
  const deviceId = searchParams.get("deviceId") ?? session?.deviceId ?? "";

  useEffect(() => {
    if (branchId && deviceId) {
      saveTvSession({ branchId, deviceId });
    }
  }, [branchId, deviceId]);

  useEffect(() => {
    if (!branchId || !deviceId) return;

    void registerTvDevice({
      name: `TV ${deviceId.slice(0, 8)}`,
      branchId,
      deviceToken: deviceId,
    }).catch(() => undefined);

    const heartbeat = window.setInterval(() => {
      void heartbeatTvDevice(deviceId, {
        branchId,
        internetStatus: navigator.onLine ? "connected" : "disconnected",
        storageStatus: "healthy",
      });
    }, 30000);

    return () => {
      window.clearInterval(heartbeat);
    };
  }, [branchId, deviceId]);

  if (!branchId || !deviceId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p className="text-xl">TV not configured</p>
        <a href="/tv/setup" className="rounded-lg bg-white px-6 py-3 text-black font-medium">
          Connect this Android TV
        </a>
      </div>
    );
  }

  return <DisplayScreen branchId={branchId} />;
}

export default function TvPlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-black text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      }
    >
      <TvPlayerContent />
    </Suspense>
  );
}
