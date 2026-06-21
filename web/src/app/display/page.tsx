"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Monitor } from "lucide-react";
import { subscribeBranch, subscribeBranchByCode, subscribeBranches } from "@/lib/services/branch-service";
import { DisplayScreen } from "@/components/display/display-screen";
import { BranchSelector } from "@/components/shared/branch-selector";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { getDisplayUrl, getStoredDisplayBranchCode, setStoredDisplayBranchCode } from "@/lib/display-url";
import type { Branch } from "@/lib/types";

function DisplayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: authLoading, isSuperAdmin, isBranchManager } = useAuth();

  const branchCode = searchParams.get("branch")?.trim().toUpperCase() ?? "";
  const branchIdParam = searchParams.get("branchId") ?? "";

  const [codeResolvedId, setCodeResolvedId] = useState("");
  const [codeNotFound, setCodeNotFound] = useState(false);
  const [idParamMissing, setIdParamMissing] = useState(false);
  const [storedCode] = useState(() => getStoredDisplayBranchCode());
  const [storedResolvedId, setStoredResolvedId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [adminBranchId, setAdminBranchId] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    return subscribeBranches((items) => {
      const active = items.filter((b) => b.status === "active");
      setBranches(active);
      if (!adminBranchId && active[0]?.id) {
        setAdminBranchId(active[0].id);
      }
    });
  }, [isSuperAdmin, adminBranchId]);

  useEffect(() => {
    if (branchIdParam || !branchCode) return;

    const unsub = subscribeBranchByCode(branchCode, (branch) => {
      if (branch) {
        setCodeResolvedId(branch.id);
        setCodeNotFound(false);
        setStoredDisplayBranchCode(branch.code);
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
      if (branch?.code) setStoredDisplayBranchCode(branch.code);
    });
    return unsub;
  }, [branchIdParam, branchCode]);

  useEffect(() => {
    if (branchCode || branchIdParam || !storedCode) return;
    const unsub = subscribeBranchByCode(storedCode, (branch) => {
      setStoredResolvedId(branch?.id ?? "");
    });
    return unsub;
  }, [storedCode, branchCode, branchIdParam]);

  const managerBranchId =
    isBranchManager && profile?.branchId ? profile.branchId : "";

  const resolvedBranchId = useMemo(() => {
    if (branchIdParam) return branchIdParam;
    if (branchCode) return codeResolvedId;
    if (managerBranchId) return managerBranchId;
    if (storedResolvedId) return storedResolvedId;
    return "";
  }, [branchIdParam, branchCode, codeResolvedId, managerBranchId, storedResolvedId]);

  function handleAdminLaunch() {
    const branch = branches.find((b) => b.id === adminBranchId);
    if (!branch) return;
    setStoredDisplayBranchCode(branch.code);
    router.replace(getDisplayUrl(branch.code).replace(/^https?:\/\/[^/]+/, ""));
  }

  if (authLoading && !branchCode && !branchIdParam) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#06060a] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  if (codeNotFound || idParamMissing) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-5 bg-[#06060a] px-6 text-center text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-2xl">🏢</div>
        <p className="text-2xl font-semibold">Branch not found</p>
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
          {branchCode ? (
            <>
              No active branch matches code <strong className="text-white">{branchCode}</strong>. An admin must create
              this branch in Dashboard → Branches first.
            </>
          ) : (
            "This branch is inactive or does not exist."
          )}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/display"
            className="rounded-xl border border-white/15 px-6 py-3 text-sm font-medium transition-colors hover:bg-white/5"
          >
            Choose another branch
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-white/10 px-6 py-3 text-sm font-medium transition-colors hover:bg-white/15"
          >
            Sign in to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!resolvedBranchId) {
    if (isSuperAdmin && branches.length > 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#06060a] px-4 text-white">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-2xl">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black">
              <Monitor className="h-7 w-7" />
            </div>
            <h1 className="text-center text-2xl font-semibold tracking-tight">Open Display</h1>
            <p className="mt-2 text-center text-sm text-zinc-400">
              Select a branch to launch signage. Press F11 or use Fullscreen on the display.
            </p>
            <div className="mt-6">
              <BranchSelector
                branches={branches}
                value={adminBranchId}
                onChange={setAdminBranchId}
                label="Branch"
                className="[&_label]:text-zinc-400 [&_button]:border-white/10 [&_button]:bg-black/40 [&_button]:text-white"
              />
            </div>
            <Button className="mt-6 h-12 w-full rounded-2xl" onClick={handleAdminLaunch} disabled={!adminBranchId}>
              Launch Display
            </Button>
            <p className="mt-4 text-center text-xs text-zinc-600">
              Bookmark{" "}
              <code className="text-zinc-400">/display?branch=CODE</code> for kiosk home screens.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-5 bg-[#06060a] px-6 text-center text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
          <Building2 className="h-8 w-8 text-zinc-400" />
        </div>
        <p className="text-2xl font-semibold tracking-tight">Branch display</p>
        <p className="max-w-md text-sm text-zinc-400">
          {isBranchManager ? (
            "Your account is not assigned to a branch yet. Ask an admin to link your manager profile to a branch."
          ) : (
            <>
              Open with a branch code, e.g.{" "}
              <code className="rounded bg-white/10 px-2 py-1 text-emerald-400">/display?branch=DXB01</code>
            </>
          )}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="rounded-xl bg-white px-8 py-3.5 text-base font-medium text-black transition-opacity hover:opacity-90"
          >
            Sign in as manager
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-white/15 px-6 py-3 text-sm font-medium transition-colors hover:bg-white/5"
          >
            Admin sign in
          </Link>
        </div>
      </div>
    );
  }

  if ((branchCode && !codeResolvedId) || (storedCode && !branchCode && !branchIdParam && !managerBranchId && !storedResolvedId)) {
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
