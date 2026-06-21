"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DashboardHeader } from "@/components/layout/dashboard-sidebar";
import { ContentPanel, FormSection, PageShell, StatusBadge } from "@/components/shared/page-elements";
import { useAuth } from "@/contexts/auth-context";
import { useBranchScope } from "@/lib/hooks/use-branch-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/constants";

const profileSchema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters"),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const { branches, managerBranchId } = useBranchScope();
  const branch = branches.find((b) => b.id === (profile?.branchId ?? managerBranchId));

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: profile?.displayName ?? "" },
  });

  useEffect(() => {
    if (profile?.displayName) {
      form.reset({ displayName: profile.displayName });
    }
  }, [profile?.displayName, form]);

  async function onSubmit(values: ProfileForm) {
    if (!user) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.users, user.uid), {
        displayName: values.displayName,
        updatedAt: serverTimestamp(),
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile");
    }
  }

  return (
    <>
      <DashboardHeader
        title="Profile"
        description="Your account details and display preferences."
        accent="violet"
      />
      <PageShell accent="violet">
        <ContentPanel title="Account">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{profile?.email ?? user?.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Role</p>
              <StatusBadge
                status={profile?.role === "superAdmin" ? "Super Admin" : "Branch Manager"}
                variant="info"
              />
            </div>
            {branch ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Assigned Branch</p>
                <p className="text-sm font-medium">{branch.name}</p>
                <p className="text-xs text-muted-foreground">Code: {branch.code}</p>
              </div>
            ) : null}
            {profile?.lastLoginAt ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Login</p>
                <p className="text-sm font-medium">
                  {profile.lastLoginAt instanceof Date
                    ? profile.lastLoginAt.toLocaleString()
                    : "Recent"}
                </p>
              </div>
            ) : null}
          </div>
        </ContentPanel>

        <ContentPanel title="Display Name">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormSection title="Public name" description="Shown in audit logs and manager lists">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input id="displayName" className="rounded-xl" {...form.register("displayName")} />
                {form.formState.errors.displayName ? (
                  <p className="text-sm text-destructive">{form.formState.errors.displayName.message}</p>
                ) : null}
              </div>
            </FormSection>
            <Button type="submit" className="rounded-xl" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </ContentPanel>
      </PageShell>
    </>
  );
}
