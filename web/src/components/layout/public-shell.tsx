"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Coins, Sparkles } from "lucide-react";
import { PolymorphicBackground } from "@/components/layout/polymorphic-background";
import { RealtimeBadge } from "@/contexts/realtime-context";
import { Button } from "@/components/ui/button";

export function PublicShell({
  children,
  showNav = true,
}: {
  children: React.ReactNode;
  showNav?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {showNav ? (
        <header className="sticky top-0 z-40 border-b border-border/35 bg-background/70 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-10">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background shadow-md transition-transform group-hover:scale-105">
                <Coins className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold sm:text-base">MoneyExchange</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:block">
                <RealtimeBadge />
              </div>
              <Link href="/login">
                <Button size="sm" className="rounded-xl sm:h-10">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </header>
      ) : null}
      <PolymorphicBackground>
        <div className="mx-auto w-full max-w-[1400px] flex-1">{children}</div>
      </PolymorphicBackground>
    </div>
  );
}

export function PublicHeroBadge({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border/50 bg-card/60 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md sm:text-xs"
    >
      <Sparkles className="h-3 w-3" />
      {children}
    </motion.div>
  );
}

export function PublicCtaButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
}) {
  return (
    <Link href={href} className="w-full sm:w-auto">
      <Button
        size="lg"
        variant={variant === "outline" ? "outline" : "default"}
        className="h-12 w-full rounded-xl px-8 sm:w-auto"
      >
        {children}
        {variant === "primary" ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
      </Button>
    </Link>
  );
}
