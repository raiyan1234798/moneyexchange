import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { changeAuthAccountPassword, db } from "@/lib/firebase/client";
import { subscribeCollection, writeAuditLog } from "@/lib/firebase/firestore";
import { normalizeEmail } from "@/lib/auth/user-profile";
import { CLIENT_ADMIN_EMAIL } from "@/lib/constants";

const COLLECTION = "user_credentials";

/** The only people who may see or regenerate the team's sign-in passwords. */
export const CREDENTIAL_MANAGER_EMAILS = [
  normalizeEmail(CLIENT_ADMIN_EMAIL),
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
): Promise<string> {
  const newPassword = generateReadablePassword();
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

/** Forget a stored credential (e.g. after the account was removed). */
export async function deleteCredential(email: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, normalizeEmail(email)));
}
