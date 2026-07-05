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
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
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
import { COLLECTIONS } from "@/lib/constants";
import type { AppUser, UserRole } from "@/lib/types";
import {
  BRANCH_MANAGER_PERMISSIONS,
  BRANCH_USER_PERMISSIONS,
  ADMIN_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
} from "@/lib/constants";

export type AuthLoadingPhase = "auth" | "profile" | null;

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
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isBranchManager: boolean;
  isBranchUser: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_LOAD_TIMEOUT_MS = 8_000;
const AUTH_LOADING_SAFETY_MS = 8_000;

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

async function resolveUserProfile(firebaseUser: User): Promise<AppUser> {
  try {
    return await withTimeout(
      ensureUserProfile(firebaseUser),
      PROFILE_LOAD_TIMEOUT_MS,
      "Profile load timed out",
    );
  } catch (error) {
    const email = firebaseUser.email ?? "";
    if (email && isSuperAdminEmail(email)) {
      console.warn("Profile load failed for super admin, using fallback", error);
      return buildSuperAdminFallbackProfile(firebaseUser);
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
  const authGenerationRef = useRef(0);

  const loadProfileForUser = useCallback(async (firebaseUser: User) => {
    const generation = ++authGenerationRef.current;
    setLoading(true);
    setLoadingPhase("profile");
    setProfileError(null);

    try {
      const userProfile = await resolveUserProfile(firebaseUser);
      if (generation !== authGenerationRef.current) return;
      setProfile(userProfile);
    } catch (error) {
      if (generation !== authGenerationRef.current) return;
      console.error("Failed to load user profile", error);
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
  }, [loadProfileForUser]);

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

  const refreshProfile = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    await loadProfileForUser(firebaseUser);
  }, [loadProfileForUser]);

  const login = useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    try {
      const userProfile = await resolveUserProfile(credential.user);
      setProfile(userProfile);
      await finalizeLogin(credential.user, userProfile);
    } catch (error) {
      await signOutIfProfileDenied(error);
      throw error instanceof ProfileAccessError
        ? error
        : new Error(error instanceof Error ? error.message : "Login failed");
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    let credential;
    try {
      credential = await signInWithPopup(auth, provider);
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (error.code === "auth/popup-blocked") {
          const message =
            "Google sign-in pop-up was blocked. Allow pop-ups for this site in your browser settings, then try again.";
          toast.error(message);
          throw new Error(message);
        }
        if (error.code === "auth/popup-closed-by-user") {
          throw new Error("Sign-in cancelled");
        }
        if (error.code === "auth/cancelled-popup-request") {
          return;
        }
      }
      throw error instanceof Error ? error : new Error("Google sign-in failed");
    }

    try {
      const userProfile = await resolveUserProfile(credential.user);
      setProfile(userProfile);
      await finalizeLogin(credential.user, userProfile);
    } catch (error) {
      await signOutIfProfileDenied(error);
      throw error instanceof ProfileAccessError
        ? error
        : new Error(error instanceof Error ? error.message : "Google sign-in failed");
    }
  }, []);

  const logout = useCallback(async () => {
    if (profile && user) {
      await writeAuditLog({
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
