#!/usr/bin/env node
/**
 * Create or repair a user_invites document for Google sign-in bootstrap.
 *
 * Usage:
 *   node scripts/fix-invite.mjs raiyan.teamz@gmail.com --branch-code ECG
 *   node scripts/fix-invite.mjs user@gmail.com --branch-id eJbyMWy8rs4l8nTvGbe6
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/fix-invite.mjs ...
 */

import { existsSync, readFileSync } from "node:fs";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "moneyexchange-35c33";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function initFirebaseAdmin() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && existsSync(keyPath)) {
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
    initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
    return;
  }
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}

function parseArgs(argv) {
  const email = normalizeEmail(argv[2] ?? "");
  if (!email) {
    throw new Error("Usage: node scripts/fix-invite.mjs <email> [--branch-code CODE | --branch-id ID] [--role role] [--name displayName]");
  }

  let branchCode = null;
  let branchId = null;
  let role = "branchManager";
  let displayName = email.split("@")[0];

  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--branch-code") branchCode = argv[++i];
    else if (arg === "--branch-id") branchId = argv[++i];
    else if (arg === "--role") role = argv[++i];
    else if (arg === "--name") displayName = argv[++i];
  }

  return { email, branchCode, branchId, role, displayName };
}

async function resolveBranchId(db, { branchCode, branchId }) {
  if (branchId) {
    const snap = await db.collection("branches").doc(branchId).get();
    if (!snap.exists) throw new Error(`Branch id "${branchId}" not found.`);
    return { id: snap.id, data: snap.data() };
  }

  if (!branchCode) {
    throw new Error("Provide --branch-code or --branch-id.");
  }

  const byCode = await db.collection("branches").where("code", "==", branchCode).limit(5).get();
  if (byCode.empty) {
    const byName = await db.collection("branches").where("name", "==", branchCode).limit(5).get();
    if (byName.empty) {
      throw new Error(`No branch found for code/name "${branchCode}".`);
    }
    if (byName.size > 1) {
      throw new Error(`Multiple branches match "${branchCode}". Use --branch-id.`);
    }
    const doc = byName.docs[0];
    return { id: doc.id, data: doc.data() };
  }

  if (byCode.size > 1) {
    throw new Error(`Multiple branches have code "${branchCode}". Use --branch-id.`);
  }

  const doc = byCode.docs[0];
  return { id: doc.id, data: doc.data() };
}

async function main() {
  const { email, branchCode, branchId, role, displayName } = parseArgs(process.argv);
  initFirebaseAdmin();
  const db = getFirestore();

  const branch = role === "admin" ? null : await resolveBranchId(db, { branchCode, branchId });
  const resolvedBranchId = branch?.id ?? null;
  const branchName = branch?.data?.name ?? null;

  const inviteRef = db.collection("user_invites").doc(email);
  const payload = {
    email,
    displayName,
    role,
    branchId: resolvedBranchId,
    branchName,
    status: "pending",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };

  await inviteRef.set(payload, { merge: true });

  const duplicates = await db.collection("user_invites").where("email", "==", email).get();
  await Promise.all(
    duplicates.docs
      .filter((doc) => doc.id !== email)
      .map((doc) => doc.ref.delete()),
  );

  console.log("Invite saved:");
  console.log(JSON.stringify({ id: email, ...payload, createdAt: "(server)", updatedAt: "(server)" }, null, 2));
  if (branch) {
    console.log(`Branch: ${branchName ?? resolvedBranchId} (id=${resolvedBranchId}, code=${branch.data?.code ?? "?"}, status=${branch.data?.status ?? "?"})`);
  }
  console.log("\nUser should sign in at https://unimoni-6va.pages.dev/login with Google using this exact Gmail address.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
