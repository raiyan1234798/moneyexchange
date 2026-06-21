"use client";

import { motion } from "framer-motion";
import { Building2, Monitor, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import { PublicCtaButton, PublicHeroBadge, PublicShell } from "@/components/layout/public-shell";

const features = [
  {
    icon: Building2,
    title: "Multi-Branch Control",
    description: "Centralized admin with branch-scoped managers, rates, videos, and brand identity per location.",
    accent: "from-violet-500/20 via-violet-500/5 to-transparent",
  },
  {
    icon: Monitor,
    title: "Browser Signage",
    description: "Open a URL in Chrome fullscreen on any display. Rates, videos, and tickers sync in real time.",
    accent: "from-sky-500/20 via-sky-500/5 to-transparent",
  },
  {
    icon: TrendingUp,
    title: "Live Rate Publishing",
    description: "Branch-specific buy/sell rates with bulk edit, audit trail, and instant display sync.",
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Security",
    description: "Role-based access, audit logs, and hardened Firebase rules across every operation.",
    accent: "from-amber-500/20 via-amber-500/5 to-transparent",
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
        <PublicHeroBadge>Premium fintech signage platform</PublicHeroBadge>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl"
        >
          Exchange rates.
          <span className="gradient-text block">Every screen. One system.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:mt-7 sm:text-lg lg:text-xl"
        >
          Enterprise console for money exchange operators — manage branches, publish rates, and drive
          cinematic browser-based signage from a single premium dashboard.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4"
        >
          <PublicCtaButton href="/login">Sign in to Console</PublicCtaButton>
          <PublicCtaButton href="/display" variant="outline">
            Open Display
          </PublicCtaButton>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 flex flex-wrap gap-6 sm:mt-14"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5">
                <Zap className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:mt-20 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 + index * 0.08 }}
              className={`glass-panel-elevated bg-gradient-to-br p-6 ${feature.accent}`}
            >
              <feature.icon className="mb-4 h-7 w-7 sm:h-8 sm:w-8" />
              <h2 className="text-base font-semibold sm:text-lg">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
