"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";

const LOADING_TIMEOUT_MS = 8_000;

function loadingMessage(loadingPhase: "auth" | "profile" | null): string {
  if (loadingPhase === "profile") return "Loading profile…";
  return "Signing in…";
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, loadingPhase, profileError, refreshProfile } = useAuth();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setTimedOut(true);
    }, LOADING_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setTimedOut(false);
    };
  }, [loading]);

  useEffect(() => {
    if (!loading && !profileError && (!user || !profile)) {
      router.replace("/login");
    }
  }, [loading, user, profile, profileError, router]);

  async function handleRetry() {
    setRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setRetrying(false);
    }
  }

  if ((loading || !user || !profile) && !profileError) {
    if (timedOut && loading) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background mesh-background px-6 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            {loadingMessage(loadingPhase)} This is taking longer than expected.
          </p>
          <Button onClick={() => void handleRetry()} disabled={retrying} className="rounded-xl">
            {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry
          </Button>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background mesh-background">
        <Loader2 className="spinner-brand h-8 w-8" />
        <p className="text-sm text-muted-foreground">{loadingMessage(loadingPhase)}</p>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background mesh-background px-6 text-center">
        <p className="max-w-sm text-sm text-destructive">{profileError ?? "Could not load your profile."}</p>
        <div className="flex gap-3">
          <Button onClick={() => void handleRetry()} disabled={retrying} className="rounded-xl">
            {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry
          </Button>
          <Button variant="outline" onClick={() => router.replace("/login")} className="rounded-xl">
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
