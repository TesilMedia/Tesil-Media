import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VideoCard } from "@/components/VideoCard";
import { RatingBadge } from "@/components/RatingBadge";
import { formatViews } from "@/lib/format";
import { RATING_META, isContentRating } from "@/lib/ratings";
import { categoriesFromDb } from "@/lib/categories";
import {
  getViewerHiddenRatings,
  ratingFilterWhere,
} from "@/lib/viewerPrefs";
import { titleOverflowClampClass } from "@/lib/titleClamp";

export const dynamic = "force-dynamic";

export default async function BeginningPage({
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
  if (!channel?.stream) notFound();

  const { stream } = channel;

  // Once a recording is ready, send them to the normal watch page.
  if (stream.vodVideoId) {
    redirect(`/watch/${stream.vodVideoId}`);
  }

  // Stream is live but no recording yet — show a snapshot MP4 generated from current segments.
  if (!stream.isLive) notFound();

  const hidden = await getViewerHiddenRatings();
  const filtered =
    isContentRating(stream.rating) &&
    (hidden as string[]).includes(stream.rating);

  if (filtered && !overrideFilter) {
    const meta = isContentRating(stream.rating)
      ? RATING_META[stream.rating]
      : null;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 py-16 text-center">
        <div className="flex items-center gap-2">
          <RatingBadge rating={stream.rating} size="sm" />
          <span className="text-sm uppercase tracking-wider text-muted">
            Stream hidden by your filter
          </span>
        </div>
        <h1
          className={`w-full min-w-0 max-w-full text-2xl font-semibold leading-tight ${titleOverflowClampClass(stream.title)}`}
        >
          {stream.title}
        </h1>
        {meta ? (
          <p className="max-w-lg text-sm text-muted">{meta.description}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/live/${channel.slug}/beginning?override=1`}
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

  const ratingWhere = ratingFilterWhere(hidden);
  const relatedSlugs = categoriesFromDb(stream.category, stream.category2);

  const related = await prisma.video.findMany({
    where: {
      AND: [
        {
          OR: [
            { channelId: channel.id },
            ...(relatedSlugs.length > 0
              ? [
                  {
                    OR: relatedSlugs.flatMap((s) => [
                      { category: s },
                      { category2: s },
                    ]),
                  },
                ]
              : []),
          ],
        },
        ratingWhere,
      ],
    },
    include: { channel: true },
    orderBy: { views: "desc" },
    take: 8,
  });

  return (
    <div className="w-full max-w-[1600px] py-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <VideoPlayer
            src={`/api/stream/${slug}/beginning?t=${Date.now()}`}
            title={stream.title}
            liveStartedAt={stream.startedAt}
          />

          <div className="mt-4 flex items-start gap-2">
            <h1
              className={`min-w-0 flex-1 text-xl font-semibold leading-tight ${titleOverflowClampClass(stream.title)}`}
            >
              {stream.title}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <RatingBadge rating={stream.rating} size="sm" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <Link
              href={`/c/${channel.slug}`}
              className="flex w-fit items-center gap-3"
            >
              <span className="h-10 w-10 overflow-hidden rounded-full bg-surface-2">
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
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/live/${slug}`}
                  className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
                >
                  Watch live
                </Link>
                <span className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-on-accent">
                  From beginning
                </span>
              </div>
              <div className="text-sm text-muted">
                <div className="text-text">{formatViews(stream.viewers)}</div>
                <div>watching now</div>
              </div>
            </div>
          </div>

          {channel.description ? (
            <p className="mt-4 whitespace-pre-line text-sm text-muted">
              {channel.description}
            </p>
          ) : null}
        </div>

        <aside className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Up next
          </h2>
          <div className="flex flex-col gap-4">
            {related.map((v) => (
              <VideoCard
                key={v.id}
                id={v.id}
                title={v.title}
                thumbnail={v.thumbnail}
                durationSec={v.durationSec}
                views={v.views}
                createdAt={v.createdAt}
                rating={v.rating}
                sourceUrl={v.sourceUrl}
                channel={{
                  slug: v.channel.slug,
                  name: v.channel.name,
                  avatarUrl: v.channel.avatarUrl,
                }}
              />
            ))}
            {related.length === 0 ? (
              <p className="text-sm text-muted">No related videos.</p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
