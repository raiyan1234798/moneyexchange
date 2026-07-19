import {
  arrayRemove,
  arrayUnion,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { normalizeFirestoreError } from "@/lib/firebase/firestore-errors";
import { COLLECTIONS } from "@/lib/constants";
import { normalizeEmail } from "@/lib/auth/user-profile";

/** The single doc that holds the video/image upload lock. */
export const UPLOAD_ACCESS_DOC_ID = "uploadAccess";

export interface UploadAccessConfig {
  /** The upload password. Empty string / missing = lock OFF (uploads open). */
  password: string;
  /** Admin emails (lowercased) the owner has granted upload access to. */
  grantedEmails: string[];
  updatedByName?: string;
}

type Actor = { userId: string; userName: string };

function ref() {
  return doc(db, COLLECTIONS.appConfig, UPLOAD_ACCESS_DOC_ID);
}

/**
 * Live-subscribe to the upload lock. Users who are not allowed to read it (not
 * the owner / not granted / not super admin) get a permission-denied error from
 * Firestore — that is expected and simply means "no access", so we report null
 * rather than surfacing an error.
 */
export function subscribeUploadAccess(
  onData: (config: UploadAccessConfig | null) => void,
): Unsubscribe {
  return onSnapshot(
    ref(),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as Partial<UploadAccessConfig>;
      onData({
        password: typeof data.password === "string" ? data.password : "",
        grantedEmails: Array.isArray(data.grantedEmails)
          ? data.grantedEmails.filter((e): e is string => typeof e === "string")
          : [],
        updatedByName: data.updatedByName,
      });
    },
    () => {
      // Permission denied (not authorised) or offline → treat as no access.
      onData(null);
    },
  );
}

/** Set or change the upload password (empty string turns the lock OFF). */
export async function setUploadPassword(password: string, actor: Actor): Promise<void> {
  try {
    await setDoc(
      ref(),
      {
        password: password.trim(),
        updatedByName: actor.userName,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

/** Grant an admin (by email) access to see the password and upload. */
export async function grantUploadAccess(email: string, actor: Actor): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Enter a valid email address.");
  }
  try {
    await setDoc(
      ref(),
      {
        grantedEmails: arrayUnion(normalized),
        updatedByName: actor.userName,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}

/** Remove an admin's upload access. */
export async function revokeUploadAccess(email: string, actor: Actor): Promise<void> {
  const normalized = normalizeEmail(email);
  try {
    await setDoc(
      ref(),
      {
        grantedEmails: arrayRemove(normalized),
        updatedByName: actor.userName,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    throw normalizeFirestoreError(error);
  }
}
