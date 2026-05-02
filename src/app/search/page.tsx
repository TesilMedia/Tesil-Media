import { prisma } from "@/lib/prisma";
import { VideoCard } from "@/components/VideoCard";
import Link from "next/link";

import {
  getViewerHiddenRatings,
  ratingFilterWhere,
} from "@/lib/viewerPrefs";
import { normaliseCategory } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    return (
      <div className="w-full max-w-[1600px] py-10">
        <h1 className="text-xl font-semibold">Search</h1>
        <p className="mt-2 text-muted">
          Type a query in the search box above to find channels and videos.
        </p>
      </div>
    );
  }

  const needle = query.toLowerCase();
  const ratingWhere = ratingFilterWhere(await getViewerHiddenRatings());
  // If the query matches a category label/alias, also match videos in that
  // canonical category (so "games" finds all `gaming` videos).
  const matchedCategory = normaliseCategory(query);

  const [videos, channels] = await Promise.all([
    prisma.video.findMany({
      where: {
        AND: [
          {
            OR: [
              { title: { contains: needle } },
              { description: { contains: needle } },
              ...(matchedCategory
                ? [
                    {
                      OR: [
                        { category: matchedCategory },
                        { category2: matchedCategory },
                      ],
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
      take: 24,
    }),
    prisma.channel.findMany({
      where: {
        OR: [
          { name: { contains: needle } },
          { slug: { contains: needle } },
          { description: { contains: needle } },
        ],
      },
      take: 12,
    }),
  ]);

  return (
    <div className="w-full max-w-[1600px] py-6">
      <h1 className="mb-1 text-xl font-semibold">
        Results for &ldquo;{query}&rdquo;
      </h1>
      <p className="mb-6 text-sm text-muted">
        {channels.length} channels · {videos.length} videos
      </p>

      {channels.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Channels
          </h2>
          <div className="flex flex-wrap gap-3">
            {channels.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.slug}`}
                className="flex w-fit items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 hover:bg-surface-2"
              >
                <span className="h-10 w-10 overflow-hidden rounded-full bg-surface-2">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </span>
                <span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.followers.toLocaleString()} followers
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Videos
        </h2>
        {videos.length === 0 ? (
          <p className="text-muted">No videos matched.</p>
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
