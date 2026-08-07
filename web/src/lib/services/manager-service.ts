import { httpsCallable } from "firebase/functions";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "@/lib/d1/firestore-compat";
import { normalizeEmail } from "@/lib/auth/user-profile";
import { createAuthAccount, db, functions } from "@/lib/firebase/client";
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
  /** Custom module picks — omitted/null means "use the role defaults". */
  moduleAccess?: string[] | null;
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
        ...(params.moduleAccess && params.moduleAccess.length > 0
          ? { moduleAccess: params.moduleAccess }
          : {}),
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
 * Admin creates a ready-to-use email/password login: the auth account is made
 * on a throwaway secondary app (admin session untouched) and the users/{uid}
 * profile is written directly — the person can sign in immediately, no invite
 * or email verification needed. Rules: superAdmin/admin only, never superAdmin
 * role.
 */
export async function createPasswordUser(
  params: {
    email: string;
    password: string;
    displayName: string;
    role: "admin" | "branchManager" | "branchUser";
    branchId: string | null;
    /** Custom module picks — omitted/null means "use the role defaults". */
    moduleAccess?: string[] | null;
  },
  actor: { userId: string; userName: string },
): Promise<void> {
  const email = normalizeEmail(params.email);
  if (!email) throw new Error("A valid email address is required.");
  if (params.password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (params.role !== "admin" && !params.branchId) throw new Error("A branch is required for this role.");

  let uid: string;
  try {
    uid = await createAuthAccount(email, params.password);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "auth/email-already-in-use") {
      throw new Error("An account with this email already exists — use Google invite or a different email.");
    }
    if (code === "auth/weak-password") {
      throw new Error("Password is too weak — use at least 8 characters with numbers.");
    }
    throw error instanceof Error ? error : new Error("Failed to create the login.");
  }

  try {
    await setDoc(doc(db, COLLECTIONS.users, uid), {
      email,
      displayName: params.displayName.trim() || email.split("@")[0],
      role: params.role,
      branchId: params.role === "admin" ? null : params.branchId,
      photoURL: null,
      isActive: true,
      ...(params.moduleAccess && params.moduleAccess.length > 0
        ? { moduleAccess: params.moduleAccess }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw mapFirestoreError(error, "Login created but profile setup failed — contact support");
  }

  await writeAuditLog({
    action: "user_created_password",
    entityType: "user",
    entityId: uid,
    userId: actor.userId,
    userName: actor.userName,
    branchId: params.role === "admin" ? null : params.branchId,
    metadata: { email, role: params.role },
  });
}

/**
 * Update an active user's profile (name / role / branch). Firestore rules:
 * superAdmin may edit anyone; admin may edit non-superAdmin users only and
 * cannot grant superAdmin.
 */
export async function updateUserProfile(
  uid: string,
  data: {
    displayName: string;
    role: "admin" | "branchManager" | "branchUser";
    branchId: string | null;
    /** Custom module picks — undefined leaves the stored value untouched. */
    moduleAccess?: string[];
  },
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
      ...(data.moduleAccess !== undefined ? { moduleAccess: data.moduleAccess } : {}),
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
