"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import type { BranchSettings } from "@/lib/types";

/**
 * Live TV preview that reflects UNSAVED edits.
 *
 * It embeds the real branch display (`/display?preview=1`) in an iframe and
 * posts the current draft settings to it via postMessage. The display renders
 * them through its `settingsOverride`, so the admin sees exactly how a change
 * will look BEFORE pressing Save. Saving still writes to the chosen branches —
 * this panel changes nothing in the database.
 */
export function LiveTvPreview({
  branchCode,
  draft,
  label,
  className,
}: {
  branchCode: string;
  /** The editor's current unsaved settings. Posted to the preview on every change. */
  draft: Partial<BranchSettings> | null;
  label?: string;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  // Keep the newest draft in a ref so the "ready" handshake can post it without
  // re-subscribing the message listener on every keystroke.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const post = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !readyRef.current) return;
    win.postMessage(
      { __unimoniPreview: true, settings: draftRef.current ?? null },
      window.location.origin,
    );
  };

  // The iframe announces itself when its listener is mounted; then we can post.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.__unimoniPreviewReady === true) {
        readyRef.current = true;
        post();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-post whenever the draft changes (settings state is a new object per edit).
  useEffect(() => {
    post();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // A fresh branch means a fresh document — force the iframe to reload.
  const src = `/display/?branch=${encodeURIComponent(branchCode)}&preview=1`;

  // TRUE MINIATURE (client 2026-08-08): render the display at real TV size and
  // scale the whole thing down, instead of letting it re-flow into a narrow
  // box. The panel then shows exactly what the TV shows — rates, images and
  // video all visible — while the real display is untouched.
  const TV_W = 1920;
  const TV_H = 1080;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.35);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const apply = () => setScale(Math.max(0.05, el.clientWidth / TV_W));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={className}>
      <div
        ref={shellRef}
        className="group relative w-full overflow-hidden rounded-xl border border-border/60 shadow-lg"
        style={{ aspectRatio: `${TV_W} / ${TV_H}` }}
      >
        {/* Full-screen the preview itself — same picture, bigger, without
            leaving the page or touching the real display (client 2026-08-08). */}
        <button
          type="button"
          title="View this preview full screen"
          onClick={() => {
            const el = shellRef.current;
            if (!el) return;
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            else void el.requestFullscreen?.().catch(() => {});
          }}
          className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100"
        >
          <Maximize2 className="h-3 w-3" />
          Full screen
        </button>
        <iframe
          ref={iframeRef}
          key={src}
          src={src}
          title={label ?? `Live preview — ${branchCode}`}
          className="absolute left-0 top-0 border-0"
          style={{
            width: `${TV_W}px`,
            height: `${TV_H}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          onLoad={() => {
            // If the iframe reloaded, its readiness resets; wait for its ready
            // ping. But also try an immediate post in case the ping was missed.
            post();
          }}
        />
      </div>
      <p className="pt-2 text-xs text-muted-foreground">
        Live preview of your <strong>unsaved</strong> changes. Nothing is saved until you press
        Save — then it goes live on the branches you choose.
      </p>
    </div>
  );
}
