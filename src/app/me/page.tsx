import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  STALE_SESSION_SIGN_OUT_URL,
  ensureChannelForUser,
} from "@/lib/slug";
import { formatDuration, formatViews } from "@/lib/format";
import { titleOverflowClampClass } from "@/lib/titleClamp";

import { ChannelEditCard } from "./ChannelEditCard";
import { ContentFilterCard } from "./ContentFilterCard";
import { DeleteVideoButton } from "./DeleteVideoButton";
import { GoLiveCard } from "./GoLiveCard";
import { RatingBadge } from "@/components/RatingBadge";
import { VideoCardTranscodeProgress } from "@/components/VideoCardTranscodeProgress";
import { parseHiddenRatings } from "@/lib/ratings";
export const dynamic = "force-dynamic";

async function signOutFromProfile() {
  "use server";
  await signOut({ redirectTo: "/signin" });
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?callbackUrl=/me");

  const channel = await ensureChannelForUser(session.user.id);
  if (!channel) redirect(STALE_SESSION_SIGN_OUT_URL);
  const stream = await prisma.liveStream.upsert({
    where: { channelId: channel.id },
    update: {},
    create: {
      channelId: channel.id,
      title: `${channel.name} live`,
      streamUrl: `/hls/${channel.slug}/index.m3u8`,
      isLive: false,
    },
    select: { isLive: true, streamKey: true },
  });

  const [videos, totalViews, userPrefs] = await Promise.all([
    prisma.video.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.video
      .aggregate({
        where: { channelId: channel.id },
        _sum: { views: true },
      })
      .then((r) => r._sum.views ?? 0),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { hiddenRatings: true },
    }),
  ]);
  const hiddenRatings = parseHiddenRatings(userPrefs?.hiddenRatings);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 lg:px-6">
      <header className="retro-tricolor-divider-b retro-tricolor-divider-caps mb-6 flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Your channel</h1>
          <p className="text-sm text-muted">
            Signed in as{" "}
            <span className="text-text">
              {session.user.name ?? session.user.email}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/c/${channel.slug}`}
            className="rounded-full bg-accent-blue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-blue-hover active:brightness-95"
          >
            View public page
          </Link>
          <Link
            href="/upload"
            className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover active:brightness-95"
          >
            Upload video
          </Link>
          <form action={signOutFromProfile}>
            <button
              type="submit"
              className="rounded-full bg-accent-red px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-red-hover active:brightness-95"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="flex flex-col gap-6">
          <ChannelEditCard
            channel={{
              slug: channel.slug,
              name: channel.name,
              description: channel.description,
              avatarUrl: channel.avatarUrl,
              bannerUrl: channel.bannerUrl,
              followers: channel.followers,
            }}
            stats={{ videos: videos.length, totalViews }}
          />
          <GoLiveCard
            slug={channel.slug}
            isLive={stream.isLive}
            hasStreamKey={Boolean(stream.streamKey)}
          />
          <ContentFilterCard initialHidden={hiddenRatings} />
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Your videos</h2>
            <span className="text-sm text-muted">
              {videos.length} total · {formatViews(totalViews)} views
            </span>
          </div>

          {videos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
              <p className="mb-3 text-sm text-muted">
                You haven&rsquo;t uploaded any videos yet.
              </p>
              <Link
                href="/upload"
                className="inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
              >
                Upload your first video
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {videos.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                >
                  <Link
                    href={`/watch/${v.id}`}
                    className="relative block aspect-video w-full shrink-0 overflow-hidden rounded-md bg-surface-2 sm:w-48"
                  >
                    {v.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                        No thumbnail
                      </div>
                    )}
                    <VideoCardTranscodeProgress
                      videoId={v.id}
                      initiallyPending={v.transcodePending}
                    />
                    {v.durationSec ? (
                      <span className="absolute right-1.5 top-1.5 z-[11] rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-medium tabular-nums text-cream">
                        {formatDuration(v.durationSec)}
                      </span>
                    ) : null}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <Link
                        href={`/watch/${v.id}`}
                        className={`min-w-0 flex-1 text-sm font-medium leading-snug ${titleOverflowClampClass(v.title)}`}
                      >
                        {v.title}
                      </Link>
                      <RatingBadge rating={v.rating} />
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {formatViews(v.views)} views ·{" "}
                      {new Date(v.createdAt).toLocaleDateString()}
                    </div>
                    {v.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted">
                        {v.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/me/videos/${v.id}/edit`}
                      className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-surface"
                    >
                      Edit
                    </Link>
                    <DeleteVideoButton id={v.id} title={v.title} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
