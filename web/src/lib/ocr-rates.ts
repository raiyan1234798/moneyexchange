import { auth } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image-utils";
import { parseCurrencyCell, type RateImportRow } from "@/lib/rate-import";

/**
 * Read exchange rates from a PHOTO of a rate board / rate sheet.
 *
 * The image is downscaled client-side, then sent to /api/ocr-rates where a
 * Workers AI vision model extracts the rows (far more accurate on photos than
 * in-browser OCR). Rows come back through the same review-before-publish flow
 * as an Excel import.
 */
export async function ocrRatesFromImage(file: File): Promise<RateImportRow[]> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to import rates.");
  const token = await user.getIdToken();

  // Downscale for upload speed; keep enough resolution for small board text.
  const { dataUrl } = await compressImageToDataUrl(file, {
    maxDimension: 1800,
    targetBytes: 900_000,
  });
  const blob = await (await fetch(dataUrl)).blob();

  const form = new FormData();
  form.append("image", blob, "rates-photo.jpg");

  const res = await fetch("/api/ocr-rates", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    rows?: Array<{
      currency?: string;
      buy?: number | null;
      sell?: number | null;
      transferUsd?: number | null;
      transferLocal?: number | null;
    }>;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Photo reading failed (${res.status})`);

  const rows: RateImportRow[] = [];
  for (const r of data.rows ?? []) {
    const cell = parseCurrencyCell(String(r.currency ?? ""));
    if (!cell.currencyCode) continue;
    const buy = typeof r.buy === "number" && r.buy > 0 ? r.buy : 0;
    const sell = typeof r.sell === "number" && r.sell > 0 ? r.sell : 0;
    const transferUsd = typeof r.transferUsd === "number" && r.transferUsd > 0 ? r.transferUsd : null;
    const transferLocal =
      typeof r.transferLocal === "number" && r.transferLocal > 0 ? r.transferLocal : null;
    if (!buy && !sell && !transferUsd && !transferLocal) continue;
    rows.push({ ...cell, buyRate: buy, sellRate: sell, transferUsd, transferLocal });
  }

  if (rows.length === 0) {
    throw new Error("No rates found in the photo — try a clearer, straight-on photo.");
  }
  return rows;
}
