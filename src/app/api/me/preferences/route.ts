import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/lib/mobileAuth";
import { prisma } from "@/lib/prisma";
import {
  CONTENT_RATINGS,
  ContentRating,
  parseHiddenRatings,
  serializeHiddenRatings,
} from "@/lib/ratings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  hiddenRatings: z
    .array(z.enum(CONTENT_RATINGS as unknown as [ContentRating, ...ContentRating[]]))
    .max(CONTENT_RATINGS.length),
});

export async function PATCH(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const serialised = serializeHiddenRatings(parsed.data.hiddenRatings);

  const updated = await prisma.user.update({
    where: { id: authUser.id },
    data: { hiddenRatings: serialised },
    select: { hiddenRatings: true },
  });

  return NextResponse.json({
    ok: true,
    hiddenRatings: parseHiddenRatings(updated.hiddenRatings),
  });
}
