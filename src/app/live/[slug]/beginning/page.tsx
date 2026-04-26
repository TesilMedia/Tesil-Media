import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { VideoPlayer } from "@/components/VideoPlayer";
import { RatingBadge } from "@/components/RatingBadge";
import { titleOverflowClampClass } from "@/lib/titleClamp";

export const dynamic = "force-dynamic";

export default async function BeginningPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

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

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <VideoPlayer
        src={`/api/stream/${slug}/beginning?t=${Date.now()}`}
        title={stream.title}
      />
      <div className="mt-2 flex gap-2">
        <Link
          href={`/live/${slug}`}
          className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
        >
          ← Watch live
        </Link>
        <span className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-on-accent">
          Watching from beginning
        </span>
      </div>

      <div className="mt-4 flex items-start gap-4 border-b border-border pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h1
              className={`min-w-0 flex-1 text-xl font-semibold leading-tight ${titleOverflowClampClass(stream.title)}`}
            >
              {stream.title}
            </h1>
            <RatingBadge rating={stream.rating} size="sm" className="mt-1" />
          </div>
          <Link
            href={`/c/${channel.slug}`}
            className="mt-2 flex w-fit items-center gap-3"
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
      </div>

      {channel.description ? (
        <p className="mt-4 whitespace-pre-line text-sm text-muted">
          {channel.description}
        </p>
      ) : null}
    </div>
  );
}
