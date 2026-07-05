"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { UnimoniLogo } from "@/components/brand/unimoni-logo";
import { HeroReveal } from "@/components/motion/reveal";
import { PolymorphicBackground } from "@/components/layout/polymorphic-background";
import { RealtimeBadge } from "@/contexts/realtime-context";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

export function PublicShell({
  children,
  showNav = true,
  showFooter = true,
}: {
  children: React.ReactNode;
  showNav?: boolean;
  showFooter?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background mesh-background">
      {showNav ? (
        <header className="sticky top-0 z-40 border-b border-border/35 bg-background/75 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-10">
            <Link href="/" className="group flex items-center gap-3">
              <UnimoniLogo size="sm" />
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:block">
                <RealtimeBadge />
              </div>
              <Link href="/login">
                <Button size="sm" className="btn-gradient rounded-xl sm:h-10">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </header>
      ) : null}
      <PolymorphicBackground>
        <div className="pointer-events-none absolute inset-0 grid-pattern opacity-60" aria-hidden />
        <div className="relative z-10 mx-auto w-full max-w-[1400px] flex-1">{children}</div>
      </PolymorphicBackground>
      {showFooter ? <PublicFooter /> : null}
    </div>
  );
}

export function PublicHeroBadge({ children }: { children: React.ReactNode }) {
  return (
    <HeroReveal delay={0} className="animate-fade-in-up mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--unimoni-blue)]/20 bg-card/70 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md sm:text-xs">
      <Sparkles className="h-3 w-3 text-[var(--unimoni-gold)]" />
      {children}
    </HeroReveal>
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
        className={
          variant === "primary"
            ? "btn-gradient h-12 w-full rounded-xl px-8 sm:w-auto"
            : "h-12 w-full rounded-xl border-[var(--unimoni-blue)]/25 px-8 hover:border-[var(--unimoni-blue)]/45 sm:w-auto"
        }
      >
        {children}
        {variant === "primary" ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
      </Button>
    </Link>
  );
}

function PublicFooter() {
  return (
    <footer className="relative z-10 border-t border-border/35 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <UnimoniLogo size="xs" />
          <p className="text-sm text-muted-foreground">
            {BRAND.fullName} · A WIZ Group Financial
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/login" className="transition-colors hover:text-[var(--unimoni-blue-light)]">
            Console
          </Link>
          <Link href="/display/setup" className="transition-colors hover:text-[var(--unimoni-blue-light)]">
            Display Setup
          </Link>
          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="transition-colors hover:text-[var(--unimoni-blue-light)]"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}

export { BRAND };
