import type { Channel } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * When the JWT still has a user id but that row was removed (e.g. DB reseed),
 * redirecting here clears the session cookie via Auth.js sign-out.
 */
export const STALE_SESSION_SIGN_OUT_URL =
  "/api/auth/signout?callbackUrl=" +
  encodeURIComponent("/signin?reason=stale-session");

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return base || "user";
}

export async function uniqueChannelSlug(desired: string): Promise<string> {
  const base = slugify(desired);
  let slug = base;
  let n = 1;
  while (await prisma.channel.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

/**
 * Returns the channel owned by the given user, creating one if it doesn't exist.
 * Used as a safety net so any signed-in user can upload even if they were
 * created before auto-channel-on-signup was added.
 *
 * Returns `null` if no user exists for `userId` (stale session after DB reset).
 */
export async function ensureChannelForUser(
  userId: string,
): Promise<Channel | null> {
  const existing = await prisma.channel.findUnique({ where: { ownerId: userId } });
  if (existing) return existing;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const slug = await uniqueChannelSlug(
    user.name || user.email.split("@")[0] || "user",
  );

  return prisma.channel.create({
    data: {
      slug,
      name: user.name ?? slug,
      ownerId: user.id,
    },
  });
}
