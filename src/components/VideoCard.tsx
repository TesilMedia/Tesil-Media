import Link from "next/link";

import { formatDuration, formatViews } from "@/lib/format";
import { RatingBadge } from "@/components/RatingBadge";

type VideoCardProps = {
  id: string;
  title: string;
  thumbnail: string | null;
  durationSec: number | null;
  views: number;
  createdAt: Date;
  rating?: string | null;
  channel: {
    slug: string;
    name: string;
    avatarUrl: string | null;
  };
};

export function VideoCard(props: VideoCardProps) {
  return (
    <article className="group flex flex-col gap-2">
      <Link
        href={`/watch/${props.id}`}
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
            No preview
          </div>
        )}
        {props.durationSec ? (
          <span className="absolute bottom-2 right-2 rounded-sm bg-bg/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-cream">
            {formatDuration(props.durationSec)}
          </span>
        ) : null}
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
          href={`/c/${props.channel.slug}`}
          className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-2"
        >
          {props.channel.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.channel.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <Link
              href={`/watch/${props.id}`}
              className="line-clamp-2 min-w-0 w-full text-sm font-semibold leading-snug hover:text-accent"
            >
              {props.title}
            </Link>
            <Link
              href={`/c/${props.channel.slug}`}
              className="mt-1 block truncate text-xs text-muted hover:text-accent-blue"
            >
              {props.channel.name}
            </Link>
            <div className="text-xs text-muted">
              {formatViews(props.views)} · {timeAgo(props.createdAt)}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const diffSec = Math.round((now - new Date(date).getTime()) / 1000);
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let value = diffSec;
  let unit = "second";
  for (const [factor, name] of units) {
    if (value < factor) {
      unit = name;
      break;
    }
    value = Math.round(value / factor);
    unit = name;
  }
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}
