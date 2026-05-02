// GET /api/streams
//
// Paginated list of live streams for native clients.
//
// Query params:
//   limit    — 1..50 (default 24)
//   cursor   — opaque cursor from previous page's `nextCursor`
//   category — slug from lib/categories.ts
//   liveOnly — "1" restricts to isLive=true (default: all streams)

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/mobileAuth";
import { isVideoCategory } from "@/lib/categories";
import { getViewerHiddenRatings, ratingFilterWhere } from "@/lib/viewerPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

export async function GET(req: Request) {
  const url = new URL(req.url);

  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const cursor = url.searchParams.get("cursor");
  const categoryRaw = url.searchParams.get("category");
  const liveOnly = url.searchParams.get("liveOnly") !== "0";

  if (categoryRaw && !isVideoCategory(categoryRaw)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const authUser = await getAuthUser(req);
  const hidden = await getViewerHiddenRatings(authUser?.id ?? null);

  const where: Record<string, unknown> = {
    ...ratingFilterWhere(hidden),
    ...(liveOnly ? { isLive: true } : {}),
    ...(categoryRaw
      ? {
          OR: [{ category: categoryRaw }, { category2: categoryRaw }],
        }
      : {}),
  };

  const rows = await prisma.liveStream.findMany({
    where,
    include: {
      channel: {
        select: { slug: true, name: true, avatarUrl: true },
      },
    },
    orderBy: [{ viewers: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  return NextResponse.json({
    streams: page.map((s) => ({
      id: s.id,
      title: s.title,
      thumbnail: s.thumbnail,
      viewers: s.viewers,
      isLive: s.isLive,
      ingestActive: s.ingestActive,
      category: s.category,
      category2: s.category2,
      rating: s.rating,
      streamUrl: s.streamUrl,
      startedAt: s.startedAt?.toISOString() ?? null,
      channel: {
        slug: s.channel.slug,
        name: s.channel.name,
        avatarUrl: s.channel.avatarUrl,
      },
    })),
    nextCursor,
  });
}
