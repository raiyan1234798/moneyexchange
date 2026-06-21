"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function TvPlayerRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    const branch = searchParams.get("branch");
    const branchId = searchParams.get("branchId");
    if (branch) params.set("branch", branch);
    else if (branchId) params.set("branchId", branchId);
    const query = params.toString();
    router.replace(query ? `/display?${query}` : "/display/setup");
  }, [router, searchParams]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#06060a] text-white">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
    </div>
  );
}

export default function TvPlayerRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#06060a] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      }
    >
      <TvPlayerRedirectContent />
    </Suspense>
  );
}
