"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import {
  buildSuperAdminFallbackProfile,
  ensureUserProfile,
  isSuperAdminEmail,
  ProfileAccessError,
  signOutIfProfileDenied,
  withFirestoreTimeout,
} from "@/lib/auth/user-profile";
import { toast } from "sonner";
import { writeAuditLog } from "@/lib/firebase/firestore";
import { COLLECTIONS, MODULE_DEFAULTS_BY_ROLE,
} from "@/lib/constants";
import type { AppUser, UserRole } from "@/lib/types";
import {
  BRANCH_MANAGER_PERMISSIONS,
  BRANCH_USER_PERMISSIONS,
  ADMIN_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
} from "@/lib/constants";

export type AuthLoadingPhase = "auth" | "profile" | "redirect" | null;

const GOOGLE_SIGN_IN_PENDING_KEY = "googleSignInPending";
const LOG_PREFIX = "[unimoni-auth]";

interface AuthContextValue {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  loadingPhase: AuthLoadingPhase;
  profileError: string | null;
  permissions: string[];
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  /** Module access: custom per-user picks override the role defaults. */
  hasModule: (moduleKey: string) => boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isBranchManager: boolean;
  isBranchUser: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_LOAD_TIMEOUT_MS = 15_000;
const REDIRECT_BOOTSTRAP_TIMEOUT_MS = 15_000;
const AUTH_LOADING_SAFETY_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
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

async function finalizeLogin(firebaseUser: User, profile: AppUser): Promise<void> {
  await withFirestoreTimeout(
    updateDoc(doc(db, COLLECTIONS.users, firebaseUser.uid), {
      lastLoginAt: serverTimestamp(),
    }),
    "Login timestamp update",
  ).catch(() => undefined);

  await writeAuditLog({
    action: "login",
    entityType: "auth",
    userId: firebaseUser.uid,
    userName: profile.displayName || firebaseUser.email || "Unknown",
    branchId: profile.branchId ?? null,
  }).catch(() => undefined);
}

async function resolveUserProfile(firebaseUser: User): Promise<{ profile: AppUser; acceptedInvite: boolean }> {
  try {
    return await withTimeout(
      ensureUserProfile(firebaseUser),
      PROFILE_LOAD_TIMEOUT_MS,
      "Profile load timed out",
    );
  } catch (error) {
    const email = firebaseUser.email ?? "";
    if (email && isSuperAdminEmail(email)) {
      console.warn(`${LOG_PREFIX} profile load failed for super admin, using fallback`, error);
      return { profile: buildSuperAdminFallbackProfile(firebaseUser), acceptedInvite: false };
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<AuthLoadingPhase>("auth");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [redirectReady, setRedirectReady] = useState(false);
  const authGenerationRef = useRef(0);
  const pendingLoginFinalizeRef = useRef<Set<string>>(new Set());

  const loadProfileForUser = useCallback(async (firebaseUser: User) => {
    const generation = ++authGenerationRef.current;
    setLoading(true);
    setLoadingPhase("profile");
    setProfileError(null);

    console.info(`${LOG_PREFIX} loading profile`, { uid: firebaseUser.uid, email: firebaseUser.email });

    try {
      const { profile: userProfile, acceptedInvite } = await resolveUserProfile(firebaseUser);
      if (generation !== authGenerationRef.current) return;
      setProfile(userProfile);

      const wasGoogleRedirect = sessionStorage.getItem(GOOGLE_SIGN_IN_PENDING_KEY) === "1";
      if (wasGoogleRedirect) {
        sessionStorage.removeItem(GOOGLE_SIGN_IN_PENDING_KEY);
        toast.success(
          acceptedInvite ? "Welcome! Your account is ready." : "Welcome back",
        );
      }

      if (pendingLoginFinalizeRef.current.delete(firebaseUser.uid)) {
        await finalizeLogin(firebaseUser, userProfile).catch(() => undefined);
      }

      console.info(`${LOG_PREFIX} profile ready`, {
        uid: userProfile.uid,
        role: userProfile.role,
        acceptedInvite,
      });
    } catch (error) {
      if (generation !== authGenerationRef.current) return;
      sessionStorage.removeItem(GOOGLE_SIGN_IN_PENDING_KEY);
      console.error(`${LOG_PREFIX} failed to load user profile`, error);
      const message =
        error instanceof ProfileAccessError
          ? error.message
          : error instanceof Error && error.message === "Profile load timed out"
            ? "Sign-in timed out. Check your connection and try again."
            : "Could not load your profile. Please try again.";

      setProfileError(message);
      if (error instanceof ProfileAccessError) {
        toast.error(error.message);
      } else if (error instanceof Error && error.message === "Profile load timed out") {
        toast.error(message);
      }

      await signOutIfProfileDenied(error);
      setProfile(null);
    } finally {
      if (generation === authGenerationRef.current) {
        setLoading(false);
        setLoadingPhase(null);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function handleRedirectResult() {
      const pendingGoogle = sessionStorage.getItem(GOOGLE_SIGN_IN_PENDING_KEY) === "1";
      if (pendingGoogle) {
        setLoading(true);
        setLoadingPhase("redirect");
      }

      console.info(`${LOG_PREFIX} awaiting getRedirectResult`, { pendingGoogle });

      try {
        const result = await withTimeout(
          getRedirectResult(auth),
          REDIRECT_BOOTSTRAP_TIMEOUT_MS,
          "Redirect sign-in timed out",
        );
        if (result?.user) {
          console.info(`${LOG_PREFIX} redirect sign-in completed`, {
            uid: result.user.uid,
            email: result.user.email,
          });
          pendingLoginFinalizeRef.current.add(result.user.uid);
        } else if (auth.currentUser) {
          console.info(`${LOG_PREFIX} no redirect result but auth.currentUser exists — continuing`, {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
          });
          if (pendingGoogle) {
            pendingLoginFinalizeRef.current.add(auth.currentUser.uid);
          }
        } else if (pendingGoogle) {
          // Redirect fallback came back with no result and no signed-in user —
          // a storage-partitioned browser (Safari, in-app webviews) lost it.
          // Clear the stale flag and tell the user, otherwise they bounce back
          // to the form with zero feedback and every later load in this tab
          // flashes "Finishing sign-in…".
          console.warn(`${LOG_PREFIX} pending Google sign-in but no redirect result — likely blocked`);
          sessionStorage.removeItem(GOOGLE_SIGN_IN_PENDING_KEY);
          const message =
            "Sign-in could not complete in this browser. Allow popups for this site and try again, or open unimoni-6va.pages.dev in Chrome.";
          setProfileError(message);
          setLoading(false);
          setLoadingPhase(null);
          toast.error(message);
        } else {
          console.info(`${LOG_PREFIX} no redirect result (normal page load)`);
        }
      } catch (error) {
        const currentUser = auth.currentUser;
        if (currentUser) {
          console.warn(`${LOG_PREFIX} redirect bootstrap error but user signed in — continuing`, error);
          if (pendingGoogle) {
            pendingLoginFinalizeRef.current.add(currentUser.uid);
          }
        } else {
          sessionStorage.removeItem(GOOGLE_SIGN_IN_PENDING_KEY);
          if (error instanceof FirebaseError) {
            if (error.code === "auth/popup-closed-by-user") return;
            if (error.code === "auth/cancelled-popup-request") return;
          }
          console.error(`${LOG_PREFIX} Google redirect sign-in failed`, error);
          const message =
            error instanceof FirebaseError && error.code === "auth/account-exists-with-different-credential"
              ? "This email was set up with a password. Ask your admin to delete the old account and re-invite you for Google sign-in."
              : error instanceof Error && error.message === "Redirect sign-in timed out"
                ? "Google sign-in timed out. Check your connection and try again."
                : error instanceof Error
                  ? error.message
                  : "Google sign-in failed";
          setProfileError(message);
          setLoading(false);
          setLoadingPhase(null);
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          console.info(`${LOG_PREFIX} redirect bootstrap complete`, {
            hasUser: Boolean(auth.currentUser),
          });
          setRedirectReady(true);
        }
      }
    }

    void handleRedirectResult();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!redirectReady) return;

    console.info(`${LOG_PREFIX} subscribing to onAuthStateChanged`);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        authGenerationRef.current += 1;
        setProfile(null);
        setProfileError(null);
        setLoading(false);
        setLoadingPhase(null);
        return;
      }

      void loadProfileForUser(firebaseUser);
    });

    return unsubscribe;
  }, [loadProfileForUser, redirectReady]);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setLoadingPhase(null);
      setProfileError((current) => current ?? "Sign-in is taking longer than expected. Please retry.");
    }, AUTH_LOADING_SAFETY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const permissions = useMemo<string[]>(() => {
    if (!profile) return [];
    switch (profile.role) {
      case "superAdmin":
        return [...SUPER_ADMIN_PERMISSIONS];
      case "admin":
        return [...ADMIN_PERMISSIONS];
      case "branchManager":
        return [...BRANCH_MANAGER_PERMISSIONS];
      case "branchUser":
        return [...BRANCH_USER_PERMISSIONS];
      default:
        return [];
    }
  }, [profile]);

  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions],
  );

  // Custom module picks on the user doc REPLACE the role defaults (the module
  // grid in Users). Super admins always see everything.
  const hasModule = useCallback(
    (moduleKey: string) => {
      if (!profile) return false;
      if (profile.role === "superAdmin") return true;
      const custom = profile.moduleAccess;
      if (Array.isArray(custom) && custom.length > 0) return custom.includes(moduleKey);
      return (MODULE_DEFAULTS_BY_ROLE[profile.role] ?? []).includes(moduleKey as never);
    },
    [profile],
  );

  const refreshProfile = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    await loadProfileForUser(firebaseUser);
  }, [loadProfileForUser]);

  const login = useCallback(async (email: string, password: string) => {
    // If another tab left a DIFFERENT account signed in, clear it first so the
    // fresh login's Firestore reads can't race against stale credentials.
    const current = auth.currentUser;
    if (current && (current.email ?? "").trim().toLowerCase() !== email.trim().toLowerCase()) {
      await signOut(auth).catch(() => undefined);
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    pendingLoginFinalizeRef.current.add(credential.user.uid);
    try {
      await resolveUserProfile(credential.user);
    } catch (error) {
      pendingLoginFinalizeRef.current.delete(credential.user.uid);
      await signOutIfProfileDenied(error);
      throw error instanceof ProfileAccessError
        ? error
        : new Error(error instanceof Error ? error.message : "Login failed");
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    // Popup FIRST: signInWithRedirect silently loses the result on custom
    // domains (unimoni.pages.dev != firebaseapp.com authDomain) in browsers
    // with storage partitioning, leaving users stuck on "Finishing sign-in…".
    // Popups complete in-page and are immune. Redirect stays as the fallback
    // for browsers that block popups (some TV/embedded browsers).
    try {
      console.info(`${LOG_PREFIX} starting Google popup sign-in`);
      const result = await signInWithPopup(auth, provider);
      pendingLoginFinalizeRef.current.add(result.user.uid);
      console.info(`${LOG_PREFIX} popup sign-in completed`, {
        uid: result.user.uid,
        email: result.user.email,
      });
      // Drive the profile load explicitly: if this user was ALREADY signed in
      // (e.g. retrying after a profile timeout), onAuthStateChanged will not
      // re-fire for the same uid and nothing else would load the profile.
      // ensureUserProfile dedupes by uid, so a concurrent onAuthStateChanged
      // load is harmless. The pending key reuses the welcome-toast logic.
      sessionStorage.setItem(GOOGLE_SIGN_IN_PENDING_KEY, "1");
      await loadProfileForUser(result.user);
      return;
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (error.code === "auth/popup-closed-by-user") {
          throw new Error("Sign-in cancelled — click Continue with Google to try again.");
        }
        if (
          error.code === "auth/popup-blocked" ||
          error.code === "auth/cancelled-popup-request" ||
          error.code === "auth/operation-not-supported-in-this-environment"
        ) {
          console.info(`${LOG_PREFIX} popup unavailable (${error.code}) — falling back to redirect`);
          sessionStorage.setItem(GOOGLE_SIGN_IN_PENDING_KEY, "1");
          await signInWithRedirect(auth, provider);
          return;
        }
        if (error.code === "auth/account-exists-with-different-credential") {
          throw new Error(
            "This email was set up with a password. Ask your admin to delete the old account and re-invite you for Google sign-in.",
          );
        }
        if (error.code === "auth/unauthorized-domain") {
          const host = typeof window !== "undefined" ? window.location.hostname : "this address";
          console.error(
            `${LOG_PREFIX} auth/unauthorized-domain — add "${host}" in Firebase Console → Authentication → Settings → Authorized domains`,
          );
          throw new Error(
            `Google sign-in isn't enabled for ${host} yet. Your admin must add this exact domain in Firebase → Authentication → Settings → Authorized domains.`,
          );
        }
      }
      throw error;
    }
  }, [loadProfileForUser]);

  const logout = useCallback(async () => {
    if (profile && user) {
      // Fire-and-forget: sign-out must never hang because Firestore is
      // unreachable (offline logout would otherwise never complete).
      void writeAuditLog({
        action: "logout",
        entityType: "auth",
        userId: user.uid,
        userName: profile.displayName || user.email || "Unknown",
        branchId: profile.branchId ?? null,
      }).catch(() => undefined);
    }
    await signOut(auth);
  }, [profile, user]);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    loadingPhase,
    profileError,
    permissions,
    login,
    loginWithGoogle,
    logout,
    refreshProfile,
    hasPermission,
    hasModule,
    isSuperAdmin: profile?.role === "superAdmin",
    isAdmin: profile?.role === "admin",
    isBranchManager: profile?.role === "branchManager",
    isBranchUser: profile?.role === "branchUser",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useRequireRole(roles: UserRole[]) {
  const { profile, loading } = useAuth();
  const allowed = profile ? roles.includes(profile.role) : false;
  return { allowed, loading, profile };
}
