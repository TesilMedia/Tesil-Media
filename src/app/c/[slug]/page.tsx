import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { VideoCard } from "@/components/VideoCard";
import { LiveCard } from "@/components/LiveCard";
import { isContentRating } from "@/lib/ratings";
import {
  getViewerHiddenRatings,
  ratingFilterWhere,
} from "@/lib/viewerPrefs";
import { EXCLUDE_LIVE_RECORDING_PLACEHOLDERS } from "@/lib/videoCatalog";

export const dynamic = "force-dynamic";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const hiddenRatings = await getViewerHiddenRatings();
  const ratingWhere = ratingFilterWhere(hiddenRatings);

  const channel = await prisma.channel.findUnique({
    where: { slug },
    include: {
      stream: true,
      videos: {
        where: {
          AND: [ratingWhere, EXCLUDE_LIVE_RECORDING_PLACEHOLDERS],
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { videos: true } },
    },
  });
  if (!channel) notFound();

  const isLive = channel.stream?.isLive ?? false;
  const streamFiltered =
    channel.stream &&
    isContentRating(channel.stream.rating) &&
    (hiddenRatings as string[]).includes(channel.stream.rating);
  const showLiveCard = Boolean(
    isLive && channel.stream && !streamFiltered,
  );
  const totalVideos = channel._count.videos;
  const hiddenByFilter = totalVideos - channel.videos.length;

  return (
    <>
      <div className="-mx-4 w-[calc(100%+2rem)] shrink-0">
        <div className="relative z-0 aspect-[6/1] w-full overflow-hidden bg-surface">
          {channel.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.bannerUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
      </div>

      <div className="w-full min-w-0">
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 pt-4 sm:gap-x-6 sm:gap-y-2">
          <div
            className={`h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-bg bg-surface-2 shadow-md ${
              channel.description ? "row-span-2" : ""
            }`}
          >
            {channel.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={channel.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight">
              {channel.name}
            </h1>
            <div className="text-sm text-muted">
              {channel.followers.toLocaleString()} followers ·{" "}
              {totalVideos} videos
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 justify-self-end rounded-full bg-accent px-3 py-2 text-xs font-semibold text-on-accent hover:enabled:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
            disabled
            title="Follow coming soon"
          >
            Follow
          </button>
          {channel.description ? (
            <p className="col-span-2 col-start-2 min-w-0 pb-2 text-sm text-muted">
              {channel.description}
            </p>
          ) : null}
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <h2 className="mb-3 text-lg font-semibold">Videos</h2>
          {hiddenByFilter > 0 ? (
            <p className="mb-4 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
              {hiddenByFilter} {hiddenByFilter === 1 ? "video is" : "videos are"}{" "}
              hidden by your{" "}
              <Link href="/me" className="underline hover:text-text">
                content filter
              </Link>
              .
            </p>
          ) : null}
          {!showLiveCard && channel.videos.length === 0 ? (
            <p className="text-sm text-muted">
              {totalVideos === 0
                ? "This channel hasn't uploaded any videos yet."
                : "All of this channel's videos are hidden by your content filter."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {showLiveCard && channel.stream ? (
                <LiveCard
                  key={`live-${channel.stream.id}`}
                  channelSlug={channel.slug}
                  channelName={channel.name}
                  channelAvatar={channel.avatarUrl}
                  title={channel.stream.title}
                  thumbnail={channel.stream.thumbnail}
                  viewers={channel.stream.viewers}
                  rating={channel.stream.rating}
                  isLive={isLive}
                  streamUrl={channel.stream.streamUrl}
                  vodVideoId={channel.stream.vodVideoId}
                />
              ) : null}
              {channel.videos.map((v) => (
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
                    slug: channel.slug,
                    name: channel.name,
                    avatarUrl: channel.avatarUrl,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
