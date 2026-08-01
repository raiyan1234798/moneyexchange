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
  allBranchForex?: boolean,
): Branch[] {
  if (role === "superAdmin" || role === "admin" || allBranchForex) return allActive;
  if (profileBranchId) {
    const own = allActive.filter((b) => b.id === profileBranchId);
    if (own.length > 0) return own;
  }
  return [];
}

export function useBranchScope() {
  const { profile, hasModule, isSuperAdmin, isAdmin, isBranchManager, isBranchUser } = useAuth();
  // "Forex rates — ALL branches" module: this user may switch to and edit
  // EVERY branch's rates, not just their own.
  const allBranchForex = hasModule("forexRatesAllBranches");
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId);
  const setSelectedBranchId = useBranchScopeStore((s) => s.setSelectedBranchId);

  const branches = useMemo(
    () => visibleBranchesForRole(allBranches, profile?.role, profile?.branchId, allBranchForex),
    [allBranches, profile?.branchId, profile?.role, allBranchForex],
  );

  useEffect(() => {
    const unsubscribe = subscribeBranches((items) => {
      const active = items.filter((b) => b.status === "active");
      setAllBranches(active);

      if (active.length === 0) return;

      const visible = visibleBranchesForRole(active, profile?.role, profile?.branchId, allBranchForex);
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
  }, [profile?.branchId, profile?.role, selectedBranchId, setSelectedBranchId, isSuperAdmin, isAdmin, allBranchForex]);

  const managerBranchId = profile?.branchId ?? "";
  const effectiveBranchId =
    isSuperAdmin || isAdmin || allBranchForex ? selectedBranchId || managerBranchId : managerBranchId;

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
  const { hasPermission, hasModule } = useAuth();
  return {
    canManageBranches: hasPermission("createBranch"),
    canManageCurrencies: hasPermission("manageCurrencies"),
    canViewRates:
      hasPermission("viewExchangeRates") ||
      hasPermission("manageExchangeRates") ||
      hasPermission("manageOwnBranchRates"),
    canManageRates:
      hasPermission("manageExchangeRates") || hasPermission("manageOwnBranchRates"),
    // The Users-page "Access" chips (moduleAccess) unlock these features for
    // any role — the grid must actually grant access (client 2026-08-01).
    canManageVideos:
      hasPermission("manageVideos") || hasPermission("manageOwnBranchVideos") ||
      hasModule("media"),
    canProposeVideos:
      hasPermission("manageVideos") ||
      hasPermission("manageOwnBranchVideos") ||
      hasPermission("proposeOwnBranchVideos"),
    canManagePlaylists:
      hasPermission("managePlaylists") || hasPermission("manageOwnBranchPlaylists"),
    canManageTickers:
      hasPermission("manageTickers") || hasPermission("manageOwnBranchTickers") ||
      hasModule("displayMessages"),
    canManageImages: hasPermission("manageImageAdverts") || hasModule("media"),
    canManageTvs:
      hasPermission("manageTVDevices") || hasPermission("manageOwnBranchTVDevices"),
  };
}
