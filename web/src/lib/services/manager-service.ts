import { httpsCallable } from "firebase/functions";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
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

export async function createUserInvite(params: {
  email: string;
  displayName: string;
  role: "admin" | "branchManager" | "branchUser";
  branchId: string | null;
  createdBy: string;
}): Promise<void> {
  const email = normalizeEmail(params.email);
  try {
    await setDoc(
      doc(db, COLLECTIONS.userInvites, email),
      {
        email,
        displayName: params.displayName.trim(),
        role: params.role,
        branchId: params.branchId,
        createdBy: params.createdBy,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    throw mapFirestoreError(error, "Failed to create user invite");
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
