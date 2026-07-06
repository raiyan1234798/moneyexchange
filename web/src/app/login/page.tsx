"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { UnimoniLogo } from "@/components/brand/unimoni-logo";
import { HeroReveal } from "@/components/motion/reveal";
import { PublicShell } from "@/components/layout/public-shell";
import { useAuth } from "@/contexts/auth-context";
import { getPostLoginPath } from "@/components/auth/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BRAND } from "@/lib/brand";

const LOGIN_LOADING_TIMEOUT_MS = 15_000;

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 h-4 w-4">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

const highlights = [
  { icon: Zap, text: "Real-time rate sync to every display" },
  { icon: ShieldCheck, text: "Role-based access for branch teams" },
  { icon: Sparkles, text: "Premium signage without hardware" },
];

function loginLoadingMessage(loadingPhase: "auth" | "profile" | "redirect" | null): string {
  if (loadingPhase === "redirect") return "Finishing sign-in…";
  if (loadingPhase === "profile") return "Setting up your account…";
  return "Signing in…";
}

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle, user, profile, loading, loadingPhase, profileError, refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!loading && user && profile) {
      router.replace(getPostLoginPath());
    }
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTimedOut(true), LOGIN_LOADING_TIMEOUT_MS);
    // Reset transient sign-in state when this loading cycle ends (or unmount).
    return () => {
      clearTimeout(timer);
      setTimedOut(false);
      setGoogleSubmitting(false);
    };
  }, [loading]);

  async function handleRetry() {
    setRetrying(true);
    setTimedOut(false);
    try {
      await refreshProfile();
    } finally {
      setRetrying(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed";
      toast.error(message);
      setGoogleSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background mesh-background px-6 text-center">
        <Loader2 className="spinner-brand h-8 w-8" />
        <p className="text-sm text-muted-foreground">{loginLoadingMessage(loadingPhase)}</p>
        {loadingPhase === "redirect" ? (
          <p className="max-w-sm text-xs text-muted-foreground">
            Completing Google sign-in. This may take a few seconds after you return from Google.
          </p>
        ) : null}
        {profileError ? (
          <p className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {profileError}
          </p>
        ) : null}
        {timedOut ? (
          <div className="mt-2 flex flex-col items-center gap-2">
            <p className="max-w-sm text-xs text-muted-foreground">
              Sign-in is taking longer than expected. You can retry or go back and try Google again.
            </p>
            <Button onClick={() => void handleRetry()} disabled={retrying} className="rounded-xl" size="sm">
              {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <PublicShell showNav={false} showFooter={false}>
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[var(--gradient-hero)] opacity-95" />
          <div className="pointer-events-none absolute inset-0 grid-pattern opacity-30" />
          <div className="relative z-10">
            <UnimoniLogo size="lg" variant="onDark" />
          </div>
          <div className="relative z-10 space-y-6">
            <h2 className="max-w-md text-3xl font-semibold tracking-tight text-white xl:text-4xl">
              Your command center for exchange rates and digital signage.
            </h2>
            <ul className="space-y-4">
              {highlights.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-white/85">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                    <Icon className="h-4 w-4 text-[var(--unimoni-gold)]" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative z-10 text-xs text-white/50">© {new Date().getFullYear()} {BRAND.displayName}</p>
        </div>

        <div className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <HeroReveal className="glass-panel-elevated gradient-border w-full max-w-md p-6 sm:p-8 lg:p-10">
            <div className="mb-6 flex flex-col items-center text-center lg:hidden">
              <UnimoniLogo size="lg" />
            </div>
            <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Sign in</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Access your {BRAND.displayName} console
            </p>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Invited users: click <strong>Continue with Google</strong> using the exact Gmail address your admin invited.
            </p>
            {profileError ? (
              <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
                {profileError}
              </p>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl border-[var(--unimoni-blue)]/15 bg-background/80"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 rounded-xl border-[var(--unimoni-blue)]/15 bg-background/80"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="btn-gradient h-11 w-full rounded-xl" disabled={submitting || googleSubmitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign in
              </Button>
            </form>

            <div className="relative my-6">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs uppercase text-muted-foreground">
                or
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl border-[var(--unimoni-blue)]/20 hover:bg-[var(--unimoni-blue)]/5"
              disabled={submitting || googleSubmitting}
              onClick={() => void handleGoogleSignIn()}
            >
              {googleSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </Button>

            <p className="mt-7 text-center text-sm text-muted-foreground">
              <Link href="/" className="underline underline-offset-4 transition-colors hover:text-[var(--brand-primary)]">
                Back to home
              </Link>
            </p>
          </HeroReveal>
        </div>
      </div>
    </PublicShell>
  );
}
