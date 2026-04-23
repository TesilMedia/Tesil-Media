import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2000;

const patchSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(MAX_BODY),
});

const userInclude = {
  user: {
    select: {
      id: true,
      name: true,
      image: true,
      channel: { select: { slug: true, name: true, avatarUrl: true } },
    },
  },
} as const;

function serialize(c: {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  userId: string;
  parentId: string | null;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    channel: { slug: string; name: string; avatarUrl: string | null } | null;
  };
}) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    userId: c.userId,
    parentId: c.parentId,
    user: {
      id: c.user.id,
      name: c.user.channel?.name ?? c.user.name,
      image: c.user.channel?.avatarUrl ?? c.user.image,
      channelSlug: c.user.channel?.slug ?? null,
    },
  };
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const existing = await prisma.comment.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  if (existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only edit your own comments." },
      { status: 403 },
    );
  }

  const updated = await prisma.comment.update({
    where: { id },
    data: { body: parsed.data.body, editedAt: new Date() },
    include: userInclude,
  });

  return NextResponse.json({ comment: serialize(updated) });
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

  const comment = await prisma.comment.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!comment) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  if (comment.userId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only delete your own comments." },
      { status: 403 },
    );
  }

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
