import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "moneyexchange-35c33";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function createFirebaseApp(): FirebaseApp {
  if (getApps().length) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

function createFirestore(app: FirebaseApp): Firestore {
  if (typeof window === "undefined") {
    try {
      return initializeFirestore(app, {
        localCache: memoryLocalCache(),
        ignoreUndefinedProperties: true,
      });
    } catch {
      return getFirestore(app);
    }
  }

  // Persistent (IndexedDB) cache ONLY for the TV routes, where offline
  // resilience matters. Dashboard tabs use a fresh in-memory cache: with many
  // dashboard tabs open across deploys, the shared multi-tab cache can elect a
  // stale tab as primary and serve outdated lists (branches/messages seeming
  // to "disappear" until a hard refresh). Memory cache = always-live data.
  const isTvRoute =
    window.location.pathname.startsWith("/display") || window.location.pathname.startsWith("/tv");

  try {
    return initializeFirestore(app, {
      // Never let a stray `undefined` in a settings object blow up a write with
      // "Unsupported field value: undefined" — silently drop undefined instead.
      ignoreUndefinedProperties: true,
      // Banks/corporate proxies often break WebChannel streaming — auto-detect
      // and fall back to long polling so live sync keeps working.
      experimentalAutoDetectLongPolling: true,
      // Single-tab persistence: a TV runs ONE tab, and the multi-tab lease is
      // exactly what wedged when several (old-deploy) tabs shared the cache.
      // If a second tab does open, init throws and we fall back to memory.
      localCache: isTvRoute
        ? persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) })
        : memoryLocalCache(),
    });
  } catch (error) {
    console.warn("Firestore cache init unavailable, falling back to memory cache:", error);
    try {
      return initializeFirestore(app, {
        localCache: memoryLocalCache(),
        ignoreUndefinedProperties: true,
      });
    } catch (memoryError) {
      console.warn("Firestore memory cache init failed, using default:", memoryError);
      return getFirestore(app);
    }
  }
}

export const app = createFirebaseApp();
export const auth: Auth = getAuth(app);
export const db: Firestore = createFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app);

/**
 * Create an email/password auth account WITHOUT touching the current admin's
 * session: a throwaway secondary Firebase app performs the signup (which
 * signs in on that app only), then is torn down. Returns the new user's uid.
 */
export async function createAuthAccount(email: string, password: string): Promise<string> {
  const { initializeApp: initSecondary, deleteApp } = await import("firebase/app");
  const { getAuth: getSecondaryAuth, createUserWithEmailAndPassword, signOut: signOutSecondary } =
    await import("firebase/auth");
  const secondary = initSecondary(firebaseConfig, `account-creator-${Date.now()}`);
  try {
    const secondaryAuth = getSecondaryAuth(secondary);
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOutSecondary(secondaryAuth).catch(() => undefined);
    return credential.user.uid;
  } finally {
    await deleteApp(secondary).catch(() => undefined);
  }
}

/**
 * Change ANOTHER user's password without touching the admin's session: a
 * throwaway secondary app signs in as that user with their CURRENT password,
 * updates it, and is torn down. Works fully client-side (no Cloud Functions).
 */
export async function changeAuthAccountPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { initializeApp: initSecondary, deleteApp } = await import("firebase/app");
  const {
    getAuth: getSecondaryAuth,
    signInWithEmailAndPassword,
    updatePassword,
    signOut: signOutSecondary,
  } = await import("firebase/auth");
  const secondary = initSecondary(firebaseConfig, `password-reset-${Date.now()}`);
  try {
    const secondaryAuth = getSecondaryAuth(secondary);
    const credential = await signInWithEmailAndPassword(secondaryAuth, email, currentPassword);
    await updatePassword(credential.user, newPassword);
    await signOutSecondary(secondaryAuth).catch(() => undefined);
  } finally {
    await deleteApp(secondary).catch(() => undefined);
  }
}

/**
 * Permanently delete a password login from Firebase Auth WITHOUT touching the
 * admin's own session: sign the target account in on a throwaway secondary app
 * (we hold its password in the owner vault) and self-delete it. After this the
 * email/password can never sign in again. Returns the deleted uid.
 */
export async function deleteAuthAccount(email: string, password: string): Promise<string> {
  const { initializeApp: initSecondary, deleteApp } = await import("firebase/app");
  const { getAuth: getSecondaryAuth, signInWithEmailAndPassword, deleteUser } = await import(
    "firebase/auth"
  );
  const secondary = initSecondary(firebaseConfig, `account-delete-${Date.now()}`);
  try {
    const secondaryAuth = getSecondaryAuth(secondary);
    const credential = await signInWithEmailAndPassword(secondaryAuth, email, password);
    const uid = credential.user.uid;
    await deleteUser(credential.user);
    return uid;
  } finally {
    await deleteApp(secondary).catch(() => undefined);
  }
}

let analytics: Analytics | null = null;

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (analytics) return analytics;
  const supported = await isSupported();
  if (!supported) return null;
  analytics = getAnalytics(app);
  return analytics;
}
