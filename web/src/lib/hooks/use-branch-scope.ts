"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { subscribeBranches } from "@/lib/services/branch-service";
import { useBranchScopeStore } from "@/lib/stores/branch-scope-store";
import type { Branch } from "@/lib/types";

function visibleBranchesForRole(
  allActive: Branch[],
  role: string | undefined,
  profileBranchId: string | null | undefined,
): Branch[] {
  if (role === "superAdmin" || role === "admin") return allActive;
  if (profileBranchId) {
    const own = allActive.filter((b) => b.id === profileBranchId);
    if (own.length > 0) return own;
  }
  return [];
}

export function useBranchScope() {
  const { profile, isSuperAdmin, isAdmin, isBranchManager, isBranchUser } = useAuth();
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const setSelectedBranchId = useBranchScopeStore((s) => s.setSelectedBranchId);

  const branches = useMemo(
    () => visibleBranchesForRole(allBranches, profile?.role, profile?.branchId),
    [allBranches, profile?.branchId, profile?.role],
  );

  useEffect(() => {
    const unsubscribe = subscribeBranches((items) => {
      const active = items.filter((b) => b.status === "active");
      setAllBranches(active);

      if (active.length === 0) return;

      const visible = visibleBranchesForRole(active, profile?.role, profile?.branchId);
      const selectionPool = visible.length > 0 ? visible : active;
      const selectionValid =
        selectedBranchId && selectionPool.some((b) => b.id === selectedBranchId);
      if (selectionValid) return;

      if (profile?.branchId && selectionPool.some((b) => b.id === profile.branchId)) {
        setSelectedBranchId(profile.branchId);
      } else if (selectionPool.length === 1) {
        setSelectedBranchId(selectionPool[0].id);
      } else if (isSuperAdmin || isAdmin) {
        if (selectionPool[0]?.id) setSelectedBranchId(selectionPool[0].id);
      }
    });
    return unsubscribe;
  }, [profile?.branchId, profile?.role, selectedBranchId, setSelectedBranchId, isSuperAdmin, isAdmin]);

  const managerBranchId = profile?.branchId ?? "";
  const effectiveBranchId = isSuperAdmin || isAdmin ? selectedBranchId : managerBranchId;

  return {
    branches,
    effectiveBranchId,
    selectedBranchId,
    setSelectedBranchId,
    isSuperAdmin,
    isAdmin,
    isBranchManager,
    isBranchUser,
    managerBranchId,
  };
}

export function useContentPermissions() {
  const { hasPermission } = useAuth();
  return {
    canManageBranches: hasPermission("createBranch"),
    canManageCurrencies: hasPermission("manageCurrencies"),
    canViewRates:
      hasPermission("viewExchangeRates") ||
      hasPermission("manageExchangeRates") ||
      hasPermission("manageOwnBranchRates"),
    canManageRates:
      hasPermission("manageExchangeRates") || hasPermission("manageOwnBranchRates"),
    canManageVideos:
      hasPermission("manageVideos") || hasPermission("manageOwnBranchVideos"),
    canManagePlaylists:
      hasPermission("managePlaylists") || hasPermission("manageOwnBranchPlaylists"),
    canManageTickers:
      hasPermission("manageTickers") || hasPermission("manageOwnBranchTickers"),
    canManageImages: hasPermission("manageImageAdverts"),
    canManageTvs:
      hasPermission("manageTVDevices") || hasPermission("manageOwnBranchTVDevices"),
  };
}
