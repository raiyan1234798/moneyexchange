import {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  where,
  writeAuditLog,
} from "@/lib/firebase/firestore";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS, DEFAULT_BRANCH_SETTINGS } from "@/lib/constants";
import {
  DEMO_BRANCH_CODE,
  DEMO_BRANCH_DOC_ID,
  DEMO_BRANCH_NAME,
  DEMO_CURRENCIES,
  DEMO_RATES,
  DEMO_SAMPLE_VIDEO_URL,
  DEMO_TICKER_LINES,
} from "@/lib/demo-content";
import type { Branch, Currency } from "@/lib/types";

export async function loadDemoContent(actor: {
  userId: string;
  userName: string;
}): Promise<{ branchId: string; branchCode: string }> {
  const existingCurrencies = await listDocuments<Currency>(COLLECTIONS.currencies);
  const currencyCodes = new Set(existingCurrencies.map((c) => c.currencyCode));

  for (const currency of DEMO_CURRENCIES) {
    if (currencyCodes.has(currency.currencyCode)) continue;
    await createDocument(
      COLLECTIONS.currencies,
      {
        currencyCode: currency.currencyCode,
        currencyName: currency.currencyName,
        country: currency.country,
        flag: currency.flag,
        sortOrder: currency.sortOrder,
        status: "active",
        isHidden: false,
      },
      currency.id,
    );
  }

  const existingByDocId = await getDocument<Branch>(COLLECTIONS.branches, DEMO_BRANCH_DOC_ID);
  const existingBranches = await listDocuments<Branch>(COLLECTIONS.branches, [
    where("code", "==", DEMO_BRANCH_CODE),
  ]);

  let branchId: string;
  if (existingBranches.length > 0 || existingByDocId) {
    branchId = existingBranches[0]?.id ?? existingByDocId!.id;
    await updateDocument(COLLECTIONS.branches, branchId, {
      code: DEMO_BRANCH_CODE,
      name: DEMO_BRANCH_NAME,
      status: "active",
      brandingColor: "#0ea5e9",
      workingHours: "Mon–Sat 9:00–21:00",
      settings: {
        ...DEFAULT_BRANCH_SETTINGS,
        slogan: "Your trusted exchange partner",
      },
    });
  } else {
    branchId = await createDocument(
      COLLECTIONS.branches,
      {
        name: DEMO_BRANCH_NAME,
        code: DEMO_BRANCH_CODE,
        address: "Sheikh Zayed Road",
        city: "Dubai",
        country: "United Arab Emirates",
        phone: "+971 4 000 0000",
        email: "demo@moneyexchange.com",
        managerId: null,
        logoUrl: null,
        brandingColor: "#0ea5e9",
        workingHours: "Mon–Sat 9:00–21:00",
        status: "active",
        settings: {
          ...DEFAULT_BRANCH_SETTINGS,
          slogan: "Your trusted exchange partner",
        },
      },
      DEMO_BRANCH_DOC_ID,
    );
  }

  async function upsertDemoDoc(collectionName: string, docId: string, data: Record<string, unknown>) {
    await setDoc(
      doc(db, collectionName, docId),
      {
        ...data,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  let order = 0;
  for (const currency of DEMO_CURRENCIES) {
    order += 1;
    const rates = DEMO_RATES[currency.currencyCode];
    const docId = `rate_${branchId}_${currency.currencyCode.toLowerCase()}`;
    await upsertDemoDoc(COLLECTIONS.exchangeRates, docId, {
      branchId,
      currencyCode: currency.currencyCode,
      buyRate: rates.buyRate,
      sellRate: rates.sellRate,
      version: 1,
      displayOrder: order,
      isHidden: false,
      status: "published",
      updatedBy: actor.userId,
      updatedByName: actor.userName,
      publishedAt: new Date(),
    });
  }

  const videoId = `video_${branchId}_demo`;
  await upsertDemoDoc(COLLECTIONS.videos, videoId, {
    title: "Demo signage video",
    description: "Local demo MP4 served from /demo-video.mp4",
    branchId,
    category: "promo",
    sourceType: "external",
    storagePath: null,
    downloadUrl: DEMO_SAMPLE_VIDEO_URL,
    mimeType: "video/mp4",
    durationSeconds: 21,
    status: "active",
    expiresAt: null,
    createdBy: actor.userId,
  });

  const tickerId = `ticker_${branchId}_main`;
  await upsertDemoDoc(COLLECTIONS.tickerMessages, tickerId, {
    branchId,
    messages: DEMO_TICKER_LINES.map((text, index) => ({
      id: `line-${index + 1}`,
      text,
      priority: index + 1,
    })),
    scrollSpeed: 50,
    fontSize: 18,
    fontColor: "#FFFFFF",
    paused: false,
    language: "en",
    scheduleStart: null,
    scheduleEnd: null,
    status: "active",
    createdBy: actor.userId,
  });

  await writeAuditLog({
    action: "demo_content_load",
    entityType: "branch",
    entityId: branchId,
    userId: actor.userId,
    userName: actor.userName,
    branchId,
    metadata: { branchCode: DEMO_BRANCH_CODE },
  });

  return { branchId, branchCode: DEMO_BRANCH_CODE };
}
