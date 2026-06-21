import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

initializeApp();
const db = getFirestore();
const authAdmin = getAuth();

const DEFAULT_TEMP_PASSWORD = "ChangeMe123!";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function assertSuperAdmin(uid: string): Promise<void> {
  const caller = await db.collection("users").doc(uid).get();
  if (!caller.exists || caller.data()?.role !== "superAdmin" || caller.data()?.isActive !== true) {
    throw new HttpsError("permission-denied", "Only super admins can perform this action.");
  }
}

export const createBranchManager = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  await assertSuperAdmin(request.auth.uid);

  const email = normalizeEmail(String(request.data?.email ?? ""));
  const displayName = String(request.data?.displayName ?? "").trim();
  const branchId = String(request.data?.branchId ?? "").trim();

  if (!email || !displayName || !branchId) {
    throw new HttpsError("invalid-argument", "Email, display name, and branch are required.");
  }

  await db.collection("user_invites").doc(email).set(
    {
      email,
      displayName,
      role: "branchManager",
      branchId,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  let temporaryPassword: string | undefined;
  try {
    await authAdmin.getUserByEmail(email);
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code !== "auth/user-not-found") {
      throw new HttpsError("internal", "Failed to look up auth user.");
    }

    temporaryPassword = DEFAULT_TEMP_PASSWORD;
    const created = await authAdmin.createUser({
      email,
      password: temporaryPassword,
      displayName,
      emailVerified: email.endsWith("@gmail.com") || email.endsWith("@googlemail.com"),
    });

    await db.collection("users").doc(created.uid).set(
      {
        email,
        displayName,
        role: "branchManager",
        branchId,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await db.collection("user_invites").doc(email).delete().catch(() => undefined);
  }

  return {
    temporaryPassword,
    message: temporaryPassword
      ? "Auth account created with temporary password."
      : "Invite saved. User can sign in with Google or existing password.",
  };
});

export const onExchangeRateChange = onDocumentWritten(
  "exchange_rates/{rateId}",
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return;

    await db.collection("notifications").add({
      type: "rate_change",
      title: "Exchange rate updated",
      message: `${after.currencyCode} updated for branch ${after.branchId}`,
      branchId: after.branchId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info("Rate change notification created", {
      branchId: after.branchId,
      currencyCode: after.currencyCode,
      version: after.version,
    });
  },
);

export const markOfflineTvs = onSchedule("every 5 minutes", async () => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const snapshot = await db.collection("tv_devices").where("status", "==", "online").get();

  const batch = db.batch();
  snapshot.docs.forEach((docSnap) => {
    const lastSeen = docSnap.data().lastSeenAt?.toDate?.()?.getTime?.() ?? 0;
    if (lastSeen < cutoff) {
      batch.update(docSnap.ref, {
        status: "offline",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  await batch.commit();
  logger.info("Offline TV sweep completed", { checked: snapshot.size });
});

export const onAuditLogCreate = onDocumentWritten("audit_logs/{logId}", async (event) => {
  const data = event.data?.after?.data();
  if (!data) return;

  await db.collection("activity_logs").add({
    ...data,
    mirroredAt: FieldValue.serverTimestamp(),
  });
});
