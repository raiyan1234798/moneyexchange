"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { DashboardRouteGuard } from "@/components/auth/role-guard";
import {
  DashboardMobileBottomNav,
  DashboardSidebarDesktop,
  DashboardUnifiedHeader,
} from "@/components/layout/dashboard-sidebar";
import { PolymorphicBackground } from "@/components/layout/polymorphic-background";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DashboardRouteGuard>
        <div className="flex h-screen overflow-hidden bg-background mesh-background">
          <DashboardSidebarDesktop />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <DashboardUnifiedHeader />
            <PolymorphicBackground className="min-h-0 flex-1 overflow-y-auto">
              <main className="mx-auto w-full max-w-[1600px] pb-24 lg:pb-0">{children}</main>
            </PolymorphicBackground>
            <DashboardMobileBottomNav />
          </div>
        </div>
      </DashboardRouteGuard>
    </AuthGuard>
  );
}
