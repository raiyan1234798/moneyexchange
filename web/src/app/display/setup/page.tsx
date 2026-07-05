"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";
import { UnimoniLogo } from "@/components/brand/unimoni-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDisplayUrl, setStoredDisplayBranchCode } from "@/lib/display-url";

function DisplaySetupContent() {
  const router = useRouter();
  const [branchCode, setBranchCode] = useState("");
  const [loading, setLoading] = useState(false);

  function handleStart() {
    const code = branchCode.trim().toUpperCase();
    if (code.length < 2) {
      toast.error("Enter your branch code from the dashboard");
      return;
    }
    setLoading(true);
    setStoredDisplayBranchCode(code);
    router.replace(getDisplayUrl(code).replace(/^https?:\/\/[^/]+/, ""));
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B1F3A] px-4 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="animate-blob absolute -left-20 top-0 h-[480px] w-[480px] rounded-full bg-[#1E3A5F]/30 blur-[100px]" />
        <div className="animate-blob animation-delay-2000 absolute -right-16 bottom-0 h-[420px] w-[420px] rounded-full bg-[#D4A853]/12 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0B1F3A_70%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg"
      >
        <div className="rounded-3xl border border-[#D4A853]/20 bg-[#1E3A5F]/40 p-8 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-10">
          <div className="mx-auto mb-6 flex flex-col items-center text-center">
            <UnimoniLogo size="lg" />
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#D4A853]/80">
              Browser Signage
            </p>
          </div>
          <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Open Display</h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-white/60">
            Enter your branch code from Dashboard → Branches. The display opens immediately — press F11 or use the
            Fullscreen button on screen.
          </p>

          <div className="mt-8 space-y-2">
            <Label htmlFor="branch" className="text-white/50">
              Branch Code
            </Label>
            <Input
              id="branch"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
              placeholder="DXB01"
              className="h-16 rounded-2xl border-[#D4A853]/20 bg-[#0B1F3A]/80 text-center text-3xl font-bold tracking-[0.3em] uppercase text-[#F5B942] shadow-inner"
              maxLength={12}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
            />
          </div>

          <Button
            className="mt-6 h-13 w-full rounded-2xl border-[#D4A853]/30 bg-[#D4A853] text-base font-semibold text-[#0B1F3A] hover:bg-[#F5B942]"
            size="lg"
            disabled={loading}
            onClick={handleStart}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Monitor className="mr-2 h-5 w-5" />}
            Launch Signage
          </Button>

          <p className="mt-4 text-center text-xs text-white/40">
            Need a branch code? Ask your administrator or sign in to Dashboard → Branches.
          </p>

          <div className="mt-6 rounded-2xl border border-white/8 bg-[#0B1F3A]/50 p-5">
            <p className="text-sm font-medium text-[#D4A853]">Kiosk tip</p>
            <p className="mt-2 text-sm leading-relaxed text-white/45">
              Set your display browser home URL to{" "}
              <code className="text-[#F5B942]/80">/display?branch=YOUR_CODE</code> for one-click launch.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function DisplaySetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0B1F3A] text-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4A853]" />
        </div>
      }
    >
      <DisplaySetupContent />
    </Suspense>
  );
}
