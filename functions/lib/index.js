"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAuditLogCreate = exports.markOfflineTvs = exports.onExchangeRateChange = exports.bootstrapInvitedUser = exports.createBranchManager = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const SUPER_ADMIN_EMAIL = "abubackerraiyan@gmail.com";
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function inviteIsOpen(status) {
    return status == null || status === "pending" || status === "approved";
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
    const role = String(request.data?.role ?? "branchManager").trim();
    const branchIdRaw = request.data?.branchId;
    const branchId = branchIdRaw ? String(branchIdRaw).trim() : null;
    const validRoles = ["admin", "branchManager", "branchUser"];
    if (!email || !displayName || !validRoles.includes(role)) {
        throw new https_1.HttpsError("invalid-argument", "Email, display name, and valid role are required.");
    }
    if ((role === "branchManager" || role === "branchUser") && !branchId) {
        throw new https_1.HttpsError("invalid-argument", "Branch is required for branch managers and branch users.");
    }
    await db.collection("user_invites").doc(email).set({
        email,
        displayName,
        role,
        branchId,
        status: "pending",
        createdBy: request.auth.uid,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
        message: "Invite saved. User signs in with Google at /login using this exact Gmail address.",
    };
});
exports.bootstrapInvitedUser = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    const uid = request.auth.uid;
    const email = normalizeEmail(String(request.auth.token.email ?? ""));
    if (!email) {
        throw new https_1.HttpsError("failed-precondition", "Your Google account has no email.");
    }
    // Only verified emails may bootstrap a profile. Google sign-in is always
    // verified; this blocks unverified email/password accounts from claiming
    // someone else's invite (or the super-admin address) via a spoofed email.
    if (request.auth.token.email_verified !== true) {
        throw new https_1.HttpsError("permission-denied", "Your email is not verified. Sign in with Google using your invited Gmail address.");
    }
    firebase_functions_1.logger.info("bootstrapInvitedUser", { uid, email });
    const userRef = db.collection("users").doc(uid);
    const existing = await userRef.get();
    if (existing.exists && existing.data()?.isActive === true) {
        return {
            profile: { uid, ...existing.data() },
            acceptedInvite: false,
        };
    }
    if (email === normalizeEmail(SUPER_ADMIN_EMAIL)) {
        const profile = {
            email,
            displayName: String(request.auth.token.name ?? "Super Admin").trim() || "Super Admin",
            role: "superAdmin",
            branchId: null,
            photoURL: request.auth.token.picture ?? null,
            isActive: true,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await userRef.set(profile, { merge: true });
        const saved = await userRef.get();
        return {
            profile: { uid, ...saved.data() },
            acceptedInvite: false,
        };
    }
    let inviteRef = db.collection("user_invites").doc(email);
    let inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
        const querySnap = await db.collection("user_invites").where("email", "==", email).limit(1).get();
        if (!querySnap.empty) {
            inviteSnap = querySnap.docs[0];
            inviteRef = inviteSnap.ref;
        }
    }
    if (!inviteSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "No invite found for this Gmail address. Ask your admin to invite you on the Users page.");
    }
    const invite = inviteSnap.data() ?? {};
    if (!inviteIsOpen(invite.status)) {
        throw new https_1.HttpsError("permission-denied", "Your invite is no longer active.");
    }
    const inviteEmail = normalizeEmail(String(invite.email ?? ""));
    if (!inviteEmail || inviteEmail !== email) {
        throw new https_1.HttpsError("failed-precondition", "Invite email mismatch. Ask your admin to re-send the invite.");
    }
    const role = String(invite.role ?? "branchManager");
    const validRoles = ["admin", "branchManager", "branchUser"];
    if (!validRoles.includes(role)) {
        throw new https_1.HttpsError("failed-precondition", "Invite has an invalid role.");
    }
    const branchId = role === "admin" ? null : String(invite.branchId ?? "").trim() || null;
    if (role !== "admin" && !branchId) {
        throw new https_1.HttpsError("failed-precondition", "Invite is missing a branch assignment.");
    }
    if (branchId) {
        const branchSnap = await db.collection("branches").doc(branchId).get();
        if (!branchSnap.exists) {
            throw new https_1.HttpsError("failed-precondition", `Branch "${branchId}" on the invite does not exist. Ask your admin to fix the invite.`);
        }
    }
    const profile = {
        email,
        displayName: String(invite.displayName ?? request.auth.token.name ?? email).trim() || email,
        role,
        branchId,
        photoURL: request.auth.token.picture ?? null,
        isActive: true,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await userRef.set(profile, { merge: false });
    await inviteRef.delete().catch(() => undefined);
    const duplicateInvites = await db.collection("user_invites").where("email", "==", email).get();
    await Promise.all(duplicateInvites.docs.map((docSnap) => docSnap.ref.delete().catch(() => undefined)));
    const saved = await userRef.get();
    firebase_functions_1.logger.info("bootstrapInvitedUser complete", { uid, email, role, branchId });
    return {
        profile: { uid, ...saved.data() },
        acceptedInvite: true,
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