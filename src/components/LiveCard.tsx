import Link from "next/link";

import { formatViews } from "@/lib/format";
import { RatingBadge } from "@/components/RatingBadge";

type LiveCardProps = {
  channelSlug: string;
  channelName: string;
  channelAvatar: string | null;
  title: string;
  thumbnail: string | null;
  viewers: number;
  rating?: string | null;
};

export function LiveCard(props: LiveCardProps) {
  return (
    <article className="group flex flex-col gap-2">
      <Link
        href={`/live/${props.channelSlug}`}
        className="relative block aspect-video overflow-hidden rounded-lg bg-surface"
      >
        {props.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.thumbnail}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            Live
          </div>
        )}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-sm bg-live px-2 py-0.5 font-display text-[11px] uppercase tracking-[0.15em] text-cream shadow-retro-sm">
          <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-cream" />
          Live
        </span>
        <span className="absolute bottom-2 left-2 rounded-sm bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-cream">
          {formatViews(props.viewers)} watching
        </span>
        {props.rating ? (
          <RatingBadge
            rating={props.rating}
            size="sm"
            className="absolute right-2 top-2 shadow-sm"
          />
        ) : null}
      </Link>
      <div className="flex gap-3">
        <Link
          href={`/c/${props.channelSlug}`}
          className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2"
        >
          {props.channelAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.channelAvatar}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <Link
              href={`/live/${props.channelSlug}`}
              className="line-clamp-2 min-w-0 w-full text-sm font-semibold leading-snug hover:underline"
            >
              {props.title}
            </Link>
            <Link
              href={`/c/${props.channelSlug}`}
              className="mt-1 block truncate text-xs text-muted hover:text-accent-blue"
            >
              {props.channelName}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
