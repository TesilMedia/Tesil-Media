import { prisma } from "@/lib/prisma";
import { LiveCard } from "@/components/LiveCard";
import { VideoCard } from "@/components/VideoCard";
import { getViewerHiddenRatings, ratingFilterWhere } from "@/lib/viewerPrefs";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const hidden = await getViewerHiddenRatings();
  const ratingWhere = ratingFilterWhere(hidden);

  const [liveStreams, videos] = await Promise.all([
    prisma.liveStream.findMany({
      where: { isLive: true, ...ratingWhere },
      include: { channel: true },
      orderBy: { viewers: "desc" },
      take: 12,
    }),
    prisma.video.findMany({
      where: { ...ratingWhere },
      include: { channel: true },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      {liveStreams.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h1 className="text-xl font-semibold">Live now</h1>
            <span className="text-sm text-muted">
              {liveStreams.length} streaming
            </span>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveStreams.map((s) => (
              <LiveCard
                key={s.id}
                channelSlug={s.channel.slug}
                channelName={s.channel.name}
                channelAvatar={s.channel.avatarUrl}
                title={s.title}
                thumbnail={s.thumbnail}
                viewers={s.viewers}
                rating={s.rating}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Recommended</h2>
          <span className="text-sm text-muted">{videos.length} videos</span>
        </div>
        {videos.length === 0 ? (
          <p className="text-muted">
            No videos yet. Run <code className="rounded bg-surface px-1.5 py-0.5">npm run db:seed</code>{" "}
            to populate demo content.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                id={v.id}
                title={v.title}
                thumbnail={v.thumbnail}
                durationSec={v.durationSec}
                views={v.views}
                createdAt={v.createdAt}
                rating={v.rating}
                channel={{
                  slug: v.channel.slug,
                  name: v.channel.name,
                  avatarUrl: v.channel.avatarUrl,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
