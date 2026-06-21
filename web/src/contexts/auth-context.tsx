"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db, enableOfflinePersistence } from "@/lib/firebase/client";
import {
  ensureUserProfile,
  ProfileAccessError,
  signOutIfProfileDenied,
} from "@/lib/auth/user-profile";
import { writeAuditLog } from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { AppUser, UserRole } from "@/lib/types";
import {
  BRANCH_MANAGER_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
} from "@/lib/constants";

interface AuthContextValue {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  permissions: string[];
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isSuperAdmin: boolean;
  isBranchManager: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function finalizeLogin(firebaseUser: User, profile: AppUser): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.users, firebaseUser.uid), {
    lastLoginAt: serverTimestamp(),
  }).catch(() => undefined);

  await writeAuditLog({
    action: "login",
    entityType: "auth",
    userId: firebaseUser.uid,
    userName: profile.displayName || firebaseUser.email || "Unknown",
    branchId: profile.branchId ?? null,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void enableOfflinePersistence();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const userProfile = await ensureUserProfile(firebaseUser);
        setProfile(userProfile);
      } catch (error) {
        console.error("Failed to load user profile", error);
        await signOutIfProfileDenied(error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const permissions = useMemo<string[]>(() => {
    if (!profile) return [];
    return profile.role === "superAdmin"
      ? [...SUPER_ADMIN_PERMISSIONS]
      : [...BRANCH_MANAGER_PERMISSIONS];
  }, [profile]);

  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions],
  );

  const login = useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    try {
      const userProfile = await ensureUserProfile(credential.user);
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
    const credential = await signInWithPopup(auth, provider);
    try {
      const userProfile = await ensureUserProfile(credential.user);
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
      });
    }
    await signOut(auth);
  }, [profile, user]);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    permissions,
    login,
    loginWithGoogle,
    logout,
    hasPermission,
    isSuperAdmin: profile?.role === "superAdmin",
    isBranchManager: profile?.role === "branchManager",
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
