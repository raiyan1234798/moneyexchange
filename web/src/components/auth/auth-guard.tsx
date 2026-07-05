"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.replace("/login");
    }
  }, [loading, user, profile, router]);

  if (loading || !user || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background mesh-background">
        <Loader2 className="spinner-brand h-8 w-8" />
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </div>
    );
  }

  return <>{children}</>;
}
