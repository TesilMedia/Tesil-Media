import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VideoCard } from "@/components/VideoCard";
import { RatingBadge } from "@/components/RatingBadge";
import { formatViews } from "@/lib/format";
import { RATING_META, isContentRating } from "@/lib/ratings";
import { normaliseCategory } from "@/lib/categories";
import {
  getViewerHiddenRatings,
  ratingFilterWhere,
} from "@/lib/viewerPrefs";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ override?: string }>;
}) {
  const [{ id }, { override }] = await Promise.all([params, searchParams]);
  const overrideFilter = override === "1";

  const video = await prisma.video.findUnique({
    where: { id },
    include: { channel: true },
  });
  if (!video) notFound();

  const session = await auth();
  const isOwner =
    session?.user?.id != null &&
    video.channel.ownerId === session.user.id;

  const hidden = await getViewerHiddenRatings();
  const filtered =
    isContentRating(video.rating) &&
    (hidden as string[]).includes(video.rating);

  if (filtered && !overrideFilter) {
    const meta = isContentRating(video.rating)
      ? RATING_META[video.rating]
      : null;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center lg:px-6">
        <div className="flex items-center gap-2">
          <RatingBadge rating={video.rating} size="sm" />
          <span className="text-sm uppercase tracking-wider text-muted">
            Content hidden by your filter
          </span>
        </div>
        <h1 className="text-2xl font-semibold leading-tight">{video.title}</h1>
        {meta ? (
          <p className="max-w-lg text-sm text-muted">{meta.description}</p>
        ) : null}
        <p className="text-sm text-muted">
          You can show this video just this once, or update your filter in your{" "}
          <Link href="/me" className="underline hover:text-text">
            profile
          </Link>
          .
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/watch/${video.id}?override=1`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-hover"
          >
            Show anyway
          </Link>
          {isOwner ? (
            <Link
              href={`/me/videos/${video.id}/edit`}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
            >
              Edit video
            </Link>
          ) : null}
          <Link
            href="/"
            className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  prisma.video
    .update({ where: { id }, data: { views: { increment: 1 } } })
    .catch(() => {});

  const ratingWhere = ratingFilterWhere(hidden);
  const relatedCategory = normaliseCategory(video.category);
  const related = await prisma.video.findMany({
    where: {
      AND: [
        {
          id: { not: video.id },
          OR: [
            { channelId: video.channelId },
            ...(relatedCategory ? [{ category: relatedCategory }] : []),
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
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      {filtered && overrideFilter ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <span className="flex items-center gap-2">
            <RatingBadge rating={video.rating} size="sm" />
            This video is hidden by your content filter. You&rsquo;re viewing
            it with the filter overridden.
          </span>
          <Link href="/me" className="underline hover:text-amber-100">
            Update filter
          </Link>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <VideoPlayer src={video.sourceUrl} title={video.title} />

          <div className="mt-4 flex items-start gap-2">
            <h1 className="flex-1 text-xl font-semibold leading-tight">
              {video.title}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              {isOwner ? (
                <Link
                  href={`/me/videos/${video.id}/edit`}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-1.5 py-0.5 text-[11px] hover:bg-surface-2"
                >
                  Edit
                </Link>
              ) : null}
              <RatingBadge rating={video.rating} size="sm" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-4 border-b border-border pb-3">
            <Link
              href={`/c/${video.channel.slug}`}
              className="flex items-center gap-3"
            >
              <span className="h-10 w-10 overflow-hidden rounded-full bg-surface-2">
                {video.channel.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.channel.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </span>
              <span>
                <span className="block font-medium">{video.channel.name}</span>
                <span className="block text-xs text-muted">
                  {video.channel.followers.toLocaleString()} followers
                </span>
              </span>
            </Link>
            <div className="text-sm text-muted">
              {formatViews(video.views)} views
            </div>
          </div>

          {video.description ? (
            <p className="mt-4 whitespace-pre-line text-sm text-muted">
              {video.description}
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
