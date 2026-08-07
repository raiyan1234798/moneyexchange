/** Stable identity keys for a media file — used to skip / collapse duplicates. */
export function mediaIdentityKeys(
  downloadUrl?: string | null,
  storagePath?: string | null,
): string[] {
  const keys: string[] = [];
  const path = storagePath?.trim();
  if (path) keys.push(`path:${path}`);
  const url = downloadUrl?.trim();
  if (url) {
    keys.push(`url:${url}`);
    if (!url.startsWith("data:")) {
      try {
        const parsed = new URL(url);
        parsed.hash = "";
        keys.push(`url:${parsed.toString()}`);
        keys.push(`pathurl:${parsed.origin}${parsed.pathname}`);
      } catch {
        /* ignore unparseable URLs */
      }
    }
  }
  return [...new Set(keys)];
}

export function mediaKeysOverlap(
  downloadUrl: string | null | undefined,
  storagePath: string | null | undefined,
  known: Set<string>,
): boolean {
  return mediaIdentityKeys(downloadUrl, storagePath).some((k) => known.has(k));
}

export function rememberMediaKeys(
  downloadUrl: string | null | undefined,
  storagePath: string | null | undefined,
  known: Set<string>,
): void {
  for (const k of mediaIdentityKeys(downloadUrl, storagePath)) known.add(k);
}

export function uniqueByMediaKey<T extends { downloadUrl?: string | null; storagePath?: string | null }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (mediaKeysOverlap(item.downloadUrl, item.storagePath, seen)) continue;
    rememberMediaKeys(item.downloadUrl, item.storagePath, seen);
    out.push(item);
  }
  return out;
}
