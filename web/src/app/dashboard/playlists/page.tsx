"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Playlists removed — displays use branch videos directly. */
export default function PlaylistsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/videos");
  }, [router]);

  return null;
}
