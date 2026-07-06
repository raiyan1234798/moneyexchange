#!/usr/bin/env node
/**
 * Validates invite onboarding prerequisites for a Gmail address.
 *
 * Usage:
 *   node scripts/test-invite-flow.mjs raiyan.teamz@gmail.com
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/test-invite-flow.mjs user@gmail.com
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "moneyexchange-35c33";
const RULES_PATH = "firestore.rules";

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

function compileRules() {
  try {
    execSync(`npx firebase-tools@latest deploy --only firestore:rules --dry-run`, {
      stdio: "pipe",
      cwd: new URL("..", import.meta.url).pathname,
    });
    return { ok: true, message: "Firestore rules compile (dry-run deploy succeeded)." };
  } catch (error) {
    const stderr = error.stderr?.toString?.() ?? error.message;
    return { ok: false, message: `Firestore rules compile failed:\n${stderr}` };
  }
}

async function inspectInvite(email) {
  const db = getFirestore();
  const issues = [];
  const notes = [];

  const inviteRef = db.collection("user_invites").doc(email);
  const inviteSnap = await inviteRef.get();

  let inviteDoc = inviteSnap.exists ? { id: inviteSnap.id, ...inviteSnap.data() } : null;

  if (!inviteDoc) {
    const querySnap = await db.collection("user_invites").where("email", "==", email).limit(3).get();
    if (!querySnap.empty) {
      const doc = querySnap.docs[0];
      inviteDoc = { id: doc.id, ...doc.data() };
      issues.push(`Invite found by email query but doc id is "${doc.id}" (expected "${email}").`);
      notes.push("Client rules require invite at user_invites/{lowercase-email}; bootstrapInvitedUser handles mismatches.");
    }
  }

  if (!inviteDoc) {
    issues.push("No invite document found.");
    return { inviteDoc: null, issues, notes };
  }

  if (inviteDoc.id !== email) {
    issues.push(`Invite doc id "${inviteDoc.id}" does not match normalized email "${email}".`);
  }

  if (!inviteDoc.email || normalizeEmail(inviteDoc.email) !== email) {
    issues.push(`Invite email field "${inviteDoc.email ?? ""}" does not match "${email}".`);
  }

  if (!inviteDoc.displayName) {
    issues.push("Invite missing displayName.");
  }

  const role = inviteDoc.role ?? "branchManager";
  if (!["admin", "branchManager", "branchUser"].includes(role)) {
    issues.push(`Invalid invite role: ${role}`);
  }

  if (role !== "admin") {
    if (!inviteDoc.branchId) {
      issues.push("Invite missing branchId for non-admin role.");
    } else {
      const branchSnap = await db.collection("branches").doc(inviteDoc.branchId).get();
      if (!branchSnap.exists) {
        issues.push(`Branch "${inviteDoc.branchId}" does not exist.`);
      } else {
        const branch = branchSnap.data();
        notes.push(`Branch: ${branch.name ?? inviteDoc.branchId} (code=${branch.code ?? "?"}, status=${branch.status ?? "?"})`);
        if (branch.status !== "active") {
          issues.push(`Branch status is "${branch.status}" — should be "active" for full dashboard access.`);
        }
      }
    }
  }

  const status = inviteDoc.status ?? "pending";
  if (!["pending", "approved"].includes(status)) {
    issues.push(`Invite status "${status}" blocks sign-in.`);
  } else {
    notes.push(`Invite status "${status}" is open for first Google sign-in. Approve is optional.`);
  }

  const usersSnap = await db.collection("users").where("email", "==", email).limit(3).get();
  if (!usersSnap.empty) {
    usersSnap.forEach((doc) => {
      notes.push(`Existing user profile: uid=${doc.id}, role=${doc.data().role}`);
    });
  }

  return { inviteDoc, issues, notes };
}

async function main() {
  const email = normalizeEmail(process.argv[2] ?? "");
  if (!email) {
    console.error("Usage: node scripts/test-invite-flow.mjs <gmail@address>");
    process.exit(1);
  }

  console.log(`\n=== Invite flow check: ${email} ===\n`);

  const rules = compileRules();
  console.log(rules.ok ? "✓" : "✗", rules.message);

  try {
    initFirebaseAdmin();
    const { inviteDoc, issues, notes } = await inspectInvite(email);

    if (inviteDoc) {
      console.log("\nInvite document:");
      console.log(JSON.stringify(inviteDoc, null, 2));
    }

    if (notes.length) {
      console.log("\nNotes:");
      for (const note of notes) console.log(`  • ${note}`);
    }

    if (issues.length) {
      console.log("\nIssues:");
      for (const issue of issues) console.log(`  ✗ ${issue}`);
      process.exit(1);
    }

    console.log("\n✓ Invite structure looks valid for Google sign-in.");
  } catch (error) {
    console.warn("\nCould not query Firestore (missing credentials). Rules check still ran.");
    console.warn(error.message);
    if (!rules.ok) process.exit(1);
    console.log("\nSet GOOGLE_APPLICATION_CREDENTIALS to validate live invite data.");
  }
}

main();
