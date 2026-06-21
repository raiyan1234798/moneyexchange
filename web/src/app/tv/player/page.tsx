"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function TvPlayerRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const branch = searchParams.get("branch");
    const branchId = searchParams.get("branchId");
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    if (branchId) params.set("branchId", branchId);
    const query = params.toString();
    router.replace(query ? `/display?${query}` : "/display");
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06060a] text-white">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
    </div>
  );
}

export default function TvPlayerRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#06060a] text-white">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      }
    >
      <TvPlayerRedirectContent />
    </Suspense>
  );
}
