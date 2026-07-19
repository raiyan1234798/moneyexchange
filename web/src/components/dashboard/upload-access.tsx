"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
type PendingAction = () => void | Promise<void>;

export interface UploadAccessState {
  loaded: boolean;
  lockActive: boolean;
  uploadsUnlocked: boolean;
  isOwner: boolean;
  isDev: boolean;
  isGranted: boolean;
  password: string;
  grantedEmails: string[];
  /** Run `action` now if unlocked; otherwise pop the password prompt and run it once unlocked. */
  guard: (action: PendingAction) => void;
  promptOpen: boolean;
  confirmUnlock: () => void;
  closePrompt: () => void;
}

/** Reads the upload lock and works out what the current admin may do. */
export function useUploadAccess(): UploadAccessState {
  const { user, profile, isSuperAdmin } = useAuth();
  const [config, setConfig] = useState<UploadAccessConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const pendingRef = useRef<PendingAction | null>(null);

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
  const isGrantedAdmin = grantedEmails.includes(email);
  const isGranted = isOwner || isDev || isGrantedAdmin;
  // Owner, the developer super admin, and admins the owner has granted never
  // need the password. Everyone else can still act — they are simply asked for
  // the password AT THE MOMENT they upload or reorder (no "you have no access"
  // wall), and once entered it stays unlocked for the rest of the session.
  const uploadsUnlocked = !lockActive || isGranted || unlocked;

  const guard = useCallback(
    (action: PendingAction) => {
      if (uploadsUnlocked) {
        void action();
        return;
      }
      pendingRef.current = action;
      setPromptOpen(true);
    },
    [uploadsUnlocked],
  );

  const confirmUnlock = useCallback(() => {
    setUnlocked(true);
    setPromptOpen(false);
    const action = pendingRef.current;
    pendingRef.current = null;
    if (action) void action();
  }, []);

  const closePrompt = useCallback(() => {
    pendingRef.current = null;
    setPromptOpen(false);
  }, []);

  return useMemo(
    () => ({
      loaded,
      lockActive,
      uploadsUnlocked,
      isOwner,
      isDev,
      isGranted,
      password,
      grantedEmails,
      guard,
      promptOpen,
      confirmUnlock,
      closePrompt,
    }),
    [loaded, lockActive, uploadsUnlocked, isOwner, isDev, isGranted, password, grantedEmails, guard, promptOpen, confirmUnlock, closePrompt],
  );
}

/**
 * The password prompt — shown ONLY when a locked admin actually tries to upload
 * or reorder. Neutral wording, no "you don't have access" wall. Render once on
 * the page; it stays hidden until `guard` opens it.
 */
export function UploadPasswordDialog({ state }: { state: UploadAccessState }) {
  const [entered, setEntered] = useState("");

  function submit() {
    if (entered.trim() === state.password) {
      setEntered("");
      state.confirmUnlock();
      toast.success("Uploads unlocked");
    } else {
      toast.error("Wrong password — please try again");
    }
  }

  return (
    <Dialog
      open={state.promptOpen}
      onOpenChange={(open) => {
        if (!open) {
          setEntered("");
          state.closePrompt();
        }
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enter upload password</DialogTitle>
          <DialogDescription>
            Adding or reordering videos and images needs the upload password. Ask{" "}
            <strong>{CLIENT_ADMIN_EMAIL}</strong> if you don&apos;t have it.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          autoFocus
          value={entered}
          onChange={(e) => setEntered(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Upload password"
          className="rounded-xl"
        />
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              setEntered("");
              state.closePrompt();
            }}
          >
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={submit}>
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owner-only controls to set the upload password and choose which admins can
 * upload/reorder without being asked. Renders nothing for non-owners — they are
 * never shown a "locked" wall; they are simply prompted for the password when
 * they act (see UploadPasswordDialog).
 */
export function UploadAccessPanel({ state, actor }: { state: UploadAccessState; actor: Actor }) {
  const { lockActive, isOwner, isDev, password, grantedEmails } = state;
  const canManage = isOwner || isDev;

  const [newPassword, setNewPassword] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [busy, setBusy] = useState(false);

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
      toast.success(`${normalizeEmail(grantEmail)} can now upload without the password`);
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

  if (!canManage) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-border/40 bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <p className="text-sm font-semibold">Upload access (owner controls)</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Only <strong>{CLIENT_ADMIN_EMAIL}</strong> controls this. Set a password and everyone else is
        asked for it when they upload <em>or reorder</em> videos &amp; images. Add trusted admins
        below so they can do it without being asked.
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
        <Label className="text-xs">Admins who can upload without the password</Label>
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
  );
}
