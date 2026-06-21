"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

function TvSetupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/display");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06060a] text-white">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
    </div>
  );
}

export default function TvSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#06060a] text-white">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      }
    >
      <TvSetupRedirect />
    </Suspense>
  );
}
