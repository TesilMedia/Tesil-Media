import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/mobileAuth";
import { isVideoCategory, VideoCategory } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { ContentRating, isContentRating } from "@/lib/ratings";
import { ensureChannelForUser } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const THUMB_DIR = path.join(process.cwd(), "public", "uploads", "thumbnails");

function extFromName(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

async function safeUnlinkThumbnail(url: string | null | undefined) {
  if (!url || !url.startsWith("/uploads/thumbnails/")) return;
  const absolute = path.resolve(path.join(process.cwd(), "public", url.replace(/^\/+/, "")));
  const thumbRoot = path.resolve(THUMB_DIR);
  if (!absolute.startsWith(thumbRoot)) return;
  try {
    await unlink(absolute);
  } catch {
    // File may already be gone. Ignore.
  }
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
      ingestActive: false,
    },
  });
}

export async function GET(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const channel = await ensureChannelForUser(authUser.id);
  if (!channel) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign in again." },
      { status: 401 },
    );
  }

  const stream = await ensureLiveStream(channel.id, channel.slug, channel.name);
  return NextResponse.json({
    ok: true,
    slug: channel.slug,
    stream: {
      id: stream.id,
      title: stream.title,
      category: stream.category,
      category2: stream.category2,
      rating: stream.rating,
      thumbnail: stream.thumbnail,
      ingestActive: stream.ingestActive,
      waitingRoomOpen: stream.waitingRoomOpen,
      isLive: stream.isLive,
      startedAt: stream.startedAt,
      vodVideoId: stream.vodVideoId,
    },
  });
}

export async function PATCH(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const channel = await ensureChannelForUser(authUser.id);
  if (!channel) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign in again." },
      { status: 401 },
    );
  }

  const stream = await ensureLiveStream(channel.id, channel.slug, channel.name);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form." }, { status: 400 });
  }

  let title: string | undefined;
  let category: VideoCategory | null | undefined;
  let category2: VideoCategory | null | undefined;
  let rating: ContentRating | undefined;
  let removeThumbnail = false;
  let newThumbnail: File | null = null;
  let waitingRoomOpen: boolean | undefined;

  if (form.has("waitingRoomOpen")) {
    const raw = String(form.get("waitingRoomOpen") ?? "").trim().toLowerCase();
    waitingRoomOpen = raw === "1" || raw === "true" || raw === "on";
  }

  if (form.has("title")) {
    title = String(form.get("title") ?? "").trim();
  }
  if (form.has("category")) {
    const raw = String(form.get("category") ?? "").trim().toLowerCase();
    if (!raw) {
      category = null;
      category2 = null;
    } else if (!isVideoCategory(raw)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    } else {
      category = raw;
      const raw2 = String(form.get("category2") ?? "").trim().toLowerCase();
      if (!raw2) {
        category2 = null;
      } else if (!isVideoCategory(raw2)) {
        return NextResponse.json({ error: "Invalid second category." }, { status: 400 });
      } else if (raw2 === raw) {
        category2 = null;
      } else {
        category2 = raw2;
      }
    }
  }
  if (form.has("rating")) {
    const raw = String(form.get("rating") ?? "").trim().toUpperCase();
    const normalized = raw === "PG-13" ? "PG13" : raw;
    if (!isContentRating(normalized)) {
      return NextResponse.json({ error: "Invalid content rating." }, { status: 400 });
    }
    rating = normalized;
  }
  if (String(form.get("removeThumbnail") ?? "") === "1") {
    removeThumbnail = true;
  }
  const maybeThumbnail = form.get("thumbnail");
  if (maybeThumbnail instanceof File && maybeThumbnail.size > 0) {
    newThumbnail = maybeThumbnail;
  }

  if (title !== undefined && (title.length === 0 || title.length > 200)) {
    return NextResponse.json(
      { error: "Title is required (max 200 chars)." },
      { status: 400 },
    );
  }

  let thumbnailUpdate: string | null | undefined;
  if (newThumbnail) {
    const ext = extFromName(newThumbnail.name);
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported image type .${ext}.` },
        { status: 400 },
      );
    }
    await mkdir(THUMB_DIR, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await newThumbnail.arrayBuffer());
    await writeFile(path.join(THUMB_DIR, filename), buffer);
    thumbnailUpdate = `/uploads/thumbnails/${filename}`;
    await safeUnlinkThumbnail(stream.thumbnail);
  } else if (removeThumbnail) {
    thumbnailUpdate = null;
    await safeUnlinkThumbnail(stream.thumbnail);
  }

  const updated = await prisma.liveStream.update({
    where: { id: stream.id },
    data: {
      ...(title !== undefined ? { title: title.slice(0, 200) } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(category2 !== undefined ? { category2 } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(thumbnailUpdate !== undefined ? { thumbnail: thumbnailUpdate } : {}),
      ...(waitingRoomOpen !== undefined ? { waitingRoomOpen } : {}),
    },
    select: {
      id: true,
      title: true,
      category: true,
      category2: true,
      rating: true,
      thumbnail: true,
      ingestActive: true,
      waitingRoomOpen: true,
      isLive: true,
      startedAt: true,
      vodVideoId: true,
    },
  });

  if (updated.vodVideoId) {
    await prisma.video
      .update({
        where: { id: updated.vodVideoId },
        data: {
          ...(title !== undefined ? { title: title.slice(0, 200) } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(category2 !== undefined ? { category2 } : {}),
          ...(rating !== undefined ? { rating } : {}),
          ...(thumbnailUpdate !== undefined ? { thumbnail: thumbnailUpdate } : {}),
        },
      })
      .catch(() => {
        /* placeholder row may have been replaced — ignore */
      });
  }

  return NextResponse.json({ ok: true, stream: updated });
}
