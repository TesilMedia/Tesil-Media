import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser } from "@/lib/mobileAuth";
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
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: commentId } = await params;

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
  const userId = authUser.id;

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  const existing = await prisma.commentLike.findUnique({
    where: { userId_commentId: { userId, commentId } },
  });

  let newVote: 0 | 1 | -1;

  if (existing?.value === value) {
    await prisma.commentLike.delete({ where: { id: existing.id } });
    await prisma.comment.update({
      where: { id: commentId },
      data: { [value === 1 ? "likes" : "dislikes"]: { decrement: 1 } },
    });
    newVote = 0;
  } else if (existing) {
    await prisma.commentLike.update({
      where: { id: existing.id },
      data: { value },
    });
    await prisma.comment.update({
      where: { id: commentId },
      data: {
        [value === 1 ? "likes" : "dislikes"]: { increment: 1 },
        [value === 1 ? "dislikes" : "likes"]: { decrement: 1 },
      },
    });
    newVote = value;
  } else {
    await prisma.commentLike.create({ data: { userId, commentId, value } });
    await prisma.comment.update({
      where: { id: commentId },
      data: { [value === 1 ? "likes" : "dislikes"]: { increment: 1 } },
    });
    newVote = value;
  }

  const updated = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { likes: true, dislikes: true },
  });

  return NextResponse.json({
    likes: updated?.likes ?? 0,
    dislikes: updated?.dislikes ?? 0,
    userVote: newVote,
  });
}
