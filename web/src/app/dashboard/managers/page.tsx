"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** @deprecated Use /dashboard/users */
export default function ManagersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/users");
  }, [router]);
  return null;
}
