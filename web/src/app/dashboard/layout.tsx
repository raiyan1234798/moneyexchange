"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import {
  DashboardMobileBottomNav,
  DashboardSidebarDesktop,
  DashboardUnifiedHeader,
} from "@/components/layout/dashboard-sidebar";
import { PolymorphicBackground } from "@/components/layout/polymorphic-background";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-background">
        <DashboardSidebarDesktop />
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardUnifiedHeader />
          <PolymorphicBackground>
            <main className="mx-auto w-full max-w-[1600px] pb-24 lg:pb-0">{children}</main>
          </PolymorphicBackground>
          <DashboardMobileBottomNav />
        </div>
      </div>
    </AuthGuard>
  );
}
