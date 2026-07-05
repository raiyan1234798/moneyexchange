"use client";

import { Building2, Monitor, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import { UnimoniLogo } from "@/components/brand/unimoni-logo";
import { HeroReveal } from "@/components/motion/reveal";
import { PublicCtaButton, PublicHeroBadge, PublicShell } from "@/components/layout/public-shell";
import { BRAND } from "@/lib/brand";

const features = [
  {
    icon: Building2,
    title: "Multi-Branch Control",
    description: "Centralized admin with branch-scoped managers, rates, videos, and brand identity per location.",
    accent: "from-[var(--unimoni-blue)]/18 via-[var(--unimoni-blue)]/5 to-transparent",
  },
  {
    icon: Monitor,
    title: "Browser Signage",
    description: "Open a URL in Chrome fullscreen on any display. Rates, videos, and tickers sync in real time.",
    accent: "from-[var(--unimoni-cyan)]/18 via-[var(--unimoni-cyan)]/5 to-transparent",
  },
  {
    icon: TrendingUp,
    title: "Live Rate Publishing",
    description: "Branch-specific buy/sell rates with bulk edit, audit trail, and instant display sync.",
    accent: "from-emerald-500/18 via-emerald-500/5 to-transparent",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Security",
    description: "Role-based access, audit logs, and hardened Firebase rules across every operation.",
    accent: "from-[var(--unimoni-gold)]/18 via-[var(--unimoni-gold)]/5 to-transparent",
  },
];

const stats = [
  { label: "Real-time sync", value: "<1s" },
  { label: "Offline capable", value: "100%" },
  { label: "Branch isolation", value: "Full" },
];

export default function HomePage() {
  return (
    <PublicShell>
      <div className="relative flex flex-col justify-center px-4 py-14 sm:px-6 sm:py-20 lg:px-10 lg:py-28">
        <PublicHeroBadge>{BRAND.subtitle}</PublicHeroBadge>

        <HeroReveal delay={0.05} className="animate-fade-in-up stagger-1 mb-6">
          <UnimoniLogo size="xl" />
        </HeroReveal>

        <HeroReveal delay={0.1} className="animate-fade-in-up stagger-2">
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            Exchange rates.
            <span className="gradient-text block">Every screen. One system.</span>
          </h1>
        </HeroReveal>

        <HeroReveal delay={0.15} className="animate-fade-in-up stagger-3">
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:mt-7 sm:text-lg lg:text-xl">
            {BRAND.fullName} — manage branches, publish rates, and drive professional browser-based
            signage from a single premium dashboard.
          </p>
        </HeroReveal>

        <HeroReveal delay={0.2} className="animate-fade-in-up stagger-4 mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
          <PublicCtaButton href="/login">Sign in to Console</PublicCtaButton>
          <PublicCtaButton href="/display/setup" variant="outline">
            Branch Display Setup
          </PublicCtaButton>
        </HeroReveal>

        <HeroReveal delay={0.25} className="animate-fade-in-up stagger-5 mt-10 flex flex-wrap gap-6 sm:mt-14">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--unimoni-gold)]/10 ring-1 ring-[var(--unimoni-gold)]/25">
                <Zap className="h-4 w-4 text-[var(--unimoni-gold)]" />
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </HeroReveal>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:mt-20 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
          {features.map((feature, index) => (
            <HeroReveal
              key={feature.title}
              delay={0.1 + index * 0.06}
              className={`glass-panel-elevated interactive-card animate-fade-in-up bg-gradient-to-br p-6 ${feature.accent}`}
            >
              <feature.icon className="mb-4 h-7 w-7 text-[var(--unimoni-blue-light)] sm:h-8 sm:w-8" />
              <h2 className="text-base font-semibold sm:text-lg">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </HeroReveal>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
