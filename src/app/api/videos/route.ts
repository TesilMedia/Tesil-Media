// GET /api/videos
//
// Paginated list of videos for native clients (and anything else that wants
// JSON). Mirrors the filtering used by the home / category / search pages so
// the iOS app can reuse one endpoint for all three.
//
// Query params:
//   limit         — page size, 1..50 (default 24)
//   cursor        — opaque cursor from the previous page's `nextCursor`
//   category      — slug from `lib/categories.ts`
//   channelSlug   — restrict to one channel
//   q             — free-text search across title + description
//   includeHidden — "1" to bypass the viewer's hidden-rating filter
//
// Response: { videos: VideoListItem[], nextCursor: string | null }

import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/mobileAuth";
import { isVideoCategory } from "@/lib/categories";
import {
  getViewerHiddenRatings,
  ratingFilterWhere,
} from "@/lib/viewerPrefs";
import { EXCLUDE_LIVE_RECORDING_PLACEHOLDERS } from "@/lib/videoCatalog";

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
  const channelSlug = url.searchParams.get("channelSlug");
  const q = url.searchParams.get("q")?.trim() ?? "";
  const includeHidden = url.searchParams.get("includeHidden") === "1";

  const authUser = await getAuthUser(req);
  const hidden = includeHidden
    ? []
    : await getViewerHiddenRatings(authUser?.id ?? null);

  const ratingClause = ratingFilterWhere(hidden) as Prisma.VideoWhereInput;
  const parts: Prisma.VideoWhereInput[] = [
    EXCLUDE_LIVE_RECORDING_PLACEHOLDERS,
  ];
  if (Object.keys(ratingClause).length > 0) {
    parts.push(ratingClause);
  }

  if (categoryRaw) {
    if (!isVideoCategory(categoryRaw)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    parts.push({
      OR: [{ category: categoryRaw }, { category2: categoryRaw }],
    });
  }

  if (channelSlug) {
    const channel = await prisma.channel.findUnique({
      where: { slug: channelSlug },
      select: { id: true },
    });
    if (!channel) {
      return NextResponse.json({ videos: [], nextCursor: null });
    }
    parts.push({ channelId: channel.id });
  }

  if (q) {
    parts.push({
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }

  const where: Prisma.VideoWhereInput =
    parts.length === 0 ? {} : parts.length === 1 ? parts[0]! : { AND: parts };

  const rows = await prisma.video.findMany({
    where,
    include: {
      channel: { select: { slug: true, name: true, avatarUrl: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return NextResponse.json({
    videos: page.map((v) => ({
      id: v.id,
      title: v.title,
      thumbnail: v.thumbnail,
      durationSec: v.durationSec,
      views: v.views,
      likes: v.likes,
      dislikes: v.dislikes,
      category: v.category,
      category2: v.category2,
      rating: v.rating,
      sourceUrl: v.sourceUrl,
      createdAt: v.createdAt.toISOString(),
      channel: {
        slug: v.channel.slug,
        name: v.channel.name,
        avatarUrl: v.channel.avatarUrl,
      },
    })),
    nextCursor,
  });
}
