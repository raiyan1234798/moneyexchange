import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BranchScopeState {
  selectedBranchId: string;
  setSelectedBranchId: (branchId: string) => void;
}

export const useBranchScopeStore = create<BranchScopeState>()(
  persist(
    (set) => ({
      selectedBranchId: "",
      setSelectedBranchId: (branchId) => set({ selectedBranchId: branchId }),
    }),
    { name: "moneyexchange-branch-scope" },
  ),
);
