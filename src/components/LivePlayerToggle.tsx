"use client";

import { useState } from "react";

import { VideoPlayer } from "@/components/VideoPlayer";

type Props = {
  slug: string;
  isLive: boolean;
  title: string;
  startedAt: Date | null;
};

export function LivePlayerToggle({ slug, isLive, title, startedAt }: Props) {
  const [mode, setMode] = useState<"live" | "dvr">("live");

  const src =
    mode === "live"
      ? `/hls/${slug}/index.m3u8`
      : `/hls-vod/${slug}/index.m3u8`;

  return (
    <div>
      <VideoPlayer
        src={src}
        title={title}
        liveStartedAt={mode === "live" ? startedAt : null}
        disableSeek={mode === "live"}
        dvrMode={mode === "dvr"}
      />
      {isLive && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("live")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "live"
                ? "bg-live text-white"
                : "border border-border bg-surface text-text hover:bg-surface-2"
            }`}
          >
            {mode === "live" && (
              <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-white" />
            )}
            Watch live
          </button>
          <button
            type="button"
            onClick={() => setMode("dvr")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "dvr"
                ? "bg-accent text-on-accent"
                : "border border-border bg-surface text-text hover:bg-surface-2"
            }`}
          >
            Watch from beginning
          </button>
        </div>
      )}
    </div>
  );
}
