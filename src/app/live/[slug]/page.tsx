import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { VideoPlayer } from "@/components/VideoPlayer";
import { RatingBadge } from "@/components/RatingBadge";
import { formatViews } from "@/lib/format";
import { RATING_META, isContentRating } from "@/lib/ratings";
import { getViewerHiddenRatings } from "@/lib/viewerPrefs";

export const dynamic = "force-dynamic";

export default async function LivePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ override?: string }>;
}) {
  const [{ slug }, { override }] = await Promise.all([params, searchParams]);
  const overrideFilter = override === "1";

  const channel = await prisma.channel.findUnique({
    where: { slug },
    include: { stream: true },
  });
  if (!channel || !channel.stream) notFound();

  const { stream } = channel;
  const playbackSrc =
    stream.streamKey && stream.isLive
      ? `/hls/${channel.slug}/index.m3u8`
      : stream.streamUrl;
  const hidden = await getViewerHiddenRatings();
  const filtered =
    isContentRating(stream.rating) &&
    (hidden as string[]).includes(stream.rating);

  if (filtered && !overrideFilter) {
    const meta = isContentRating(stream.rating)
      ? RATING_META[stream.rating]
      : null;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center lg:px-6">
        <div className="flex items-center gap-2">
          <RatingBadge rating={stream.rating} size="sm" />
          <span className="text-sm uppercase tracking-wider text-muted">
            Stream hidden by your filter
          </span>
        </div>
        <h1 className="text-2xl font-semibold leading-tight">{stream.title}</h1>
        {meta ? (
          <p className="max-w-lg text-sm text-muted">{meta.description}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/live/${channel.slug}?override=1`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            Show anyway
          </Link>
          <Link
            href="/me"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
          >
            Update filter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <VideoPlayer
        src={playbackSrc}
        title={stream.title}
        liveStartedAt={stream.isLive ? stream.startedAt : null}
      />

      <div className="mt-4 flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {stream.isLive ? (
              <span className="flex items-center gap-1 rounded bg-live px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                <span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-white" />
                Live
              </span>
            ) : (
              <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted">
                Offline
              </span>
            )}
          </div>
          <div className="flex items-start gap-2">
            <h1 className="flex-1 text-xl font-semibold leading-tight">
              {stream.title}
            </h1>
            <RatingBadge rating={stream.rating} size="sm" className="mt-1" />
          </div>
          <Link
            href={`/c/${channel.slug}`}
            className="mt-2 flex items-center gap-3"
          >
            <span className="h-9 w-9 overflow-hidden rounded-full bg-surface-2">
              {channel.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={channel.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </span>
            <span>
              <span className="block font-medium">{channel.name}</span>
              <span className="block text-xs text-muted">
                {channel.followers.toLocaleString()} followers
              </span>
            </span>
          </Link>
        </div>
        {stream.isLive ? (
          <div className="text-right text-sm text-muted">
            <div className="text-text">{formatViews(stream.viewers)}</div>
            <div>watching now</div>
          </div>
        ) : null}
      </div>

      {channel.description ? (
        <p className="mt-4 whitespace-pre-line text-sm text-muted">
          {channel.description}
        </p>
      ) : null}
    </div>
  );
}
