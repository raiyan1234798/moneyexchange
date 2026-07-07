import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentReference,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";
import { bootstrapInvitedUserProfile } from "@/lib/auth/bootstrap-invited-user";
import { auth, db } from "@/lib/firebase/client";
import { COLLECTIONS, SUPER_ADMIN_EMAIL } from "@/lib/constants";
import type { AppUser, UserRole } from "@/lib/types";

const profileLoadByUid = new Map<string, Promise<ProfileLoadResult>>();

export const FIRESTORE_OP_TIMEOUT_MS = 12_000;

const LOG_PREFIX = "[unimoni-auth]";

export interface ProfileLoadResult {
  profile: AppUser;
  acceptedInvite: boolean;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSuperAdminEmail(email: string): boolean {
  return normalizeEmail(email) === normalizeEmail(SUPER_ADMIN_EMAIL);
}

function authLog(step: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.info(`${LOG_PREFIX} ${step}`, detail);
    return;
  }
  console.info(`${LOG_PREFIX} ${step}`);
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
  readonly step: string;

  constructor(message: string, step = "unknown") {
    super(message);
    this.name = "ProfileAccessError";
    this.step = step;
  }
}

interface UserInviteData {
  email: string;
  displayName: string;
  role?: UserRole;
  branchId?: string | null;
  status?: "pending" | "approved";
}

interface PendingInvite {
  ref: DocumentReference;
  data: UserInviteData;
}

function isPermissionDenied(error: unknown): boolean {
  if (error instanceof FirebaseError && error.code === "permission-denied") return true;
  if (error instanceof Error && /insufficient permissions|permission.denied/i.test(error.message)) {
    return true;
  }
  return false;
}

function isInviteOpen(invite: UserInviteData): boolean {
  return !invite.status || invite.status === "pending" || invite.status === "approved";
}

function resolveInviteRole(invite: UserInviteData): UserRole {
  return invite.role ?? "branchManager";
}

function resolveInviteBranchId(role: UserRole, invite: UserInviteData): string | null {
  if (role === "admin") return null;
  const branchId = invite.branchId;
  if (branchId == null || branchId === "") return null;
  return branchId;
}

async function findPendingInvite(email: string): Promise<PendingInvite | null> {
  const directRef = doc(db, COLLECTIONS.userInvites, email);
  authLog("invite lookup by doc id", email);
  const directSnap = await withFirestoreTimeout(getDoc(directRef), "Invite read (by id)");
  if (directSnap.exists()) {
    const data = directSnap.data() as UserInviteData;
    if (isInviteOpen(data)) {
      authLog("invite found by doc id", { id: directSnap.id, role: data.role, branchId: data.branchId });
      return { ref: directRef, data };
    }
    authLog("invite exists but is not open", { id: directSnap.id, status: data.status });
    return null;
  }

  authLog("invite not at doc id, querying by email field", email);
  const inviteQuery = query(
    collection(db, COLLECTIONS.userInvites),
    where("email", "==", email),
    limit(1),
  );
  const querySnap = await withFirestoreTimeout(getDocs(inviteQuery), "Invite lookup (by email)");
  if (querySnap.empty) {
    authLog("no invite found", email);
    return null;
  }

  const match = querySnap.docs[0];
  const data = match.data() as UserInviteData;
  if (!isInviteOpen(data)) {
    authLog("invite query match is not open", { id: match.id, status: data.status });
    return null;
  }

  authLog("invite found by email query", { id: match.id, role: data.role, branchId: data.branchId });
  return { ref: match.ref, data };
}

function validateInviteShape(email: string, pendingInvite: PendingInvite): UserRole {
  const invite = pendingInvite.data;
  const inviteEmail = invite.email ? normalizeEmail(invite.email) : "";
  if (!inviteEmail || inviteEmail !== email) {
    throw new ProfileAccessError(
      "Invite misconfigured — contact your admin to delete and re-send your invite.",
      "invite-email-mismatch",
    );
  }

  if (pendingInvite.ref.id !== email) {
    authLog("invite doc id mismatch — will use server bootstrap if client write fails", {
      docId: pendingInvite.ref.id,
      email,
    });
  }

  const role = resolveInviteRole(invite);
  if (!["admin", "branchManager", "branchUser"].includes(role)) {
    throw new ProfileAccessError(
      "Invite misconfigured — invalid role. Contact your admin.",
      "invite-invalid-role",
    );
  }

  if (role !== "admin") {
    const branchId = resolveInviteBranchId(role, invite);
    if (!branchId) {
      throw new ProfileAccessError(
        "Invite misconfigured — missing branch assignment. Contact your admin.",
        "invite-missing-branch",
      );
    }
  }

  return role;
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

async function loadSuperAdminProfile(firebaseUser: User): Promise<ProfileLoadResult> {
  const uid = firebaseUser.uid;
  const userRef = doc(db, COLLECTIONS.users, uid);

  try {
    const existingSnap = await withFirestoreTimeout(getDoc(userRef), "Profile read");
    try {
      const profile = await bootstrapSuperAdminProfile(firebaseUser, existingSnap);
      return { profile, acceptedInvite: false };
    } catch (writeError) {
      console.warn(`${LOG_PREFIX} super admin Firestore write failed, using client fallback`, writeError);
      return { profile: buildSuperAdminFallbackProfile(firebaseUser), acceptedInvite: false };
    }
  } catch (readError) {
    console.warn(`${LOG_PREFIX} super admin Firestore read failed, using client fallback`, readError);
    return { profile: buildSuperAdminFallbackProfile(firebaseUser), acceptedInvite: false };
  }
}

function mapProfileFirestoreError(error: unknown, step: string): Error {
  if (error instanceof ProfileAccessError) return error;
  if (isPermissionDenied(error)) {
    console.error(`${LOG_PREFIX} Firestore permission denied during: ${step}`, error);
    if (step.startsWith("Invite")) {
      return new ProfileAccessError(
        "No access — sign in with the exact Gmail address your admin invited, then try again.",
        step,
      );
    }
    if (step === "Profile create" || step === "Profile verify") {
      return new ProfileAccessError(
        "Could not finish sign-in — your invite may need to be re-sent. Ask your admin to check the Users page.",
        step,
      );
    }
    return new ProfileAccessError(
      `Sign-in blocked at "${step}". Ask your admin to verify your invite on the Users page.`,
      step,
    );
  }
  if (error instanceof Error) {
    console.error(`${LOG_PREFIX} Firestore error during: ${step}`, error);
    return error;
  }
  return new Error("Could not load your profile.");
}

async function runFirestoreStep<T>(label: string, operation: () => Promise<T>): Promise<T> {
  authLog(`step start: ${label}`);
  try {
    const value = await withFirestoreTimeout(operation(), label);
    authLog(`step ok: ${label}`);
    return value;
  } catch (error) {
    authLog(`step failed: ${label}`, error);
    throw mapProfileFirestoreError(error, label);
  }
}

async function createProfileFromInvite(
  firebaseUser: User,
  pendingInvite: PendingInvite,
  role: UserRole,
  branchId: string | null,
): Promise<ProfileLoadResult> {
  const uid = firebaseUser.uid;
  const email = normalizeEmail(firebaseUser.email ?? "");
  const userRef = doc(db, COLLECTIONS.users, uid);
  const invite = pendingInvite.data;

  authLog("bootstrapping invited user profile (client first)", { uid, email, role, branchId });

  const profileData = {
    email,
    displayName: invite.displayName || firebaseUser.displayName || email,
    role,
    branchId,
    photoURL: firebaseUser.photoURL ?? null,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await runFirestoreStep("Profile create", () => setDoc(userRef, profileData));

    const createdSnap = await runFirestoreStep("Profile verify", () => getDoc(userRef));
    if (!createdSnap.exists()) {
      throw new ProfileAccessError("Profile setup failed. Contact the administrator.", "Profile verify");
    }

    await runFirestoreStep("Invite cleanup", () => deleteDoc(pendingInvite.ref)).catch(() => undefined);

    authLog("profile created via client", { uid, role, branchId });
    return {
      profile: { uid, ...createdSnap.data() } as AppUser,
      acceptedInvite: true,
    };
  } catch (error) {
    const shouldBootstrap =
      isPermissionDenied(error) ||
      (error instanceof ProfileAccessError &&
        (error.step === "Profile create" || error.step === "Profile verify")) ||
      pendingInvite.ref.id !== email;

    if (!shouldBootstrap) throw error;

    authLog("client profile create failed — calling bootstrapInvitedUser", {
      uid,
      email,
      reason: error instanceof Error ? error.message : error,
    });

    try {
      const bootstrapped = await bootstrapInvitedUserProfile();
      authLog("profile created via cloud function", {
        uid: bootstrapped.profile.uid,
        role: bootstrapped.profile.role,
      });
      return bootstrapped;
    } catch (bootstrapError) {
      console.error(`${LOG_PREFIX} bootstrapInvitedUser failed`, bootstrapError);
      const code = (bootstrapError as { code?: string }).code ?? "";
      // "functions/internal" is how an undeployed callable surfaces (CORS
      // preflight fails before any function code runs).
      if (code === "functions/not-found" || code === "functions/unavailable" || code === "functions/internal") {
        throw new ProfileAccessError(
          "Could not finish sign-in — ask your admin to delete and re-send your invite, then try Google sign-in again.",
          "bootstrap-unavailable",
        );
      }
      throw error instanceof ProfileAccessError
        ? error
        : mapProfileFirestoreError(error, "Profile create");
    }
  }
}

export async function ensureUserProfile(firebaseUser: User): Promise<ProfileLoadResult> {
  const uid = firebaseUser.uid;
  const inFlight = profileLoadByUid.get(uid);
  if (inFlight) {
    authLog("profile load already in flight, awaiting", uid);
    return inFlight;
  }

  const loadPromise = ensureUserProfileOnce(firebaseUser).finally(() => {
    profileLoadByUid.delete(uid);
  });

  profileLoadByUid.set(uid, loadPromise);
  return loadPromise;
}

async function ensureUserProfileOnce(firebaseUser: User): Promise<ProfileLoadResult> {
  const email = normalizeEmail(firebaseUser.email ?? "");
  authLog("ensureUserProfile", { uid: firebaseUser.uid, email });

  if (!email) {
    throw new ProfileAccessError("Your account has no email. Contact the administrator.", "no-email");
  }

  if (isSuperAdminEmail(email)) {
    authLog("super admin path");
    const result = await loadSuperAdminProfile(firebaseUser);
    if (!result.profile.isActive) {
      throw new ProfileAccessError("Your account is inactive. Contact the administrator.", "inactive");
    }
    return result;
  }

  const uid = firebaseUser.uid;
  const userRef = doc(db, COLLECTIONS.users, uid);
  const existingSnap = await runFirestoreStep("Profile read", () => getDoc(userRef));

  if (existingSnap.exists()) {
    authLog("existing profile found", uid);
    const profile = { uid, ...existingSnap.data() } as AppUser;
    if (!profile.isActive) {
      throw new ProfileAccessError("Your account is inactive. Contact the administrator.", "inactive");
    }
    return { profile, acceptedInvite: false };
  }

  const pendingInvite = await runFirestoreStep("Invite read", () => findPendingInvite(email));

  if (!pendingInvite) {
    throw new ProfileAccessError(
      "No access — ask your admin to invite you with this Gmail address, then sign in at /login with Google.",
      "no-invite",
    );
  }

  const role = validateInviteShape(email, pendingInvite);
  const branchId = resolveInviteBranchId(role, pendingInvite.data);

  return createProfileFromInvite(firebaseUser, pendingInvite, role, branchId);
}

export async function signOutIfProfileDenied(error: unknown): Promise<void> {
  if (error instanceof ProfileAccessError) {
    authLog("signing out after profile access error", error instanceof ProfileAccessError ? error.step : "unknown");
    await auth.signOut();
  }
}
