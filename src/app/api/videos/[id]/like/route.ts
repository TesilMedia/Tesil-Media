import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: videoId } = await params;

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

  const { value } = parsed.data;
  const userId = session.user.id;

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  const existing = await prisma.videoLike.findUnique({
    where: { userId_videoId: { userId, videoId } },
  });

  let newVote: 0 | 1 | -1;

  if (existing?.value === value) {
    // Same button clicked again — toggle off
    await prisma.videoLike.delete({ where: { id: existing.id } });
    await prisma.video.update({
      where: { id: videoId },
      data: { [value === 1 ? "likes" : "dislikes"]: { decrement: 1 } },
    });
    newVote = 0;
  } else if (existing) {
    // Switching from like ↔ dislike
    await prisma.videoLike.update({
      where: { id: existing.id },
      data: { value },
    });
    await prisma.video.update({
      where: { id: videoId },
      data: {
        [value === 1 ? "likes" : "dislikes"]: { increment: 1 },
        [value === 1 ? "dislikes" : "likes"]: { decrement: 1 },
      },
    });
    newVote = value;
  } else {
    // New vote
    await prisma.videoLike.create({ data: { userId, videoId, value } });
    await prisma.video.update({
      where: { id: videoId },
      data: { [value === 1 ? "likes" : "dislikes"]: { increment: 1 } },
    });
    newVote = value;
  }

  const updated = await prisma.video.findUnique({
    where: { id: videoId },
    select: { likes: true, dislikes: true },
  });

  return NextResponse.json({
    likes: updated?.likes ?? 0,
    dislikes: updated?.dislikes ?? 0,
    userVote: newVote,
  });
}
