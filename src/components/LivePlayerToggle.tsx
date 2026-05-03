import Link from "next/link";
import { ReactNode } from "react";

import { LivePlayer } from "@/components/LivePlayer";

type Props = {
  slug: string;
  isLive: boolean;
  title: string;
  startedAt: Date | string | null;
  vodVideoId: string | null;
  action?: ReactNode;
};

export function LivePlayerToggle({ slug, isLive, title, startedAt, vodVideoId, action }: Props) {
  const watchLiveHref = vodVideoId ? `/watch/${vodVideoId}` : `/live/${slug}`;
  const fromBeginningHref = vodVideoId
    ? `/watch/${vodVideoId}?from=start`
    : `/live/${slug}/beginning`;

  return (
    <div>
      <LivePlayer
        src={`/hls/${slug}/index.m3u8`}
        title={title}
        liveStartedAt={startedAt}
        isLive={isLive}
        viewportBottomInset={200}
      />
      {(isLive || vodVideoId) && (
        <div className="mt-2 flex gap-2">
          <Link
            href={watchLiveHref}
            className="flex items-center gap-1.5 rounded-full bg-live px-4 py-1.5 text-sm font-medium text-white"
          >
            {isLive && (
              <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-white" />
            )}
            Watch live
          </Link>
          <Link
            href={fromBeginningHref}
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
