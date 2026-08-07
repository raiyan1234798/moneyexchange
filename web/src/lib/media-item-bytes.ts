/** Bytes for one media row — prefer stored size, else estimate data: URLs. */
export function estimateMediaItemBytes(item: {
  fileSizeBytes?: number | null;
  downloadUrl?: string | null;
}): number {
  if (typeof item.fileSizeBytes === "number" && item.fileSizeBytes > 0) {
    return item.fileSizeBytes;
  }
  const url = item.downloadUrl?.trim() ?? "";
  if (url.startsWith("data:")) {
    // base64 payload ≈ 75% of the data-URL string length
    const comma = url.indexOf(",");
    const payload = comma >= 0 ? url.slice(comma + 1) : url;
    return Math.ceil(payload.length * 0.75);
  }
  return 0;
}
