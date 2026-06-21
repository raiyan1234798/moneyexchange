"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { subscribeBranch, subscribeBranchByCode } from "@/lib/services/branch-service";
import { DisplayScreen } from "@/components/display/display-screen";

function DisplayContent() {
  const searchParams = useSearchParams();
  const branchCode = searchParams.get("branch") ?? "";
  const branchIdParam = searchParams.get("branchId") ?? "";
  const [codeResolvedId, setCodeResolvedId] = useState("");
  const [codeNotFound, setCodeNotFound] = useState(false);
  const [idParamMissing, setIdParamMissing] = useState(false);

  const resolvedBranchId = branchIdParam || codeResolvedId;

  useEffect(() => {
    if (branchIdParam || !branchCode) return;

    const unsub = subscribeBranchByCode(branchCode, (branch) => {
      if (branch) {
        setCodeResolvedId(branch.id);
        setCodeNotFound(false);
      } else {
        setCodeResolvedId("");
        setCodeNotFound(true);
      }
    });
    return unsub;
  }, [branchCode, branchIdParam]);

  useEffect(() => {
    if (!branchIdParam || branchCode) return;
    const unsub = subscribeBranch(branchIdParam, (branch) => {
      setIdParamMissing(!branch || branch.status !== "active");
    });
    return unsub;
  }, [branchIdParam, branchCode]);

  if (!branchCode && !branchIdParam) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-5 bg-[#06060a] px-6 text-center text-white">
        <p className="text-2xl font-semibold tracking-tight">Display not configured</p>
        <p className="max-w-md text-sm text-zinc-400">
          Open this page with a branch code, e.g.{" "}
          <code className="rounded bg-white/10 px-2 py-1 text-emerald-400">/display?branch=DXB01</code>
        </p>
        <a
          href="/display/setup"
          className="rounded-xl bg-white px-8 py-3.5 text-base font-medium text-black transition-opacity hover:opacity-90"
        >
          Set up display
        </a>
      </div>
    );
  }

  if (codeNotFound || idParamMissing) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#06060a] px-6 text-center text-white">
        <p className="text-2xl font-semibold">Branch not found</p>
        <p className="text-sm text-zinc-400">
          {branchCode ? (
            <>
              No active branch matches code <strong>{branchCode.toUpperCase()}</strong>
            </>
          ) : (
            "This branch is inactive or does not exist"
          )}
        </p>
        <a href="/display/setup" className="text-sm text-emerald-400 underline-offset-4 hover:underline">
          Try another code
        </a>
      </div>
    );
  }

  if (!resolvedBranchId) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#06060a] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return <DisplayScreen branchId={resolvedBranchId} />;
}

export default function DisplayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#06060a] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      }
    >
      <DisplayContent />
    </Suspense>
  );
}
