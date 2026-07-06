import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import type { AppUser } from "@/lib/types";

export interface BootstrapInvitedUserResult {
  profile: AppUser;
  acceptedInvite: boolean;
}

const BOOTSTRAP_CALLABLE_TIMEOUT_MS = 5_000;
const LOG_PREFIX = "[unimoni-auth]";

function withCallableTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("bootstrapInvitedUser timed out");
      (error as { code?: string }).code = "functions/unavailable";
      reject(error);
    }, ms);
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

export async function bootstrapInvitedUserProfile(): Promise<BootstrapInvitedUserResult> {
  console.info(`${LOG_PREFIX} calling bootstrapInvitedUser cloud function`);
  const callable = httpsCallable<void, BootstrapInvitedUserResult>(
    functions,
    "bootstrapInvitedUser",
  );
  const result = await withCallableTimeout(callable(), BOOTSTRAP_CALLABLE_TIMEOUT_MS);
  return result.data;
}
