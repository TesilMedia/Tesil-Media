import Link from "next/link";
import { ReactNode } from "react";

import { VideoPlayer } from "@/components/VideoPlayer";

type Props = {
  slug: string;
  isLive: boolean;
  title: string;
  startedAt: Date | string | null;
  vodVideoId: string | null;
  action?: ReactNode;
};

export function LivePlayerToggle({ slug, isLive, title, startedAt, vodVideoId, action }: Props) {
  return (
    <div>
      <VideoPlayer
        src={`/hls/${slug}/index.m3u8`}
        title={title}
        liveStartedAt={isLive ? startedAt : null}
        disableSeek={isLive}
        hideLivePill={!isLive}
        hideTimeGroup={!isLive}
      />
      {(isLive || vodVideoId) && (
        <div className="mt-2 flex gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-live px-4 py-1.5 text-sm font-medium text-white">
            {isLive && (
              <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-white" />
            )}
            Watch live
          </span>
          <Link
            href={`/live/${slug}/beginning`}
            className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
          >
            Watch from beginning
          </Link>
          {action}
        </div>
      )}
    </div>
  );
}
