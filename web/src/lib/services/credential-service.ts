import { doc, setDoc, deleteDoc, serverTimestamp } from "@/lib/d1/firestore-compat";
import { changeAuthAccountPassword, deleteAuthAccount, db } from "@/lib/firebase/client";
import { subscribeCollection, writeAuditLog } from "@/lib/firebase/firestore";
import { normalizeEmail } from "@/lib/auth/user-profile";
import { CLIENT_ADMIN_EMAIL } from "@/lib/constants";

const COLLECTION = "user_credentials";

/** The only people who may see or regenerate the team's sign-in passwords. */
export const CREDENTIAL_MANAGER_EMAILS = [
  normalizeEmail(CLIENT_ADMIN_EMAIL),
  // The client's handover admin uses the DOT spelling — a separate account
  // from CLIENT_ADMIN_EMAIL's dash spelling. Without this it could not see or
  // regenerate team passwords (client 2026-08-07).
  "admin@unimoni.signage.com",
  "mohamedaalthaf@gmail.com",
];

export function canManageCredentials(email: string | null | undefined, isDevSuperAdmin: boolean): boolean {
  if (isDevSuperAdmin) return true;
  const normalized = normalizeEmail(email ?? "");
  return CREDENTIAL_MANAGER_EMAILS.includes(normalized);
}

export interface StoredCredential {
  id: string;
  email: string;
  password: string;
  displayName?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

export function subscribeUserCredentials(
  onData: (items: StoredCredential[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<StoredCredential>(COLLECTION, [], (items) => {
    onData([...items].sort((a, b) => (a.email > b.email ? 1 : -1)));
  }, onError);
}

/** Easy to read out over the phone: letters + digits, no confusing 0/O/1/l. */
export function generateReadablePassword(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `${pick(letters, 4)}${pick(digits, 2)}#${pick(letters, 2)}${pick(digits, 2)}`;
}

/** Remember (or update) the password the owner handed to a team member. */
export async function saveCredential(
  email: string,
  password: string,
  displayName: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  const normalized = normalizeEmail(email);
  await setDoc(
    doc(db, COLLECTION, normalized),
    {
      email: normalized,
      password,
      displayName: displayName.trim(),
      updatedBy: actor.userName,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Generate a NEW password for a team member: signs in as them (secondary app,
 * using the stored current password), updates it, and stores the new one so
 * the owners can always see and share it.
 */
export async function resetUserPassword(
  credential: StoredCredential,
  actor: { userId: string; userName: string },
  /** Owner-chosen password — omitted = generate a readable one. */
  chosenPassword?: string,
): Promise<string> {
  const newPassword = chosenPassword?.trim() || generateReadablePassword();
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
  try {
    await changeAuthAccountPassword(credential.email, credential.password, newPassword);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
      throw new Error(
        "The stored password no longer matches (the user changed it themselves). Ask them for their current password, or recreate their login.",
      );
    }
    if (code === "auth/too-many-requests") {
      throw new Error("Too many attempts — wait a few minutes and try again.");
    }
    throw error instanceof Error ? error : new Error("Could not change the password");
  }
  await saveCredential(credential.email, newPassword, credential.displayName ?? "", actor);
  await writeAuditLog({
    action: "user_password_reset",
    entityType: "user",
    entityId: credential.email,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { email: credential.email },
  });
  return newPassword;
}

/**
 * Change a password login's EMAIL / user ID (owner admins): the login is
 * recreated under the new address with the SAME password and the same profile
 * (role, branch, modules), and the old login is destroyed. The person simply
 * signs in with the new ID from then on.
 */
export async function changeUserEmail(
  credential: StoredCredential,
  newEmailInput: string,
  target: { uid: string } | null,
  actor: { userId: string; userName: string },
): Promise<string> {
  const { completeLoginEmail } = await import("@/lib/auth/user-profile");
  const { createAuthAccount, deleteAuthAccount } = await import("@/lib/firebase/client");
  const { getDoc, setDoc: setDocFs, serverTimestamp: srvTs } = await import("@/lib/d1/firestore-compat");
  const newEmail = completeLoginEmail(newEmailInput);
  if (!newEmail || !newEmail.includes("@")) throw new Error("Enter a valid email or user ID.");
  if (newEmail === normalizeEmail(credential.email)) throw new Error("That is already their sign-in.");

  // 1. New auth account, same password.
  let newUid: string;
  try {
    newUid = await createAuthAccount(newEmail, credential.password);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "auth/email-already-in-use") throw new Error("That email / user ID is already taken.");
    throw error instanceof Error ? error : new Error("Could not create the new login.");
  }

  // 2. Copy the profile to the new uid (role, branch, modules, name intact).
  const oldSnap = target ? await getDoc(doc(db, "users", target.uid)) : null;
  const old = oldSnap?.exists() ? (oldSnap.data() as Record<string, unknown>) : {};
  await setDocFs(doc(db, "users", newUid), {
    email: newEmail,
    displayName: old.displayName ?? credential.displayName ?? newEmail.split("@")[0],
    role: old.role ?? "branchUser",
    branchId: old.branchId ?? null,
    photoURL: old.photoURL ?? null,
    isActive: old.isActive ?? true,
    ...(Array.isArray(old.moduleAccess) && old.moduleAccess.length > 0
      ? { moduleAccess: old.moduleAccess }
      : {}),
    createdAt: srvTs(),
    updatedAt: srvTs(),
  });

  // 3. Destroy the OLD login + profile + vault entry; store the new one.
  await deleteAuthAccount(normalizeEmail(credential.email), credential.password).catch(() => undefined);
  if (target) await deleteDoc(doc(db, "users", target.uid)).catch(() => undefined);
  await saveCredential(newEmail, credential.password, credential.displayName ?? "", actor);
  await deleteCredential(credential.email).catch(() => undefined);
  await writeAuditLog({
    action: "user_email_changed",
    entityType: "user",
    entityId: newUid,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { from: normalizeEmail(credential.email), to: newEmail },
  }).catch(() => undefined);
  return newEmail;
}

/** Forget a stored credential (e.g. after the account was removed). */
export async function deleteCredential(email: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, normalizeEmail(email)));
}

/**
 * PERMANENTLY delete a team member (owner admins only):
 *  1. Their Firebase Auth login is destroyed when we hold their password in the
 *     vault — email/password sign-in stops working immediately.
 *  2. Their profile doc is deleted, so even a Google sign-in with the same
 *     address gets "not invited" and is bounced out.
 *  3. Any open invite and the stored password are removed too.
 * Google-only accounts (no stored password) lose all access via 2+3; their
 * Google identity itself lives at Google and cannot be deleted from here.
 */
export async function deleteUserAccount(
  target: { uid: string; email: string },
  storedPassword: string | null,
  actor: { userId: string; userName: string },
): Promise<{ authDeleted: boolean }> {
  const email = normalizeEmail(target.email);
  let authDeleted = false;
  let authError: string | null = null;
  if (storedPassword) {
    try {
      await deleteAuthAccount(email, storedPassword);
      authDeleted = true;
    } catch (e) {
      // e.g. password changed by the user, or auth/too-many-requests — the
      // profile delete below still cuts off ALL access; keep the reason for
      // the audit trail so a false authDeleted is diagnosable.
      authError = e instanceof Error ? (e as { code?: string }).code ?? e.message : String(e);
    }
  }
  await deleteDoc(doc(db, "users", target.uid));
  await deleteDoc(doc(db, "user_invites", email)).catch(() => undefined);
  await deleteCredential(email).catch(() => undefined);
  await writeAuditLog({
    action: "delete",
    entityType: "user",
    entityId: target.uid,
    userId: actor.userId,
    userName: actor.userName,
    metadata: { email, authDeleted, ...(authError ? { authError } : {}) },
  }).catch(() => undefined);
  return { authDeleted };
}
