import { NextResponse } from "next/server";
import path from "node:path";
import { readdir, unlink } from "node:fs/promises";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureChannelForUser } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** http(s) URL or a path returned by POST /api/channel/upload */
const imageUrlOrUploadPath = z
  .string()
  .max(500)
  .refine(
    (s) => {
      if (s.startsWith("/uploads/channel/")) {
        return /^\/uploads\/channel\/[a-zA-Z0-9._-]+$/.test(s);
      }
      try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Use a valid http(s) URL or upload an image file." },
  );

const optionalImage = z.union([
  z.literal("").transform(() => null),
  imageUrlOrUploadPath,
]);

/** Cleared with null or ""; external URLs or /uploads/channel/ paths from upload */
const nullableImage = z.union([z.null(), optionalImage]);

const schema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(2_000).optional().nullable(),
  avatarUrl: nullableImage.optional(),
  bannerUrl: nullableImage.optional(),
});

const CHANNEL_UPLOAD_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "channel",
);

function diskPathForChannelUploadUrl(
  publicUrl: string | null | undefined,
): string | null {
  if (!publicUrl || !publicUrl.startsWith("/uploads/channel/")) return null;
  if (!/^\/uploads\/channel\/[a-zA-Z0-9._-]+$/.test(publicUrl)) return null;
  const rel = publicUrl.replace(/^\//, "");
  const abs = path.join(process.cwd(), "public", rel);
  const normalized = path.resolve(abs);
  const root = path.resolve(CHANNEL_UPLOAD_DIR);
  if (!normalized.startsWith(root)) return null;
  return normalized;
}

function basenameFromChannelUploadUrl(
  publicUrl: string | null | undefined,
): string | null {
  if (!publicUrl || !publicUrl.startsWith("/uploads/channel/")) return null;
  if (!/^\/uploads\/channel\/[a-zA-Z0-9._-]+$/.test(publicUrl)) return null;
  return path.basename(publicUrl);
}

/**
 * Removes stale files from POST /api/channel/upload (same naming pattern as
 * that route) so abandoned uploads do not accumulate on disk.
 */
async function cleanupOrphanChannelKindFiles(
  channelId: string,
  kind: "avatar" | "banner",
  keepBasename: string | null,
) {
  const resolvedDir = path.resolve(CHANNEL_UPLOAD_DIR);
  const prefix = `${channelId}-${kind}-`;
  let names: string[];
  try {
    names = await readdir(CHANNEL_UPLOAD_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    if (keepBasename && name === keepBasename) continue;
    const abs = path.resolve(CHANNEL_UPLOAD_DIR, name);
    if (!abs.startsWith(resolvedDir)) continue;
    await unlink(abs).catch(() => {});
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const channel = await ensureChannelForUser(session.user.id);
  if (!channel) {
    return NextResponse.json(
      { error: "Your session is no longer valid. Please sign in again." },
      { status: 401 },
    );
  }

  const nextAvatar =
    "avatarUrl" in parsed.data
      ? (parsed.data.avatarUrl ?? null)
      : channel.avatarUrl;
  const nextBanner =
    "bannerUrl" in parsed.data
      ? (parsed.data.bannerUrl ?? null)
      : channel.bannerUrl;

  const oldAvatarDisk = diskPathForChannelUploadUrl(channel.avatarUrl);
  const oldBannerDisk = diskPathForChannelUploadUrl(channel.bannerUrl);
  const nextAvatarDisk = diskPathForChannelUploadUrl(nextAvatar);
  const nextBannerDisk = diskPathForChannelUploadUrl(nextBanner);

  if (oldAvatarDisk && oldAvatarDisk !== nextAvatarDisk) {
    await unlink(oldAvatarDisk).catch(() => {});
  }
  if (oldBannerDisk && oldBannerDisk !== nextBannerDisk) {
    await unlink(oldBannerDisk).catch(() => {});
  }

  const updated = await prisma.channel.update({
    where: { id: channel.id },
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description?.toString().trim() || null,
      ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: nextAvatar } : {}),
      ...(parsed.data.bannerUrl !== undefined ? { bannerUrl: nextBanner } : {}),
    },
  });

  await cleanupOrphanChannelKindFiles(
    channel.id,
    "avatar",
    basenameFromChannelUploadUrl(nextAvatar),
  );
  await cleanupOrphanChannelKindFiles(
    channel.id,
    "banner",
    basenameFromChannelUploadUrl(nextBanner),
  );

  return NextResponse.json({ ok: true, channel: { slug: updated.slug } });
}
