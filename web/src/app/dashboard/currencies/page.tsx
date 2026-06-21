"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Currencies merged into Exchange Rates — keep route for old bookmarks. */
export default function CurrenciesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/exchange-rates");
  }, [router]);

  return null;
}
