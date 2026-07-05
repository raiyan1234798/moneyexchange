import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { COLLECTIONS, SUPER_ADMIN_EMAIL } from "@/lib/constants";
import type { AppUser, UserRole } from "@/lib/types";

export const FIRESTORE_OP_TIMEOUT_MS = 5_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSuperAdminEmail(email: string): boolean {
  return normalizeEmail(email) === normalizeEmail(SUPER_ADMIN_EMAIL);
}

export function withFirestoreTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms = FIRESTORE_OP_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function buildSuperAdminFallbackProfile(firebaseUser: User): AppUser {
  const email = normalizeEmail(firebaseUser.email ?? SUPER_ADMIN_EMAIL);
  const now = new Date();
  return {
    uid: firebaseUser.uid,
    email,
    displayName: firebaseUser.displayName || "Super Admin",
    role: "superAdmin",
    branchId: null,
    photoURL: firebaseUser.photoURL ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export class ProfileAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileAccessError";
  }
}

interface UserInviteData {
  email: string;
  displayName: string;
  role: UserRole;
  branchId?: string | null;
}

async function bootstrapSuperAdminProfile(
  firebaseUser: User,
  existingSnap: Awaited<ReturnType<typeof getDoc>>,
): Promise<AppUser> {
  const email = normalizeEmail(firebaseUser.email ?? "");
  const uid = firebaseUser.uid;
  const userRef = doc(db, COLLECTIONS.users, uid);
  const existing = existingSnap.exists()
    ? (existingSnap.data() as Partial<AppUser>)
    : null;

  const profileData = {
    email,
    displayName: firebaseUser.displayName || existing?.displayName || "Super Admin",
    role: "superAdmin" as const,
    branchId: null,
    photoURL: firebaseUser.photoURL ?? existing?.photoURL ?? null,
    isActive: true,
    updatedAt: serverTimestamp(),
    ...(existing ? {} : { createdAt: serverTimestamp() }),
  };

  await withFirestoreTimeout(
    setDoc(userRef, profileData, { merge: true }),
    "Super admin profile write",
  );

  return {
    uid,
    ...profileData,
    createdAt: existing?.createdAt ?? profileData.createdAt,
  } as AppUser;
}

async function loadSuperAdminProfile(firebaseUser: User): Promise<AppUser> {
  const uid = firebaseUser.uid;
  const userRef = doc(db, COLLECTIONS.users, uid);

  try {
    const existingSnap = await withFirestoreTimeout(getDoc(userRef), "Profile read");
    try {
      return await bootstrapSuperAdminProfile(firebaseUser, existingSnap);
    } catch (writeError) {
      console.warn("Super admin Firestore write failed, using client fallback", writeError);
      return buildSuperAdminFallbackProfile(firebaseUser);
    }
  } catch (readError) {
    console.warn("Super admin Firestore read failed, using client fallback", readError);
    return buildSuperAdminFallbackProfile(firebaseUser);
  }
}

export async function ensureUserProfile(firebaseUser: User): Promise<AppUser> {
  const email = normalizeEmail(firebaseUser.email ?? "");
  if (!email) {
    throw new ProfileAccessError("Your account has no email. Contact the administrator.");
  }

  if (isSuperAdminEmail(email)) {
    const profile = await loadSuperAdminProfile(firebaseUser);
    if (!profile.isActive) {
      throw new ProfileAccessError("Your account is inactive. Contact the administrator.");
    }
    return profile;
  }

  const uid = firebaseUser.uid;
  const userRef = doc(db, COLLECTIONS.users, uid);
  const existingSnap = await withFirestoreTimeout(getDoc(userRef), "Profile read");

  if (existingSnap.exists()) {
    const profile = { uid, ...existingSnap.data() } as AppUser;
    if (!profile.isActive) {
      throw new ProfileAccessError("Your account is inactive. Contact the administrator.");
    }
    return profile;
  }

  const inviteRef = doc(db, COLLECTIONS.userInvites, email);
  const inviteSnap = await withFirestoreTimeout(getDoc(inviteRef), "Invite read");
  if (!inviteSnap.exists()) {
    throw new ProfileAccessError("Contact administrator to get access.");
  }

  const invite = inviteSnap.data() as UserInviteData;
  const profileData = {
    email,
    displayName: invite.displayName || firebaseUser.displayName || email,
    role: invite.role ?? ("branchManager" as const),
    branchId: invite.branchId ?? null,
    photoURL: firebaseUser.photoURL ?? null,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await withFirestoreTimeout(setDoc(userRef, profileData), "Profile create");
  await deleteDoc(inviteRef).catch(() => undefined);

  return { uid, ...profileData } as AppUser;
}

export async function signOutIfProfileDenied(error: unknown): Promise<void> {
  if (error instanceof ProfileAccessError) {
    await auth.signOut();
  }
}
