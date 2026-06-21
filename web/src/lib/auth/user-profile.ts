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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

export async function ensureUserProfile(firebaseUser: User): Promise<AppUser> {
  const email = normalizeEmail(firebaseUser.email ?? "");
  if (!email) {
    throw new ProfileAccessError("Your account has no email. Contact the administrator.");
  }

  const uid = firebaseUser.uid;
  const userRef = doc(db, COLLECTIONS.users, uid);
  const existingSnap = await getDoc(userRef);

  if (email === normalizeEmail(SUPER_ADMIN_EMAIL)) {
    if (existingSnap.exists()) {
      const profile = { uid, ...existingSnap.data() } as AppUser;
      if (!profile.isActive) {
        throw new ProfileAccessError("Your account is inactive. Contact the administrator.");
      }
      return profile;
    }

    const profileData = {
      email,
      displayName: firebaseUser.displayName || "Super Admin",
      role: "superAdmin" as const,
      branchId: null,
      photoURL: firebaseUser.photoURL ?? null,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, profileData);
    return { uid, ...profileData } as AppUser;
  }

  if (existingSnap.exists()) {
    const profile = { uid, ...existingSnap.data() } as AppUser;
    if (!profile.isActive) {
      throw new ProfileAccessError("Your account is inactive. Contact the administrator.");
    }
    return profile;
  }

  const inviteRef = doc(db, COLLECTIONS.userInvites, email);
  const inviteSnap = await getDoc(inviteRef);
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

  await setDoc(userRef, profileData);
  await deleteDoc(inviteRef).catch(() => undefined);

  return { uid, ...profileData } as AppUser;
}

export async function signOutIfProfileDenied(error: unknown): Promise<void> {
  if (error instanceof ProfileAccessError) {
    await auth.signOut();
  }
}
