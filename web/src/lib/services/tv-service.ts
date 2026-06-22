import {
  createDocument,
  getDocument,
  listDocuments,
  subscribeCollection,
  updateDocument,
  where,
  orderBy,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";
import type { TvDevice, TvHealth } from "@/lib/types";

function generatePairingCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function listTvDevices(branchId?: string): Promise<TvDevice[]> {
  const constraints = branchId
    ? [where("branchId", "==", branchId), orderBy("name", "asc")]
    : [orderBy("name", "asc")];
  return listDocuments<TvDevice>(COLLECTIONS.tvDevices, constraints);
}

export function subscribeTvDevices(onData: (devices: TvDevice[]) => void, branchId?: string) {
  const constraints = branchId
    ? [where("branchId", "==", branchId), orderBy("name", "asc")]
    : [orderBy("name", "asc")];
  return subscribeCollection<TvDevice>(COLLECTIONS.tvDevices, constraints, onData);
}

export async function createTvDevice(
  data: { name: string; branchId: string },
  actor: { userId: string; userName: string },
): Promise<TvDevice> {
  const deviceToken = crypto.randomUUID();
  const pairingCode = generatePairingCode();
  const id = await createDocument(COLLECTIONS.tvDevices, {
    name: data.name,
    branchId: data.branchId,
    deviceToken,
    pairingCode,
    status: "offline",
    internetStatus: "disconnected",
    storageStatus: "healthy",
  });

  await writeAuditLog({
    action: "tv_create",
    entityType: "tv_device",
    entityId: id,
    userId: actor.userId,
    userName: actor.userName,
    branchId: data.branchId,
    metadata: { pairingCode },
  });

  const device = await getDocument<TvDevice>(COLLECTIONS.tvDevices, id);
  await setDoc(doc(db, COLLECTIONS.tvPairingCodes, pairingCode), {
    deviceId: id,
    branchId: data.branchId,
    createdAt: new Date(),
  });
  return device!;
}

export async function findTvByPairingCode(code: string): Promise<TvDevice | null> {
  const normalized = code.trim().toUpperCase();
  const pairingSnap = await getDocument<{ deviceId: string; branchId: string }>(
    COLLECTIONS.tvPairingCodes,
    normalized,
  );
  if (pairingSnap?.deviceId) {
    return getDocument<TvDevice>(COLLECTIONS.tvDevices, pairingSnap.deviceId);
  }
  const devices = await listDocuments<TvDevice>(COLLECTIONS.tvDevices, [
    where("pairingCode", "==", normalized),
  ]);
  return devices[0] ?? null;
}

export async function registerTvDevice(
  data: {
    name: string;
    branchId: string;
    deviceToken: string;
    pairingCode?: string;
  },
): Promise<string> {
  const existing = await getDocument<TvDevice>(COLLECTIONS.tvDevices, data.deviceToken);
  if (existing) {
    await updateDocument(COLLECTIONS.tvDevices, data.deviceToken, {
      status: "online",
      lastSeenAt: new Date(),
      internetStatus: "connected",
    });
    return data.deviceToken;
  }

  return createDocument(COLLECTIONS.tvDevices, {
    name: data.name,
    branchId: data.branchId,
    deviceToken: data.deviceToken,
    pairingCode: data.pairingCode ?? generatePairingCode(),
    status: "online",
    lastSeenAt: new Date(),
    internetStatus: "connected",
    storageStatus: "healthy",
  }, data.deviceToken);
}

export async function heartbeatTvDevice(
  deviceId: string,
  payload: Partial<TvDevice & TvHealth>,
): Promise<void> {
  await updateDocument(COLLECTIONS.tvDevices, deviceId, {
    ...payload,
    status: "online",
    lastSeenAt: new Date(),
  });
}

export async function getTvDevice(deviceId: string): Promise<TvDevice | null> {
  return getDocument<TvDevice>(COLLECTIONS.tvDevices, deviceId);
}

export function getTvPlayerUrl(branchCode: string): string {
  const code = encodeURIComponent(branchCode.trim().toUpperCase());
  if (typeof window === "undefined") {
    return `/display?branch=${code}`;
  }
  return `${window.location.origin}/display?branch=${code}`;
}

export async function requestTvRestart(
  deviceId: string,
  actor: { userId: string; userName: string },
): Promise<void> {
  await updateDocument(COLLECTIONS.tvDevices, deviceId, {
    status: "maintenance",
  });
  await writeAuditLog({
    action: "tv_restart",
    entityType: "tv_device",
    entityId: deviceId,
    userId: actor.userId,
    userName: actor.userName,
  });
}

export function subscribeTvHealth(deviceId: string, onData: (health: TvHealth | null) => void) {
  return subscribeCollection<TvHealth>(
    COLLECTIONS.tvHealth,
    [where("deviceId", "==", deviceId), orderBy("lastHeartbeat", "desc")],
    (items) => onData(items[0] ?? null),
  );
}
