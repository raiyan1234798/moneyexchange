"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Building2,
  ScrollText,
  Settings,
  TextCursorInput,
  TrendingUp,
  User,
  Users,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ContentPanel } from "@/components/shared/page-elements";
import type { UserRole } from "@/lib/types";

interface FeatureCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

const ADMIN_FEATURES: FeatureCard[] = [
  { title: "Branches", description: "Manage locations and branding", href: "/dashboard/branches", icon: Building2 },
  { title: "Users", description: "Invite admins, managers, and branch users", href: "/dashboard/users", icon: Users },
  { title: "Exchange Rates", description: "View rates across all branches", href: "/dashboard/exchange-rates", icon: TrendingUp },
  { title: "Media Manager", description: "Upload and schedule branch videos & images", href: "/dashboard/videos", icon: Video },
  { title: "Display Messages", description: "Scrolling tickers on branch displays", href: "/dashboard/tickers", icon: TextCursorInput },
  { title: "Settings", description: "Branch display and system preferences", href: "/dashboard/settings", icon: Settings },
  { title: "Audit Logs", description: "Review activity across the platform", href: "/dashboard/audit-logs", icon: ScrollText },
  { title: "Notifications", description: "Alerts and system announcements", href: "/dashboard/notifications", icon: Bell },
];

// Per client (2026-07-21): branch managers handle RATES ONLY — exchange
// rates + the transfer rates card. No media, messages, or team management
// (grant extra modules per user in Users if ever needed).
const BRANCH_MANAGER_FEATURES: FeatureCard[] = [
  { title: "Exchange Rates", description: "Import, edit, and publish branch forex rates", href: "/dashboard/exchange-rates", icon: TrendingUp },
  { title: "Transfer Rates", description: "Upload and edit the money-transfer rates card", href: "/dashboard/exchange-rates#transfer-rates", icon: TrendingUp },
  { title: "Notifications", description: "Stay updated on approvals and changes", href: "/dashboard/notifications", icon: Bell },
  { title: "Profile", description: "Your account and branch details", href: "/dashboard/profile", icon: User },
];

const BRANCH_USER_FEATURES: FeatureCard[] = [
  { title: "Exchange Rates", description: "Edit buy and sell rates for your branch", href: "/dashboard/exchange-rates", icon: TrendingUp },
  { title: "Profile", description: "Your account and branch details", href: "/dashboard/profile", icon: User },
];

function featuresForRole(role: UserRole): FeatureCard[] {
  switch (role) {
    case "superAdmin":
      return ADMIN_FEATURES;
    case "admin":
      return ADMIN_FEATURES.filter((feature) => feature.title !== "Branches");
    case "branchManager":
      return BRANCH_MANAGER_FEATURES;
    case "branchUser":
      return BRANCH_USER_FEATURES;
    default:
      return [];
  }
}

function boardTitle(role: UserRole): string {
  switch (role) {
    case "superAdmin":
      return "Platform control";
    case "admin":
      return "Admin workspace";
    case "branchManager":
      return "Branch manager workspace";
    case "branchUser":
      return "Your workspace";
    default:
      return "Your features";
  }
}

export function RoleFeatureBoard({
  role,
  branchName,
}: {
  role: UserRole;
  branchName?: string | null;
}) {
  const features = featuresForRole(role);
  if (features.length === 0) return null;

  const subtitle =
    role === "branchUser"
      ? `Edit rates for ${branchName ?? "your branch"}`
      : role === "branchManager"
        ? `Your branch: ${branchName ?? "—"}`
        : "Everything you can access in Unimoni";

  return (
    <ContentPanel title={boardTitle(role)} description={subtitle}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Link
              key={feature.href}
              href={feature.href}
              className="group flex flex-col rounded-xl border border-border/50 bg-card/60 p-4 transition-colors hover:border-[var(--unimoni-blue)]/30 hover:bg-[var(--unimoni-blue)]/5"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--unimoni-blue)]/10 text-[var(--unimoni-blue)]">
                <Icon className="h-5 w-5" />
              </span>
              <p className="font-medium">{feature.title}</p>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{feature.description}</p>
              <span className="mt-3 inline-flex items-center text-sm font-medium text-[var(--brand-primary)] group-hover:underline">
                Open
                <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </ContentPanel>
  );
}

export function inviteFeaturePreview(role: UserRole): string[] {
  return featuresForRole(role).map((feature) => feature.title);
}
