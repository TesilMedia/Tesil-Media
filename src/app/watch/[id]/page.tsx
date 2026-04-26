import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { VideoPlayer } from "@/components/VideoPlayer";
import { VideoCard } from "@/components/VideoCard";
import { RatingBadge } from "@/components/RatingBadge";
import { Comments, type CommentDTO } from "@/components/Comments";
import { VideoLikeBar } from "@/components/LikeDislike";
import { formatViews } from "@/lib/format";
import { RATING_META, isContentRating } from "@/lib/ratings";
import { normaliseCategory } from "@/lib/categories";
import {
  getViewerHiddenRatings,
  ratingFilterWhere,
} from "@/lib/viewerPrefs";
import { auth } from "@/lib/auth";
import { titleOverflowClampClass } from "@/lib/titleClamp";

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
        <h1
          className={`w-full min-w-0 max-w-full text-2xl font-semibold leading-tight ${titleOverflowClampClass(video.title)}`}
        >
          {video.title}
        </h1>
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
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
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
  const viewerId = session?.user?.id ?? null;

  const [related, commentRows, videoLike, viewerCommentLikes] = await Promise.all([
    prisma.video.findMany({
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
    }),
    prisma.comment.findMany({
      where: { videoId: video.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            channel: { select: { slug: true, name: true, avatarUrl: true } },
          },
        },
      },
    }),
    viewerId
      ? prisma.videoLike.findUnique({
          where: { userId_videoId: { userId: viewerId, videoId: video.id } },
        })
      : null,
    viewerId
      ? prisma.commentLike.findMany({
          where: { userId: viewerId, comment: { videoId: video.id } },
          select: { commentId: true, value: true },
        })
      : [],
  ]);

  const commentVoteMap = new Map<string, number>(
    (viewerCommentLikes as { commentId: string; value: number }[]).map(
      (cl) => [cl.commentId, cl.value],
    ),
  );

  const initialComments: CommentDTO[] = commentRows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    userId: c.userId,
    parentId: c.parentId,
    likes: c.likes,
    dislikes: c.dislikes,
    userVote: (commentVoteMap.get(c.id) ?? 0) as 0 | 1 | -1,
    user: {
      id: c.user.id,
      name: c.user.channel?.name ?? c.user.name,
      image: c.user.channel?.avatarUrl ?? c.user.image,
      channelSlug: c.user.channel?.slug ?? null,
    },
  }));

  const viewerChannel = session?.user?.id
    ? await prisma.channel.findUnique({
        where: { ownerId: session.user.id },
        select: { slug: true, name: true, avatarUrl: true },
      })
    : null;

  const viewer = session?.user?.id
    ? {
        id: session.user.id,
        name: viewerChannel?.name ?? session.user.name ?? null,
        image: viewerChannel?.avatarUrl ?? session.user.image ?? null,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <VideoPlayer
            src={video.sourceUrl}
            videoId={video.id}
            title={video.title}
          />

          <div className="mt-4 flex items-start gap-2">
            <h1
              className={`flex-1 min-w-0 text-xl font-semibold leading-tight ${titleOverflowClampClass(video.title)}`}
            >
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <Link
              href={`/c/${video.channel.slug}`}
              className="flex w-fit items-center gap-3"
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
            <div className="flex items-center gap-4">
              <VideoLikeBar
                videoId={video.id}
                initialLikes={video.likes}
                initialDislikes={video.dislikes}
                initialVote={(videoLike?.value ?? 0) as 0 | 1 | -1}
                disabled={!viewerId}
              />
              <div className="text-sm text-muted">
                {formatViews(video.views)} views
              </div>
            </div>
          </div>

          {video.description ? (
            <p className="mt-4 whitespace-pre-line text-sm text-muted">
              {video.description}
            </p>
          ) : null}

          <Comments
            videoId={video.id}
            initial={initialComments}
            viewer={viewer}
          />
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
