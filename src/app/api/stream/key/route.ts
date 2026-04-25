import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureChannelForUser } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newStreamKey(): string {
  return randomBytes(24).toString("base64url");
}

async function ensureLiveStream(channelId: string, channelSlug: string, channelName: string) {
  return prisma.liveStream.upsert({
    where: { channelId },
    update: {},
    create: {
      channelId,
      title: `${channelName} live`,
      streamUrl: `/hls/${channelSlug}/index.m3u8`,
      isLive: false,
    },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const channel = await ensureChannelForUser(session.user.id);
  if (!channel) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign in again." },
      { status: 401 },
    );
  }

  const stream = await ensureLiveStream(channel.id, channel.slug, channel.name);
  if (!stream.streamKey) {
    const withKey = await prisma.liveStream.update({
      where: { id: stream.id },
      data: { streamKey: newStreamKey() },
      select: { streamKey: true, isLive: true, ingestActive: true },
    });
    return NextResponse.json({
      ok: true,
      slug: channel.slug,
      streamKey: withKey.streamKey,
      isLive: withKey.isLive,
      ingestActive: withKey.ingestActive,
    });
  }

  return NextResponse.json({
    ok: true,
    slug: channel.slug,
    streamKey: stream.streamKey,
    isLive: stream.isLive,
    ingestActive: stream.ingestActive,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const channel = await ensureChannelForUser(session.user.id);
  if (!channel) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign in again." },
      { status: 401 },
    );
  }

  const stream = await ensureLiveStream(channel.id, channel.slug, channel.name);
  const nextKey = newStreamKey();
  const updated = await prisma.liveStream.update({
    where: { id: stream.id },
    data: { streamKey: nextKey },
    select: { streamKey: true, isLive: true, ingestActive: true },
  });

  return NextResponse.json({
    ok: true,
    slug: channel.slug,
    streamKey: updated.streamKey,
    isLive: updated.isLive,
    ingestActive: updated.ingestActive,
  });
}
