import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateMidframeThumbnail } from "@/lib/videoQualities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secureStringMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const streamNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/i);

const hookSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("prePublish"),
    streamName: streamNameSchema,
    key: z.string().min(1).max(128),
  }),
  z.object({
    event: z.literal("donePublish"),
    streamName: streamNameSchema,
    key: z.string().max(128).optional(),
  }),
  z.object({
    event: z.literal("streamState"),
    streamName: streamNameSchema,
  }),
  z.object({
    event: z.literal("vodReady"),
    streamName: streamNameSchema,
    vodId: z.string().min(1).max(64).regex(/^[a-f0-9]+$/),
  }),
]);

export async function POST(req: Request) {
  const expectedSecret = process.env.STREAM_HOOK_SECRET;
  const incomingSecret = req.headers.get("x-stream-hook-secret") ?? "";

  if (!expectedSecret || !secureStringMatch(incomingSecret, expectedSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = hookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  // Use parsed.data.event (not a destructured variable) so TypeScript narrows
  // parsed.data to the correct union member inside each branch.
  const { streamName } = parsed.data;

  if (parsed.data.event === "prePublish") {
    const stream = await prisma.liveStream.findFirst({
      where: { channel: { slug: streamName } },
      select: {
        id: true,
        streamKey: true,
        title: true,
        category: true,
        category2: true,
        rating: true,
        thumbnail: true,
        channelId: true,
      },
    });
    if (!stream) return NextResponse.json({ ok: true });
    if (
      !stream.streamKey ||
      !secureStringMatch(parsed.data.key, stream.streamKey)
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.liveMessage.deleteMany({ where: { streamId: stream.id } });
      const sessionVideo = await tx.video.create({
        data: {
          id: randomUUID(),
          title: stream.title,
          category: stream.category ?? null,
          category2: stream.category2 ?? null,
          rating: stream.rating,
          thumbnail: stream.thumbnail ?? null,
          sourceUrl: `/hls/${streamName}/index.m3u8`,
          channelId: stream.channelId,
        },
      });
      await tx.liveStream.update({
        where: { id: stream.id },
        data: {
          ingestActive: true,
          isLive: true,
          startedAt: now,
          lastIngestAt: now,
          waitingRoomOpen: false,
          vodVideoId: sessionVideo.id,
        },
      });
    });
  } else if (parsed.data.event === "donePublish") {
    const stream = await prisma.liveStream.findFirst({
      where: { channel: { slug: streamName } },
      select: { id: true },
    });
    if (!stream) return NextResponse.json({ ok: true });
    await prisma.liveStream.update({
      where: { id: stream.id },
      data: { ingestActive: false, isLive: false, waitingRoomOpen: false },
    });
  } else if (parsed.data.event === "streamState") {
    const stream = await prisma.liveStream.findFirst({
      where: { channel: { slug: streamName } },
      select: { startedAt: true, isLive: true, ingestActive: true },
    });
    return NextResponse.json({
      ok: true,
      startedAt: stream?.startedAt ?? null,
      isLive: stream?.isLive ?? false,
      ingestActive: stream?.ingestActive ?? false,
    });
  } else {
    // vodReady — parsed.data.vodId is accessible because TS narrows to vodReady shape
    const liveStream = await prisma.liveStream.findFirst({
      where: { channel: { slug: streamName } },
      select: {
        title: true,
        category: true,
        category2: true,
        rating: true,
        thumbnail: true,
        channelId: true,
        vodVideoId: true,
      },
    });
    if (!liveStream) return NextResponse.json({ ok: true });

    let thumbnail = liveStream.thumbnail ?? null;
    if (!thumbnail) {
      const vodAbs = path.join(
        process.cwd(),
        "public",
        "uploads",
        "videos",
        `${parsed.data.vodId}.mp4`,
      );
      const thumbDir = path.join(process.cwd(), "public", "uploads", "thumbnails");
      thumbnail = await generateMidframeThumbnail(vodAbs, thumbDir);
    }

    const mp4Source = `/uploads/videos/${parsed.data.vodId}.mp4`;

    if (liveStream.vodVideoId) {
      await prisma.video.update({
        where: { id: liveStream.vodVideoId },
        data: {
          title: liveStream.title,
          category: liveStream.category ?? null,
          category2: liveStream.category2 ?? null,
          rating: liveStream.rating,
          thumbnail,
          sourceUrl: mp4Source,
        },
      });
      await prisma.liveStream.update({
        where: { channelId: liveStream.channelId },
        data: { thumbnail: null },
      });
    } else {
      const vodVideo = await prisma.video.create({
        data: {
          id: randomUUID(),
          title: liveStream.title,
          category: liveStream.category ?? null,
          category2: liveStream.category2 ?? null,
          rating: liveStream.rating,
          thumbnail,
          sourceUrl: mp4Source,
          channelId: liveStream.channelId,
        },
      });
      await prisma.liveStream.update({
        where: { channelId: liveStream.channelId },
        data: { vodVideoId: vodVideo.id, thumbnail: null },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
