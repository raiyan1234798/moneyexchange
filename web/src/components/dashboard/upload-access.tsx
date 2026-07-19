"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, LockOpen, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { ContentPanel } from "@/components/shared/page-elements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { isClientAdminEmail, normalizeEmail } from "@/lib/auth/user-profile";
import { CLIENT_ADMIN_EMAIL } from "@/lib/constants";
import {
  grantUploadAccess,
  revokeUploadAccess,
  setUploadPassword,
  subscribeUploadAccess,
  type UploadAccessConfig,
} from "@/lib/services/upload-access-service";

type Actor = { userId: string; userName: string } | null;

export interface UploadAccessState {
  loaded: boolean;
  lockActive: boolean;
  uploadsUnlocked: boolean;
  isOwner: boolean;
  isDev: boolean;
  isGranted: boolean;
  canSeePassword: boolean;
  password: string;
  grantedEmails: string[];
  unlock: () => void;
}

/** Reads the upload lock and works out what the current admin may do. */
export function useUploadAccess(): UploadAccessState {
  const { user, profile, isSuperAdmin } = useAuth();
  const [config, setConfig] = useState<UploadAccessConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const unsub = subscribeUploadAccess((c) => {
      setConfig(c);
      setLoaded(true);
    });
    return unsub;
  }, []);

  const email = normalizeEmail(profile?.email ?? user?.email ?? "");
  const isOwner = isClientAdminEmail(email);
  const isDev = isSuperAdmin;
  const grantedEmails = config?.grantedEmails ?? [];
  const password = (config?.password ?? "").trim();
  const lockActive = password.length > 0;
  const isGranted = isOwner || isDev || grantedEmails.includes(email);
  const canSeePassword = isGranted;
  // The owner (who sets the password) and the developer super admin always keep
  // access. Granted admins must enter the password once per session; everyone
  // else is blocked while a password is set.
  const uploadsUnlocked = !lockActive || isDev || isOwner || unlocked;

  return useMemo(
    () => ({
      loaded,
      lockActive,
      uploadsUnlocked,
      isOwner,
      isDev,
      isGranted,
      canSeePassword,
      password,
      grantedEmails,
      unlock: () => setUnlocked(true),
    }),
    [loaded, lockActive, uploadsUnlocked, isOwner, isDev, isGranted, canSeePassword, password, grantedEmails],
  );
}

/**
 * The lock screen + owner controls shown above the upload sections on the Videos
 * page. When uploads are unlocked it shows only a small owner panel (if any).
 */
export function UploadAccessPanel({ state, actor }: { state: UploadAccessState; actor: Actor }) {
  const { lockActive, uploadsUnlocked, isOwner, isDev, canSeePassword, password, grantedEmails, unlock } = state;
  const canManage = isOwner || isDev;

  const [entered, setEntered] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [busy, setBusy] = useState(false);

  function tryUnlock() {
    if (entered.trim() === password) {
      unlock();
      setEntered("");
      toast.success("Uploads unlocked");
    } else {
      toast.error("Wrong password");
    }
  }

  async function savePassword() {
    if (!actor) return;
    setBusy(true);
    try {
      await setUploadPassword(newPassword, actor);
      toast.success(newPassword.trim() ? "Upload password saved" : "Upload lock turned off");
      setNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the password");
    } finally {
      setBusy(false);
    }
  }

  async function addGrant() {
    if (!actor) return;
    setBusy(true);
    try {
      await grantUploadAccess(grantEmail, actor);
      toast.success(`${normalizeEmail(grantEmail)} can now upload`);
      setGrantEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not grant access");
    } finally {
      setBusy(false);
    }
  }

  async function removeGrant(email: string) {
    if (!actor) return;
    try {
      await revokeUploadAccess(email, actor);
      toast.success(`Removed ${email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove access");
    }
  }

  // ---- Owner/developer management block (always available to them) ----
  const managePanel = canManage ? (
    <div className="space-y-4 rounded-xl border border-border/40 bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <p className="text-sm font-semibold">Upload access (owner controls)</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Only <strong>{CLIENT_ADMIN_EMAIL}</strong> controls this. Set a password to lock who can
        upload <em>and reorder</em> videos &amp; images, then add the admins who are allowed — they
        will see the password.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Upload password {lockActive ? "" : "(none — uploads are open)"}</Label>
          <Input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={lockActive ? "Type a new password to change it" : "Set a password to lock uploads"}
            className="rounded-xl"
          />
        </div>
        <Button onClick={() => void savePassword()} disabled={busy} className="rounded-xl">
          {lockActive ? "Change password" : "Set password"}
        </Button>
      </div>
      {lockActive ? (
        <>
          <p className="text-xs">
            Current password:{" "}
            <strong className="font-mono rounded bg-background px-1.5 py-0.5">{password}</strong>{" "}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 rounded px-2 text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(password);
                toast.success("Password copied");
              }}
            >
              Copy
            </Button>
          </p>
          <button
            type="button"
            onClick={() => {
              setNewPassword("");
              void setUploadPassword("", actor ?? { userId: "", userName: "" }).then(() =>
                toast.success("Upload lock turned off"),
              );
            }}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Turn the lock off
          </button>
        </>
      ) : null}
      <div className="space-y-2 border-t border-border/40 pt-3">
        <Label className="text-xs">Admins allowed to upload</Label>
        <div className="flex flex-wrap gap-2">
          {grantedEmails.length === 0 ? (
            <span className="text-xs text-muted-foreground">No one added yet.</span>
          ) : (
            grantedEmails.map((email) => (
              <Badge key={email} variant="secondary" className="gap-1.5 rounded-lg py-1 pl-2.5 pr-1">
                {email}
                <button
                  type="button"
                  aria-label={`Remove ${email}`}
                  onClick={() => void removeGrant(email)}
                  className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-destructive/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            type="email"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            placeholder="admin-email@example.com"
            className="rounded-xl"
          />
          <Button variant="outline" onClick={() => void addGrant()} disabled={busy} className="rounded-xl">
            Add admin
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  // ---- Lock screen (uploads still locked for this admin) ----
  if (lockActive && !uploadsUnlocked) {
    return (
      <ContentPanel
        title="Uploads are locked"
        description="Enter the upload password to add or reorder videos and images."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            {canSeePassword
              ? "You have upload access — enter the password below."
              : `You don't have upload access yet. Ask ${CLIENT_ADMIN_EMAIL} to grant you access.`}
          </div>
          {canSeePassword ? (
            <p className="text-xs">
              Password:{" "}
              <strong className="font-mono rounded bg-muted px-1.5 py-0.5">{password}</strong>
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              type="password"
              value={entered}
              onChange={(e) => setEntered(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="Upload password"
              className="rounded-xl"
            />
            <Button onClick={tryUnlock} className="rounded-xl">
              Unlock uploads
            </Button>
          </div>
          {managePanel}
        </div>
      </ContentPanel>
    );
  }

  // ---- Unlocked (or no lock): just show the owner controls, if any ----
  if (!managePanel) return null;
  return (
    <ContentPanel
      title="Uploads"
      description={lockActive ? "Uploads are unlocked for this session." : undefined}
    >
      <div className="space-y-4">
        {lockActive ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <LockOpen className="h-4 w-4" /> Uploads unlocked.
          </div>
        ) : null}
        {managePanel}
      </div>
    </ContentPanel>
  );
}
