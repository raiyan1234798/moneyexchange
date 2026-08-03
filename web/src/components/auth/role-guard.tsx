"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { NAV_ITEMS, NAV_MODULE } from "@/lib/constants";
import type { UserRole } from "@/lib/types";

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getDefaultPath(): string {
  return "/dashboard";
}

function isPathAllowed(
  pathname: string,
  role: UserRole,
  hasModule: (key: string) => boolean,
): boolean {
  const path = normalizePath(pathname);

  if (path === "/dashboard/profile" || path.startsWith("/dashboard/profile/")) {
    return true;
  }

  return NAV_ITEMS.some((item) => {
    const matchesPath =
      item.href === "/dashboard"
        ? path === "/dashboard"
        : path === item.href || path.startsWith(`${item.href}/`);
    if (!matchesPath) return false;
    // Admit by ROLE, or by a granted "Access" chip for this route — mirroring
    // the sidebar (NAV_MODULE). Without the module check the grid is dead: the
    // sidebar shows the link but the guard bounces the user (client 2026-08-01).
    if (item.roles.includes(role)) return true;
    const moduleKeys = NAV_MODULE[item.href];
    return moduleKeys ? moduleKeys.some((k) => hasModule(k)) : false;
  });
}

export function DashboardRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading, hasModule } = useAuth();

  const role = profile?.role;
  const allowed = role ? isPathAllowed(pathname, role, hasModule) : false;

  useEffect(() => {
    if (loading || !profile) return;
    if (!isPathAllowed(pathname, profile.role, hasModule)) {
      router.replace(getDefaultPath());
    }
  }, [loading, pathname, profile, router, hasModule]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function getPostLoginPath(): string {
  return getDefaultPath();
}
