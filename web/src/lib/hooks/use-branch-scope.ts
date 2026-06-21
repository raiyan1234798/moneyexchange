"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { subscribeBranches } from "@/lib/services/branch-service";
import { useBranchScopeStore } from "@/lib/stores/branch-scope-store";
import type { Branch } from "@/lib/types";

export function useBranchScope() {
  const { profile, isSuperAdmin, isBranchManager } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const setSelectedBranchId = useBranchScopeStore((s) => s.setSelectedBranchId);

  useEffect(() => {
    const unsubscribe = subscribeBranches((items) => {
      const active = items.filter((b) => b.status === "active");
      setBranches(active);
      if (!selectedBranchId || !active.some((b) => b.id === selectedBranchId)) {
        if (profile?.branchId && active.some((b) => b.id === profile.branchId)) {
          setSelectedBranchId(profile.branchId);
        } else if (active[0]?.id) {
          setSelectedBranchId(active[0].id);
        }
      }
    });
    return unsubscribe;
  }, [profile?.branchId, selectedBranchId, setSelectedBranchId]);

  const managerBranchId = profile?.branchId ?? "";
  const effectiveBranchId = isSuperAdmin ? selectedBranchId : managerBranchId;

  return {
    branches,
    effectiveBranchId,
    selectedBranchId,
    setSelectedBranchId,
    isSuperAdmin,
    isBranchManager,
    managerBranchId,
  };
}

export function useContentPermissions() {
  const { hasPermission } = useAuth();
  return {
    canManageBranches: hasPermission("createBranch"),
    canManageCurrencies: hasPermission("manageCurrencies"),
    canManageRates:
      hasPermission("manageExchangeRates") || hasPermission("manageOwnBranchRates"),
    canManageVideos:
      hasPermission("manageVideos") || hasPermission("manageOwnBranchVideos"),
    canManagePlaylists:
      hasPermission("managePlaylists") || hasPermission("manageOwnBranchPlaylists"),
    canManageTickers:
      hasPermission("manageTickers") || hasPermission("manageOwnBranchTickers"),
    canManageTvs:
      hasPermission("manageTVDevices") || hasPermission("manageOwnBranchTVDevices"),
  };
}
