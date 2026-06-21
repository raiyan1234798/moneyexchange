"use client";

import { useState } from "react";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDisplayUrl } from "@/lib/display-url";
import { cn } from "@/lib/utils";

function qrImageUrl(url: string, size = 128): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&margin=8`;
}

export function DisplayUrlCard({
  branchCode,
  branchName,
  className,
  compact,
}: {
  branchCode: string;
  branchName?: string;
  className?: string;
  compact?: boolean;
}) {
  const [showQr, setShowQr] = useState(false);
  const displayUrl = getDisplayUrl(branchCode);

  function copyUrl() {
    void navigator.clipboard.writeText(displayUrl);
    toast.success("Display URL copied");
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
            Display URL
          </p>
          <p className="mt-1 text-sm font-medium">
            {branchName ? (
              <>
                {branchName}{" "}
                <span className="font-mono text-xs text-muted-foreground">({branchCode})</span>
              </>
            ) : (
              <span className="font-mono">{branchCode}</span>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Open this link on your TV or kiosk browser, then press Enter Fullscreen.
          </p>
          {!compact ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  readOnly
                  value={displayUrl}
                  className="h-10 rounded-xl font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={copyUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowQr((v) => !v)}>
                <QrCode className="mr-1.5 h-3.5 w-3.5" />
                {showQr ? "Hide QR" : "Show QR"}
              </Button>
              <Button
                size="sm"
                className="rounded-xl"
                render={
                  <a href={displayUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open Display
                  </a>
                }
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="rounded-lg" onClick={copyUrl}>
                <Copy className="mr-1.5 h-3 w-3" />
                Copy URL
              </Button>
              <Button
                size="sm"
                className="rounded-lg"
                render={
                  <a href={displayUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3 w-3" />
                    Open
                  </a>
                }
              />
            </div>
          )}
        </div>
        {showQr && !compact ? (
          <div className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-border/40 bg-background p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl(displayUrl)}
              alt={`QR code for ${branchName ?? branchCode} display`}
              width={128}
              height={128}
              className="rounded-lg"
            />
            <p className="text-center text-[10px] text-muted-foreground">Scan to open on a display device</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
