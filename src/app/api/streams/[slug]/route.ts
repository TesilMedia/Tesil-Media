// GET /api/streams/[slug]
// Single live stream detail by channel slug.

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      avatarUrl: true,
      description: true,
      followers: true,
      stream: true,
    },
  });

  if (!channel?.stream) {
    return NextResponse.json({ error: "Stream not found." }, { status: 404 });
  }

  const s = channel.stream;

  return NextResponse.json({
    id: s.id,
    title: s.title,
    thumbnail: s.thumbnail,
    viewers: s.viewers,
    isLive: s.isLive,
    ingestActive: s.ingestActive,
    category: s.category,
    rating: s.rating,
    streamUrl: s.streamUrl,
    startedAt: s.startedAt?.toISOString() ?? null,
    vodVideoId: s.vodVideoId,
    channel: {
      slug: channel.slug,
      name: channel.name,
      avatarUrl: channel.avatarUrl,
      description: channel.description,
      followers: channel.followers,
    },
  });
}
