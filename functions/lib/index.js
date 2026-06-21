"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAuditLogCreate = exports.markOfflineTvs = exports.onExchangeRateChange = exports.createBranchManager = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const authAdmin = (0, auth_1.getAuth)();
const DEFAULT_TEMP_PASSWORD = "ChangeMe123!";
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
async function assertSuperAdmin(uid) {
    const caller = await db.collection("users").doc(uid).get();
    if (!caller.exists || caller.data()?.role !== "superAdmin" || caller.data()?.isActive !== true) {
        throw new https_1.HttpsError("permission-denied", "Only super admins can perform this action.");
    }
}
exports.createBranchManager = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    await assertSuperAdmin(request.auth.uid);
    const email = normalizeEmail(String(request.data?.email ?? ""));
    const displayName = String(request.data?.displayName ?? "").trim();
    const branchId = String(request.data?.branchId ?? "").trim();
    if (!email || !displayName || !branchId) {
        throw new https_1.HttpsError("invalid-argument", "Email, display name, and branch are required.");
    }
    await db.collection("user_invites").doc(email).set({
        email,
        displayName,
        role: "branchManager",
        branchId,
        createdBy: request.auth.uid,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    let temporaryPassword;
    try {
        await authAdmin.getUserByEmail(email);
    }
    catch (error) {
        const code = error.code;
        if (code !== "auth/user-not-found") {
            throw new https_1.HttpsError("internal", "Failed to look up auth user.");
        }
        temporaryPassword = DEFAULT_TEMP_PASSWORD;
        const created = await authAdmin.createUser({
            email,
            password: temporaryPassword,
            displayName,
            emailVerified: email.endsWith("@gmail.com") || email.endsWith("@googlemail.com"),
        });
        await db.collection("users").doc(created.uid).set({
            email,
            displayName,
            role: "branchManager",
            branchId,
            isActive: true,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        await db.collection("user_invites").doc(email).delete().catch(() => undefined);
    }
    return {
        temporaryPassword,
        message: temporaryPassword
            ? "Auth account created with temporary password."
            : "Invite saved. User can sign in with Google or existing password.",
    };
});
exports.onExchangeRateChange = (0, firestore_2.onDocumentWritten)("exchange_rates/{rateId}", async (event) => {
    const after = event.data?.after?.data();
    if (!after)
        return;
    await db.collection("notifications").add({
        type: "rate_change",
        title: "Exchange rate updated",
        message: `${after.currencyCode} updated for branch ${after.branchId}`,
        branchId: after.branchId,
        read: false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    firebase_functions_1.logger.info("Rate change notification created", {
        branchId: after.branchId,
        currencyCode: after.currencyCode,
        version: after.version,
    });
});
exports.markOfflineTvs = (0, scheduler_1.onSchedule)("every 5 minutes", async () => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const snapshot = await db.collection("tv_devices").where("status", "==", "online").get();
    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => {
        const lastSeen = docSnap.data().lastSeenAt?.toDate?.()?.getTime?.() ?? 0;
        if (lastSeen < cutoff) {
            batch.update(docSnap.ref, {
                status: "offline",
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
    });
    await batch.commit();
    firebase_functions_1.logger.info("Offline TV sweep completed", { checked: snapshot.size });
});
exports.onAuditLogCreate = (0, firestore_2.onDocumentWritten)("audit_logs/{logId}", async (event) => {
    const data = event.data?.after?.data();
    if (!data)
        return;
    await db.collection("activity_logs").add({
        ...data,
        mirroredAt: firestore_1.FieldValue.serverTimestamp(),
    });
});
//# sourceMappingURL=index.js.map