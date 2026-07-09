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
import { writeAuditLog } from "@/lib/firebase/firestore";
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

/**
 * Update an active user's profile (name / role / branch). Firestore rules:
 * superAdmin may edit anyone; admin may edit non-superAdmin users only and
 * cannot grant superAdmin.
 */
export async function updateUserProfile(
  uid: string,
  data: { displayName: string; role: "admin" | "branchManager" | "branchUser"; branchId: string | null },
  actor: { userId: string; userName: string },
): Promise<void> {
  if (data.role !== "admin" && !data.branchId) {
    throw new Error("A branch is required for this role.");
  }
  try {
    await updateDoc(doc(db, COLLECTIONS.users, uid), {
      displayName: data.displayName.trim(),
      role: data.role,
      branchId: data.role === "admin" ? null : data.branchId,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      action: "user_update",
      entityType: "user",
      entityId: uid,
      userId: actor.userId,
      userName: actor.userName,
      branchId: data.role === "admin" ? null : data.branchId,
      metadata: { role: data.role, displayName: data.displayName.trim() },
    });
  } catch (error) {
    throw mapFirestoreError(error, "Failed to update user");
  }
}

/** Activate / deactivate an account. Deactivated users cannot sign in. */
export async function setUserActive(
  target: { uid: string; branchId?: string | null },
  isActive: boolean,
  actor: { userId: string; userName: string },
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, target.uid), {
      isActive,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      action: isActive ? "user_activated" : "user_deactivated",
      entityType: "user",
      entityId: target.uid,
      userId: actor.userId,
      userName: actor.userName,
      branchId: target.branchId ?? null,
    });
  } catch (error) {
    throw mapFirestoreError(error, "Failed to update user status");
  }
}

/** Super admin only (rules): permanently remove a user profile. */
export async function deleteUserProfile(
  target: { uid: string; email: string; branchId?: string | null },
  actor: { userId: string; userName: string },
): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.users, target.uid));
    await writeAuditLog({
      action: "user_deleted",
      entityType: "user",
      entityId: target.uid,
      userId: actor.userId,
      userName: actor.userName,
      branchId: target.branchId ?? null,
      metadata: { email: target.email },
    });
  } catch (error) {
    throw mapFirestoreError(error, "Failed to delete user");
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
