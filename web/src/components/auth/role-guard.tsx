"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { NAV_ITEMS } from "@/lib/constants";
import type { UserRole } from "@/lib/types";

function getDefaultPath(role: UserRole): string {
  return role === "branchUser" ? "/dashboard/exchange-rates" : "/dashboard";
}

function isPathAllowed(pathname: string, role: UserRole): boolean {
  if (pathname === "/dashboard/profile" || pathname.startsWith("/dashboard/profile/")) {
    return true;
  }

  return NAV_ITEMS.some((item) => {
    if (!item.roles.includes(role)) return false;
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  });
}

export function DashboardRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useAuth();

  const role = profile?.role;
  const allowed = role ? isPathAllowed(pathname, role) : false;

  useEffect(() => {
    if (loading || !profile) return;
    if (!isPathAllowed(pathname, profile.role)) {
      router.replace(getDefaultPath(profile.role));
    }
  }, [loading, pathname, profile, router]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

export function getPostLoginPath(role: UserRole): string {
  return getDefaultPath(role);
}
