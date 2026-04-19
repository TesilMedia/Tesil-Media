import { NextResponse } from "next/server";
import path from "node:path";
import { unlink } from "node:fs/promises";
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

function diskPathForChannelUploadUrl(
  publicUrl: string | null | undefined,
): string | null {
  if (!publicUrl || !publicUrl.startsWith("/uploads/channel/")) return null;
  if (!/^\/uploads\/channel\/[a-zA-Z0-9._-]+$/.test(publicUrl)) return null;
  const rel = publicUrl.replace(/^\//, "");
  return path.join(process.cwd(), "public", rel);
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

  const nextAvatar = parsed.data.avatarUrl ?? null;
  const nextBanner = parsed.data.bannerUrl ?? null;

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
      avatarUrl: nextAvatar,
      bannerUrl: nextBanner,
    },
  });

  return NextResponse.json({ ok: true, channel: { slug: updated.slug } });
}
