import {
  createDocument,
  getDocument,
  listDocuments,
  subscribeCollection,
  updateDocument,
  writeAuditLog,
  where,
  orderBy,
} from "@/lib/firebase/firestore";
import { COLLECTIONS } from "@/lib/constants";
import type { Agreement, AgreementSignature } from "@/lib/types";

// ─── Agreements ───────────────────────────────────────────────────────────────

export function subscribeAgreements(
  onData: (agreements: Agreement[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<Agreement>(
    COLLECTIONS.agreements,
    [where("status", "==", "active"), orderBy("createdAt", "desc")],
    onData,
    onError,
  );
}

export function subscribeAllAgreements(
  onData: (agreements: Agreement[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<Agreement>(
    COLLECTIONS.agreements,
    [orderBy("createdAt", "desc")],
    onData,
    onError,
  );
}

export async function addAgreement(
  data: Omit<Agreement, "id" | "createdAt" | "updatedAt">,
  actor: { userId: string; userName: string },
): Promise<string> {
  const id = await createDocument(COLLECTIONS.agreements, data);
  await writeAuditLog({
    action: "agreement_change",
    entityType: "agreement",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
    metadata: { change: "create", title: data.title },
  });
  return id;
}

export async function updateAgreement(
  id: string,
  data: Partial<Omit<Agreement, "id" | "createdAt">>,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.agreements, id, data);
  await writeAuditLog({
    action: "agreement_change",
    entityType: "agreement",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
    metadata: { change: "update" },
  });
}

export async function archiveAgreement(
  id: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.agreements, id, { status: "archived" });
  await writeAuditLog({
    action: "agreement_change",
    entityType: "agreement",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: null,
    metadata: { change: "archive" },
  });
}

// ─── Signatures ───────────────────────────────────────────────────────────────

export function subscribeSignatures(
  agreementId: string,
  onData: (signatures: AgreementSignature[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeCollection<AgreementSignature>(
    COLLECTIONS.agreementSignatures,
    [
      where("agreementId", "==", agreementId),
      orderBy("signedAt", "desc"),
    ],
    onData,
    onError,
  );
}

export async function getUserSignature(
  agreementId: string,
  userId: string,
): Promise<AgreementSignature | null> {
  const results = await listDocuments<AgreementSignature>(
    COLLECTIONS.agreementSignatures,
    [
      where("agreementId", "==", agreementId),
      where("userId", "==", userId),
    ],
  );
  return results[0] ?? null;
}

export async function signAgreement(
  agreementId: string,
  actor: {
    userId: string;
    userEmail: string;
    userName: string;
    branchId?: string | null;
    branchName?: string | null;
  },
): Promise<string> {
  const sigData: Omit<AgreementSignature, "id"> = {
    agreementId,
    userId: actor.userId,
    userEmail: actor.userEmail,
    userName: actor.userName,
    branchId: actor.branchId ?? null,
    branchName: actor.branchName ?? null,
    signedAt: new Date(),
  };
  const id = await createDocument(COLLECTIONS.agreementSignatures, sigData);
  await writeAuditLog({
    action: "agreement_signed",
    entityType: "agreement",
    entityId: agreementId,
    userId: actor.userId,
    userName: actor.userName,
    branchId: actor.branchId ?? null,
    metadata: { signatureId: id },
  });
  return id;
}
