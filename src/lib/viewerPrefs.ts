import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CONTENT_RATINGS,
  ContentRating,
  DEFAULT_HIDDEN_RATINGS,
  parseHiddenRatings,
} from "@/lib/ratings";

/**
 * Returns the list of ratings the given viewer does NOT want to see.
 *
 * - Guests / unknown users get the platform defaults (X hidden).
 * - Signed-in users get their saved preference (which may be empty if they
 *   have explicitly opted-in to X).
 *
 * If `userId` is omitted, the current NextAuth cookie session is consulted —
 * keeps the existing server-rendered pages working without changes. Mobile
 * routes should pass the userId resolved from `getAuthUser(req)` instead.
 */
export async function getViewerHiddenRatings(
  userId?: string | null,
): Promise<ContentRating[]> {
  let resolvedId = userId ?? null;
  if (resolvedId === null && userId === undefined) {
    const session = await auth();
    resolvedId = session?.user?.id ?? null;
  }
  if (!resolvedId) return [...DEFAULT_HIDDEN_RATINGS];

  const user = await prisma.user.findUnique({
    where: { id: resolvedId },
    select: { hiddenRatings: true },
  });
  if (!user) return [...DEFAULT_HIDDEN_RATINGS];
  return parseHiddenRatings(user.hiddenRatings);
}

/**
 * Produce a Prisma `where` fragment that excludes rows whose `rating` column
 * is in the hidden list. Returns an empty object when nothing is hidden, so it
 * can be spread into existing `where` clauses safely.
 */
export function ratingFilterWhere(hidden: readonly ContentRating[]) {
  if (hidden.length === 0) return {};
  // If every rating is hidden, return a clause that matches nothing rather
  // than letting Prisma treat `notIn: [all]` as an empty query.
  if (hidden.length >= CONTENT_RATINGS.length) {
    return { rating: { in: [] as string[] } };
  }
  return { rating: { notIn: [...hidden] as string[] } };
}
