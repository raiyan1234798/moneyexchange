"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  Coins,
  LayoutDashboard,
  ListVideo,
  LogOut,
  Menu,
  Monitor,
  Moon,
  MoreHorizontal,
  ScrollText,
  Settings,
  Sun,
  TextCursorInput,
  TrendingUp,
  Users,
  User,
  Video,
} from "lucide-react";
import { useTheme } from "next-themes";
import { UnimoniLogo } from "@/components/brand/unimoni-logo";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { BRAND } from "@/lib/brand";
import { useAuth } from "@/contexts/auth-context";
import { RealtimeBadge } from "@/contexts/realtime-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const iconMap = {
  LayoutDashboard,
  Building2,
  Users,
  User,
  Coins,
  TrendingUp,
  Video,
  ListVideo,
  TextCursorInput,
  Monitor,
  Activity,
  BarChart3,
  Bell,
  ScrollText,
  Settings,
};

const MOBILE_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/exchange-rates", label: "Rates", icon: TrendingUp },
  { href: "/dashboard/videos", label: "Videos", icon: Video },
  { href: "/dashboard/profile", label: "Profile", icon: User },
] as const;

function mobileNavForRole(role: string) {
  return MOBILE_NAV.filter((item) => {
    const nav = NAV_ITEMS.find((entry) => entry.href === item.href);
    return nav?.roles.includes(role as (typeof NAV_ITEMS)[number]["roles"][number]);
  });
}

function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="group flex items-center gap-3">
      <UnimoniLogo size={compact ? "xs" : "sm"} className="min-w-0" />
    </Link>
  );
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function NavLinks({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const role = profile?.role ?? "branchManager";
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role as (typeof item.roles)[number]));
  const currentPath = normalizePath(pathname);

  return (
    <nav className={cn("flex flex-col gap-0.5", className)}>
      {items.map((item) => {
        const Icon = iconMap[item.icon as keyof typeof iconMap];
        const active =
          currentPath === item.href ||
          (item.href !== "/dashboard" && currentPath.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200",
              active
                ? "text-[var(--brand-primary)] dark:text-[var(--brand-accent)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-xl border-l-[3px] border-[var(--brand-primary)] bg-[var(--brand-primary)]/8 dark:border-[var(--brand-accent)] dark:bg-[var(--brand-accent)]/10"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : (
              <span className="absolute inset-0 rounded-xl bg-transparent transition-colors group-hover:bg-[var(--unimoni-blue)]/8" />
            )}
            <Icon
              className={cn(
                "relative z-10 h-4 w-4 shrink-0",
                active && "text-[var(--brand-primary)] dark:text-[var(--brand-accent)]",
              )}
            />
            <span
              className={cn(
                "relative z-10",
                active && "text-[var(--brand-primary)] dark:text-[var(--brand-accent)]",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserPanel({ onAction }: { onAction?: () => void }) {
  const { profile, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 p-4 backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-3">
        <Avatar className="h-10 w-10 rounded-xl ring-2 ring-[var(--brand-accent)]/25">
          <AvatarFallback className="rounded-xl bg-[var(--brand-primary-light)]/30 text-xs font-semibold text-[var(--brand-accent)]">
            {(profile?.displayName || profile?.email || "U").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{profile?.displayName || "User"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{profile?.email}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 rounded-xl" render={<Link href="/dashboard/profile" onClick={onAction} />}>
          Profile
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-xl"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-xl"
          onClick={() => {
            onAction?.();
            void logout();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

function MobileNavSheet({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            className="flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        }
      />
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-border/40 bg-background/95 p-6 backdrop-blur-xl"
      >
        <SheetHeader>
          <SheetTitle>All sections</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <NavLinks onNavigate={onNavigate} />
        </div>
        <div className="mt-6">
          <UserPanel onAction={onNavigate} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DashboardSidebarDesktop() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-border/35 bg-sidebar/80 p-4 backdrop-blur-2xl lg:flex">
      <div className="mb-5 shrink-0 px-1">
        <BrandMark />
      </div>
      <div className="mb-3 shrink-0 px-1">
        <RealtimeBadge />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-1">
        <NavLinks />
      </div>
      <div className="mt-4 shrink-0">
        <UserPanel />
      </div>
    </aside>
  );
}

export function DashboardUnifiedHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/35 bg-background/70 px-4 backdrop-blur-xl sm:h-16 sm:px-6 lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="outline" size="icon" className="shrink-0 rounded-xl lg:hidden" aria-label="Open navigation menu">
                <Menu className="h-4 w-4" />
              </Button>
            }
          />
          <SheetContent
            side="left"
            className="w-[min(100vw-2rem,320px)] border-border/40 bg-background/95 p-5 backdrop-blur-xl"
          >
            <SheetHeader className="mb-4">
              <SheetTitle className="text-left">
                <BrandMark />
              </SheetTitle>
            </SheetHeader>
            <RealtimeBadge />
            <div className="mt-6 max-h-[50vh] overflow-y-auto">
              <NavLinks />
            </div>
            <div className="mt-6">
              <UserPanel />
            </div>
          </SheetContent>
        </Sheet>
        <BrandMark compact />
      </div>
      <RealtimeBadge />
    </header>
  );
}

export function DashboardMobileBottomNav() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const role = profile?.role ?? "branchManager";
  const items = mobileNavForRole(role);
  const currentPath = normalizePath(pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/35 bg-background/85 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {items.map((item) => {
          const active =
            currentPath === item.href ||
            (item.href !== "/dashboard" && currentPath.startsWith(`${item.href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[10px] font-medium transition-colors",
                active
                  ? "text-[var(--brand-primary)] dark:text-[var(--brand-accent)]"
                  : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                  active
                    ? "bg-[var(--brand-primary)]/12 text-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/25 dark:bg-[var(--brand-accent)]/15 dark:text-[var(--brand-accent)] dark:ring-[var(--brand-accent)]/30"
                    : "bg-transparent",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              {item.label}
            </Link>
          );
        })}
        <MobileNavSheet />
      </div>
    </nav>
  );
}

export function DashboardHeader({
  title,
  description,
  accent,
}: {
  title: string;
  description?: string;
  accent?: "violet" | "emerald" | "sky" | "amber" | "rose" | "default";
}) {
  const accentClass = accent ? `section-accent-${accent} section-header-accent` : "";

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-border/30 px-4 py-6 sm:px-6 sm:py-7 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className={cn("min-w-0", accentClass)}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-[11px]">
            {BRAND.name} Console
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:mt-2 sm:text-3xl lg:text-[2.25rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="hidden shrink-0 lg:block">
          <RealtimeBadge />
        </div>
      </div>
    </motion.div>
  );
}

/** @deprecated use DashboardSidebarDesktop */
export const DashboardSidebar = DashboardSidebarDesktop;
/** @deprecated use DashboardUnifiedHeader */
export const DashboardTopBar = DashboardUnifiedHeader;
