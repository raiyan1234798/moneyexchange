"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDisplayUrl } from "@/lib/display-url";
import { loadDemoContent } from "@/lib/services/demo-content-service";
import { cn } from "@/lib/utils";

export function LoadDemoContentButton({
  userId,
  userName,
  className,
  variant = "default",
}: {
  userId: string;
  userName: string;
  className?: string;
  variant?: "default" | "outline";
}) {
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    setLoading(true);
    try {
      const { branchCode } = await loadDemoContent({ userId, userName });
      const displayUrl = getDisplayUrl(branchCode);
      toast.success("Demo content loaded", {
        description: (
          <a href={displayUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Open display preview →
          </a>
        ),
        duration: 10000,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load demo content");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      className={cn("rounded-xl", className)}
      disabled={loading}
      onClick={() => void handleLoad()}
    >
      <Sparkles className="mr-2 h-4 w-4" />
      {loading ? "Loading demo…" : "Load Demo Content"}
    </Button>
  );
}
