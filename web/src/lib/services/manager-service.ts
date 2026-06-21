import { httpsCallable } from "firebase/functions";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { normalizeEmail } from "@/lib/auth/user-profile";
import { db, functions } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";

export async function createBranchManagerInvite(params: {
  email: string;
  displayName: string;
  branchId: string;
  createdBy: string;
}): Promise<void> {
  const email = normalizeEmail(params.email);
  await setDoc(
    doc(db, COLLECTIONS.userInvites, email),
    {
      email,
      displayName: params.displayName.trim(),
      role: "branchManager",
      branchId: params.branchId,
      createdBy: params.createdBy,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function provisionBranchManagerAccount(params: {
  email: string;
  displayName: string;
  branchId: string;
}): Promise<{ temporaryPassword?: string; message?: string }> {
  const callable = httpsCallable<
    typeof params,
    { temporaryPassword?: string; message?: string }
  >(functions, "createBranchManager");
  const result = await callable(params);
  return result.data;
}
