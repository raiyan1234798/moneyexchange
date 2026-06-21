"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDisplayUrl } from "@/lib/display-url";

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
    router.replace(getDisplayUrl(code).replace(/^https?:\/\/[^/]+/, ""));
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06060a] px-4 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="animate-blob absolute -left-20 top-0 h-[480px] w-[480px] rounded-full bg-indigo-600/20 blur-[100px]" />
        <div className="animate-blob animation-delay-2000 absolute -right-16 bottom-0 h-[420px] w-[420px] rounded-full bg-emerald-500/15 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#06060a_70%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg"
      >
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl sm:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-black shadow-lg">
            <Monitor className="h-8 w-8" />
          </div>
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">Browser Signage</p>
          <h1 className="mt-2 text-center text-3xl font-semibold tracking-tight sm:text-4xl">Connect Display</h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-zinc-400">
            Enter the branch code from Dashboard → Branches. Open in Chrome and press F11 for fullscreen.
          </p>

          <div className="mt-8 space-y-2">
            <Label htmlFor="branch" className="text-zinc-400">
              Branch Code
            </Label>
            <Input
              id="branch"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
              placeholder="DXB01"
              className="h-16 rounded-2xl border-white/10 bg-black/50 text-center text-3xl font-bold tracking-[0.3em] uppercase shadow-inner"
              maxLength={12}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
            />
          </div>

          <Button
            className="mt-6 h-13 w-full rounded-2xl text-base"
            size="lg"
            disabled={loading}
            onClick={handleStart}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Monitor className="mr-2 h-5 w-5" />}
            Launch Signage
          </Button>

          <div className="mt-8 rounded-2xl border border-white/8 bg-black/30 p-5">
            <p className="text-sm font-medium text-zinc-300">Kiosk tip</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Set your display browser home URL to this page or bookmark{" "}
              <code className="text-zinc-400">/display?branch=YOUR_CODE</code> for one-click launch.
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
        <div className="flex min-h-screen items-center justify-center bg-[#06060a] text-white">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      }
    >
      <DisplaySetupContent />
    </Suspense>
  );
}
