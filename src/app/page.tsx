import { prisma } from "@/lib/prisma";
import { LiveCard } from "@/components/LiveCard";
import { VideoCard } from "@/components/VideoCard";
import { getViewerHiddenRatings, ratingFilterWhere } from "@/lib/viewerPrefs";
import { EXCLUDE_LIVE_RECORDING_PLACEHOLDERS } from "@/lib/videoCatalog";

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
      where: { AND: [ratingWhere, EXCLUDE_LIVE_RECORDING_PLACEHOLDERS] },
      include: { channel: true },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
  ]);

  return (
    <div className="w-full pt-4 pb-6">
      {liveStreams.length > 0 && (
        <section className="mb-10">
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
                isLive={s.isLive}
                streamUrl={s.streamUrl}
                vodVideoId={s.vodVideoId}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        {videos.length === 0 ? (
          <p className="text-muted">
            No videos yet. Sign in and upload a video to see it here.
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
                sourceUrl={v.sourceUrl}
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
