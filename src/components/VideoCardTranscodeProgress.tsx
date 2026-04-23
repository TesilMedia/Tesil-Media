"use client";

import { useEffect, useState } from "react";

const POLL_MS = 1200;

/**
 * Thin progress strip on a video thumbnail while extra quality rungs are encoding.
 */
export function VideoCardTranscodeProgress({
  videoId,
  initiallyPending,
}: {
  videoId: string;
  initiallyPending: boolean;
}) {
  const [visible, setVisible] = useState(initiallyPending);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!initiallyPending) return;

    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(
          `/api/videos/${encodeURIComponent(videoId)}/transcode-status`,
        );
        if (!res.ok || cancelled) return;
        const j: {
          pending?: boolean;
          totalExtraQualities?: number;
          completedExtraQualities?: number;
        } = await res.json();
        const t = j.totalExtraQualities ?? 0;
        const d = j.completedExtraQualities ?? 0;
        setTotal(t);
        setDone(d);
        if (t > 0) {
          setPct(Math.min(100, Math.round((d / t) * 100)));
        } else {
          setPct(j.pending ? 0 : 100);
        }
        if (j.pending === false) {
          setVisible(false);
        }
      } catch {
        /* ignore */
      }
    }

    void tick();
    const iv = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [videoId, initiallyPending]);

  if (!initiallyPending || !visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-0.5 bg-black/55 px-1.5 py-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-medium tabular-nums text-cream">
        {total > 0 ? `More qualities ${done}/${total}` : "Processing qualities…"}
      </span>
    </div>
  );
}
