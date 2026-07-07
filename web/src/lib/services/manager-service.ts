import { httpsCallable } from "firebase/functions";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { normalizeEmail } from "@/lib/auth/user-profile";
import { db, functions } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";

function mapFirestoreError(error: unknown, fallback: string): Error {
  const code = (error as { code?: string }).code ?? "";
  if (code === "permission-denied") {
    return new Error("Permission denied. Ensure you are signed in as Super Admin.");
  }
  if (error instanceof Error) return error;
  return new Error(fallback);
}

async function resolveBranchName(branchId: string | null): Promise<string | null> {
  if (!branchId) return null;
  const branchSnap = await getDoc(doc(db, COLLECTIONS.branches, branchId));
  if (!branchSnap.exists()) return null;
  return (branchSnap.data() as { name?: string }).name ?? null;
}

export async function createUserInvite(params: {
  email: string;
  displayName: string;
  role: "admin" | "branchManager" | "branchUser";
  branchId: string | null;
  createdBy: string;
}): Promise<void> {
  const email = normalizeEmail(params.email);
  if (!email) {
    throw new Error("A valid email address is required.");
  }

  if (params.role !== "admin" && !params.branchId) {
    throw new Error("A branch is required for this role.");
  }

  if (params.branchId) {
    const branchSnap = await getDoc(doc(db, COLLECTIONS.branches, params.branchId));
    if (!branchSnap.exists()) {
      throw new Error("Selected branch does not exist. Refresh and try again.");
    }
  }

  const branchName = await resolveBranchName(params.branchId);

  try {
    await setDoc(
      doc(db, COLLECTIONS.userInvites, email),
      {
        email,
        displayName: params.displayName.trim(),
        role: params.role,
        branchId: params.branchId,
        branchName,
        status: "pending",
        createdBy: params.createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    throw mapFirestoreError(error, "Failed to create user invite");
  }
}

export async function updateUserInvite(params: {
  inviteId: string;
  email: string;
  displayName: string;
  role: "admin" | "branchManager" | "branchUser";
  branchId: string | null;
}): Promise<void> {
  const email = normalizeEmail(params.inviteId || params.email);
  if (!email) {
    throw new Error("Invalid invite.");
  }

  if (params.role !== "admin" && !params.branchId) {
    throw new Error("A branch is required for this role.");
  }

  if (params.branchId) {
    const branchSnap = await getDoc(doc(db, COLLECTIONS.branches, params.branchId));
    if (!branchSnap.exists()) {
      throw new Error("Selected branch does not exist. Refresh and try again.");
    }
  }

  const branchName = await resolveBranchName(params.branchId);

  try {
    await updateDoc(doc(db, COLLECTIONS.userInvites, email), {
      email,
      displayName: params.displayName.trim(),
      role: params.role,
      branchId: params.branchId,
      branchName,
      status: "pending",
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw mapFirestoreError(error, "Failed to update invite");
  }
}

export async function approveUserInvite(inviteId: string): Promise<void> {
  const email = normalizeEmail(inviteId);
  if (!email) {
    throw new Error("Invalid invite.");
  }

  try {
    await updateDoc(doc(db, COLLECTIONS.userInvites, email), {
      status: "approved",
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw mapFirestoreError(error, "Failed to approve invite");
  }
}

export async function deleteUserInvite(inviteId: string): Promise<void> {
  const email = normalizeEmail(inviteId);
  if (!email) {
    throw new Error("Invalid invite.");
  }

  try {
    await deleteDoc(doc(db, COLLECTIONS.userInvites, email));
  } catch (error) {
    throw mapFirestoreError(error, "Failed to delete invite");
  }
}

/** @deprecated use createUserInvite */
export async function createBranchManagerInvite(params: {
  email: string;
  displayName: string;
  branchId: string;
  createdBy: string;
}): Promise<void> {
  return createUserInvite({ ...params, role: "branchManager" });
}

export async function provisionUserAccount(params: {
  email: string;
  displayName: string;
  role: "admin" | "branchManager" | "branchUser";
  branchId: string | null;
}): Promise<{ temporaryPassword?: string; message?: string }> {
  const callable = httpsCallable<
    typeof params,
    { temporaryPassword?: string; message?: string }
  >(functions, "createBranchManager");
  const result = await callable(params);
  return result.data;
}

/** @deprecated use provisionUserAccount */
export async function provisionBranchManagerAccount(params: {
  email: string;
  displayName: string;
  branchId: string;
}): Promise<{ temporaryPassword?: string; message?: string }> {
  return provisionUserAccount({ ...params, role: "branchManager" });
}
