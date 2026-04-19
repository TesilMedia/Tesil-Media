import { NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ContentRating, isContentRating } from "@/lib/ratings";
import { VideoCategory, isVideoCategory } from "@/lib/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const VIDEO_DIR = path.join(UPLOAD_ROOT, "videos");
const THUMB_DIR = path.join(UPLOAD_ROOT, "thumbnails");

function extFromName(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

/**
 * Best-effort unlink of a file referenced by a public URL like
 * `/uploads/videos/abc.mp4`. We only delete files inside the known upload
 * directories to avoid path traversal.
 */
async function safeUnlinkPublicUrl(url: string | null | undefined) {
  if (!url) return;
  if (!url.startsWith("/uploads/")) return;
  const abs = path.join(process.cwd(), "public", url.replace(/^\/+/, ""));
  const normalized = path.resolve(abs);
  if (
    !normalized.startsWith(path.resolve(VIDEO_DIR)) &&
    !normalized.startsWith(path.resolve(THUMB_DIR))
  ) {
    return;
  }
  try {
    await unlink(normalized);
  } catch {
    /* file may already be gone; swallow */
  }
}

async function loadOwnedVideo(id: string, userId: string) {
  const video = await prisma.video.findUnique({
    where: { id },
    include: { channel: true },
  });
  if (!video) return { error: "Video not found.", status: 404 as const };
  if (video.channel.ownerId !== userId) {
    return { error: "You don't own this video.", status: 403 as const };
  }
  return { video };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const result = await loadOwnedVideo(id, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { video } = result;

  const contentType = req.headers.get("content-type") ?? "";

  let title: string | undefined;
  let description: string | null | undefined;
  let category: VideoCategory | undefined;
  let rating: ContentRating | undefined;
  let newThumbFile: File | null = null;
  let removeThumb = false;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form." }, { status: 400 });
    }
    if (form.has("title")) title = String(form.get("title") ?? "").trim();
    if (form.has("description")) {
      const v = String(form.get("description") ?? "").trim();
      description = v.length ? v : null;
    }
    if (form.has("category")) {
      const raw = String(form.get("category") ?? "").trim().toLowerCase();
      if (!isVideoCategory(raw)) {
        return NextResponse.json(
          { error: "Invalid category." },
          { status: 400 },
        );
      }
      category = raw;
    }
    if (form.has("rating")) {
      const raw = String(form.get("rating") ?? "")
        .trim()
        .toUpperCase();
      const normalised = raw === "PG-13" ? "PG13" : raw;
      if (!isContentRating(normalised)) {
        return NextResponse.json(
          { error: "Invalid content rating." },
          { status: 400 },
        );
      }
      rating = normalised;
    }
    const maybeThumb = form.get("thumbnail");
    if (maybeThumb instanceof File && maybeThumb.size > 0) {
      newThumbFile = maybeThumb;
    }
    if (String(form.get("removeThumbnail") ?? "") === "1") {
      removeThumb = true;
    }
  } else {
    let body: {
      title?: string;
      description?: string | null;
      category?: string | null;
      rating?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
    if (typeof body.title === "string") title = body.title.trim();
    if (body.description !== undefined) {
      description =
        typeof body.description === "string" && body.description.trim().length
          ? body.description.trim()
          : null;
    }
    if (body.category !== undefined) {
      const raw =
        typeof body.category === "string"
          ? body.category.trim().toLowerCase()
          : "";
      if (!isVideoCategory(raw)) {
        return NextResponse.json(
          { error: "Invalid category." },
          { status: 400 },
        );
      }
      category = raw;
    }
    if (body.rating !== undefined) {
      const raw = String(body.rating).trim().toUpperCase();
      const normalised = raw === "PG-13" ? "PG13" : raw;
      if (!isContentRating(normalised)) {
        return NextResponse.json(
          { error: "Invalid content rating." },
          { status: 400 },
        );
      }
      rating = normalised;
    }
  }

  if (title !== undefined && (title.length === 0 || title.length > 200)) {
    return NextResponse.json(
      { error: "Title is required (max 200 chars)." },
      { status: 400 },
    );
  }

  let thumbnailUpdate: string | null | undefined;
  if (newThumbFile) {
    const ext = extFromName(newThumbFile.name);
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported image type .${ext}.` },
        { status: 400 },
      );
    }
    await mkdir(THUMB_DIR, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    const buf = Buffer.from(await newThumbFile.arrayBuffer());
    await writeFile(path.join(THUMB_DIR, filename), buf);
    thumbnailUpdate = `/uploads/thumbnails/${filename}`;
    await safeUnlinkPublicUrl(video.thumbnail);
  } else if (removeThumb) {
    thumbnailUpdate = null;
    await safeUnlinkPublicUrl(video.thumbnail);
  }

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      ...(title !== undefined ? { title: title.slice(0, 200) } : {}),
      ...(description !== undefined
        ? { description: description?.slice(0, 5000) ?? null }
        : {}),
      ...(category !== undefined ? { category } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(thumbnailUpdate !== undefined ? { thumbnail: thumbnailUpdate } : {}),
    },
  });

  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const result = await loadOwnedVideo(id, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { video } = result;

  await prisma.video.delete({ where: { id: video.id } });
  await safeUnlinkPublicUrl(video.sourceUrl);
  await safeUnlinkPublicUrl(video.thumbnail);

  return NextResponse.json({ ok: true });
}
