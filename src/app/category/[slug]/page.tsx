import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { VideoCard } from "@/components/VideoCard";
import { LiveCard } from "@/components/LiveCard";
import {
  CATEGORY_BADGE_CLASS,
  CATEGORY_META,
  VIDEO_CATEGORIES,
  categoryHref,
  isVideoCategory,
} from "@/lib/categories";
import { CategoryIcon } from "@/components/CategoryIcon";
import {
  getViewerHiddenRatings,
  ratingFilterWhere,
} from "@/lib/viewerPrefs";
import { EXCLUDE_LIVE_RECORDING_PLACEHOLDERS } from "@/lib/videoCatalog";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return VIDEO_CATEGORIES.map((slug) => ({ slug }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isVideoCategory(slug)) notFound();
  const meta = CATEGORY_META[slug];

  const hidden = await getViewerHiddenRatings();
  const ratingWhere = ratingFilterWhere(hidden);

  const [live, videos] = await Promise.all([
    prisma.liveStream.findMany({
      where: {
        isLive: true,
        ...ratingWhere,
        OR: [{ category: slug }, { category2: slug }],
      },
      include: { channel: true },
      orderBy: { viewers: "desc" },
      take: 12,
    }),
    prisma.video.findMany({
      where: {
        AND: [
          EXCLUDE_LIVE_RECORDING_PLACEHOLDERS,
          ratingWhere,
          { OR: [{ category: slug }, { category2: slug }] },
        ],
      },
      include: { channel: true },
      orderBy: { createdAt: "desc" },
      take: 48,
    }),
  ]);

  return (
    <div className="w-full py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-md ${CATEGORY_BADGE_CLASS}`}
          >
            <CategoryIcon category={slug} className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">
              {meta.label}
            </h1>
            <p className="text-sm text-muted">{meta.description}</p>
          </div>
        </div>
        <nav className="flex max-w-full flex-wrap gap-1.5">
          {VIDEO_CATEGORIES.map((c) => {
            const active = c === slug;
            const cmeta = CATEGORY_META[c];
            return (
              <Link
                key={c}
                href={categoryHref(c)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-accent/70 bg-surface-2 text-text"
                    : "border-border bg-surface text-muted hover:border-accent/50 hover:bg-surface-2 hover:text-text"
                }`}
              >
                <CategoryIcon category={c} className="h-3.5 w-3.5 shrink-0" />
                {cmeta.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {live.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Live now</h2>
            <span className="text-sm text-muted">{live.length} streaming</span>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {live.map((s) => (
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
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Videos</h2>
          <span className="text-sm text-muted">{videos.length} videos</span>
        </div>
        {videos.length === 0 ? (
          <p className="text-muted">
            Nothing in <span className="text-text">{meta.label}</span> yet.
            Check back soon, or{" "}
            <Link href="/upload" className="underline hover:text-text">
              upload something
            </Link>
            .
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
