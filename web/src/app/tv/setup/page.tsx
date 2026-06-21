"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";

function TvSetupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/display/setup");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06060a] text-white">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
    </div>
  );
}

export default function TvSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#06060a] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      }
    >
      <TvSetupRedirect />
    </Suspense>
  );
}
